import { describe, expect, it } from "bun:test";
import { freshMeta } from "../meta";
import {
  applyRecruitmentLabOverrides,
  effectiveSlotCount,
  eligibleProfiles,
  generateTestRecruitmentPool,
  initRecruitmentLab,
  progressionFactsFromMeta,
  resetRecruitmentLabAll,
} from "./recruitmentLabCore";
import {
  BASE_RADIO_SLOTS,
  getRecruitmentSlotCount,
  RADIO_SLOT_MAX,
  RADIO_SLOT_MIN,
} from "./recruitmentSlots";
import {
  freshRadioProgression,
  RADIO_SLOTS_ON_NETWORKED,
} from "./radioProgression";
import { regenerateRecruitmentPool } from "./crew";
import { generateRecruitmentCandidates } from "./generation";
import { buildCandidateCardView, candidateStatRows } from "./recruitmentUi";
import { playerStatRows } from "./recruitmentPresentation";
import {
  CANONICAL_RECRUITMENT_PROFILES,
  generateStatsFromProfile,
  isProfileRangeValid,
} from "./recruitmentProfiles";
import {
  evaluateRequirement,
  isProfileEligible,
  type RecruitmentRequirement,
} from "./recruitmentRequirements";
import {
  isNegativeTraitId,
  isPositivePerkId,
  RECRUITABLE_NEGATIVE_TRAIT_IDS,
  traitPolarity,
} from "./perks";
import { withRecruitmentCosts } from "./recruitment";
import { hireCandidate } from "./crew";
import { STAT_KEYS } from "./stats";

describe("recruitment slots", () => {
  it("new game default is 0 slots until NETWORKED", () => {
    expect(getRecruitmentSlotCount({ radio: freshRadioProgression(), devToolsEnabled: false })).toBe(0);
    expect(BASE_RADIO_SLOTS).toBe(RADIO_SLOTS_ON_NETWORKED);
    expect(BASE_RADIO_SLOTS).toBe(1);
  });

  it("SIGNAL_RESTORED grants 0 procedural slots", () => {
    expect(
      getRecruitmentSlotCount({
        radio: { ...freshRadioProgression(), radioState: "SIGNAL_RESTORED" },
        devToolsEnabled: false,
      }),
    ).toBe(0);
  });

  it("NETWORKED grants base 1 slot", () => {
    expect(
      getRecruitmentSlotCount({
        radio: { ...freshRadioProgression(), radioState: "NETWORKED" },
        devToolsEnabled: false,
      }),
    ).toBe(1);
  });

  it("DEV slot override changes effective count", () => {
    initRecruitmentLab(true);
    applyRecruitmentLabOverrides({ profiles: {}, previewCandidates: {}, slotCount: 5 }, true);
    expect(effectiveSlotCount()).toBe(5);
    resetRecruitmentLabAll();
  });

  it("DEV-off ignores slot override", () => {
    applyRecruitmentLabOverrides({ profiles: {}, previewCandidates: {}, slotCount: 6 }, true);
    expect(
      getRecruitmentSlotCount({
        radio: { ...freshRadioProgression(), radioState: "NETWORKED" },
        devAppliedSlotOverride: 6,
        devToolsEnabled: false,
      }),
    ).toBe(1);
    resetRecruitmentLabAll();
  });

  it("future modifier function composes without UI assumptions", () => {
    expect(
      getRecruitmentSlotCount({
        modifiers: { signalLevelBonus: 1, perkBonus: 0 },
        devToolsEnabled: false,
      }),
    ).toBe(2);
  });

  it("clamps to min/max bounds", () => {
    expect(getRecruitmentSlotCount({ devAppliedSlotOverride: 100, devToolsEnabled: true })).toBe(RADIO_SLOT_MAX);
    expect(getRecruitmentSlotCount({ devAppliedSlotOverride: 0, devToolsEnabled: true })).toBe(RADIO_SLOT_MIN);
  });

  it("existing pool does not silently resize on APPLY", () => {
    initRecruitmentLab(true);
    const meta = freshMeta();
    const before = meta.crew.recruitment.candidates.length;
    applyRecruitmentLabOverrides({ profiles: {}, previewCandidates: {}, slotCount: 5 }, true);
    expect(meta.crew.recruitment.candidates.length).toBe(before);
    resetRecruitmentLabAll();
  });

  it("explicit regenerate uses new slot count", () => {
    initRecruitmentLab(true);
    const meta = freshMeta();
    applyRecruitmentLabOverrides({ profiles: {}, previewCandidates: {}, slotCount: 5 }, true);
    regenerateRecruitmentPool(meta);
    expect(meta.crew.recruitment.candidates.length).toBe(5);
    resetRecruitmentLabAll();
  });

  it("fresh meta starts with empty pool (0 slots)", () => {
    const meta = freshMeta();
    expect(meta.crew.radio.radioState).toBe("BROKEN");
    expect(meta.crew.recruitment.candidates.length).toBe(0);
  });
});

describe("recruitment profiles and potential presentation", () => {
  it("profile ranges are valid for canonical profiles", () => {
    for (const p of CANONICAL_RECRUITMENT_PROFILES) {
      expect(isProfileRangeValid(p)).toBe(true);
    }
  });

  it("generated stats respect profile ranges and invariants", () => {
    const profile = CANONICAL_RECRUITMENT_PROFILES[0]!;
    const rng = () => 0.42;
    for (let i = 0; i < 20; i++) {
      const { stats, potential } = generateStatsFromProfile(profile, () => Math.random());
      for (const key of STAT_KEYS) {
        expect(stats[key]).toBeGreaterThanOrEqual(profile.currentRanges[key].min);
        expect(stats[key]).toBeLessThanOrEqual(profile.currentRanges[key].max);
        expect(potential[key]).toBeGreaterThanOrEqual(Math.max(profile.potentialRanges[key].min, stats[key]));
        expect(potential[key]).toBeLessThanOrEqual(profile.potentialRanges[key].max);
        expect(stats[key]).toBeLessThanOrEqual(potential[key]);
      }
    }
    expect(rng()).toBeGreaterThan(0);
  });

  it("normal Radio hides exact potential numbers", () => {
    const pool = withRecruitmentCosts(generateRecruitmentCandidates(99, 0));
    const card = buildCandidateCardView(pool[0]!);
    for (const row of card.statRows) {
      expect(row).not.toHaveProperty("potential");
      expect(row.current).toBe(pool[0]!.stats[row.key]);
    }
  });

  it("Recruitment Lab stat rows show exact potential", () => {
    const pool = withRecruitmentCosts(generateRecruitmentCandidates(99, 0));
    const rows = candidateStatRows(pool[0]!.stats, pool[0]!.potential);
    expect(rows[0]!.potential).toBe(pool[0]!.potential.aim);
  });

  it("player stat rows hide exact potential", () => {
    const pool = withRecruitmentCosts(generateRecruitmentCandidates(99, 0));
    const rows = playerStatRows(pool[0]!.stats, pool[0]!.potential);
    expect(rows[0]).not.toHaveProperty("potential");
    expect(rows[0]!.bar.length).toBeGreaterThan(0);
  });

  it("already-hired operator unchanged by profile override", () => {
    initRecruitmentLab(true);
    applyRecruitmentLabOverrides(
      { profiles: {}, previewCandidates: {}, crewCapacity: 4 },
      true,
    );
    const meta = freshMeta();
    meta.bank = 99999;
    const pool = withRecruitmentCosts(generateRecruitmentCandidates(1, 0));
    meta.crew.recruitment.candidates = pool;
    const hired = hireCandidate(meta, pool[0]!.candidateId);
    expect(hired.ok).toBe(true);
    if (!hired.ok) return;
    const before = { ...hired.operator.stats };
    applyRecruitmentLabOverrides({
      profiles: {
        [pool[0]!.archetypeId]: {
          currentRanges: { aim: { min: 10, max: 15 } },
        },
      },
      previewCandidates: {},
      crewCapacity: 4,
    }, true);
    expect(hired.operator.stats).toEqual(before);
    resetRecruitmentLabAll();
  });
});

describe("recruitment traits", () => {
  it("canonical perks carry polarity", () => {
    expect(traitPolarity("marksman")).toBe("POSITIVE");
    expect(traitPolarity("wobbly_aim")).toBe("NEGATIVE");
  });

  it("positive and negative pools filter correctly", () => {
    for (const id of ["marksman", "tough", "quick_hands", "lightfoot"]) {
      expect(isPositivePerkId(id)).toBe(true);
      expect(isNegativeTraitId(id)).toBe(false);
    }
    for (const id of RECRUITABLE_NEGATIVE_TRAIT_IDS) {
      expect(isNegativeTraitId(id)).toBe(true);
      expect(isPositivePerkId(id)).toBe(false);
    }
  });
});

describe("recruitment prerequisites", () => {
  const facts = progressionFactsFromMeta(freshMeta());

  it("no requirements => eligible", () => {
    expect(isProfileEligible([], facts)).toBe(true);
  });

  it("quest requirement uses canonical quest progress", () => {
    const req: RecruitmentRequirement = { type: "QUEST_COMPLETED", questId: "debut" };
    const incomplete = evaluateRequirement(req, facts);
    const completeMeta = freshMeta();
    completeMeta.quests.scavKills = 25;
    const complete = evaluateRequirement(req, progressionFactsFromMeta(completeMeta));
    expect(incomplete.met).toBe(false);
    expect(complete.met).toBe(true);
  });

  it("wave requirement uses map-specific counter", () => {
    const req: RecruitmentRequirement = { type: "WAVES_COMPLETED", count: 20, mapId: "kolkhoz" };
    const m = freshMeta();
    m.quests.wavesCompletedByMap = { kolkhoz: 13 };
    const ev = evaluateRequirement(req, progressionFactsFromMeta(m));
    expect(ev.met).toBe(false);
    expect(ev.current).toBe(13);
    expect(ev.target).toBe(20);
  });

  it("multiple requirements use ALL semantics", () => {
    const reqs: RecruitmentRequirement[] = [
      { type: "TOTAL_KILLS", count: 1, enemyId: "scav" },
      { type: "WAVES_COMPLETED", count: 100, mapId: "kolkhoz" },
    ];
    const m = freshMeta();
    m.quests.scavKills = 5;
    expect(isProfileEligible(reqs, progressionFactsFromMeta(m))).toBe(false);
  });

  it("facts include radio state and quality", () => {
    expect(facts.radioState).toBe("BROKEN");
    expect(facts.effectiveQuality).toBe(1);
  });
});

describe("recruitment lab preview pool", () => {
  it("generate test pool does not mutate real pool", () => {
    initRecruitmentLab(true);
    const meta = freshMeta();
    const before = meta.crew.recruitment.candidates.length;
    generateTestRecruitmentPool(123, 1, progressionFactsFromMeta(meta), [], getOverridesWithSlots(2), meta.crew.radio);
    expect(meta.crew.recruitment.candidates.length).toBe(before);
    resetRecruitmentLabAll();
  });

  it("eligible profiles filter locked profiles", () => {
    initRecruitmentLab(true);
    const meta = freshMeta();
    applyRecruitmentLabOverrides({
      profiles: {
        rifleman: {
          requirements: [{ type: "WAVES_COMPLETED", count: 999, mapId: "kolkhoz" }],
        },
      },
      previewCandidates: {},
    }, true);
    const eligible = eligibleProfiles(progressionFactsFromMeta(meta));
    expect(eligible.some((p) => p.id === "rifleman")).toBe(false);
    resetRecruitmentLabAll();
  });
});

function getOverridesWithSlots(slotCount: number) {
  return { profiles: {}, previewCandidates: {}, slotCount };
}
