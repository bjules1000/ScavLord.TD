import { ITEM_BY_ID } from "../gear";
import { armorItemId, attachItemId, weaponItemId } from "../raidGear";
import { ARCHETYPES, ARCHETYPE_BY_ID, applyArchetypeBaseline } from "./archetypes";
import { OPERATOR_NAMES } from "./names";
import { RECRUITABLE_PERK_IDS } from "./perks";
import { mulberry32, pickOne, pickWeighted, seedFromParts } from "./rng";
import { STAT_NEUTRAL, clampStat } from "./stats";
import type { OperatorAppearance, OperatorEquipment, RecruitCandidate } from "./types";

export const RECRUITMENT_POOL_SIZE = 3;

/** Basic kits only — no high-end arbitrage bait. */
const WEAPON_POOLS: Record<string, string[]> = {
  marksman: ["adar", "pm"],
  runner: ["pm", "toz"],
  bruiser: ["toz", "mp133"],
  rifleman: ["adar", "ak74"],
  scrapper: ["toz", "pm"],
};

const ATTACH_POOLS: Record<string, string[]> = {
  low: [],
  mid: ["grip", "brake"],
  high: ["grip", "optic"],
};

const ARMOR_POOLS: Record<string, (string | null)[]> = {
  none: [null],
  light: [null, "paca"],
  heavy: [null, "paca"],
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

function randomVariation(rng: () => number) {
  const jitter = () => clampStat(STAT_NEUTRAL + Math.round((rng() - 0.5) * 14));
  return { aim: jitter(), toughness: jitter(), handling: jitter(), mobility: jitter() };
}

function pickKit(archetypeId: string, rng: () => number): OperatorEquipment {
  const weapons = WEAPON_POOLS[archetypeId] ?? ["pm", "toz"];
  const weapon = pickOne(rng, weapons);
  const attachTier = rng() < 0.35 ? "low" : rng() < 0.75 ? "mid" : "high";
  const attachments = [...(ATTACH_POOLS[attachTier] ?? [])].slice(0, 1);
  const armorTier = archetypeId === "bruiser" ? "heavy" : archetypeId === "runner" ? "none" : "light";
  const armor = pickOne(rng, ARMOR_POOLS[armorTier] ?? [null]);
  return { weapon, attachments, armor };
}

function pickAppearance(rng: () => number): OperatorAppearance {
  const presetId = `scav_${Math.floor(rng() * 4)}`;
  const paletteId = rng() < 0.5 ? `accent_${Math.floor(rng() * 3)}` : undefined;
  return { presetId, paletteId };
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

export function generateCandidate(
  seed: number,
  generation: number,
  index: number,
  usedNames: Set<string>,
): RecruitCandidate {
  const rng = mulberry32(seedFromParts(seed, generation, index));
  const archetype = pickWeighted(rng, ARCHETYPES);
  const variation = randomVariation(rng);
  const stats = applyArchetypeBaseline(archetype.id, variation);
  const perkIds = [pickOne(rng, RECRUITABLE_PERK_IDS)];
  const equipment = pickKit(archetype.id, rng);
  const name = uniqueName(rng, usedNames);
  usedNames.add(name);
  const candidateId = `cand_${generation}_${index}_${seed.toString(16)}`;
  return {
    candidateId,
    name,
    roleLabel: ARCHETYPE_BY_ID[archetype.id]?.roleLabel ?? archetype.roleLabel,
    archetypeId: archetype.id,
    stats,
    perkIds: [...perkIds],
    equipment,
    appearance: pickAppearance(rng),
    cost: 0,
  };
}

export function generateRecruitmentCandidates(
  seed: number,
  generation: number,
  count = RECRUITMENT_POOL_SIZE,
  existingNames: readonly string[] = [],
): RecruitCandidate[] {
  const used = new Set(existingNames);
  const out: RecruitCandidate[] = [];
  for (let i = 0; i < count; i++) {
    out.push(generateCandidate(seed, generation, i, used));
  }
  return out;
}
