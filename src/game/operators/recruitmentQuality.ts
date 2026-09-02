/**
 * Recruitment quality tiers and trait-probability distributions.
 * Quality biases opportunities; it does not guarantee every stat increases.
 */

import type { RecruitmentQuality } from "./radioProgression";
import { RECRUITMENT_QUALITY_MAX, RECRUITMENT_QUALITY_MIN } from "./radioProgression";

export interface TraitProbabilityConfig {
  /** Chance of at least N positive traits. Must satisfy P(>=1) >= P(>=2) >= P(>=3). */
  positiveAtLeast1: number;
  positiveAtLeast2: number;
  positiveAtLeast3: number;
  /** Chance of at least one negative trait. */
  negativeAtLeast1: number;
}

export interface QualityTierDef {
  quality: RecruitmentQuality;
  /** Bias applied to current-stat rolls (−1..+1 fraction of range). */
  currentBias: number;
  /** Bias applied to potential rolls. */
  potentialBias: number;
  /** Attachment tier weight shift toward higher tiers. */
  attachHighBias: number;
  /** Armor presence weight multiplier. */
  armorWeightMult: number;
  traits: TraitProbabilityConfig;
}

/** Canonical quality tier definitions — tunable via Recruitment Lab overrides. */
export const CANONICAL_QUALITY_TIERS: Record<RecruitmentQuality, QualityTierDef> = {
  1: {
    quality: 1,
    currentBias: 0,
    potentialBias: 0,
    attachHighBias: 0,
    armorWeightMult: 1,
    traits: {
      positiveAtLeast1: 0.45,
      positiveAtLeast2: 0.12,
      positiveAtLeast3: 0.04,
      negativeAtLeast1: 0.18,
    },
  },
  2: {
    quality: 2,
    currentBias: 0.08,
    potentialBias: 0.06,
    attachHighBias: 0.05,
    armorWeightMult: 1.1,
    traits: {
      positiveAtLeast1: 0.55,
      positiveAtLeast2: 0.2,
      positiveAtLeast3: 0.08,
      negativeAtLeast1: 0.14,
    },
  },
  3: {
    quality: 3,
    currentBias: 0.14,
    potentialBias: 0.12,
    attachHighBias: 0.1,
    armorWeightMult: 1.2,
    traits: {
      positiveAtLeast1: 0.65,
      positiveAtLeast2: 0.3,
      positiveAtLeast3: 0.12,
      negativeAtLeast1: 0.1,
    },
  },
  4: {
    quality: 4,
    currentBias: 0.2,
    potentialBias: 0.18,
    attachHighBias: 0.15,
    armorWeightMult: 1.3,
    traits: {
      positiveAtLeast1: 0.75,
      positiveAtLeast2: 0.4,
      positiveAtLeast3: 0.18,
      negativeAtLeast1: 0.08,
    },
  },
  5: {
    quality: 5,
    currentBias: 0.25,
    potentialBias: 0.22,
    attachHighBias: 0.2,
    armorWeightMult: 1.4,
    traits: {
      positiveAtLeast1: 0.85,
      positiveAtLeast2: 0.5,
      positiveAtLeast3: 0.25,
      negativeAtLeast1: 0.05,
    },
  },
};

export function getQualityTier(quality: number): QualityTierDef {
  const q = Math.max(
    RECRUITMENT_QUALITY_MIN,
    Math.min(RECRUITMENT_QUALITY_MAX, Math.round(quality)),
  ) as RecruitmentQuality;
  return CANONICAL_QUALITY_TIERS[q];
}

export function validateTraitProbabilities(cfg: TraitProbabilityConfig): string[] {
  const errors: string[] = [];
  const keys: (keyof TraitProbabilityConfig)[] = [
    "positiveAtLeast1",
    "positiveAtLeast2",
    "positiveAtLeast3",
    "negativeAtLeast1",
  ];
  for (const k of keys) {
    const v = cfg[k];
    if (typeof v !== "number" || v < 0 || v > 1) errors.push(`${k} must be in [0,1]`);
  }
  if (cfg.positiveAtLeast1 < cfg.positiveAtLeast2) {
    errors.push("P(>=1) must be >= P(>=2)");
  }
  if (cfg.positiveAtLeast2 < cfg.positiveAtLeast3) {
    errors.push("P(>=2) must be >= P(>=3)");
  }
  return errors;
}

/**
 * Deterministic trait count from cumulative probabilities.
 * roll in [0,1): count = 3 if roll < P3, else 2 if roll < P2, else 1 if roll < P1, else 0.
 */
export function rollPositiveTraitCount(rng: () => number, cfg: TraitProbabilityConfig): number {
  const r = rng();
  if (r < cfg.positiveAtLeast3) return 3;
  if (r < cfg.positiveAtLeast2) return 2;
  if (r < cfg.positiveAtLeast1) return 1;
  return 0;
}

export function rollNegativeTraitCount(rng: () => number, cfg: TraitProbabilityConfig): number {
  return rng() < cfg.negativeAtLeast1 ? 1 : 0;
}

export function mergeTraitConfig(
  base: TraitProbabilityConfig,
  patch?: Partial<TraitProbabilityConfig>,
): TraitProbabilityConfig {
  return { ...base, ...patch };
}
