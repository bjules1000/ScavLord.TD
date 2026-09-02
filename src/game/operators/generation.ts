import { ITEM_BY_ID } from "../gear";
import { armorItemId, attachItemId, weaponItemId } from "../raidGear";
import { ARCHETYPES } from "./archetypes";
import { OPERATOR_NAMES } from "./names";
import { isNegativeTraitId, isPositivePerkId, RECRUITABLE_NEGATIVE_TRAIT_IDS, RECRUITABLE_PERK_IDS } from "./perks";
import { CANONICAL_RECRUITMENT_PROFILES } from "./recruitmentProfiles";
import type { EffectiveRecruitmentProfile } from "./recruitmentProfiles";
import { generateStatsFromProfile } from "./recruitmentProfiles";
import { mulberry32, pickOne, pickWeighted, seedFromParts } from "./rng";
import type { OperatorAppearance, OperatorEquipment, RecruitCandidate } from "./types";

/** @deprecated Use getRecruitmentSlotCount() — kept for backward compat in tests. */
export const RECRUITMENT_POOL_SIZE = 3;

const ATTACH_BY_TIER: Record<string, string[]> = {
  low: [],
  mid: ["grip", "brake"],
  high: ["grip", "optic"],
};

export function kitEquipmentValue(equipment: OperatorEquipment): number {
  let total = 0;
  const wid = weaponItemId(equipment.weapon);
  if (wid) total += ITEM_BY_ID[wid]?.value ?? 0;
  for (const att of equipment.attachments) {
    const aid = attachItemId(att);
    if (aid) total += ITEM_BY_ID[aid]?.value ?? 0;
  }
  if (equipment.armor) {
    const ar = armorItemId(equipment.armor);
    if (ar) total += ITEM_BY_ID[ar]?.value ?? 0;
  }
  return total;
}

function pickAttachTier(rng: () => number, weights: { low: number; mid: number; high: number }): string {
  const roll = rng();
  if (roll < weights.low) return "low";
  if (roll < weights.low + weights.mid) return "mid";
  return "high";
}

function pickKitFromProfile(profile: EffectiveRecruitmentProfile, rng: () => number): OperatorEquipment {
  const weapon = pickOne(rng, [...profile.kit.weaponPool]);
  const tier = pickAttachTier(rng, profile.kit.attachTierWeights);
  const attachments = [...(ATTACH_BY_TIER[tier] ?? [])].slice(0, 1);
  const armor = pickOne(rng, [...profile.kit.armorPool]);
  return { weapon, attachments, armor };
}

function pickAppearance(rng: () => number): OperatorAppearance {
  const presetId = `scav_${Math.floor(rng() * 4)}`;
  if (rng() < 0.5) return { presetId, paletteId: `accent_${Math.floor(rng() * 3)}` };
  return { presetId };
}

function uniqueName(rng: () => number, used: Set<string>): string {
  const pool = [...OPERATOR_NAMES].sort(() => rng() - 0.5);
  for (const name of pool) {
    if (!used.has(name)) return name;
  }
  let i = 1;
  while (used.has(`OPERATOR-${i}`)) i++;
  return `OPERATOR-${i}`;
}

function pickPositivePerk(rng: () => number, pool: readonly string[]): string {
  const eligible = pool.filter((id) => isPositivePerkId(id));
  const fallback = RECRUITABLE_PERK_IDS.filter((id) => isPositivePerkId(id));
  return pickOne(rng, eligible.length ? eligible : fallback);
}

function pickNegativeTrait(rng: () => number, pool: readonly string[], chance: number): string[] {
  if (rng() >= chance) return [];
  const eligible = pool.filter((id) => isNegativeTraitId(id));
  const fallback = RECRUITABLE_NEGATIVE_TRAIT_IDS.filter((id) => isNegativeTraitId(id));
  const pick = eligible.length ? eligible : fallback;
  if (!pick.length) return [];
  return [pickOne(rng, pick)];
}

export function generateCandidateFromProfile(
  profile: EffectiveRecruitmentProfile,
  seed: number,
  generation: number,
  index: number,
  usedNames: Set<string>,
): RecruitCandidate {
  const rng = mulberry32(seedFromParts(seed, generation, index, profile.id));
  const { stats, potential } = generateStatsFromProfile(profile, rng);
  const perkIds = [pickPositivePerk(rng, profile.positivePerkPool)];
  const negativeTraitIds = pickNegativeTrait(rng, profile.negativeTraitPool, profile.negativeTraitChance);
  const equipment = pickKitFromProfile(profile, rng);
  const name = uniqueName(rng, usedNames);
  usedNames.add(name);
  const candidateId = `cand_${generation}_${index}_${seed.toString(16)}`;
  return {
    candidateId,
    name,
    roleLabel: profile.roleLabel,
    archetypeId: profile.id,
    stats,
    potential,
    perkIds,
    negativeTraitIds,
    equipment,
    appearance: pickAppearance(rng),
    cost: 0,
  };
}

export type GeneratePoolOptions = {
  seed: number;
  generation: number;
  count: number;
  existingNames?: readonly string[];
  profiles: EffectiveRecruitmentProfile[];
};

/**
 * Candidate generation order:
 * eligible profiles -> weighted profile pick -> stats/potential -> traits -> kit -> cost
 */
export function generateRecruitmentPool(options: GeneratePoolOptions): RecruitCandidate[] {
  const { seed, generation, count, existingNames = [], profiles } = options;
  const used = new Set(existingNames);
  const out: RecruitCandidate[] = [];
  const eligible = profiles.filter((p) => p.enabled);
  if (!eligible.length) return out;
  for (let i = 0; i < count; i++) {
    const rng = mulberry32(seedFromParts(seed, generation, i, "profile-pick"));
    const profile = pickWeighted(
      rng,
      eligible.map((p) => ({ ...p, weight: Math.max(0, p.weight) })),
    );
    out.push(generateCandidateFromProfile(profile, seed, generation, i, used));
  }
  return out;
}

/** Legacy entry — uses canonical profiles without eligibility filtering. */
export function generateCandidate(
  seed: number,
  generation: number,
  index: number,
  usedNames: Set<string>,
): RecruitCandidate {
  const rng = mulberry32(seedFromParts(seed, generation, index, "legacy"));
  const profilePick = pickWeighted(
    rng,
    CANONICAL_RECRUITMENT_PROFILES.map((p) => ({ ...p, weight: p.weight })),
  );
  const profile: EffectiveRecruitmentProfile = { ...profilePick, hasOverride: false };
  return generateCandidateFromProfile(profile, seed, generation, index, usedNames);
}

export function generateRecruitmentCandidates(
  seed: number,
  generation: number,
  count = RECRUITMENT_POOL_SIZE,
  existingNames: readonly string[] = [],
  profiles?: EffectiveRecruitmentProfile[],
): RecruitCandidate[] {
  if (profiles?.length) {
    return generateRecruitmentPool({ seed, generation, count, existingNames, profiles });
  }
  const used = new Set(existingNames);
  const out: RecruitCandidate[] = [];
  for (let i = 0; i < count; i++) {
    out.push(generateCandidate(seed, generation, i, used));
  }
  return out;
}
