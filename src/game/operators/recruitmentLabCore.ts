/**
 * DEV Recruitment Lab override layer.
 *
 * canonical recruitment data + DEV overrides = effective test recruitment data.
 * Separate namespace from Balance / Economy / Wave / Quest Labs.
 */

import { DEV_TOOLS_ENABLED } from "../dev/tools";
import type { Meta } from "../meta";
import {
  CANONICAL_RECRUITMENT_PROFILES,
  RECRUITMENT_PROFILE_BY_ID,
  isProfileRangeValid,
  profileWeightShare,
  type EffectiveRecruitmentProfile,
  type RecruitmentProfileKit,
  type StatRange,
} from "./recruitmentProfiles";
import {
  evaluateRequirement,
  isProfileEligible,
  type RecruitmentProgressionFacts,
  type RecruitmentRequirement,
  validateRequirements,
} from "./recruitmentRequirements";
import { getRecruitmentSlotCount, BASE_RADIO_SLOTS } from "./recruitmentSlots";
import {
  generateRecruitmentCandidates,
  generateRecruitmentPool,
  type GeneratePoolOptions,
} from "./generation";
import { withRecruitmentCosts, calculateRecruitmentCost, recruitmentCostBreakdown } from "./recruitment";
import type { OperatorBaseStats, OperatorEquipment, RecruitCandidate } from "./types";
import { isNegativeTraitId, isPositivePerkId } from "./perks";

export const RECRUITMENT_LAB_STORAGE_KEY = "scavlord.dev.recruitmentLab.v1";

export type ProfileOverride = {
  enabled?: boolean;
  weight?: number;
  currentRanges?: Partial<Record<keyof OperatorBaseStats, StatRange>>;
  potentialRanges?: Partial<Record<keyof OperatorBaseStats, StatRange>>;
  positivePerkPool?: string[];
  negativeTraitPool?: string[];
  negativeTraitChance?: number;
  kit?: Partial<RecruitmentProfileKit>;
  requirements?: RecruitmentRequirement[];
};

export type CandidateOverride = {
  stats?: Partial<OperatorBaseStats>;
  potential?: Partial<OperatorBaseStats>;
  perkIds?: string[];
  negativeTraitIds?: string[];
  equipment?: Partial<OperatorEquipment>;
  costOverride?: number;
};

export type RecruitmentLabOverrides = {
  slotCount?: number;
  profiles: Record<string, ProfileOverride>;
  previewCandidates: Record<string, CandidateOverride>;
};

export type RecruitmentLabView = "radio" | "profiles" | "candidates";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

let appliedOverrides: RecruitmentLabOverrides = emptyRecruitmentLabOverrides();
let previewPool: RecruitCandidate[] | null = null;
let previewSeed: { seed: number; generation: number } | null = null;

export function emptyRecruitmentLabOverrides(): RecruitmentLabOverrides {
  return { profiles: {}, previewCandidates: {} };
}

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function loadRecruitmentLabOverrides(storage: StorageLike | null = defaultStorage()): RecruitmentLabOverrides {
  if (!storage) return emptyRecruitmentLabOverrides();
  try {
    const raw = storage.getItem(RECRUITMENT_LAB_STORAGE_KEY);
    if (!raw) return emptyRecruitmentLabOverrides();
    const parsed = JSON.parse(raw) as RecruitmentLabOverrides;
    return normalizeOverrides(parsed);
  } catch {
    return emptyRecruitmentLabOverrides();
  }
}

export function saveRecruitmentLabOverrides(
  overrides: RecruitmentLabOverrides,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  storage.setItem(RECRUITMENT_LAB_STORAGE_KEY, JSON.stringify(pruneOverrides(overrides)));
}

export function getRecruitmentLabOverrides(devEnabled = DEV_TOOLS_ENABLED): RecruitmentLabOverrides {
  if (!devEnabled) return emptyRecruitmentLabOverrides();
  return appliedOverrides;
}

export function applyRecruitmentLabOverrides(
  overrides: RecruitmentLabOverrides,
  devEnabled = DEV_TOOLS_ENABLED,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!devEnabled) return;
  appliedOverrides = pruneOverrides(overrides);
  saveRecruitmentLabOverrides(appliedOverrides, storage);
}

export function initRecruitmentLab(devEnabled = DEV_TOOLS_ENABLED, storage: StorageLike | null = defaultStorage()): void {
  appliedOverrides = devEnabled ? loadRecruitmentLabOverrides(storage) : emptyRecruitmentLabOverrides();
}

export function resetRecruitmentLabAll(storage: StorageLike | null = defaultStorage()): void {
  appliedOverrides = emptyRecruitmentLabOverrides();
  previewPool = null;
  previewSeed = null;
  storage?.removeItem(RECRUITMENT_LAB_STORAGE_KEY);
}

export function resetRecruitmentLabRadio(): void {
  const next = { ...appliedOverrides };
  delete next.slotCount;
  appliedOverrides = pruneOverrides(next);
  previewPool = null;
  previewSeed = null;
}

export function resetRecruitmentLabProfile(profileId: string): void {
  const next = { ...appliedOverrides, profiles: { ...appliedOverrides.profiles } };
  delete next.profiles[profileId];
  appliedOverrides = pruneOverrides(next);
}

export function resetRecruitmentLabCandidate(candidateId: string): void {
  const next = { ...appliedOverrides, previewCandidates: { ...appliedOverrides.previewCandidates } };
  delete next.previewCandidates[candidateId];
  appliedOverrides = pruneOverrides(next);
}

function normalizeOverrides(src: Partial<RecruitmentLabOverrides>): RecruitmentLabOverrides {
  return pruneOverrides({
    profiles: src.profiles ?? {},
    previewCandidates: src.previewCandidates ?? {},
    ...(src.slotCount != null ? { slotCount: src.slotCount } : {}),
  });
}

function pruneOverrides(src: RecruitmentLabOverrides): RecruitmentLabOverrides {
  const profiles: Record<string, ProfileOverride> = {};
  for (const [id, o] of Object.entries(src.profiles ?? {})) {
    if (Object.keys(o).length) profiles[id] = o;
  }
  const previewCandidates: Record<string, CandidateOverride> = {};
  for (const [id, o] of Object.entries(src.previewCandidates ?? {})) {
    if (Object.keys(o).length) previewCandidates[id] = o;
  }
  const out: RecruitmentLabOverrides = { profiles, previewCandidates };
  if (src.slotCount != null) out.slotCount = src.slotCount;
  return out;
}

export function recruitmentLabOverridesEqual(a: RecruitmentLabOverrides, b: RecruitmentLabOverrides): boolean {
  return JSON.stringify(pruneOverrides(a)) === JSON.stringify(pruneOverrides(b));
}

export function modifiedRecruitmentLabCount(overrides: RecruitmentLabOverrides): number {
  let n = overrides.slotCount != null ? 1 : 0;
  n += Object.keys(overrides.profiles).length;
  n += Object.keys(overrides.previewCandidates).length;
  return n;
}


function mergeStatRanges(
  base: Record<keyof OperatorBaseStats, StatRange>,
  patch?: Partial<Record<keyof OperatorBaseStats, StatRange>>,
): Record<keyof OperatorBaseStats, StatRange> {
  const out = { ...base };
  if (!patch) return out;
  for (const [k, v] of Object.entries(patch) as Array<[keyof OperatorBaseStats, StatRange]>) {
    if (v) out[k] = { ...v };
  }
  return out;
}

export function effectiveRecruitmentProfile(
  profileId: string,
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): EffectiveRecruitmentProfile | undefined {
  const base = RECRUITMENT_PROFILE_BY_ID[profileId];
  if (!base) return undefined;
  const patch = overrides.profiles[profileId];
  if (!patch) return { ...base, hasOverride: false };
  return {
    ...base,
    enabled: patch.enabled ?? base.enabled,
    weight: patch.weight ?? base.weight,
    currentRanges: mergeStatRanges(base.currentRanges, patch.currentRanges),
    potentialRanges: mergeStatRanges(base.potentialRanges, patch.potentialRanges),
    positivePerkPool: patch.positivePerkPool ?? base.positivePerkPool,
    negativeTraitPool: patch.negativeTraitPool ?? base.negativeTraitPool,
    negativeTraitChance: patch.negativeTraitChance ?? base.negativeTraitChance,
    kit: {
      weaponPool: patch.kit?.weaponPool ?? base.kit.weaponPool,
      armorPool: patch.kit?.armorPool ?? base.kit.armorPool,
      attachTierWeights: { ...base.kit.attachTierWeights, ...patch.kit?.attachTierWeights },
    },
    requirements: patch.requirements ?? base.requirements,
    hasOverride: true,
  };
}

export function effectiveRecruitmentProfiles(
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): EffectiveRecruitmentProfile[] {
  return CANONICAL_RECRUITMENT_PROFILES.map((p) => effectiveRecruitmentProfile(p.id, overrides)!);
}

export function progressionFactsFromMeta(meta: Meta): RecruitmentProgressionFacts {
  return { quests: meta.quests, claimedQuestIds: meta.claimed };
}

export function eligibleProfiles(
  facts: RecruitmentProgressionFacts,
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): EffectiveRecruitmentProfile[] {
  return effectiveRecruitmentProfiles(overrides).filter(
    (p) => p.enabled && isProfileEligible(p.requirements, facts) && isProfileRangeValid(p),
  );
}

export function profileEligibilityRows(profileId: string, facts: RecruitmentProgressionFacts) {
  const profile = effectiveRecruitmentProfile(profileId);
  if (!profile) return [];
  return profile.requirements.map((req) => ({
    requirement: req,
    ...evaluateRequirement(req, facts),
  }));
}

export function profileLocked(profileId: string, facts: RecruitmentProgressionFacts): boolean {
  const profile = effectiveRecruitmentProfile(profileId);
  if (!profile || !profile.enabled) return true;
  return !isProfileEligible(profile.requirements, facts);
}

export function effectiveSlotCount(overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides()): number {
  return getRecruitmentSlotCount({
    devAppliedSlotOverride: overrides.slotCount ?? null,
    devToolsEnabled: DEV_TOOLS_ENABLED,
  });
}

export function generateTestRecruitmentPool(
  seed: number,
  generation: number,
  facts: RecruitmentProgressionFacts,
  existingNames: readonly string[] = [],
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): RecruitCandidate[] {
  const count = effectiveSlotCount(overrides);
  const profiles = eligibleProfiles(facts, overrides);
  const pool = generateRecruitmentPool({
    seed,
    generation,
    count,
    existingNames,
    profiles,
  });
  previewPool = pool;
  previewSeed = { seed, generation };
  return pool;
}

export function getPreviewRecruitmentPool(): RecruitCandidate[] | null {
  return previewPool;
}

export function applyCandidateOverride(
  candidate: RecruitCandidate,
  override?: CandidateOverride,
): RecruitCandidate {
  if (!override) return candidate;
  const stats = { ...candidate.stats, ...override.stats };
  const potentialRaw = { ...candidate.potential, ...override.potential };
  const potential = { ...potentialRaw };
  for (const key of Object.keys(stats) as Array<keyof OperatorBaseStats>) {
    potential[key] = Math.max(stats[key], potential[key] ?? stats[key]);
  }
  const next: RecruitCandidate = {
    ...candidate,
    stats,
    potential,
    perkIds: override.perkIds ?? candidate.perkIds,
    equipment: {
      weapon: override.equipment?.weapon ?? candidate.equipment.weapon,
      attachments: override.equipment?.attachments ?? [...candidate.equipment.attachments],
      armor: override.equipment?.armor !== undefined ? override.equipment.armor : candidate.equipment.armor,
    },
    cost: 0,
  };
  const neg = override.negativeTraitIds ?? candidate.negativeTraitIds;
  if (neg?.length) next.negativeTraitIds = [...neg];
  next.cost =
    override.costOverride != null ? override.costOverride : calculateRecruitmentCost(next);
  return next;
}

export function formatRecruitmentPatch(
  draft: RecruitmentLabOverrides,
  applied: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): string {
  const lines: string[] = ["RECRUITMENT PATCH", ""];
  if (draft.slotCount !== applied.slotCount) {
    lines.push("RADIO", `baseSlots: ${BASE_RADIO_SLOTS} -> test ${draft.slotCount ?? BASE_RADIO_SLOTS}`, "");
  }
  for (const profile of CANONICAL_RECRUITMENT_PROFILES) {
    const d = draft.profiles[profile.id];
    const a = applied.profiles[profile.id];
    if (!d && !a) continue;
    const merged = { ...a, ...d };
    if (!Object.keys(merged).length) continue;
    lines.push(`PROFILE: ${profile.id.toUpperCase()}`);
    if (merged.weight != null && merged.weight !== profile.weight) {
      lines.push(`weight: ${profile.weight} -> ${merged.weight}`);
    }
    if (merged.enabled != null && merged.enabled !== profile.enabled) {
      lines.push(`enabled: ${profile.enabled} -> ${merged.enabled}`);
    }
    if (merged.negativeTraitChance != null && merged.negativeTraitChance !== profile.negativeTraitChance) {
      lines.push(`negativeTraitChance: ${(profile.negativeTraitChance * 100).toFixed(0)}% -> ${(merged.negativeTraitChance * 100).toFixed(0)}%`);
    }
    if (merged.requirements?.length) {
      for (const req of merged.requirements) {
        lines.push(`requirements: + ${req.type} ${JSON.stringify(req)}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function profileListForLab(
  query: string,
  overrides: RecruitmentLabOverrides,
): EffectiveRecruitmentProfile[] {
  const q = query.trim().toLowerCase();
  return effectiveRecruitmentProfiles(overrides).filter(
    (p) => !q || p.id.includes(q) || p.displayName.toLowerCase().includes(q),
  );
}

export function profileShareLabel(profileId: string, facts: RecruitmentProgressionFacts): string {
  const eligible = eligibleProfiles(facts);
  const shares = profileWeightShare(eligible);
  const pct = (shares[profileId] ?? 0) * 100;
  return `${pct.toFixed(1)}% among eligible`;
}

export function validateProfileOverride(profileId: string, override: ProfileOverride): string[] {
  const effective = effectiveRecruitmentProfile(profileId, {
    ...emptyRecruitmentLabOverrides(),
    profiles: { [profileId]: override },
  });
  if (!effective) return ["Unknown profile"];
  const errors = [...validateRequirements(effective.requirements)];
  if (!isProfileRangeValid(effective)) errors.push("Invalid stat ranges");
  for (const id of effective.positivePerkPool) {
    if (!isPositivePerkId(id)) errors.push(`Non-positive perk in positive pool: ${id}`);
  }
  for (const id of effective.negativeTraitPool) {
    if (!isNegativeTraitId(id)) errors.push(`Non-negative trait in negative pool: ${id}`);
  }
  return errors;
}

export { recruitmentCostBreakdown, withRecruitmentCosts, generateRecruitmentCandidates };
