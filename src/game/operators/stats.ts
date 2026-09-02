import type { OperatorBaseStats } from "./types";

/** Canonical current-stat bounds for generation and validation. */
export const STAT_MIN = 35;
export const STAT_MAX = 65;
export const STAT_NEUTRAL = 50;

/** Legal potential ceiling bounds (per stat). */
export const STAT_POTENTIAL_MIN = STAT_MIN;
export const STAT_POTENTIAL_MAX = 120;

/** Absolute display scale for stat bars — shared across all candidates. */
export const STAT_DISPLAY_MAX: Record<keyof OperatorBaseStats, number> = {
  aim: 120,
  toughness: 120,
  handling: 120,
  mobility: 120,
};

export const STAT_LABELS: Record<keyof OperatorBaseStats, string> = {
  aim: "AIM",
  toughness: "TOUGH",
  handling: "HANDLING",
  mobility: "MOBILITY",
};

export const STAT_KEYS = ["aim", "toughness", "handling", "mobility"] as const satisfies ReadonlyArray<
  keyof OperatorBaseStats
>;

export function clampStat(value: number): number {
  return Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(value)));
}

export function clampPotential(value: number): number {
  return Math.max(STAT_POTENTIAL_MIN, Math.min(STAT_POTENTIAL_MAX, Math.round(value)));
}

export function neutralStats(): OperatorBaseStats {
  return { aim: STAT_NEUTRAL, toughness: STAT_NEUTRAL, handling: STAT_NEUTRAL, mobility: STAT_NEUTRAL };
}

export function isValidStats(stats: OperatorBaseStats): boolean {
  return STAT_KEYS.every((k) => {
    const v = stats[k];
    return typeof v === "number" && v >= STAT_MIN && v <= STAT_MAX;
  });
}

export function isValidPotential(potential: OperatorBaseStats): boolean {
  return STAT_KEYS.every((k) => {
    const v = potential[k];
    return typeof v === "number" && v >= STAT_POTENTIAL_MIN && v <= STAT_POTENTIAL_MAX;
  });
}

/** Enforce current <= potential for every stat. Never returns impossible pairs. */
export function enforceCurrentPotentialInvariant(
  current: OperatorBaseStats,
  potential: OperatorBaseStats,
): OperatorBaseStats {
  const out = { ...potential };
  for (const key of STAT_KEYS) {
    out[key] = clampPotential(Math.max(current[key], out[key]));
  }
  return out;
}

export function isValidStatPair(current: OperatorBaseStats, potential: OperatorBaseStats): boolean {
  if (!isValidStats(current) || !isValidPotential(potential)) return false;
  return STAT_KEYS.every((k) => current[k] <= potential[k]);
}

export function growthGap(current: number, potential: number): number {
  return Math.max(0, potential - current);
}

export function growthGaps(
  current: OperatorBaseStats,
  potential: OperatorBaseStats,
): Record<keyof OperatorBaseStats, number> {
  return {
    aim: growthGap(current.aim, potential.aim),
    toughness: growthGap(current.toughness, potential.toughness),
    handling: growthGap(current.handling, potential.handling),
    mobility: growthGap(current.mobility, potential.mobility),
  };
}

/** Positive deviation from neutral used by recruitment cost (current capability). */
export function statQualityScore(stats: OperatorBaseStats): number {
  let score = 0;
  for (const v of Object.values(stats)) {
    if (v > STAT_NEUTRAL) score += v - STAT_NEUTRAL;
    if (v < STAT_NEUTRAL) score += (STAT_NEUTRAL - v) * 0.35;
  }
  return score;
}

/** Unrealized upside — weaker weight than current in pricing. */
export function potentialUpsideScore(current: OperatorBaseStats, potential: OperatorBaseStats): number {
  let score = 0;
  for (const key of STAT_KEYS) {
    score += growthGap(current[key], potential[key]);
  }
  return score;
}
