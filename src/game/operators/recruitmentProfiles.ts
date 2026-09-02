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

export interface RecruitmentProfileKit {
  weaponPool: readonly string[];
  armorPool: readonly (string | null)[];
  attachTierWeights: { low: number; mid: number; high: number };
}

/** Canonical recruitment profile — generation rules, not a specific person. */
export interface RecruitmentProfile {
  id: string;
  displayName: string;
  roleLabel: string;
  enabled: boolean;
  weight: number;
  currentRanges: Record<keyof OperatorBaseStats, StatRange>;
  potentialRanges: Record<keyof OperatorBaseStats, StatRange>;
  positivePerkPool: readonly string[];
  negativeTraitPool: readonly string[];
  /** 0–1 probability of rolling one negative trait. */
  negativeTraitChance: number;
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

const KIT_BY_ARCHETYPE: Record<string, RecruitmentProfileKit> = {
  marksman: {
    weaponPool: ["adar", "pm"],
    armorPool: [null, "paca"],
    attachTierWeights: { low: 0.35, mid: 0.4, high: 0.25 },
  },
  runner: {
    weaponPool: ["pm", "toz"],
    armorPool: [null],
    attachTierWeights: { low: 0.5, mid: 0.35, high: 0.15 },
  },
  bruiser: {
    weaponPool: ["toz", "mp133"],
    armorPool: [null, "paca"],
    attachTierWeights: { low: 0.3, mid: 0.45, high: 0.25 },
  },
  rifleman: {
    weaponPool: ["adar", "ak74"],
    armorPool: [null, "paca"],
    attachTierWeights: { low: 0.35, mid: 0.4, high: 0.25 },
  },
  scrapper: {
    weaponPool: ["toz", "pm"],
    armorPool: [null, "paca"],
    attachTierWeights: { low: 0.4, mid: 0.4, high: 0.2 },
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
    currentRanges: ranges.current,
    potentialRanges: ranges.potential,
    positivePerkPool: [...RECRUITABLE_PERK_IDS],
    negativeTraitPool: [...RECRUITABLE_NEGATIVE_TRAIT_IDS],
    negativeTraitChance: 0.12,
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
): { stats: OperatorBaseStats; potential: OperatorBaseStats } {
  const stats = {} as OperatorBaseStats;
  const potential = {} as OperatorBaseStats;
  for (const key of STAT_KEYS) {
    stats[key] = rollStatInRange(rng, profile.currentRanges[key], clampStat);
    const potMin = Math.max(profile.potentialRanges[key].min, stats[key]);
    const potMax = Math.max(potMin, profile.potentialRanges[key].max);
    potential[key] = rollStatInRange(rng, { min: potMin, max: potMax }, clampPotential);
  }
  return { stats, potential: enforceCurrentPotentialInvariant(stats, potential) };
}

export function profileWeightShare(
  profiles: readonly Pick<RecruitmentProfile, "id" | "weight">[],
): Record<string, number> {
  const total = profiles.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  if (total <= 0) return Object.fromEntries(profiles.map((p) => [p.id, 0]));
  return Object.fromEntries(
    profiles.map((p) => [p.id, Math.max(0, p.weight) / total]),
  );
}

/** Profile after DEV Recruitment Lab merge. */
export type EffectiveRecruitmentProfile = RecruitmentProfile & { hasOverride?: boolean };
