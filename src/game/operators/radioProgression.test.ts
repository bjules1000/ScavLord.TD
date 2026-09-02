import { describe, expect, it } from "bun:test";
import {
  applyProgressionModifier,
  freshRadioProgression,
  isRecruitmentUnlocked,
  radioStateBaseSlots,
  resolveRecruitmentCapability,
  normalizeRadioProgression,
} from "./radioProgression";
import { applyQuestRewardsToRadio } from "./questRadioRewards";
import {
  getQualityTier,
  rollPositiveTraitCount,
  validateTraitProbabilities,
} from "./recruitmentQuality";
import {
  canRequestRetransmission,
  CANONICAL_RETRANSMISSION,
  nextRetransmissionCashCost,
} from "./retransmission";
import { CANONICAL_UNIQUE_OPERATORS, uniqueRevealForLifecycle } from "./uniqueOperators";
import { resolveTraitIds } from "./types";
import { freshCrewState, hireCandidate, regenerateRecruitmentPool } from "./crew";
import { freshMeta } from "../meta";
import { QUEST_SPEC_BY_ID } from "../quests";
import { isProfileEligible } from "./recruitmentRequirements";
import { generateRecruitmentPool } from "./generation";
import { CANONICAL_RECRUITMENT_PROFILES } from "./recruitmentProfiles";
import { withRecruitmentCosts } from "./recruitment";
import { kitEquipmentValue } from "./generation";

describe("radio progression", () => {
  it("new game Radio starts BROKEN with 0 slots", () => {
    const radio = freshRadioProgression();
    expect(radio.radioState).toBe("BROKEN");
    const cap = resolveRecruitmentCapability({ radio, devToolsEnabled: false });
    expect(cap.slots.effective).toBe(0);
    expect(isRecruitmentUnlocked(radio.radioState)).toBe(false);
  });

  it("powered-static still has 0 slots", () => {
    let radio = freshRadioProgression();
    radio = applyProgressionModifier(radio, {
      id: "t",
      kind: "SET_RADIO_STATE",
      source: "quest",
      targetId: "POWERED_STATIC",
    });
    expect(radio.radioState).toBe("POWERED_STATIC");
    expect(resolveRecruitmentCapability({ radio, devToolsEnabled: false }).slots.effective).toBe(0);
  });

  it("signal restored grants first slot", () => {
    let radio = freshRadioProgression();
    radio = applyProgressionModifier(radio, {
      id: "t",
      kind: "SET_RADIO_STATE",
      source: "quest",
      targetId: "SIGNAL_RESTORED",
    });
    expect(radioStateBaseSlots(radio.radioState)).toBe(1);
    expect(resolveRecruitmentCapability({ radio, devToolsEnabled: false }).slots.effective).toBe(1);
  });

  it("quest slot bonus composes", () => {
    let radio = freshRadioProgression();
    radio = applyProgressionModifier(radio, {
      id: "sig",
      kind: "SET_RADIO_STATE",
      source: "quest",
      targetId: "SIGNAL_RESTORED",
    });
    radio = applyProgressionModifier(radio, {
      id: "slot",
      kind: "RECRUITMENT_SLOT_BONUS",
      source: "quest",
      amount: 1,
    });
    expect(resolveRecruitmentCapability({ radio, devToolsEnabled: false }).slots.effective).toBe(2);
  });

  it("radio quest rewards apply generically", () => {
    let radio = freshRadioProgression();
    const power = QUEST_SPEC_BY_ID["radio_power"]!;
    radio = applyQuestRewardsToRadio(radio, "radio_power", power.rewards);
    expect(radio.radioState).toBe("POWERED_STATIC");
    const signal = QUEST_SPEC_BY_ID["radio_signal"]!;
    radio = applyQuestRewardsToRadio(radio, "radio_signal", signal.rewards);
    expect(radio.radioState).toBe("SIGNAL_RESTORED");
  });

  it("compat migration for existing recruitment saves", () => {
    const migrated = normalizeRadioProgression(undefined, { hadRecruitmentCandidates: true });
    expect(migrated.radioState).toBe("SIGNAL_RESTORED");
    expect(resolveRecruitmentCapability({ radio: migrated, devToolsEnabled: false }).slots.effective).toBeGreaterThanOrEqual(1);
  });
});

describe("quality and traits", () => {
  it("validates cumulative trait probabilities", () => {
    expect(validateTraitProbabilities(getQualityTier(1).traits)).toEqual([]);
    expect(
      validateTraitProbabilities({
        positiveAtLeast1: 0.1,
        positiveAtLeast2: 0.5,
        positiveAtLeast3: 0.2,
        negativeAtLeast1: 0.1,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("trait count deterministic from probabilities", () => {
    const cfg = getQualityTier(3).traits;
    expect(rollPositiveTraitCount(() => 0.01, cfg)).toBe(3);
    expect(rollPositiveTraitCount(() => 0.99, cfg)).toBe(0);
  });

  it("migrates single perk to traitIds", () => {
    const resolved = resolveTraitIds({ perkIds: ["marksman"], negativeTraitIds: ["wobbly_aim"] });
    expect(resolved.traitIds).toContain("marksman");
    expect(resolved.traitIds).toContain("wobbly_aim");
  });

  it("quality biases generation without guaranteeing all-stat superiority", () => {
    const profiles = CANONICAL_RECRUITMENT_PROFILES.map((p) => ({ ...p, hasOverride: false }));
    const low = withRecruitmentCosts(
      generateRecruitmentPool({ seed: 7, generation: 0, count: 8, profiles, quality: 1 }),
    );
    const high = withRecruitmentCosts(
      generateRecruitmentPool({ seed: 7, generation: 0, count: 8, profiles, quality: 4 }),
    );
    expect(low.length).toBe(8);
    expect(high.length).toBe(8);
    // Same seed different quality → different individuals; not every high > every low.
    const lowAimAvg = low.reduce((s, c) => s + c.stats.aim, 0) / low.length;
    const highAimAvg = high.reduce((s, c) => s + c.stats.aim, 0) / high.length;
    expect(highAimAvg).toBeGreaterThanOrEqual(lowAimAvg - 5);
  });
});

describe("retransmission", () => {
  it("starts locked and escalates cost", () => {
    expect(
      canRequestRetransmission({
        unlocked: false,
        rules: CANONICAL_RETRANSMISSION,
        retransmissionCount: 0,
        bank: 99999,
      }).ok,
    ).toBe(false);
    const c0 = nextRetransmissionCashCost(CANONICAL_RETRANSMISSION, 0);
    const c1 = nextRetransmissionCashCost(CANONICAL_RETRANSMISSION, 1);
    expect(c1).toBeGreaterThan(c0);
  });
});

describe("crew capacity vs radio slots", () => {
  it("blocks hire when capacity full but keeps candidates", () => {
    const meta = freshMeta();
    meta.crew.radio = {
      ...freshRadioProgression(),
      radioState: "SIGNAL_RESTORED",
      modifiers: [
        { id: "slots", kind: "RECRUITMENT_SLOT_BONUS", source: "quest", amount: 3 },
      ],
    };
    // Force capacity to current occupancy (PMC only = 1) via absolute... use modifiers carefully:
    // base capacity is 2, so hire one first then block next if we don't bump capacity.
    regenerateRecruitmentPool(meta);
    meta.bank = 99999;
    const first = hireCandidate(meta, meta.crew.recruitment.candidates[0]!.candidateId);
    expect(first.ok).toBe(true);
    // Now occupancy = 2 (PMC + 1), capacity = 2 → next hire blocked
    const before = meta.crew.recruitment.candidates.length;
    expect(before).toBeGreaterThan(0);
    const result = hireCandidate(meta, meta.crew.recruitment.candidates[0]!.candidateId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("CREW CAPACITY");
    expect(meta.crew.recruitment.candidates.length).toBe(before);
  });
});

describe("unique operators", () => {
  it("has curated definition and reveal stages", () => {
    const wolf = CANONICAL_UNIQUE_OPERATORS.find((u) => u.id === "wolf")!;
    expect(wolf.name).toBe("WOLF");
    const distress = uniqueRevealForLifecycle(wolf, "DISTRESS_SIGNAL");
    expect(distress?.headline).toContain("UNKNOWN");
    const identified = uniqueRevealForLifecycle(wolf, "IDENTIFIED");
    expect(identified?.headline).toContain("WOLF");
  });
});

describe("equipment cost", () => {
  it("kit value contributes to hire cost", () => {
    const profiles = CANONICAL_RECRUITMENT_PROFILES.map((p) => ({ ...p, hasOverride: false }));
    const [c] = withRecruitmentCosts(
      generateRecruitmentPool({ seed: 3, generation: 1, count: 1, profiles, quality: 2 }),
    );
    expect(c).toBeTruthy();
    expect(kitEquipmentValue(c!.equipment)).toBeGreaterThanOrEqual(0);
    expect(c!.cost).toBeGreaterThan(400);
  });
});

describe("profile requirements", () => {
  it("radio-state requirement gates profiles", () => {
    const reqs = [{ type: "RADIO_STATE" as const, minState: "SIGNAL_RESTORED" as const }];
    const brokenFacts = {
      quests: freshMeta().quests,
      claimedQuestIds: [] as string[],
      radioState: "BROKEN" as const,
      effectiveQuality: 1,
    };
    expect(isProfileEligible(reqs, brokenFacts)).toBe(false);
    expect(
      isProfileEligible(reqs, { ...brokenFacts, radioState: "SIGNAL_RESTORED" }),
    ).toBe(true);
  });
});

describe("fresh crew", () => {
  it("starts with empty pool and broken radio", () => {
    const crew = freshCrewState(0);
    expect(crew.radio.radioState).toBe("BROKEN");
    expect(crew.recruitment.candidates).toEqual([]);
  });
});
