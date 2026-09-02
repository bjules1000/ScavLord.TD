import { describe, expect, it } from "bun:test";
import {
  applyProgressionModifier,
  freshRadioProgression,
  isProceduralRecruitmentUnlocked,
  isRecruitmentUnlocked,
  isUniqueContactRadioActive,
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
import {
  CANONICAL_UNIQUE_OPERATORS,
  getUniqueContactProgress,
  maybeTriggerUniqueDistress,
  uniqueRevealForLifecycle,
  uniqueTransmissionForLifecycle,
  syncUniqueEligibility,
  uniqueContactRequirementsMet,
} from "./uniqueOperators";
import { resolveTraitIds } from "./types";
import { crewOccupancy, freshCrewState, hireCandidate, hireUniqueContact, regenerateRecruitmentPool } from "./crew";
import { freshMeta } from "../meta";
import { QUEST_SPEC_BY_ID, questUniqueGateMet } from "../quests";
import { isProfileEligible } from "./recruitmentRequirements";
import { generateRecruitmentPool } from "./generation";
import { CANONICAL_RECRUITMENT_PROFILES } from "./recruitmentProfiles";
import { withRecruitmentCosts } from "./recruitment";
import { kitEquipmentValue } from "./generation";
import { progressionFactsFromMeta } from "./recruitmentLabCore";

describe("radio progression", () => {
  it("new game Radio starts BROKEN with 0 slots", () => {
    const radio = freshRadioProgression();
    expect(radio.radioState).toBe("BROKEN");
    const cap = resolveRecruitmentCapability({ radio, devToolsEnabled: false });
    expect(cap.slots.effective).toBe(0);
    expect(isProceduralRecruitmentUnlocked(radio.radioState)).toBe(false);
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
    expect(radioStateBaseSlots(radio.radioState)).toBe(0);
    expect(resolveRecruitmentCapability({ radio, devToolsEnabled: false }).slots.effective).toBe(0);
  });

  it("SIGNAL_RESTORED has 0 procedural slots but unique contacts active", () => {
    let radio = freshRadioProgression();
    radio = applyProgressionModifier(radio, {
      id: "t",
      kind: "SET_RADIO_STATE",
      source: "quest",
      targetId: "SIGNAL_RESTORED",
    });
    expect(radioStateBaseSlots(radio.radioState)).toBe(0);
    expect(resolveRecruitmentCapability({ radio, devToolsEnabled: false }).slots.effective).toBe(0);
    expect(isProceduralRecruitmentUnlocked(radio.radioState)).toBe(false);
    expect(isUniqueContactRadioActive(radio.radioState)).toBe(true);
  });

  it("NETWORKED grants first procedural slot", () => {
    let radio = freshRadioProgression();
    radio = applyProgressionModifier(radio, {
      id: "t",
      kind: "SET_RADIO_STATE",
      source: "quest",
      targetId: "NETWORKED",
    });
    expect(radioStateBaseSlots(radio.radioState)).toBe(1);
    expect(resolveRecruitmentCapability({ radio, devToolsEnabled: false }).slots.effective).toBe(1);
    expect(isProceduralRecruitmentUnlocked(radio.radioState)).toBe(true);
  });

  it("quest slot bonus composes after NETWORKED", () => {
    let radio = freshRadioProgression();
    radio = applyProgressionModifier(radio, {
      id: "net",
      kind: "SET_RADIO_STATE",
      source: "quest",
      targetId: "NETWORKED",
    });
    radio = applyProgressionModifier(radio, {
      id: "slot",
      kind: "RECRUITMENT_SLOT_BONUS",
      source: "quest",
      amount: 1,
    });
    expect(resolveRecruitmentCapability({ radio, devToolsEnabled: false }).slots.effective).toBe(2);
  });

  it("slot bonuses do not unlock procedural pool before NETWORKED", () => {
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
      amount: 3,
    });
    expect(resolveRecruitmentCapability({ radio, devToolsEnabled: false }).slots.effective).toBe(0);
  });

  it("radio quest rewards apply generically", () => {
    let radio = freshRadioProgression();
    const power = QUEST_SPEC_BY_ID["radio_power"]!;
    radio = applyQuestRewardsToRadio(radio, "radio_power", power.rewards);
    expect(radio.radioState).toBe("POWERED_STATIC");
    const signal = QUEST_SPEC_BY_ID["radio_signal"]!;
    radio = applyQuestRewardsToRadio(radio, "radio_signal", signal.rewards);
    expect(radio.radioState).toBe("SIGNAL_RESTORED");
    expect(resolveRecruitmentCapability({ radio, devToolsEnabled: false }).slots.effective).toBe(0);
    const network = QUEST_SPEC_BY_ID["radio_network"]!;
    radio = applyQuestRewardsToRadio(radio, "radio_network", network.rewards);
    expect(radio.radioState).toBe("NETWORKED");
    expect(resolveRecruitmentCapability({ radio, devToolsEnabled: false }).slots.effective).toBe(1);
  });

  it("compat migration for existing recruitment saves → NETWORKED", () => {
    const migrated = normalizeRadioProgression(undefined, { hadRecruitmentCandidates: true });
    expect(migrated.radioState).toBe("NETWORKED");
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
      radioState: "NETWORKED",
      modifiers: [{ id: "slots", kind: "RECRUITMENT_SLOT_BONUS", source: "quest", amount: 3 }],
    };
    regenerateRecruitmentPool(meta);
    meta.bank = 99999;
    const first = hireCandidate(meta, meta.crew.recruitment.candidates[0]!.candidateId);
    expect(first.ok).toBe(true);
    const before = meta.crew.recruitment.candidates.length;
    expect(before).toBeGreaterThan(0);
    const result = hireCandidate(meta, meta.crew.recruitment.candidates[0]!.candidateId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("CREW CAPACITY");
    expect(meta.crew.recruitment.candidates.length).toBe(before);
  });
});

describe("unique operators / Wolf storyline", () => {
  it("has curated definition and transmissions", () => {
    const wolf = CANONICAL_UNIQUE_OPERATORS.find((u) => u.id === "wolf")!;
    expect(wolf.name).toBe("WOLF");
    const distress = uniqueRevealForLifecycle(wolf, "DISTRESS_SIGNAL");
    expect(distress?.headline).toContain("UNKNOWN");
    const identified = uniqueRevealForLifecycle(wolf, "IDENTIFIED");
    expect(identified?.headline).toContain("WOLF");
    expect(uniqueTransmissionForLifecycle(wolf, "DISTRESS_SIGNAL")?.body).toContain("anyone receiving");
  });

  it("starts HIDDEN and cannot transmit while Radio BROKEN", () => {
    const radio = freshRadioProgression();
    expect(getUniqueContactProgress(radio, "wolf").lifecycle).toBe("HIDDEN");
    const once = maybeTriggerUniqueDistress(radio, "wolf", 0);
    expect(once.triggered).toBe(false);
  });

  it("first Radio open after SIGNAL_RESTORED triggers distress exactly once", () => {
    let radio = freshRadioProgression();
    radio = applyProgressionModifier(radio, {
      id: "sig",
      kind: "SET_RADIO_STATE",
      source: "quest",
      targetId: "SIGNAL_RESTORED",
    });
    const first = maybeTriggerUniqueDistress(radio, "wolf", 1);
    expect(first.triggered).toBe(true);
    expect(first.radio.uniqueContacts["wolf"]?.lifecycle).toBe("DISTRESS_SIGNAL");
    const second = maybeTriggerUniqueDistress(first.radio, "wolf", 2);
    expect(second.triggered).toBe(false);
    expect(second.radio.uniqueContacts["wolf"]?.lifecycle).toBe("DISTRESS_SIGNAL");
  });

  it("Wolf hire does not unlock procedural slots; network quest does", () => {
    const meta = freshMeta();
    meta.crew.radio = {
      ...freshRadioProgression(),
      radioState: "SIGNAL_RESTORED",
      uniqueContacts: { wolf: { lifecycle: "RECRUITABLE", distressHeard: true } },
    };
    meta.claimed = ["wolf_help"];
    meta.quests.wavesCompletedByMap = { woods: 5 };
    meta.bank = 0;
    expect(crewOccupancy(meta)).toBe(1);
    const hired = hireUniqueContact(meta, "wolf");
    expect(hired.ok).toBe(true);
    if (hired.ok) {
      expect(hired.operator.uniqueId).toBe("wolf");
      expect(hired.operator.equipment.weapon).toBe("adar");
    }
    expect(crewOccupancy(meta)).toBe(2);
    expect(meta.crew.radio.uniqueContacts["wolf"]?.lifecycle).toBe("RECRUITED");
    expect(resolveRecruitmentCapability({ radio: meta.crew.radio, devToolsEnabled: false }).slots.effective).toBe(0);
    expect(meta.crew.recruitment.candidates.length).toBe(0);

    const again = hireUniqueContact(meta, "wolf");
    expect(again.ok).toBe(false);

    expect(questUniqueGateMet(QUEST_SPEC_BY_ID["radio_network"]!, meta.crew.radio.uniqueContacts)).toBe(true);
    meta.crew.radio = applyQuestRewardsToRadio(
      meta.crew.radio,
      "radio_network",
      QUEST_SPEC_BY_ID["radio_network"]!.rewards,
    );
    expect(meta.crew.radio.radioState).toBe("NETWORKED");
    regenerateRecruitmentPool(meta);
    expect(meta.crew.recruitment.candidates.length).toBe(1);
    expect(meta.crew.operators.some((o) => o.uniqueId === "wolf")).toBe(true);
  });

  it("unmet Wolf requirements block hire", () => {
    const meta = freshMeta();
    meta.crew.radio = {
      ...freshRadioProgression(),
      radioState: "SIGNAL_RESTORED",
      uniqueContacts: { wolf: { lifecycle: "CONTACTABLE" } },
    };
    const facts = progressionFactsFromMeta(meta);
    const wolf = CANONICAL_UNIQUE_OPERATORS.find((u) => u.id === "wolf")!;
    expect(uniqueContactRequirementsMet(wolf, facts)).toBe(false);
    expect(hireUniqueContact(meta, "wolf").ok).toBe(false);
  });

  it("SET_UNIQUE_CONTACT_STATE quest reward advances lifecycle", () => {
    let radio = freshRadioProgression();
    radio = applyProgressionModifier(radio, {
      id: "sig",
      kind: "SET_RADIO_STATE",
      source: "quest",
      targetId: "SIGNAL_RESTORED",
    });
    radio = maybeTriggerUniqueDistress(radio, "wolf", 0).radio;
    radio = applyQuestRewardsToRadio(radio, "wolf_help", QUEST_SPEC_BY_ID["wolf_help"]!.rewards);
    expect(radio.uniqueContacts["wolf"]?.lifecycle).toBe("CONTACTABLE");
  });

  it("sync promotes CONTACTABLE → RECRUITABLE when requirements met", () => {
    const meta = freshMeta();
    meta.claimed = ["wolf_help"];
    meta.quests.wavesCompletedByMap = { woods: 3 };
    const radio = {
      ...freshRadioProgression(),
      radioState: "SIGNAL_RESTORED" as const,
      uniqueContacts: { wolf: { lifecycle: "CONTACTABLE" as const } },
    };
    const next = syncUniqueEligibility(radio, "wolf", progressionFactsFromMeta({ ...meta, crew: { ...meta.crew, radio } }));
    expect(next.uniqueContacts["wolf"]?.lifecycle).toBe("RECRUITABLE");
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
