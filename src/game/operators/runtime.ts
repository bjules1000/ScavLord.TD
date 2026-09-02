import { getEquippedWeight } from "../armor";
import { allTraitIds, PERKS } from "./perks";
import { STAT_NEUTRAL } from "./stats";
import type { OperatorBaseStats, PersistentOperator } from "./types";

export interface OperatorCombatMods {
  aimBonus: number;
  toughnessBonus: number;
  handlingBonus: number;
  mobilityBonus: number;
}

export const OPERATOR_BASE_HP = 110;

/** Resolve live combat modifiers from base stats + perks. */
export function resolveCombatMods(
  op: Pick<PersistentOperator, "stats" | "perkIds" | "negativeTraitIds">,
): OperatorCombatMods {
  let aimBonus = op.stats.aim - STAT_NEUTRAL;
  let toughnessBonus = op.stats.toughness - STAT_NEUTRAL;
  let handlingBonus = op.stats.handling - STAT_NEUTRAL;
  let mobilityBonus = op.stats.mobility - STAT_NEUTRAL;
  for (const id of allTraitIds(op)) {
    const perk = PERKS[id];
    if (!perk) continue;
    aimBonus += perk.combat.aim ?? 0;
    toughnessBonus += perk.combat.toughness ?? 0;
    handlingBonus += perk.combat.handling ?? 0;
    mobilityBonus += perk.combat.mobility ?? 0;
  }
  return { aimBonus, toughnessBonus, handlingBonus, mobilityBonus };
}

/** Max HP from persistent operator base stats. Equipment does not change max HP. */
export function operatorMaxHp(
  op: Pick<PersistentOperator, "stats" | "perkIds">,
  debuffHpMult = 1,
): number {
  const mods = resolveCombatMods(op);
  const mult = 1 + mods.toughnessBonus * 0.02;
  return Math.round(OPERATOR_BASE_HP * mult * debuffHpMult);
}

/** Accuracy delta applied in towerStats (fractional). */
export function operatorAccuracyBonus(mods: OperatorCombatMods): number {
  return mods.aimBonus * 0.01;
}

/** Reload speed multiplier (<1 = faster). */
export function operatorReloadMult(mods: OperatorCombatMods): number {
  return Math.max(0.75, 1 - mods.handlingBonus * 0.015);
}

/** Effective equipped weight after mobility perks. */
export function operatorEffectiveWeight(
  kit: { weapon?: string; armor?: string | null; attachments?: readonly string[] },
  mods: OperatorCombatMods,
): number {
  const raw = getEquippedWeight(kit);
  return Math.max(0, raw - mods.mobilityBonus * 0.35);
}

export function syncOperatorEquipmentFromTower(
  op: PersistentOperator,
  tower: { weapon: string; attachments: readonly string[]; armor?: string | null },
): PersistentOperator {
  return {
    ...op,
    equipment: {
      weapon: tower.weapon,
      attachments: [...tower.attachments],
      armor: tower.armor ?? null,
    },
  };
}

export function clearOperatorEquipment(): PersistentOperator["equipment"] {
  return { weapon: "toz", attachments: [], armor: null };
}
