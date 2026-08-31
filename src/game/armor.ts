import { ARMORS, type ArmorDef } from "./gear";

export function armorDef(id: string | null | undefined): ArmorDef | undefined {
  return id ? ARMORS[id] : undefined;
}

/**
 * Canonical wearable-armor soak used by the player operator and hired operators.
 * Percentage reduction while durability remains; leftover damage hits HP.
 */
export function absorbWithArmor(
  incoming: number,
  armorId: string | null | undefined,
  armorHp: number,
): { damage: number; armorHp: number; absorbed: number; broke: boolean } {
  const def = armorDef(armorId);
  if (!def || armorHp <= 0 || incoming <= 0) {
    return { damage: incoming, armorHp: Math.max(0, armorHp), absorbed: 0, broke: false };
  }
  const absorbed = incoming * def.reduction;
  const nextHp = Math.max(0, armorHp - absorbed);
  return {
    damage: incoming - absorbed,
    armorHp: nextHp,
    absorbed,
    broke: armorHp > 0 && nextHp <= 0,
  };
}

/**
 * Future movement should read this instead of inventing a second loadout model.
 * Armor has no authored weight yet; unset pieces contribute 0.
 */
export function getEquippedWeight(kit: { armor?: string | null }): number {
  return armorDef(kit.armor)?.weight ?? 0;
}
