import type { OperatorBaseStats } from "./types";

/** Canonical stat bounds for generation and validation. */
export const STAT_MIN = 35;
export const STAT_MAX = 65;
export const STAT_NEUTRAL = 50;

export const STAT_LABELS: Record<keyof OperatorBaseStats, string> = {
  aim: "AIM",
  toughness: "TOUGH",
  handling: "HANDLING",
  mobility: "MOBILITY",
};

export function clampStat(value: number): number {
  return Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(value)));
}

export function neutralStats(): OperatorBaseStats {
  return { aim: STAT_NEUTRAL, toughness: STAT_NEUTRAL, handling: STAT_NEUTRAL, mobility: STAT_NEUTRAL };
}

export function isValidStats(stats: OperatorBaseStats): boolean {
  return (Object.keys(STAT_LABELS) as (keyof OperatorBaseStats)[]).every((k) => {
    const v = stats[k];
    return typeof v === "number" && v >= STAT_MIN && v <= STAT_MAX;
  });
}

/** Positive deviation from neutral used by recruitment cost. */
export function statQualityScore(stats: OperatorBaseStats): number {
  let score = 0;
  for (const v of Object.values(stats)) {
    if (v > STAT_NEUTRAL) score += v - STAT_NEUTRAL;
    if (v < STAT_NEUTRAL) score += (STAT_NEUTRAL - v) * 0.35;
  }
  return score;
}
