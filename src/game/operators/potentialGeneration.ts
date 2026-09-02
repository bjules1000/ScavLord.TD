import { ARCHETYPE_BY_ID } from "./archetypes";
import { mulberry32, seedFromParts } from "./rng";
import {
  STAT_KEYS,
  clampPotential,
  clampStat,
  enforceCurrentPotentialInvariant,
} from "./stats";
import type { OperatorBaseStats } from "./types";

/** Recruitment Lab tuning — current stat generation. */
export const CURRENT_GENERATION = {
  variationSpan: 14,
} as const;

/** Recruitment Lab tuning — potential stat generation. */
export const POTENTIAL_GENERATION = {
  neutral: 78,
  variationSpan: 44,
  minGap: 4,
  maxGap: 58,
  /** Chance a stat rolls a tight ceiling despite archetype tendency. */
  lowCeilingChance: 0.14,
  lowCeilingMaxGap: 10,
} as const;

export function generateCurrentVariation(rng: () => number): OperatorBaseStats {
  const jitter = () => clampStat(50 + Math.round((rng() - 0.5) * CURRENT_GENERATION.variationSpan));
  return { aim: jitter(), toughness: jitter(), handling: jitter(), mobility: jitter() };
}

export function generatePotentialStats(
  current: OperatorBaseStats,
  archetypeId: string,
  rng: () => number,
): OperatorBaseStats {
  const arch = ARCHETYPE_BY_ID[archetypeId];
  const out = {} as OperatorBaseStats;
  for (const key of STAT_KEYS) {
    const potTend = arch?.potentialTendencies?.[key] ?? 0;
    const independent =
      POTENTIAL_GENERATION.neutral +
      potTend +
      (rng() - 0.5) * POTENTIAL_GENERATION.variationSpan;
    const gap =
      POTENTIAL_GENERATION.minGap +
      rng() * (POTENTIAL_GENERATION.maxGap - POTENTIAL_GENERATION.minGap);
    let pot = Math.round(Math.max(independent, current[key] + gap));
    if (rng() < POTENTIAL_GENERATION.lowCeilingChance) {
      pot = Math.min(pot, current[key] + Math.round(2 + rng() * POTENTIAL_GENERATION.lowCeilingMaxGap));
    }
    pot = Math.max(pot, current[key]);
    out[key] = clampPotential(pot);
  }
  return enforceCurrentPotentialInvariant(current, out);
}

/** Deterministic potential for saves/operators missing potential data. */
export function migratePotentialStats(
  current: OperatorBaseStats,
  archetypeId: string,
  identityKey: string,
): OperatorBaseStats {
  const rng = mulberry32(seedFromParts("migrate-potential", identityKey, archetypeId));
  return generatePotentialStats(current, archetypeId, rng);
}
