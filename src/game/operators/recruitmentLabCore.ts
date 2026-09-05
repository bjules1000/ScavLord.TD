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
  type WeightedGearEntry,
} from "./recruitmentProfiles";
import {
  evaluateRequirement,
  isProfileEligible,
  type RecruitmentProgressionFacts,
  type RecruitmentRequirement,
  validateRequirements,
} from "./recruitmentRequirements";
import {
  generateRecruitmentCandidates,
  generateRecruitmentPool,
} from "./generation";
import { withRecruitmentCosts, calculateRecruitmentCost, recruitmentCostBreakdown } from "./recruitment";
import type { OperatorBaseStats, OperatorEquipment, RecruitCandidate } from "./types";
import { isNegativeTraitId, isPositivePerkId } from "./perks";
import {
  RADIO_STATES,
  freshRadioProgression,
  resolveRecruitmentCapability,
  type CapabilityBreakdown,
  type RadioState,
  type RecruitmentQuality,
  type UniqueContactLifecycle,
  type RadioProgressionState,
  clampQuality,
} from "./radioProgression";
import {
  CANONICAL_QUALITY_TIERS,
  mergeTraitConfig,
  type TraitProbabilityConfig,
} from "./recruitmentQuality";
import {
  CANONICAL_RETRANSMISSION,
  nextRetransmissionCashCost,
  type RetransmissionRules,
} from "./retransmission";

export const RECRUITMENT_LAB_STORAGE_KEY = "scavlord.dev.recruitmentLab.v1";

export type ProfileOverride = {
  enabled?: boolean;
  weight?: number;
  minQuality?: number;
  currentRanges?: Partial<Record<keyof OperatorBaseStats, StatRange>>;
  potentialRanges?: Partial<Record<keyof OperatorBaseStats, StatRange>>;
  positivePerkPool?: string[];
  negativeTraitPool?: string[];
  negativeTraitChance?: number;
  /** Full kit override when present. */
  kit?: RecruitmentProfileKit;
  requirements?: RecruitmentRequirement[];
};

export type CandidateOverride = {
  stats?: Partial<OperatorBaseStats>;
  potential?: Partial<OperatorBaseStats>;
  traitIds?: string[];
  perkIds?: string[];
  negativeTraitIds?: string[];
  equipment?: Partial<OperatorEquipment>;
  costOverride?: number;
};

export type RecruitmentLabOverrides = {
  radioState?: RadioState;
  /** Absolute DEV slot override. */
  slotCount?: number;
  qualityLevel?: number;
  crewCapacity?: number;
  retransmissionUnlocked?: boolean | null;
  retransmissionRules?: Partial<RetransmissionRules>;
  qualityTraitOverrides?: Partial<Record<RecruitmentQuality, Partial<TraitProbabilityConfig>>>;
  profiles: Record<string, ProfileOverride>;
  previewCandidates: Record<string, CandidateOverride>;
  uniqueLifecycle?: Record<string, UniqueContactLifecycle>;
};

export type RecruitmentLabView = "radio" | "profiles" | "unique" | "candidates";

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
  delete next.radioState;
  delete next.slotCount;
  delete next.qualityLevel;
  delete next.crewCapacity;
  delete next.retransmissionUnlocked;
  delete next.retransmissionRules;
  delete next.qualityTraitOverrides;
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
  const next = {
    ...appliedOverrides,
    previewCandidates: { ...appliedOverrides.previewCandidates },
  };
  delete next.previewCandidates[candidateId];
  appliedOverrides = pruneOverrides(next);
}

export function resetRecruitmentLabUnique(): void {
  const next = { ...appliedOverrides };
  delete next.uniqueLifecycle;
  appliedOverrides = pruneOverrides(next);
}

function normalizeOverrides(src: Partial<RecruitmentLabOverrides>): RecruitmentLabOverrides {
  return pruneOverrides({
    profiles: src.profiles ?? {},
    previewCandidates: src.previewCandidates ?? {},
    ...(src.radioState && RADIO_STATES.includes(src.radioState) ? { radioState: src.radioState } : {}),
    ...(src.slotCount != null ? { slotCount: src.slotCount } : {}),
    ...(src.qualityLevel != null ? { qualityLevel: src.qualityLevel } : {}),
    ...(src.crewCapacity != null ? { crewCapacity: src.crewCapacity } : {}),
    ...(src.retransmissionUnlocked !== undefined
      ? { retransmissionUnlocked: src.retransmissionUnlocked }
      : {}),
    ...(src.retransmissionRules ? { retransmissionRules: src.retransmissionRules } : {}),
    ...(src.qualityTraitOverrides ? { qualityTraitOverrides: src.qualityTraitOverrides } : {}),
    ...(src.uniqueLifecycle ? { uniqueLifecycle: src.uniqueLifecycle } : {}),
  });
}

function pruneOverrides(src: RecruitmentLabOverrides): RecruitmentLabOverrides {
  const profiles: Record<string, ProfileOverride> = {};
  for (const [id, o] of Object.entries(src.profiles ?? {})) {
    if (o && Object.keys(o).length) profiles[id] = o;
  }
  const previewCandidates: Record<string, CandidateOverride> = {};
  for (const [id, o] of Object.entries(src.previewCandidates ?? {})) {
    if (o && Object.keys(o).length) previewCandidates[id] = o;
  }
  const out: RecruitmentLabOverrides = { profiles, previewCandidates };
  if (src.radioState && RADIO_STATES.includes(src.radioState)) out.radioState = src.radioState;
  if (src.slotCount != null) out.slotCount = src.slotCount;
  if (src.qualityLevel != null) out.qualityLevel = src.qualityLevel;
  if (src.crewCapacity != null) out.crewCapacity = src.crewCapacity;
  if (src.retransmissionUnlocked !== undefined) out.retransmissionUnlocked = src.retransmissionUnlocked;
  if (src.retransmissionRules && Object.keys(src.retransmissionRules).length) {
    out.retransmissionRules = src.retransmissionRules;
  }
  if (src.qualityTraitOverrides && Object.keys(src.qualityTraitOverrides).length) {
    out.qualityTraitOverrides = src.qualityTraitOverrides;
  }
  if (src.uniqueLifecycle && Object.keys(src.uniqueLifecycle).length) {
    out.uniqueLifecycle = { ...src.uniqueLifecycle };
  }
  return out;
}

export function recruitmentLabOverridesEqual(a: RecruitmentLabOverrides, b: RecruitmentLabOverrides): boolean {
  return JSON.stringify(pruneOverrides(a)) === JSON.stringify(pruneOverrides(b));
}

export function modifiedRecruitmentLabCount(overrides: RecruitmentLabOverrides): number {
  let n = 0;
  if (overrides.radioState != null) n += 1;
  if (overrides.slotCount != null) n += 1;
  if (overrides.qualityLevel != null) n += 1;
  if (overrides.crewCapacity != null) n += 1;
  if (overrides.retransmissionUnlocked !== undefined && overrides.retransmissionUnlocked !== null) n += 1;
  if (overrides.retransmissionRules && Object.keys(overrides.retransmissionRules).length) n += 1;
  if (overrides.qualityTraitOverrides && Object.keys(overrides.qualityTraitOverrides).length) n += 1;
  n += Object.keys(overrides.profiles).length;
  n += Object.keys(overrides.previewCandidates).length;
  n += Object.keys(overrides.uniqueLifecycle ?? {}).length;
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

function cloneGearEntries(entries: readonly WeightedGearEntry[]): WeightedGearEntry[] {
  return entries.map((e) => ({ ...e }));
}

/** Merge weighted kit arrays by id (null id kept as distinct none entry). */
export function mergeWeightedGearEntries(
  base: readonly WeightedGearEntry[],
  patch?: readonly WeightedGearEntry[],
): WeightedGearEntry[] {
  if (!patch) return cloneGearEntries(base);
  const byKey = new Map<string, WeightedGearEntry>();
  for (const e of base) {
    byKey.set(e.id ?? "__null__", { ...e });
  }
  for (const e of patch) {
    byKey.set(e.id ?? "__null__", { ...e });
  }
  // Preserve patch order when provided as a full replacement list; otherwise base+new.
  if (patch.length >= base.length || patch.length > 0) {
    const seen = new Set<string>();
    const ordered: WeightedGearEntry[] = [];
    for (const e of patch) {
      const key = e.id ?? "__null__";
      ordered.push(byKey.get(key) ?? { ...e });
      seen.add(key);
    }
    for (const e of base) {
      const key = e.id ?? "__null__";
      if (!seen.has(key)) ordered.push(byKey.get(key)!);
    }
    return ordered;
  }
  return [...byKey.values()];
}

export function mergeRecruitmentKit(
  base: RecruitmentProfileKit,
  patch?: RecruitmentProfileKit | Partial<RecruitmentProfileKit>,
): RecruitmentProfileKit {
  if (!patch) {
    return {
      weapons: cloneGearEntries(base.weapons),
      armors: cloneGearEntries(base.armors),
      attachments: cloneGearEntries(base.attachments),
      attachmentChance: base.attachmentChance,
    };
  }
  return {
    weapons: mergeWeightedGearEntries(base.weapons, patch.weapons),
    armors: mergeWeightedGearEntries(base.armors, patch.armors),
    attachments: mergeWeightedGearEntries(base.attachments, patch.attachments),
    attachmentChance:
      typeof patch.attachmentChance === "number" ? patch.attachmentChance : base.attachmentChance,
  };
}

export function effectiveRecruitmentProfile(
  profileId: string,
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): EffectiveRecruitmentProfile | undefined {
  const base = RECRUITMENT_PROFILE_BY_ID[profileId];
  if (!base) return undefined;
  const patch = overrides.profiles[profileId];
  if (!patch) return { ...base, kit: mergeRecruitmentKit(base.kit), hasOverride: false };
  const negativeTraitChance = patch.negativeTraitChance ?? base.negativeTraitChance;
  const out: EffectiveRecruitmentProfile = {
    ...base,
    enabled: patch.enabled ?? base.enabled,
    weight: patch.weight ?? base.weight,
    minQuality: patch.minQuality ?? base.minQuality,
    currentRanges: mergeStatRanges(base.currentRanges, patch.currentRanges),
    potentialRanges: mergeStatRanges(base.potentialRanges, patch.potentialRanges),
    positivePerkPool: patch.positivePerkPool ?? base.positivePerkPool,
    negativeTraitPool: patch.negativeTraitPool ?? base.negativeTraitPool,
    kit: mergeRecruitmentKit(base.kit, patch.kit),
    requirements: patch.requirements ?? base.requirements,
    hasOverride: true,
  };
  if (negativeTraitChance != null) out.negativeTraitChance = negativeTraitChance;
  return out;
}

export function effectiveRecruitmentProfiles(
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): EffectiveRecruitmentProfile[] {
  return CANONICAL_RECRUITMENT_PROFILES.map((p) => effectiveRecruitmentProfile(p.id, overrides)!);
}

/** Local capability resolution — avoids importing crew (cycle with getRecruitmentLabOverrides). */
export function capabilityFromRadio(
  radio: RadioProgressionState,
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
  devEnabled = DEV_TOOLS_ENABLED,
): CapabilityBreakdown {
  const dev: NonNullable<Parameters<typeof resolveRecruitmentCapability>[0]["dev"]> = {
    slotOverride: overrides.slotCount ?? null,
    qualityOverride: overrides.qualityLevel ?? null,
    crewCapacityOverride: overrides.crewCapacity ?? null,
    retransmissionUnlocked: overrides.retransmissionUnlocked ?? null,
  };
  if (overrides.radioState != null) dev.radioState = overrides.radioState;
  return resolveRecruitmentCapability({
    radio,
    dev,
    devToolsEnabled: devEnabled,
  });
}

export function progressionFactsFromMeta(
  meta: Meta,
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): RecruitmentProgressionFacts {
  const radio = meta.crew?.radio ?? freshRadioProgression();
  const cap = capabilityFromRadio(radio, overrides);
  const { effectiveClaimedQuestIds } = require("../dev/questForceComplete") as typeof import("../dev/questForceComplete");
  const { getQuestLabOverrides } = require("../dev/questLab") as typeof import("../dev/questLab");
  return {
    quests: meta.quests,
    claimedQuestIds: effectiveClaimedQuestIds(meta.claimed, getQuestLabOverrides().forcedCompleted),
    radioState: cap.radioState,
    effectiveQuality: cap.quality.effective,
  };
}

export function eligibleProfiles(
  facts: RecruitmentProgressionFacts,
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): EffectiveRecruitmentProfile[] {
  const quality = facts.effectiveQuality;
  return effectiveRecruitmentProfiles(overrides).filter(
    (p) =>
      p.enabled &&
      (p.minQuality ?? 1) <= quality &&
      isProfileEligible(p.requirements, facts) &&
      isProfileRangeValid(p),
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
  if ((profile.minQuality ?? 1) > facts.effectiveQuality) return true;
  return !isProfileEligible(profile.requirements, facts);
}

export function effectiveSlotCount(
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
  radio: RadioProgressionState = freshRadioProgression(),
): number {
  return capabilityFromRadio(radio, overrides).slots.effective;
}

export function effectiveRetransmissionRules(
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): RetransmissionRules {
  const patch = overrides.retransmissionRules;
  if (!patch) return { ...CANONICAL_RETRANSMISSION, resourceCosts: { ...CANONICAL_RETRANSMISSION.resourceCosts } };
  return {
    baseCashCost: patch.baseCashCost ?? CANONICAL_RETRANSMISSION.baseCashCost,
    escalation: patch.escalation ?? CANONICAL_RETRANSMISSION.escalation,
    maxPerCycle: patch.maxPerCycle !== undefined ? patch.maxPerCycle : CANONICAL_RETRANSMISSION.maxPerCycle,
    resourceCosts: {
      ...CANONICAL_RETRANSMISSION.resourceCosts,
      ...patch.resourceCosts,
    },
  };
}

export function effectiveTraitProbability(
  quality: number,
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): TraitProbabilityConfig {
  const q = clampQuality(quality);
  const base = CANONICAL_QUALITY_TIERS[q].traits;
  const patch = overrides.qualityTraitOverrides?.[q];
  return mergeTraitConfig(base, patch);
}

export function generateTestRecruitmentPool(
  seed: number,
  generation: number,
  facts: RecruitmentProgressionFacts,
  existingNames: readonly string[] = [],
  overrides: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
  radio: RadioProgressionState = freshRadioProgression(),
): RecruitCandidate[] {
  const cap = capabilityFromRadio(radio, overrides);
  const count = cap.slots.effective;
  const quality = cap.quality.effective;
  const profiles = eligibleProfiles({ ...facts, effectiveQuality: quality, radioState: cap.radioState }, overrides);
  const pool = generateRecruitmentPool({
    seed,
    generation,
    count,
    existingNames,
    profiles,
    quality,
  });
  previewPool = pool;
  previewSeed = { seed, generation };
  return pool;
}

export function getPreviewRecruitmentPool(): RecruitCandidate[] | null {
  return previewPool;
}

export function getPreviewRecruitmentSeed(): { seed: number; generation: number } | null {
  return previewSeed;
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
  const perkIds = override.perkIds ?? candidate.perkIds;
  const neg = override.negativeTraitIds ?? candidate.negativeTraitIds;
  const traitIds =
    override.traitIds ??
    [...new Set([...(perkIds ?? []), ...(neg ?? [])])];
  const next: RecruitCandidate = {
    ...candidate,
    stats,
    potential,
    traitIds,
    perkIds,
    equipment: {
      weapon: override.equipment?.weapon ?? candidate.equipment.weapon,
      attachments: override.equipment?.attachments ?? [...candidate.equipment.attachments],
      armor: override.equipment?.armor !== undefined ? override.equipment.armor : candidate.equipment.armor,
    },
    cost: 0,
  };
  if (neg?.length) next.negativeTraitIds = [...neg];
  next.cost = override.costOverride != null ? override.costOverride : calculateRecruitmentCost(next);
  return next;
}

export function formatRecruitmentPatch(
  draft: RecruitmentLabOverrides,
  applied: RecruitmentLabOverrides = getRecruitmentLabOverrides(),
): string {
  const lines: string[] = ["RECRUITMENT PATCH", ""];
  const radioChanged =
    draft.radioState !== applied.radioState ||
    draft.slotCount !== applied.slotCount ||
    draft.qualityLevel !== applied.qualityLevel ||
    draft.crewCapacity !== applied.crewCapacity ||
    draft.retransmissionUnlocked !== applied.retransmissionUnlocked ||
    JSON.stringify(draft.retransmissionRules ?? null) !== JSON.stringify(applied.retransmissionRules ?? null) ||
    JSON.stringify(draft.qualityTraitOverrides ?? null) !== JSON.stringify(applied.qualityTraitOverrides ?? null);

  if (radioChanged) {
    lines.push("RADIO");
    if (draft.radioState !== applied.radioState) {
      lines.push(`radioState: ${applied.radioState ?? "(meta)"} -> ${draft.radioState ?? "(meta)"}`);
    }
    if (draft.slotCount !== applied.slotCount) {
      lines.push(`slotOverride: ${applied.slotCount ?? "none"} -> ${draft.slotCount ?? "none"}`);
    }
    if (draft.qualityLevel !== applied.qualityLevel) {
      lines.push(`qualityOverride: ${applied.qualityLevel ?? "none"} -> ${draft.qualityLevel ?? "none"}`);
    }
    if (draft.crewCapacity !== applied.crewCapacity) {
      lines.push(`crewCapacity: ${applied.crewCapacity ?? "none"} -> ${draft.crewCapacity ?? "none"}`);
    }
    if (draft.retransmissionUnlocked !== applied.retransmissionUnlocked) {
      lines.push(
        `retransmissionUnlocked: ${String(applied.retransmissionUnlocked)} -> ${String(draft.retransmissionUnlocked)}`,
      );
    }
    if (JSON.stringify(draft.retransmissionRules ?? null) !== JSON.stringify(applied.retransmissionRules ?? null)) {
      lines.push(`retransmissionRules: ${JSON.stringify(draft.retransmissionRules ?? {})}`);
    }
    if (
      JSON.stringify(draft.qualityTraitOverrides ?? null) !==
      JSON.stringify(applied.qualityTraitOverrides ?? null)
    ) {
      lines.push(`qualityTraitOverrides: ${JSON.stringify(draft.qualityTraitOverrides ?? {})}`);
    }
    lines.push("");
  }

  if (JSON.stringify(draft.uniqueLifecycle ?? {}) !== JSON.stringify(applied.uniqueLifecycle ?? {})) {
    lines.push("UNIQUE LIFECYCLE");
    for (const [id, life] of Object.entries(draft.uniqueLifecycle ?? {})) {
      lines.push(`${id}: ${life}`);
    }
    lines.push("");
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
    if (merged.minQuality != null && merged.minQuality !== profile.minQuality) {
      lines.push(`minQuality: ${profile.minQuality} -> ${merged.minQuality}`);
    }
    if (merged.negativeTraitChance != null && merged.negativeTraitChance !== profile.negativeTraitChance) {
      lines.push(
        `negativeTraitChance: ${((profile.negativeTraitChance ?? 0) * 100).toFixed(0)}% -> ${(merged.negativeTraitChance * 100).toFixed(0)}%`,
      );
    }
    if (merged.kit) {
      lines.push(
        `kit: weapons=${merged.kit.weapons.length} armors=${merged.kit.armors.length} attachments=${merged.kit.attachments.length} attachChance=${merged.kit.attachmentChance}`,
      );
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

export function nextLabRetransmissionCost(
  overrides: RecruitmentLabOverrides,
  retransmissionCount: number,
): number {
  return nextRetransmissionCashCost(effectiveRetransmissionRules(overrides), retransmissionCount);
}

export { recruitmentCostBreakdown, withRecruitmentCosts, generateRecruitmentCandidates };
