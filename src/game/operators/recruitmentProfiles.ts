import { ARCHETYPES } from "./archetypes";
import { RECRUITABLE_NEGATIVE_TRAIT_IDS, RECRUITABLE_PERK_IDS } from "./perks";
import type { RecruitmentRequirement } from "./recruitmentRequirements";
import {
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  STAT_POTENTIAL_MAX,
  STAT_POTENTIAL_MIN,
  clampPotential,
  clampStat,
  enforceCurrentPotentialInvariant,
} from "./stats";
import type { OperatorBaseStats } from "./types";

export interface StatRange {
  min: number;
  max: number;
}

export interface WeightedGearEntry {
  id: string | null;
  enabled: boolean;
  weight: number;
}

export interface RecruitmentProfileKit {
  weapons: WeightedGearEntry[];
  armors: WeightedGearEntry[];
  attachments: WeightedGearEntry[];
  /** Chance to roll an attachment when pool is non-empty (0–1). */
  attachmentChance: number;
}

/** Canonical recruitment profile — generation rules, not a specific person. */
export interface RecruitmentProfile {
  id: string;
  displayName: string;
  roleLabel: string;
  enabled: boolean;
  weight: number;
  /** Minimum effective recruitment quality to enter the pool. */
  minQuality: number;
  currentRanges: Record<keyof OperatorBaseStats, StatRange>;
  potentialRanges: Record<keyof OperatorBaseStats, StatRange>;
  positivePerkPool: readonly string[];
  negativeTraitPool: readonly string[];
  /** Profile-local override for negative trait chance; quality tiers also apply. */
  negativeTraitChance?: number;
  kit: RecruitmentProfileKit;
  requirements: readonly RecruitmentRequirement[];
}

/** Per-archetype canonical ranges approximating current production generation. */
const PROFILE_RANGES: Record<
  string,
  { current: Record<keyof OperatorBaseStats, StatRange>; potential: Record<keyof OperatorBaseStats, StatRange> }
> = {
  marksman: {
    current: {
      aim: { min: 48, max: 62 },
      toughness: { min: 38, max: 52 },
      handling: { min: 40, max: 58 },
      mobility: { min: 35, max: 50 },
    },
    potential: {
      aim: { min: 75, max: 115 },
      toughness: { min: 45, max: 85 },
      handling: { min: 55, max: 95 },
      mobility: { min: 40, max: 75 },
    },
  },
  runner: {
    current: {
      aim: { min: 38, max: 54 },
      toughness: { min: 35, max: 48 },
      handling: { min: 42, max: 58 },
      mobility: { min: 50, max: 62 },
    },
    potential: {
      aim: { min: 45, max: 80 },
      toughness: { min: 40, max: 70 },
      handling: { min: 50, max: 90 },
      mobility: { min: 70, max: 110 },
    },
  },
  bruiser: {
    current: {
      aim: { min: 36, max: 50 },
      toughness: { min: 50, max: 62 },
      handling: { min: 35, max: 50 },
      mobility: { min: 35, max: 48 },
    },
    potential: {
      aim: { min: 40, max: 75 },
      toughness: { min: 70, max: 110 },
      handling: { min: 40, max: 70 },
      mobility: { min: 38, max: 65 },
    },
  },
  rifleman: {
    current: {
      aim: { min: 42, max: 58 },
      toughness: { min: 42, max: 56 },
      handling: { min: 42, max: 58 },
      mobility: { min: 40, max: 55 },
    },
    potential: {
      aim: { min: 70, max: 110 },
      toughness: { min: 55, max: 90 },
      handling: { min: 60, max: 100 },
      mobility: { min: 45, max: 80 },
    },
  },
  scrapper: {
    current: {
      aim: { min: 35, max: 50 },
      toughness: { min: 42, max: 58 },
      handling: { min: 45, max: 60 },
      mobility: { min: 40, max: 55 },
    },
    potential: {
      aim: { min: 38, max: 70 },
      toughness: { min: 50, max: 90 },
      handling: { min: 65, max: 105 },
      mobility: { min: 48, max: 85 },
    },
  },
};

function w(id: string | null, weight: number, enabled = true): WeightedGearEntry {
  return { id, enabled, weight };
}

const KIT_BY_ARCHETYPE: Record<string, RecruitmentProfileKit> = {
  marksman: {
    weapons: [w("adar", 40), w("pm", 25)],
    armors: [w(null, 55), w("paca", 45)],
    attachments: [w("grip", 20), w("brake", 15), w("optic", 25)],
    attachmentChance: 0.4,
  },
  runner: {
    weapons: [w("pm", 45), w("toz", 30)],
    armors: [w(null, 100)],
    attachments: [w("grip", 20), w("brake", 10)],
    attachmentChance: 0.25,
  },
  bruiser: {
    weapons: [w("toz", 40), w("mp133", 35)],
    armors: [w(null, 40), w("paca", 60)],
    attachments: [w("grip", 25), w("brake", 20)],
    attachmentChance: 0.35,
  },
  rifleman: {
    weapons: [w("adar", 35), w("ak74", 30), w("pm", 15)],
    armors: [w(null, 50), w("paca", 50)],
    attachments: [w("grip", 25), w("optic", 20), w("brake", 15)],
    attachmentChance: 0.4,
  },
  scrapper: {
    weapons: [w("toz", 40), w("pm", 35)],
    armors: [w(null, 55), w("paca", 45)],
    attachments: [w("grip", 20), w("brake", 15)],
    attachmentChance: 0.3,
  },
};

function defaultRangesFor(id: string): {
  current: Record<keyof OperatorBaseStats, StatRange>;
  potential: Record<keyof OperatorBaseStats, StatRange>;
} {
  return (
    PROFILE_RANGES[id] ?? {
      current: {
        aim: { min: 40, max: 60 },
        toughness: { min: 40, max: 60 },
        handling: { min: 40, max: 60 },
        mobility: { min: 40, max: 60 },
      },
      potential: {
        aim: { min: 70, max: 110 },
        toughness: { min: 60, max: 90 },
        handling: { min: 55, max: 95 },
        mobility: { min: 45, max: 80 },
      },
    }
  );
}

export const CANONICAL_RECRUITMENT_PROFILES: RecruitmentProfile[] = ARCHETYPES.map((arch) => {
  const ranges = defaultRangesFor(arch.id);
  return {
    id: arch.id,
    displayName: arch.roleLabel,
    roleLabel: arch.roleLabel,
    enabled: true,
    weight: arch.weight,
    minQuality: 1,
    currentRanges: ranges.current,
    potentialRanges: ranges.potential,
    positivePerkPool: [...RECRUITABLE_PERK_IDS],
    negativeTraitPool: [...RECRUITABLE_NEGATIVE_TRAIT_IDS],
    kit: KIT_BY_ARCHETYPE[arch.id] ?? KIT_BY_ARCHETYPE["rifleman"]!,
    requirements: [],
  };
});

export const RECRUITMENT_PROFILE_BY_ID: Record<string, RecruitmentProfile> = Object.fromEntries(
  CANONICAL_RECRUITMENT_PROFILES.map((p) => [p.id, p]),
);

export function validateStatRange(range: StatRange, kind: "current" | "potential"): string | null {
  const minBound = kind === "current" ? STAT_MIN : STAT_POTENTIAL_MIN;
  const maxBound = kind === "current" ? STAT_MAX : STAT_POTENTIAL_MAX;
  if (range.min > range.max) return `${kind} min > max`;
  if (range.min < minBound || range.max > maxBound) return `${kind} out of legal bounds`;
  return null;
}

export function validateProfileRanges(profile: Pick<RecruitmentProfile, "currentRanges" | "potentialRanges">): string[] {
  const errors: string[] = [];
  for (const key of STAT_KEYS) {
    const cErr = validateStatRange(profile.currentRanges[key], "current");
    if (cErr) errors.push(`${key} current: ${cErr}`);
    const pErr = validateStatRange(profile.potentialRanges[key], "potential");
    if (pErr) errors.push(`${key} potential: ${pErr}`);
    if (profile.potentialRanges[key].min < profile.currentRanges[key].min) {
      errors.push(`${key}: potential min < current min`);
    }
  }
  return errors;
}

export function isProfileRangeValid(profile: Pick<RecruitmentProfile, "currentRanges" | "potentialRanges">): boolean {
  return validateProfileRanges(profile).length === 0;
}

export function rollStatInRange(rng: () => number, range: StatRange, clamp: (n: number) => number): number {
  const span = Math.max(0, range.max - range.min);
  return clamp(range.min + Math.round(rng() * span));
}

export function generateStatsFromProfile(
  profile: Pick<RecruitmentProfile, "currentRanges" | "potentialRanges">,
  rng: () => number,
  qualityBias = { current: 0, potential: 0 },
): { stats: OperatorBaseStats; potential: OperatorBaseStats } {
  const stats = {} as OperatorBaseStats;
  const potential = {} as OperatorBaseStats;
  for (const key of STAT_KEYS) {
    const cRange = profile.currentRanges[key];
    const cSpan = Math.max(0, cRange.max - cRange.min);
    const cShift = Math.round(cSpan * qualityBias.current * (rng() * 0.5 + 0.5));
    stats[key] = clampStat(cRange.min + Math.round(rng() * cSpan) + cShift);

    const potMin = Math.max(profile.potentialRanges[key].min, stats[key]);
    const potMax = Math.max(potMin, profile.potentialRanges[key].max);
    const pSpan = Math.max(0, potMax - potMin);
    const pShift = Math.round(pSpan * qualityBias.potential * (rng() * 0.5 + 0.5));
    potential[key] = clampPotential(potMin + Math.round(rng() * pSpan) + pShift);
  }
  return { stats, potential: enforceCurrentPotentialInvariant(stats, potential) };
}

export function pickWeightedGear(
  rng: () => number,
  entries: readonly WeightedGearEntry[],
  weightMult = 1,
): string | null {
  const enabled = entries.filter((e) => e.enabled && e.weight > 0);
  if (!enabled.length) return null;
  const weighted = enabled.map((e) => ({
    ...e,
    weight: e.id == null ? e.weight : e.weight * weightMult,
  }));
  const total = weighted.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  for (const e of weighted) {
    roll -= e.weight;
    if (roll <= 0) return e.id;
  }
  return weighted[weighted.length - 1]!.id;
}

export function profileWeightShare(
  profiles: readonly Pick<RecruitmentProfile, "id" | "weight">[],
): Record<string, number> {
  const total = profiles.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  if (total <= 0) return Object.fromEntries(profiles.map((p) => [p.id, 0]));
  return Object.fromEntries(profiles.map((p) => [p.id, Math.max(0, p.weight) / total]));
}

/** Profile after DEV Recruitment Lab merge. */
export type EffectiveRecruitmentProfile = RecruitmentProfile & { hasOverride?: boolean };
