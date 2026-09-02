import { describe, expect, it } from "bun:test";
import { freshMeta } from "../meta";
import { hireCandidate, regenerateRecruitmentPool } from "./crew";
import { generateRecruitmentCandidates, kitEquipmentValue } from "./generation";
import { calculateRecruitmentCost } from "./recruitment";
import { isValidStats, STAT_MAX, STAT_MIN, isValidStatPair } from "./stats";
import { isCanonicalPerkId } from "./perks";
import { WEAPONS } from "../gear";
import { freshRadioProgression } from "./radioProgression";

function metaWithSignal(slots = 1) {
  const meta = freshMeta();
  meta.crew.radio = {
    ...freshRadioProgression(),
    radioState: "SIGNAL_RESTORED",
    modifiers:
      slots > 1
        ? [{ id: "extra", kind: "RECRUITMENT_SLOT_BONUS", source: "quest", amount: slots - 1 }]
        : [],
  };
  regenerateRecruitmentPool(meta);
  return meta;
}

describe("recruitment generation", () => {
  it("generates requested candidate count", () => {
    const pool = generateRecruitmentCandidates(42, 0, 3);
    expect(pool).toHaveLength(3);
  });

  it("default helper generates at least one when count omitted with positive count arg", () => {
    const pool = generateRecruitmentCandidates(42, 0, 1);
    expect(pool).toHaveLength(1);
  });

  it("gives candidates unique candidate IDs", () => {
    const pool = generateRecruitmentCandidates(99, 1, 3);
    const ids = new Set(pool.map((c) => c.candidateId));
    expect(ids.size).toBe(pool.length);
  });

  it("gives candidates valid names", () => {
    const pool = generateRecruitmentCandidates(7, 2, 3);
    for (const c of pool) expect(c.name.length).toBeGreaterThan(0);
  });

  it("keeps generated stats within legal ranges", () => {
    const pool = generateRecruitmentCandidates(123, 3, 5);
    for (const c of pool) {
      expect(isValidStats(c.stats)).toBe(true);
      expect(isValidStatPair(c.stats, c.potential)).toBe(true);
      for (const v of Object.values(c.stats)) {
        expect(v).toBeGreaterThanOrEqual(STAT_MIN);
        expect(v).toBeLessThanOrEqual(STAT_MAX);
      }
    }
  });

  it("uses canonical perk/trait IDs when traits roll", () => {
    const pool = generateRecruitmentCandidates(55, 4, 20);
    const withTraits = pool.filter((c) => (c.perkIds?.length ?? 0) > 0 || (c.traitIds?.length ?? 0) > 0);
    // With quality 1 some may have 0 traits — ensure those that have them are canonical
    for (const c of pool) {
      for (const id of c.perkIds ?? []) expect(isCanonicalPerkId(id)).toBe(true);
      for (const id of c.traitIds ?? []) expect(isCanonicalPerkId(id)).toBe(true);
    }
    expect(withTraits.length).toBeGreaterThan(0);
  });

  it("uses canonical equipment IDs", () => {
    const pool = generateRecruitmentCandidates(88, 5, 3);
    for (const c of pool) {
      expect(WEAPONS[c.equipment.weapon]).toBeDefined();
    }
  });

  it("same seed creates same candidates", () => {
    const a = generateRecruitmentCandidates(1000, 0, 2);
    const b = generateRecruitmentCandidates(1000, 0, 2);
    expect(a.map((c) => c.name)).toEqual(b.map((c) => c.name));
    expect(a.map((c) => c.archetypeId)).toEqual(b.map((c) => c.archetypeId));
  });

  it("different seed can create different candidates", () => {
    const a = generateRecruitmentCandidates(1, 0, 1);
    const b = generateRecruitmentCandidates(2, 0, 1);
    expect(a[0]!.name).not.toBe(b[0]!.name);
  });
});

describe("recruitment cost", () => {
  it("is deterministic", () => {
    const [c] = generateRecruitmentCandidates(5, 0, 1);
    const a = calculateRecruitmentCost(c!);
    const b = calculateRecruitmentCost(c!);
    expect(a).toBe(b);
  });

  it("includes starting equipment value", () => {
    const base = {
      candidateId: "x",
      name: "TEST",
      roleLabel: "TEST",
      archetypeId: "rifleman",
      stats: { aim: 50, toughness: 50, handling: 50, mobility: 50 },
      potential: { aim: 80, toughness: 75, handling: 78, mobility: 72 },
      perkIds: ["marksman"],
      traitIds: ["marksman"],
      equipment: { weapon: "m4", attachments: ["optic"], armor: "paca" },
      appearance: { presetId: "scav_0" },
    };
    const rich = calculateRecruitmentCost(base);
    const poor = calculateRecruitmentCost({
      ...base,
      equipment: { weapon: "pm", attachments: [], armor: null },
    });
    expect(rich).toBeGreaterThan(poor);
    expect(kitEquipmentValue(base.equipment)).toBeGreaterThan(0);
  });

  it("never returns invalid cost", () => {
    const pool = generateRecruitmentCandidates(33, 6, 3);
    for (const c of pool) {
      const cost = calculateRecruitmentCost(c);
      expect(cost).toBeGreaterThan(0);
    }
  });
});

describe("hiring", () => {
  it("fails with insufficient currency", () => {
    const meta = metaWithSignal(1);
    meta.bank = 0;
    const candidate = meta.crew.recruitment.candidates[0]!;
    expect(hireCandidate(meta, candidate.candidateId).ok).toBe(false);
  });

  it("deducts exact cost once and removes candidate", () => {
    const meta = metaWithSignal(1);
    const candidate = meta.crew.recruitment.candidates[0]!;
    meta.bank = candidate.cost + 50;
    const before = meta.bank;
    const result = hireCandidate(meta, candidate.candidateId);
    expect(result.ok).toBe(true);
    expect(meta.bank).toBe(before - candidate.cost);
    expect(meta.crew.recruitment.candidates.find((c) => c.candidateId === candidate.candidateId)).toBeUndefined();
  });

  it("repeated hire attempt does not double charge", () => {
    const meta = metaWithSignal(1);
    const candidate = meta.crew.recruitment.candidates[0]!;
    meta.bank = candidate.cost + 100;
    hireCandidate(meta, candidate.candidateId);
    const bank = meta.bank;
    expect(hireCandidate(meta, candidate.candidateId).ok).toBe(false);
    expect(meta.bank).toBe(bank);
  });
});
