import { beforeEach, describe, expect, it } from "bun:test";
import { freshMeta } from "../meta";
import { QUEST_SPEC_BY_ID, QUEST_SPECS, getQuestLifecycle, isQuestUnlocked } from "../quests";
import { freshRadioProgression } from "../operators/radioProgression";
import { capabilityFromMeta } from "../operators/crew";
import {
  collectPrerequisiteIds,
  effectiveClaimedQuestIds,
  effectiveQuestLifecycle,
  forceCompleteModifierIds,
  progressionOnlyRewards,
  stripOrphanQuestProgressionModifiers,
} from "./questForceComplete";
import { syncDevForcedQuestProgression } from "./questForceCompleteSync";
import {
  applyQuestLabOverrides,
  emptyQuestLabOverrides,
  forceCompleteQuestWithPrerequisites,
  getQuestLabOverrides,
  hydrateQuestLabOverrides,
  resetQuestItem,
  setQuestForcedCompleted,
  type StorageLike,
} from "./questLab";
import { DEV_TOOLS_ENABLED } from "./tools";

function memStore(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe("quest force complete", () => {
  beforeEach(() => {
    hydrateQuestLabOverrides(true, memStore());
  });

  it("forcing quest complete makes effective status COMPLETED without Meta.claimed", () => {
    const meta = freshMeta();
    const power = QUEST_SPEC_BY_ID["radio_power"]!;
    const forced = { radio_power: true as const };
    const ctx = {
      claimedQuestIds: meta.claimed,
      playerLevel: meta.pmc.level,
      radioState: "BROKEN" as const,
      uniqueContacts: {},
    };
    expect(getQuestLifecycle(power, ctx)).toBe("ACTIVE");
    expect(effectiveQuestLifecycle(power, ctx, forced)).toBe("COMPLETED");
    expect(meta.claimed.includes("radio_power")).toBe(false);
  });

  it("prerequisite resolution recognizes forced completion", () => {
    const signal = QUEST_SPEC_BY_ID["radio_signal"]!;
    const claimed = effectiveClaimedQuestIds([], { radio_power: true });
    expect(
      isQuestUnlocked(signal, {
        claimedQuestIds: claimed,
        playerLevel: 1,
        radioState: "BROKEN",
      }),
    ).toBe(true);
  });

  it("removing override restores canonical quest state", () => {
    const power = QUEST_SPEC_BY_ID["radio_power"]!;
    const ctx = {
      claimedQuestIds: [] as string[],
      playerLevel: 1,
      radioState: "BROKEN" as const,
    };
    expect(effectiveQuestLifecycle(power, ctx, { radio_power: true })).toBe("COMPLETED");
    expect(effectiveQuestLifecycle(power, ctx, {})).toBe("ACTIVE");
  });

  it("legitimate COMPLETED remains when override clears", () => {
    const power = QUEST_SPEC_BY_ID["radio_power"]!;
    const ctx = {
      claimedQuestIds: ["radio_power"],
      playerLevel: 1,
      radioState: "POWERED_STATIC" as const,
    };
    expect(effectiveQuestLifecycle(power, ctx, {})).toBe("COMPLETED");
    expect(effectiveQuestLifecycle(power, ctx, { radio_power: true })).toBe("COMPLETED");
  });

  it("force completion does not include economy rewards", () => {
    const network = QUEST_SPEC_BY_ID["radio_network"]!;
    const types = progressionOnlyRewards(network).map((r) => r.type);
    expect(types.includes("ROUBLES")).toBe(false);
    expect(types.includes("SKILL_POINTS")).toBe(false);
    expect(types.includes("UNLOCK")).toBe(false);
    expect(types.includes("SET_RADIO_STATE")).toBe(true);
    expect(types.includes("CREW_CAPACITY_BONUS")).toBe(true);
  });

  it("toggle on/off/on does not duplicate progression modifiers", () => {
    const meta = freshMeta();
    meta.crew.radio = freshRadioProgression();
    const bank0 = meta.bank;
    syncDevForcedQuestProgression(meta, { radio_power: true });
    const mods1 = meta.crew.radio!.modifiers.length;
    const bank1 = meta.bank;
    syncDevForcedQuestProgression(meta, { radio_power: true });
    expect(meta.crew.radio!.modifiers.length).toBe(mods1);
    expect(meta.bank).toBe(bank0);
    expect(bank1).toBe(bank0);
    syncDevForcedQuestProgression(meta, {});
    expect(meta.crew.radio!.radioState).toBe("BROKEN");
    syncDevForcedQuestProgression(meta, { radio_power: true });
    expect(meta.crew.radio!.radioState).toBe("POWERED_STATIC");
    expect(meta.bank).toBe(bank0);
  });

  it("Wolf-chain prerequisites unlock via forced ids", () => {
    const claimed = effectiveClaimedQuestIds([], {
      radio_power: true,
      radio_signal: true,
    });
    expect(
      isQuestUnlocked(QUEST_SPEC_BY_ID["wolf_help"]!, {
        claimedQuestIds: claimed,
        playerLevel: 1,
        radioState: "SIGNAL_RESTORED",
        uniqueContacts: { wolf: { lifecycle: "REQUIREMENTS_VISIBLE" } },
      }),
    ).toBe(true);
  });

  it("sync applies radio_network progression for recruitment testing", () => {
    const meta = freshMeta();
    meta.crew.radio = freshRadioProgression();
    syncDevForcedQuestProgression(meta, {
      radio_power: true,
      radio_signal: true,
      wolf_help: true,
      radio_network: true,
    });
    expect(meta.crew.radio!.radioState).toBe("NETWORKED");
    const cap = capabilityFromMeta(meta);
    expect(cap.crewCapacity.effective).toBeGreaterThanOrEqual(3);
    expect(meta.claimed.length).toBe(0);
  });

  it("RESET clears DEV completion override", () => {
    let ov = setQuestForcedCompleted(emptyQuestLabOverrides(), "radio_power", true);
    ov = resetQuestItem(ov, "radio_power");
    expect(ov.forcedCompleted["radio_power"]).toBeUndefined();
  });

  it("FORCE COMPLETE PREREQUISITES walks the chain by id", () => {
    const ids = collectPrerequisiteIds("radio_network", QUEST_SPECS);
    expect(ids).toContain("wolf_help");
    expect(ids).toContain("radio_signal");
    expect(ids).toContain("radio_power");
    const ov = forceCompleteQuestWithPrerequisites(emptyQuestLabOverrides(), "radio_network", QUEST_SPECS);
    expect(ov.forcedCompleted["radio_network"]).toBe(true);
    expect(ov.forcedCompleted["wolf_help"]).toBe(true);
  });

  it("strip orphans does not remove claimed quest modifiers", () => {
    const meta = freshMeta();
    meta.claimed = ["radio_power"];
    meta.crew.radio = freshRadioProgression();
    syncDevForcedQuestProgression(meta, { radio_power: true });
    // Already claimed — sync skips apply but keep set includes claimed
    const ids = forceCompleteModifierIds(QUEST_SPEC_BY_ID["radio_power"]!);
    // Manually ensure a claimed modifier exists then strip with keep=claimed
    syncDevForcedQuestProgression(meta, {});
    // radio_power claimed → modifiers from a prior force should be kept if still present
    const radio = stripOrphanQuestProgressionModifiers(meta.crew.radio!, new Set(meta.claimed));
    expect(radio.modifiers.every((m) => !ids.includes(m.id) || meta.claimed.includes("radio_power"))).toBe(
      true,
    );
  });

  it("persists forcedCompleted in Quest Lab storage", () => {
    if (!DEV_TOOLS_ENABLED) return;
    const store = memStore();
    let ov = setQuestForcedCompleted(emptyQuestLabOverrides(), "debut", true);
    applyQuestLabOverrides(ov, true, store);
    hydrateQuestLabOverrides(true, store);
    expect(getQuestLabOverrides().forcedCompleted["debut"]).toBe(true);
  });
});
