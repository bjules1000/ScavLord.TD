import type { OperatorBaseStats } from "./types";
import { STAT_KEYS, STAT_LABELS } from "./stats";
import { statPotentialBarSegments } from "./recruitmentUi";

/**
 * Player-visible stat assessment — separate from canonical true potential.
 * Future scouting / signal quality may derive qualitative bands from truePotential.
 */
export interface PlayerStatRow {
  key: keyof OperatorBaseStats;
  label: string;
  current: number;
  bar: string;
}

/** DEV / Recruitment Lab — exact true potential always visible. */
export interface DevStatRow extends PlayerStatRow {
  potential: number;
  growthGap: number;
}

export function playerStatRows(
  stats: OperatorBaseStats,
  truePotential: OperatorBaseStats,
): PlayerStatRow[] {
  return STAT_KEYS.map((key) => {
    const barModel = statPotentialBarSegments(stats[key], truePotential[key], key);
    return {
      key,
      label: STAT_LABELS[key],
      current: stats[key],
      bar: barModel.bar,
    };
  });
}

export function devStatRows(stats: OperatorBaseStats, truePotential: OperatorBaseStats): DevStatRow[] {
  return STAT_KEYS.map((key) => {
    const barModel = statPotentialBarSegments(stats[key], truePotential[key], key);
    return {
      key,
      label: STAT_LABELS[key],
      current: stats[key],
      potential: truePotential[key],
      growthGap: Math.max(0, truePotential[key] - stats[key]),
      bar: barModel.bar,
    };
  });
}
