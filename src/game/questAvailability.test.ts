import { describe, expect, it } from "bun:test";
import {
  QUEST_SPECS,
  QUEST_SPEC_BY_ID,
  applyRaidQuestProgress,
  emptyQuestProgress,
  evaluateQuest,
  getQuestAvailability,
  getQuestTracker,
  listAvailableQuestIds,
  type QuestUnlockContext,
} from "./quests";
import { playerVisibleQuests } from "./PlayerQuestsPanel";
import {
  ensureNetworkCrewCapacityOnce,
  freshRadioProgression,
  resolveRecruitmentCapability,
} from "./operators/radioProgression";
import { applyQuestRewardsToRadio } from "./operators/questRadioRewards";
import {
  isUniqueContactActiveTransmission,
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

describe("quest availability", () => {
  it("unmet prerequisite = LOCKED", () => {
    const tower = QUEST_SPEC_BY_ID["radio_signal"]!;
    expect(getQuestAvailability(tower, unlockCtx())).toBe("LOCKED");
  });

  it("unmet minLevel = LOCKED", () => {
    const spec = {
      ...QUEST_SPEC_BY_ID["debut"]!,
      minLevel: 3,
      prerequisites: [] as string[],
    };
    expect(getQuestAvailability(spec, unlockCtx({ playerLevel: 2 }))).toBe("LOCKED");
    expect(getQuestAvailability(spec, unlockCtx({ playerLevel: 3 }))).toBe("AVAILABLE");
  });

  it("all unlock conditions met = AVAILABLE", () => {
    const tower = QUEST_SPEC_BY_ID["radio_signal"]!;
    expect(
      getQuestAvailability(
        tower,
        unlockCtx({ claimedQuestIds: ["radio_power"], radioState: "POWERED_STATIC" }),
      ),
    ).toBe("AVAILABLE");
  });

  it("claimed quest = COMPLETED", () => {
    const power = QUEST_SPEC_BY_ID["radio_power"]!;
    expect(getQuestAvailability(power, unlockCtx({ claimedQuestIds: ["radio_power"] }))).toBe(
      "COMPLETED",
    );
  });

  it("player UI hides LOCKED; editor catalog still includes them", () => {
    const ctx = unlockCtx();
    const visible = playerVisibleQuests(QUEST_SPECS, ctx, "active");
    expect(visible.some((q) => q.id === "radio_power")).toBe(true);
    expect(visible.some((q) => q.id === "radio_signal")).toBe(false);
    expect(visible.some((q) => q.id === "wolf_help")).toBe(false);
    expect(visible.some((q) => q.id === "radio_network")).toBe(false);
    expect(QUEST_SPECS.some((q) => q.id === "radio_signal")).toBe(true);
  });
});

describe("quest progress gating", () => {
  it("locked quests do not accumulate kill/wave/extract progress", () => {
    let progress = emptyQuestProgress();
    const ctx = unlockCtx();
    const available = listAvailableQuestIds(QUEST_SPECS, ctx);
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
    expect(getQuestTracker(progress, "radio_power").bestWave).toBe(5);
    expect(getQuestTracker(progress, "radio_power").extracts).toBe(1);

    expect(getQuestTracker(progress, "radio_signal").scavKills).toBe(0);
    expect(getQuestTracker(progress, "radio_signal").bestWave).toBe(0);
    expect(getQuestTracker(progress, "radio_signal").extracts).toBe(0);

    // Lifetime globals still update for recruitment/stats.
    expect(progress.scavKills).toBe(20);
    expect(progress.bestWave).toBe(5);
  });

  it("historical lifetime progress does not retroactively complete a newly unlocked quest", () => {
    let progress = emptyQuestProgress();
    progress = applyRaidQuestProgress(progress, ["radio_power"], {
      scavKills: 30,
      bossKills: 0,
      wave: 5,
      mapId: "woods",
      extracted: true,
    });
    // Unlock Raise the Tower after Dead Channel claimed — tracker starts empty.
    const tower = QUEST_SPEC_BY_ID["radio_signal"]!;
    expect(
      evaluateQuest(tower, { kind: "meta", progress: getQuestTracker(progress, "radio_signal") })
        .complete,
    ).toBe(false);
    expect(getQuestTracker(progress, "radio_signal").bestWave).toBe(0);
  });

  it("event completing A does not progress newly unlocked B; later raid can", () => {
    let progress = emptyQuestProgress();
    // First raid: only Dead Channel available — complete its objectives.
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

    // Same raid's wave 3 must not fill Raise the Tower after unlock.
    const afterClaim = unlockCtx({ claimedQuestIds: ["radio_power"] });
    const nowAvailable = listAvailableQuestIds(QUEST_SPECS, afterClaim);
    expect(nowAvailable).toContain("radio_signal");
    expect(getQuestTracker(progress, "radio_signal").bestWave).toBe(0);

    // Later raid progresses Raise the Tower.
    progress = applyRaidQuestProgress(progress, nowAvailable, {
      scavKills: 0,
      bossKills: 0,
      wave: 3,
      mapId: "woods",
      extracted: true,
    });
    expect(getQuestTracker(progress, "radio_signal").bestWave).toBe(3);
    expect(getQuestTracker(progress, "radio_signal").extracts).toBe(1);
  });
});

describe("Wolf transmission archival", () => {
  it("RECRUITED transmission clears after settle; Lab lifecycle remains", () => {
    let radio = settleUniqueTransmission(
      {
        ...freshRadioProgression(),
        radioState: "SIGNAL_RESTORED",
        uniqueContacts: { wolf: { lifecycle: "RECRUITED", distressHeard: true } },
      },
      "wolf",
    );
    expect(radio.uniqueContacts["wolf"]?.lifecycle).toBe("RECRUITED");
    expect(radio.uniqueContacts["wolf"]?.transmissionSettled).toBe(true);
    expect(isUniqueContactActiveTransmission(radio.uniqueContacts["wolf"]!)).toBe(false);
    const again = settleUniqueTransmission(radio, "wolf");
    expect(again.uniqueContacts["wolf"]?.transmissionSettled).toBe(true);
  });
});

describe("NETWORKED crew capacity", () => {
  it("Open Frequencies grants capacity 3 via generic bonus; slots stay 1", () => {
    const meta = freshMeta();
    meta.crew.radio = {
      ...freshRadioProgression(),
      radioState: "SIGNAL_RESTORED",
      uniqueContacts: { wolf: { lifecycle: "RECRUITABLE", distressHeard: true } },
    };
    meta.claimed = ["wolf_help"];
    meta.quests.wavesCompletedByMap = { woods: 5 };
    meta.quests.trackers = {
      wolf_help: { scavKills: 12, bossKills: 0, bestWave: 3, extracts: 1 },
    };
    expect(hireUniqueContact(meta, "wolf").ok).toBe(true);
    expect(crewOccupancy(meta)).toBe(2);

    meta.crew.radio = applyQuestRewardsToRadio(
      meta.crew.radio,
      "radio_network",
      QUEST_SPEC_BY_ID["radio_network"]!.rewards,
    );
    const cap = resolveRecruitmentCapability({ radio: meta.crew.radio, devToolsEnabled: false });
    expect(cap.radioState).toBe("NETWORKED");
    expect(cap.slots.effective).toBe(1);
    expect(cap.crewCapacity.effective).toBe(3);
    regenerateRecruitmentPool(meta);
    expect(meta.crew.recruitment.candidates.length).toBe(1);
    expect(crewOccupancy(meta) < cap.crewCapacity.effective).toBe(true);
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
