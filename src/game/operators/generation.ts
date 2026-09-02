/**
 * Candidate generation from recruitment profiles.
 *
 * Order: eligible profiles → weighted pick → stats/potential (quality bias)
 * → stackable traits → kit (weighted pools) → cost
 */

import { ITEM_BY_ID } from "../gear";
import { armorItemId, attachItemId, weaponItemId } from "../raidGear";
import { OPERATOR_NAMES } from "./names";
import {
  isNegativeTraitId,
  isPositivePerkId,
  RECRUITABLE_NEGATIVE_TRAIT_IDS,
  RECRUITABLE_PERK_IDS,
} from "./perks";
import {
  CANONICAL_RECRUITMENT_PROFILES,
  generateStatsFromProfile,
  pickWeightedGear,
  type EffectiveRecruitmentProfile,
} from "./recruitmentProfiles";
import { getQualityTier, rollNegativeTraitCount, rollPositiveTraitCount } from "./recruitmentQuality";
import type { RecruitmentQuality } from "./radioProgression";
import { mulberry32, pickOne, pickWeighted, seedFromParts } from "./rng";
import type { OperatorAppearance, OperatorEquipment, RecruitCandidate } from "./types";

/** @deprecated Prefer resolveRecruitmentCapability().slots.effective */
export const RECRUITMENT_POOL_SIZE = 0;

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

function pickDistinctTraits(
  rng: () => number,
  pool: readonly string[],
  count: number,
  filter: (id: string) => boolean,
  used: Set<string>,
): string[] {
  const eligible = pool.filter((id) => filter(id) && !used.has(id));
  const out: string[] = [];
  for (let i = 0; i < count && eligible.length; i++) {
    const pick = pickOne(rng, eligible);
    out.push(pick);
    used.add(pick);
    const idx = eligible.indexOf(pick);
    if (idx >= 0) eligible.splice(idx, 1);
  }
  return out;
}

function pickKitFromProfile(
  profile: EffectiveRecruitmentProfile,
  rng: () => number,
  quality: RecruitmentQuality,
): OperatorEquipment {
  const tier = getQualityTier(quality);
  const weapon =
    pickWeightedGear(rng, profile.kit.weapons) ??
    profile.kit.weapons.find((w) => w.enabled)?.id ??
    "pm";
  let armor = pickWeightedGear(rng, profile.kit.armors, tier.armorWeightMult);
  // None stays null; armor ids as-is
  if (armor === undefined) armor = null;

  const attachments: string[] = [];
  const attachChance = Math.min(1, Math.max(0, profile.kit.attachmentChance + tier.attachHighBias));
  if (rng() < attachChance) {
    const att = pickWeightedGear(rng, profile.kit.attachments);
    if (att) attachments.push(att);
  }
  return { weapon: weapon ?? "pm", attachments, armor };
}

export function generateCandidateFromProfile(
  profile: EffectiveRecruitmentProfile,
  seed: number,
  generation: number,
  index: number,
  usedNames: Set<string>,
  quality: RecruitmentQuality = 1,
): RecruitCandidate {
  const rng = mulberry32(seedFromParts(seed, generation, index, profile.id, quality));
  const tier = getQualityTier(quality);
  const { stats, potential } = generateStatsFromProfile(profile, rng, {
    current: tier.currentBias,
    potential: tier.potentialBias,
  });

  const usedTraits = new Set<string>();
  const positivePool = profile.positivePerkPool.length
    ? profile.positivePerkPool
    : RECRUITABLE_PERK_IDS;
  const negativePool = profile.negativeTraitPool.length
    ? profile.negativeTraitPool
    : RECRUITABLE_NEGATIVE_TRAIT_IDS;

  const posCount = rollPositiveTraitCount(rng, tier.traits);
  const perkIds = pickDistinctTraits(rng, positivePool, posCount, isPositivePerkId, usedTraits);

  let negChance = tier.traits.negativeAtLeast1;
  if (typeof profile.negativeTraitChance === "number") {
    negChance = Math.min(negChance, profile.negativeTraitChance);
  }
  const negCount = rollNegativeTraitCount(rng, { ...tier.traits, negativeAtLeast1: negChance });
  const negativeTraitIds = pickDistinctTraits(
    rng,
    negativePool,
    negCount,
    isNegativeTraitId,
    usedTraits,
  );

  const traitIds = [...perkIds, ...negativeTraitIds];
  const equipment = pickKitFromProfile(profile, rng, quality);
  const name = uniqueName(rng, usedNames);
  usedNames.add(name);
  const candidateId = `cand_${generation}_${index}_${seed.toString(16)}`;

  const candidate: RecruitCandidate = {
    candidateId,
    name,
    roleLabel: profile.roleLabel,
    archetypeId: profile.id,
    stats,
    potential,
    traitIds,
    perkIds,
    equipment,
    appearance: pickAppearance(rng),
    cost: 0,
    generationQuality: quality,
  };
  if (negativeTraitIds.length) candidate.negativeTraitIds = negativeTraitIds;
  return candidate;
}

export type GeneratePoolOptions = {
  seed: number;
  generation: number;
  count: number;
  existingNames?: readonly string[];
  profiles: EffectiveRecruitmentProfile[];
  quality?: RecruitmentQuality;
};

export function generateRecruitmentPool(options: GeneratePoolOptions): RecruitCandidate[] {
  const { seed, generation, count, existingNames = [], profiles, quality = 1 } = options;
  const used = new Set(existingNames);
  const out: RecruitCandidate[] = [];
  const eligible = profiles.filter((p) => p.enabled && (p.minQuality ?? 1) <= quality);
  if (!eligible.length || count <= 0) return out;
  for (let i = 0; i < count; i++) {
    const rng = mulberry32(seedFromParts(seed, generation, i, "profile-pick", quality));
    const profile = pickWeighted(
      rng,
      eligible.map((p) => ({ ...p, weight: Math.max(0, p.weight) })),
    );
    out.push(generateCandidateFromProfile(profile, seed, generation, i, used, quality));
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
  return generateCandidateFromProfile(profile, seed, generation, index, usedNames, 1);
}

export function generateRecruitmentCandidates(
  seed: number,
  generation: number,
  count = 1,
  existingNames: readonly string[] = [],
  profiles?: EffectiveRecruitmentProfile[],
  quality: RecruitmentQuality = 1,
): RecruitCandidate[] {
  if (profiles?.length) {
    return generateRecruitmentPool({ seed, generation, count, existingNames, profiles, quality });
  }
  const used = new Set(existingNames);
  const out: RecruitCandidate[] = [];
  for (let i = 0; i < count; i++) {
    out.push(generateCandidate(seed, generation, i, used));
  }
  return out;
}
