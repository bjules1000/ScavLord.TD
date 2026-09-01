import { describe, expect, it } from "bun:test";
import { freshMeta } from "../meta";
import { hireCandidate } from "./crew";
import {
  RECRUITMENT_POOL_SIZE,
  generateRecruitmentCandidates,
  kitEquipmentValue,
} from "./generation";
import { calculateRecruitmentCost } from "./recruitment";
import { isValidStats, STAT_MAX, STAT_MIN } from "./stats";
import { isCanonicalPerkId } from "./perks";
import { WEAPONS } from "../gear";

describe("recruitment generation", () => {
  it("generates expected candidate count", () => {
    const pool = generateRecruitmentCandidates(42, 0);
    expect(pool).toHaveLength(RECRUITMENT_POOL_SIZE);
  });

  it("gives candidates unique candidate IDs", () => {
    const pool = generateRecruitmentCandidates(99, 1);
    const ids = new Set(pool.map((c) => c.candidateId));
    expect(ids.size).toBe(pool.length);
  });

  it("gives candidates valid names", () => {
    const pool = generateRecruitmentCandidates(7, 2);
    for (const c of pool) expect(c.name.length).toBeGreaterThan(0);
  });

  it("keeps generated stats within legal ranges", () => {
    const pool = generateRecruitmentCandidates(123, 3);
    for (const c of pool) {
      expect(isValidStats(c.stats)).toBe(true);
      for (const v of Object.values(c.stats)) {
        expect(v).toBeGreaterThanOrEqual(STAT_MIN);
        expect(v).toBeLessThanOrEqual(STAT_MAX);
      }
    }
  });

  it("uses canonical perk IDs", () => {
    const pool = generateRecruitmentCandidates(55, 4);
    for (const c of pool) {
      expect(c.perkIds.length).toBeGreaterThan(0);
      for (const id of c.perkIds) expect(isCanonicalPerkId(id)).toBe(true);
    }
  });

  it("uses canonical equipment IDs", () => {
    const pool = generateRecruitmentCandidates(88, 5);
    for (const c of pool) {
      expect(WEAPONS[c.equipment.weapon]).toBeDefined();
    }
  });

  it("same seed creates same candidates", () => {
    const a = generateRecruitmentCandidates(1000, 0);
    const b = generateRecruitmentCandidates(1000, 0);
    expect(a.map((c) => c.name)).toEqual(b.map((c) => c.name));
    expect(a.map((c) => c.archetypeId)).toEqual(b.map((c) => c.archetypeId));
  });

  it("different seed can create different candidates", () => {
    const a = generateRecruitmentCandidates(1, 0);
    const b = generateRecruitmentCandidates(2, 0);
    expect(a[0]!.name).not.toBe(b[0]!.name);
  });
});

describe("recruitment cost", () => {
  it("is deterministic", () => {
    const [c] = generateRecruitmentCandidates(5, 0);
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
      perkIds: ["marksman"],
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
    const pool = generateRecruitmentCandidates(33, 6);
    for (const c of pool) {
      const cost = calculateRecruitmentCost(c);
      expect(cost).toBeGreaterThan(0);
    }
  });
});

describe("hiring", () => {
  it("fails with insufficient currency", () => {
    const meta = freshMeta();
    meta.bank = 0;
    const candidate = meta.crew.recruitment.candidates[0]!;
    expect(hireCandidate(meta, candidate.candidateId).ok).toBe(false);
  });

  it("deducts exact cost once and removes candidate", () => {
    const meta = freshMeta();
    const candidate = meta.crew.recruitment.candidates[0]!;
    meta.bank = candidate.cost + 500;
    const before = meta.bank;
    const result = hireCandidate(meta, candidate.candidateId, "op_test_1");
    expect(result.ok).toBe(true);
    expect(meta.bank).toBe(before - candidate.cost);
    expect(meta.crew.recruitment.candidates.some((c) => c.candidateId === candidate.candidateId)).toBe(
      false,
    );
    expect(meta.crew.operators).toHaveLength(1);
    expect(meta.crew.operators[0]!.id).toBe("op_test_1");
  });

  it("repeated hire attempt does not double charge", () => {
    const meta = freshMeta();
    const candidate = meta.crew.recruitment.candidates[0]!;
    meta.bank = candidate.cost + 1000;
    hireCandidate(meta, candidate.candidateId, "op_a");
    const bank = meta.bank;
    expect(hireCandidate(meta, candidate.candidateId, "op_b").ok).toBe(false);
    expect(meta.bank).toBe(bank);
    expect(meta.crew.operators).toHaveLength(1);
  });
});
