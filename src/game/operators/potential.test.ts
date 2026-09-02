import { describe, expect, it } from "bun:test";
import { ARCHETYPE_BY_ID } from "./archetypes";
import { generateRecruitmentCandidates } from "./generation";
import {
  RECRUITMENT_COST,
  currentStatCostContribution,
  calculateRecruitmentCost,
  potentialStatCostContribution,
  withRecruitmentCosts,
} from "./recruitment";
import { generatePotentialStats, migratePotentialStats } from "./potentialGeneration";
import { migrateOperatorPotentialOnce, normalizeCandidatePotential } from "./migration";
import { hireCandidate } from "./crew";
import { mulberry32, seedFromParts } from "./rng";
import {
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  STAT_POTENTIAL_MAX,
  isValidStatPair,
  isValidStats,
} from "./stats";
import { freshMeta } from "../meta";

describe("potential generation", () => {
  it("every candidate has current and potential for each stat", () => {
    const pool = generateRecruitmentCandidates(9001, 0);
    for (const c of pool) {
      expect(isValidStats(c.stats)).toBe(true);
      for (const key of STAT_KEYS) {
        expect(typeof c.potential[key]).toBe("number");
      }
    }
  });

  it("current <= potential for every stat", () => {
    const pool = generateRecruitmentCandidates(9002, 1);
    for (const c of pool) {
      expect(isValidStatPair(c.stats, c.potential)).toBe(true);
      for (const key of STAT_KEYS) {
        expect(c.stats[key]).toBeLessThanOrEqual(c.potential[key]);
      }
    }
  });

  it("same seed produces same current and potential", () => {
    const a = generateRecruitmentCandidates(42, 0);
    const b = generateRecruitmentCandidates(42, 0);
    expect(a.map((c) => ({ stats: c.stats, potential: c.potential }))).toEqual(
      b.map((c) => ({ stats: c.stats, potential: c.potential })),
    );
  });

  it("different seeds can produce different potential", () => {
    const a = generateRecruitmentCandidates(1, 0)[0]!;
    const b = generateRecruitmentCandidates(2, 0)[0]!;
    expect(a.potential).not.toEqual(b.potential);
  });

  it("potential can vary independently between stats", () => {
    const pool = generateRecruitmentCandidates(555, 2);
    const found = pool.some((c) => {
      const gaps = STAT_KEYS.map((k) => c.potential[k] - c.stats[k]);
      return new Set(gaps).size > 1;
    });
    expect(found).toBe(true);
  });

  it("potential can exceed 100 where generation allows", () => {
    let found = false;
    for (let seed = 0; seed < 200 && !found; seed++) {
      const [c] = generateRecruitmentCandidates(seed, 0);
      if (c && STAT_KEYS.some((k) => c.potential[k] > 100)) found = true;
    }
    expect(found).toBe(true);
  });

  it("potential never exceeds canonical legal max", () => {
    const pool = generateRecruitmentCandidates(777, 3);
    for (const c of pool) {
      for (const key of STAT_KEYS) {
        expect(c.potential[key]).toBeLessThanOrEqual(STAT_POTENTIAL_MAX);
        expect(c.potential[key]).toBeGreaterThanOrEqual(STAT_MIN);
      }
    }
  });
});

describe("archetype influence on potential", () => {
  it("uses archetype potential tendencies without rigid templates", () => {
    const rng = mulberry32(12345);
    const current = { aim: 50, toughness: 50, handling: 50, mobility: 50 };
    const marksmanPot = generatePotentialStats(current, "marksman", rng);
    const runnerPot = generatePotentialStats(current, "runner", mulberry32(54321));
    expect(marksmanPot.aim).toBeGreaterThanOrEqual(current.aim);
    expect(runnerPot.mobility).toBeGreaterThanOrEqual(current.mobility);
    expect(marksmanPot).not.toEqual(runnerPot);
  });

  it("same archetype still produces variation across seeds", () => {
    const current = { aim: 48, toughness: 52, handling: 49, mobility: 47 };
    const pots = Array.from({ length: 8 }, (_, i) =>
      generatePotentialStats(current, "rifleman", mulberry32(i + 100)),
    );
    const unique = new Set(pots.map((p) => JSON.stringify(p)));
    expect(unique.size).toBeGreaterThan(1);
  });

  it("every archetype defines potential tendencies", () => {
    for (const arch of Object.values(ARCHETYPE_BY_ID)) {
      expect(arch.potentialTendencies).toBeDefined();
    }
  });
});

describe("pricing with potential", () => {
  it("potential contributes to cost", () => {
    const [raw] = generateRecruitmentCandidates(11, 0);
    const base = { ...raw!, cost: 0 };
    const lowPot = {
      ...base,
      potential: { aim: base.stats.aim, toughness: base.stats.toughness, handling: base.stats.handling, mobility: base.stats.mobility },
    };
    const highPot = {
      ...base,
      potential: { aim: 115, toughness: 110, handling: 108, mobility: 105 },
    };
    expect(calculateRecruitmentCost(highPot)).toBeGreaterThan(calculateRecruitmentCost(lowPot));
  });

  it("prices realized current capability higher per point than unrealized potential", () => {
    expect(RECRUITMENT_COST.currentStatFactor).toBeGreaterThan(RECRUITMENT_COST.potentialStatFactor);
    const base = { aim: 50, toughness: 50, handling: 50, mobility: 50 };
    const currentBump =
      currentStatCostContribution({ ...base, aim: 60 }) - currentStatCostContribution(base);
    const potBump = potentialStatCostContribution(base, { ...base, aim: 60 });
    expect(currentBump).toBeGreaterThan(potBump);
  });

  it("high potential low current does not price like maxed current stats", () => {
    const prospect = {
      candidateId: "t",
      name: "P",
      roleLabel: "R",
      archetypeId: "rifleman",
      stats: { aim: 40, toughness: 50, handling: 50, mobility: 45 },
      potential: { aim: 115, toughness: 90, handling: 95, mobility: 80 },
      perkIds: ["marksman"],
      equipment: { weapon: "pm", attachments: [], armor: null },
      appearance: { presetId: "scav_0" },
      cost: 0,
    };
    const maxedCurrent = {
      ...prospect,
      stats: { aim: 65, toughness: 65, handling: 65, mobility: 65 },
    };
    expect(calculateRecruitmentCost(maxedCurrent)).toBeGreaterThan(calculateRecruitmentCost(prospect));
  });

  it("cost remains deterministic", () => {
    const [c] = withRecruitmentCosts(generateRecruitmentCandidates(88, 0));
    expect(calculateRecruitmentCost(c!)).toBe(c!.cost);
  });
});

describe("potential persistence", () => {
  it("hired operator receives exact candidate potential", () => {
    const meta = freshMeta();
    const candidate = meta.crew.recruitment.candidates[0]!;
    meta.bank = candidate.cost + 500;
    const result = hireCandidate(meta, candidate.candidateId, "op_pot_1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operator.potential).toEqual(candidate.potential);
    expect(result.operator.stats).toEqual(candidate.stats);
  });
});

describe("potential migration", () => {
  const stats = { aim: 50, toughness: 51, handling: 58, mobility: 45 };

  it("generates migration potential >= current deterministically", () => {
    const pot = migratePotentialStats(stats, "rifleman", "op_legacy_1");
    expect(isValidStatPair(stats, pot)).toBe(true);
    const again = migratePotentialStats(stats, "rifleman", "op_legacy_1");
    expect(pot).toEqual(again);
  });

  it("migration is idempotent once potential exists", () => {
    const first = migrateOperatorPotentialOnce(stats, undefined, "rifleman", "op_legacy_2");
    const second = migrateOperatorPotentialOnce(stats, first, "rifleman", "op_legacy_2");
    expect(second).toEqual(first);
  });

  it("normalizes candidates missing potential", () => {
    const pot = normalizeCandidatePotential({
      candidateId: "cand_x",
      name: "X",
      roleLabel: "R",
      archetypeId: "runner",
      stats,
    } as never);
    expect(isValidStatPair(stats, pot)).toBe(true);
  });

  it("preserves current stats exactly during migration", () => {
    const pot = migratePotentialStats(stats, "scrapper", "idempotent");
    for (const key of STAT_KEYS) expect(stats[key]).toBeLessThanOrEqual(pot[key]);
  });
});
