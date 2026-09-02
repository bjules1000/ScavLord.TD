import { describe, expect, it } from "bun:test";
import {
  QUEST_SPECS,
  QUEST_SPEC_BY_ID,
  applyRaidQuestProgress,
  emptyQuestProgress,
  evaluateQuest,
  getQuestLifecycle,
  getQuestTracker,
  listAvailableQuestIds,
  listNewlyUnlockedQuestIds,
  type QuestUnlockContext,
} from "./quests";
import { playerVisibleQuests } from "./PlayerQuestsPanel";
import { redeemQuest, unlockContextFromMeta } from "./questRedeem";
import {
  buildQuestCompleteNotice,
  summarizeQuestReward,
} from "./progressionNotifications";
import {
  ensureNetworkCrewCapacityOnce,
  freshRadioProgression,
  resolveRecruitmentCapability,
} from "./operators/radioProgression";
import { applyQuestRewardsToRadio } from "./operators/questRadioRewards";
import {
  isUniqueContactActiveTransmission,
  setUniqueLifecycle,
  settleUniqueTransmission,
} from "./operators/uniqueOperators";
import { crewOccupancy, hireUniqueContact, regenerateRecruitmentPool } from "./operators/crew";
import { freshMeta } from "./meta";

function unlockCtx(partial: Partial<QuestUnlockContext> = {}): QuestUnlockContext {
  return {
    claimedQuestIds: [],
    playerLevel: 1,
    radioState: "BROKEN",
    uniqueContacts: {},
    ...partial,
  };
}

describe("quest lifecycle", () => {
  it("unmet prerequisite = LOCKED", () => {
    const tower = QUEST_SPEC_BY_ID["radio_signal"]!;
    expect(getQuestLifecycle(tower, unlockCtx())).toBe("LOCKED");
  });

  it("unmet minLevel = LOCKED", () => {
    const spec = {
      ...QUEST_SPEC_BY_ID["debut"]!,
      minLevel: 3,
      prerequisites: [] as string[],
    };
    expect(getQuestLifecycle(spec, unlockCtx({ playerLevel: 2 }))).toBe("LOCKED");
    expect(getQuestLifecycle(spec, unlockCtx({ playerLevel: 3 }))).toBe("ACTIVE");
  });

  it("objectives complete → READY_TO_REDEEM, not COMPLETED", () => {
    const power = QUEST_SPEC_BY_ID["radio_power"]!;
    const progress = emptyQuestProgress();
    progress.trackers = {
      radio_power: { scavKills: 10, bossKills: 0, bestWave: 2, extracts: 1 },
    };
    const ctx = unlockCtx();
    expect(getQuestLifecycle(power, ctx, progress)).toBe("READY_TO_REDEEM");
    expect(getQuestLifecycle(power, ctx, progress)).not.toBe("COMPLETED");
  });

  it("claimed quest = COMPLETED", () => {
    const power = QUEST_SPEC_BY_ID["radio_power"]!;
    expect(getQuestLifecycle(power, unlockCtx({ claimedQuestIds: ["radio_power"] }))).toBe(
      "COMPLETED",
    );
  });

  it("player UI hides LOCKED; ACTIVE includes READY_TO_REDEEM", () => {
    const progress = emptyQuestProgress();
    progress.trackers = {
      radio_power: { scavKills: 10, bossKills: 0, bestWave: 1, extracts: 1 },
    };
    const ctx = unlockCtx();
    const active = playerVisibleQuests(QUEST_SPECS, ctx, progress, "active");
    expect(active.some((q) => q.id === "radio_power")).toBe(true);
    expect(active.some((q) => q.id === "radio_signal")).toBe(false);
    expect(active.some((q) => q.id === "wolf_help")).toBe(false);
  });
});

describe("quest redemption settlement", () => {
  it("objectives complete does not grant rewards until redeem", () => {
    const meta = freshMeta();
    meta.quests.trackers = {
      radio_power: { scavKills: 10, bossKills: 0, bestWave: 1, extracts: 1 },
    };
    expect(meta.crew.radio.radioState).toBe("BROKEN");
    expect(meta.bank).toBe(0);
    expect(getQuestLifecycle(QUEST_SPEC_BY_ID["radio_power"]!, unlockContextFromMeta(meta), meta.quests)).toBe(
      "READY_TO_REDEEM",
    );
  });

  it("redeem grants once; repeated redeem is idempotent", () => {
    const meta = freshMeta();
    meta.quests.trackers = {
      radio_power: { scavKills: 10, bossKills: 0, bestWave: 1, extracts: 1 },
    };
    const first = redeemQuest(meta, "radio_power");
    expect(first.ok).toBe(true);
    if (!first.ok || first.alreadySettled) return;
    expect(meta.claimed).toContain("radio_power");
    expect(meta.crew.radio.radioState).toBe("POWERED_STATIC");
    expect(meta.bank).toBe(400);
    expect(first.notice?.title).toBe("QUEST COMPLETE");
    expect(first.newlyUnlockedQuestIds).toContain("radio_signal");

    const bank = meta.bank;
    const second = redeemQuest(meta, "radio_power");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.alreadySettled).toBe(true);
    expect(meta.bank).toBe(bank);
  });

  it("READY_TO_REDEEM prerequisite does not unlock child", () => {
    const progress = emptyQuestProgress();
    progress.trackers = {
      radio_power: { scavKills: 10, bossKills: 0, bestWave: 1, extracts: 1 },
    };
    const ctx = unlockCtx();
    expect(getQuestLifecycle(QUEST_SPEC_BY_ID["radio_power"]!, ctx, progress)).toBe("READY_TO_REDEEM");
    expect(getQuestLifecycle(QUEST_SPEC_BY_ID["radio_signal"]!, ctx, progress)).toBe("LOCKED");
  });
});

describe("quest progress gating", () => {
  it("locked quests do not accumulate kill/wave/extract progress", () => {
    let progress = emptyQuestProgress();
    const ctx = unlockCtx();
    const available = listAvailableQuestIds(QUEST_SPECS, ctx, progress);
    expect(available).toContain("radio_power");
    expect(available).not.toContain("radio_signal");

    progress = applyRaidQuestProgress(progress, available, {
      scavKills: 20,
      bossKills: 0,
      wave: 5,
      mapId: "woods",
      extracted: true,
    });

    expect(getQuestTracker(progress, "radio_power").scavKills).toBe(20);
    expect(getQuestTracker(progress, "radio_signal").bestWave).toBe(0);
  });

  it("event completing A does not progress newly unlocked B; later raid can", () => {
    let progress = emptyQuestProgress();
    progress = applyRaidQuestProgress(progress, ["radio_power", "debut"], {
      scavKills: 10,
      bossKills: 0,
      wave: 3,
      mapId: "woods",
      extracted: true,
    });
    expect(
      evaluateQuest(QUEST_SPEC_BY_ID["radio_power"]!, {
        kind: "meta",
        progress: getQuestTracker(progress, "radio_power"),
      }).complete,
    ).toBe(true);

    const afterClaim = unlockCtx({ claimedQuestIds: ["radio_power"] });
    const nowAvailable = listAvailableQuestIds(QUEST_SPECS, afterClaim, progress);
    expect(nowAvailable).toContain("radio_signal");
    expect(getQuestTracker(progress, "radio_signal").bestWave).toBe(0);

    progress = applyRaidQuestProgress(progress, nowAvailable, {
      scavKills: 0,
      bossKills: 0,
      wave: 3,
      mapId: "woods",
      extracted: true,
    });
    expect(getQuestTracker(progress, "radio_signal").bestWave).toBe(3);
  });
});

describe("Wolf spoiler / acknowledgment gate", () => {
  it("Raise the Tower redeem does not unlock HELP WOLF", () => {
    const meta = freshMeta();
    meta.claimed = ["radio_power"];
    meta.quests.trackers = {
      radio_signal: { scavKills: 0, bossKills: 0, bestWave: 3, extracts: 1 },
    };
    const result = redeemQuest(meta, "radio_signal");
    expect(result.ok).toBe(true);
    expect(meta.crew.radio.radioState).toBe("SIGNAL_RESTORED");
    expect(getQuestLifecycle(QUEST_SPEC_BY_ID["wolf_help"]!, unlockContextFromMeta(meta), meta.quests)).toBe(
      "LOCKED",
    );
    expect(
      playerVisibleQuests(QUEST_SPECS, unlockContextFromMeta(meta), meta.quests, "active").some(
        (q) => q.id === "wolf_help",
      ),
    ).toBe(false);
  });

  it("ACKNOWLEDGE unlocks HELP WOLF; LISTEN alone does not", () => {
    const meta = freshMeta();
    meta.claimed = ["radio_power", "radio_signal"];
    meta.crew.radio = {
      ...freshRadioProgression(),
      radioState: "SIGNAL_RESTORED",
      uniqueContacts: { wolf: { lifecycle: "DISTRESS_SIGNAL", distressHeard: true } },
    };
    expect(getQuestLifecycle(QUEST_SPEC_BY_ID["wolf_help"]!, unlockContextFromMeta(meta))).toBe("LOCKED");

    meta.crew.radio = setUniqueLifecycle(meta.crew.radio, "wolf", "IDENTIFIED");
    expect(getQuestLifecycle(QUEST_SPEC_BY_ID["wolf_help"]!, unlockContextFromMeta(meta))).toBe("LOCKED");

    const before = unlockContextFromMeta(meta);
    meta.crew.radio = setUniqueLifecycle(meta.crew.radio, "wolf", "REQUIREMENTS_VISIBLE");
    const after = unlockContextFromMeta(meta);
    expect(getQuestLifecycle(QUEST_SPEC_BY_ID["wolf_help"]!, after)).toBe("ACTIVE");
    expect(listNewlyUnlockedQuestIds(QUEST_SPECS, before, after)).toContain("wolf_help");
  });

  it("HELP WOLF objectives alone do not satisfy QUEST_COMPLETED for Wolf", () => {
    const meta = freshMeta();
    meta.claimed = ["radio_power", "radio_signal"];
    meta.crew.radio = {
      ...freshRadioProgression(),
      radioState: "SIGNAL_RESTORED",
      uniqueContacts: { wolf: { lifecycle: "REQUIREMENTS_VISIBLE", distressHeard: true } },
    };
    meta.quests.trackers = {
      wolf_help: { scavKills: 12, bossKills: 0, bestWave: 2, extracts: 1 },
    };
    meta.quests.wavesCompletedByMap = { woods: 5 };
    expect(getQuestLifecycle(QUEST_SPEC_BY_ID["wolf_help"]!, unlockContextFromMeta(meta), meta.quests)).toBe(
      "READY_TO_REDEEM",
    );
    expect(hireUniqueContact(meta, "wolf").ok).toBe(false);

    const redeemed = redeemQuest(meta, "wolf_help");
    expect(redeemed.ok).toBe(true);
    meta.crew.radio = {
      ...meta.crew.radio,
      uniqueContacts: {
        ...meta.crew.radio.uniqueContacts,
        wolf: { lifecycle: "RECRUITABLE", distressHeard: true },
      },
    };
    expect(hireUniqueContact(meta, "wolf").ok).toBe(true);
  });
});

describe("Wolf transmission archival", () => {
  it("RECRUITED transmission clears after settle", () => {
    let radio = settleUniqueTransmission(
      {
        ...freshRadioProgression(),
        radioState: "SIGNAL_RESTORED",
        uniqueContacts: { wolf: { lifecycle: "RECRUITED", distressHeard: true } },
      },
      "wolf",
    );
    expect(radio.uniqueContacts["wolf"]?.transmissionSettled).toBe(true);
    expect(isUniqueContactActiveTransmission(radio.uniqueContacts["wolf"]!)).toBe(false);
  });
});

describe("NETWORKED crew capacity + notifications", () => {
  it("Open Frequencies redeem networks Radio and summarizes unlocks", () => {
    const meta = freshMeta();
    meta.crew.radio = {
      ...freshRadioProgression(),
      radioState: "SIGNAL_RESTORED",
      uniqueContacts: { wolf: { lifecycle: "RECRUITABLE", distressHeard: true } },
    };
    meta.claimed = ["radio_power", "radio_signal", "wolf_help"];
    meta.quests.wavesCompletedByMap = { woods: 5 };
    meta.quests.trackers = {
      wolf_help: { scavKills: 12, bossKills: 0, bestWave: 3, extracts: 1 },
      radio_network: { scavKills: 0, bossKills: 0, bestWave: 2, extracts: 1 },
    };
    expect(hireUniqueContact(meta, "wolf").ok).toBe(true);
    expect(crewOccupancy(meta)).toBe(2);

    const result = redeemQuest(meta, "radio_network");
    expect(result.ok).toBe(true);
    if (!result.ok || result.alreadySettled) return;
    expect(meta.crew.radio.radioState).toBe("NETWORKED");
    const cap = resolveRecruitmentCapability({ radio: meta.crew.radio, devToolsEnabled: false });
    expect(cap.slots.effective).toBe(1);
    expect(cap.crewCapacity.effective).toBe(3);
    expect(meta.crew.recruitment.candidates.length).toBe(1);
    expect(result.notice?.sections.some((s) => s.lines.some((l) => l.includes("Network") || l.includes("Capacity")))).toBe(
      true,
    );
  });

  it("reward summarizer covers common types", () => {
    expect(summarizeQuestReward({ type: "ROUBLES", amount: 600 })).toBe("+600 ₽");
    expect(summarizeQuestReward({ type: "SET_RADIO_STATE", state: "SIGNAL_RESTORED" })).toContain(
      "Signal",
    );
    const notice = buildQuestCompleteNotice({
      quest: QUEST_SPEC_BY_ID["radio_power"]!,
      rewards: QUEST_SPEC_BY_ID["radio_power"]!.rewards,
      newlyUnlockedQuestIds: ["radio_signal"],
      catalog: QUEST_SPECS,
      radioStateChangedTo: "POWERED_STATIC",
    });
    expect(notice.title).toBe("QUEST COMPLETE");
    expect(notice.sections.length).toBeGreaterThan(0);
  });

  it("migration applies network capacity bonus once", () => {
    const first = ensureNetworkCrewCapacityOnce(
      { ...freshRadioProgression(), radioState: "NETWORKED", modifiers: [] },
      ["radio_network"],
    );
    expect(
      resolveRecruitmentCapability({ radio: first, devToolsEnabled: false }).crewCapacity.effective,
    ).toBe(3);
    const again = ensureNetworkCrewCapacityOnce(first, ["radio_network"]);
    expect(again.modifiers.filter((m) => m.kind === "CREW_CAPACITY_BONUS").length).toBe(1);
  });
});
