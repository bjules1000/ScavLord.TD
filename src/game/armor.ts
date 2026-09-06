import { ARMORS, ATTACHMENTS, WEAPONS, type AmmoTier, type ArmorDef } from "./gear";
import { effectiveArmor, effectiveAttachment, effectiveWeapon } from "./dev/balance";

export function armorDef(id: string | null | undefined): ArmorDef | undefined {
  return id ? (effectiveArmor(id) ?? ARMORS[id]) : undefined;
}

export function reductionForTier(def: ArmorDef, tier: AmmoTier): number {
  if (tier === "AP") return def.reductionAp;
  if (tier === "HEAVY") return def.reductionHeavy;
  return def.reductionNormal;
}

/**
 * Canonical wearable-armor soak used by the player operator and hired operators.
 * Reduction is looked up per ammo tier (NORMAL/AP/HEAVY); leftover damage hits HP.
 *
 * Durability is spent by the full incoming hit, not just the absorbed portion —
 * the plate takes structural damage from every hit regardless of how much it
 * stopped. This makes reduction% multiply total damage blocked over the
 * armor's life (durability * reduction) instead of only pacing individual
 * hits while leaving total mitigation fixed at durability alone.
 */
export function absorbWithArmor(
  incoming: number,
  armorId: string | null | undefined,
  armorHp: number,
  tier: AmmoTier = "NORMAL",
): { damage: number; armorHp: number; absorbed: number; broke: boolean } {
  const def = armorDef(armorId);
  if (!def || armorHp <= 0 || incoming <= 0) {
    return { damage: incoming, armorHp: Math.max(0, armorHp), absorbed: 0, broke: false };
  }
  const reduction = reductionForTier(def, tier);
  const absorbed = incoming * reduction;
  const nextHp = Math.max(0, armorHp - incoming);
  return {
    damage: incoming - absorbed,
    armorHp: nextHp,
    absorbed,
    broke: armorHp > 0 && nextHp <= 0,
  };
}

/** Equipped kit fields used by the single canonical load calculation. */
export type EquippedKit = {
  weapon?: string | null;
  armor?: string | null;
  attachments?: readonly string[] | null;
};

/**
 * Canonical equipped-weight: weapon + armor + currently installed attachments.
 * Raid backpack contents, loose attachments, loot, ammo, and currency are ignored.
 */
export function getEquippedWeight(kit: EquippedKit): number {
  const weaponW = kit.weapon ? (effectiveWeapon(kit.weapon)?.weight ?? WEAPONS[kit.weapon]?.weight ?? 0) : 0;
  const armorW = armorDef(kit.armor)?.weight ?? 0;
  let attachW = 0;
  for (const id of kit.attachments ?? []) {
    attachW += effectiveAttachment(id)?.weight ?? ATTACHMENTS[id]?.weight ?? 0;
  }
  return weaponW + armorW + attachW;
}
