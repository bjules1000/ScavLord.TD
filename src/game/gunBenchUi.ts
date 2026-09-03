/**
 * Pure Gun Bench UI helpers — slot selection, factory mount bridging, preview framing.
 */

import type { AttachMount } from "./gear";
import {
  getScavAction,
  listScavActionsForSlot,
  type ScavBenchAction,
} from "./scavWeaponMods";
import {
  currentPartLabel,
  platformForWeaponId,
  resolveSlotHitAreas,
  slotLabel,
  visualPart,
  type WeaponVisualSlot,
  type WeaponVisualState,
} from "./weaponVisuals";

/** Visual Bench slots that share a factory AttachMount. */
const VISUAL_TO_FACTORY: Partial<Record<WeaponVisualSlot, AttachMount>> = {
  magazine: "magazine",
  optic: "optic",
  underbarrel: "underbarrel",
  muzzle: "muzzle",
};

const FACTORY_TO_VISUAL: Record<AttachMount, WeaponVisualSlot> = {
  magazine: "magazine",
  optic: "optic",
  underbarrel: "underbarrel",
  muzzle: "muzzle",
};

export function factoryMountForVisualSlot(slot: WeaponVisualSlot): AttachMount | null {
  return VISUAL_TO_FACTORY[slot] ?? null;
}

export function visualSlotForFactoryMount(mount: AttachMount): WeaponVisualSlot {
  return FACTORY_TO_VISUAL[mount];
}

export function clickableSlotsForWeapon(weaponId: string): WeaponVisualSlot[] {
  return resolveSlotHitAreas(weaponId)?.map((h) => h.slot) ?? [];
}

export function scavActionsForSelectedSlot(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
  slot: WeaponVisualSlot | null,
): ScavBenchAction[] {
  if (!slot) return [];
  return listScavActionsForSlot(weaponId, state, slot);
}

export function selectedPartHeading(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
  slot: WeaponVisualSlot,
): { slotLabel: string; partLabel: string } {
  return {
    slotLabel: slotLabel(slot),
    partLabel: currentPartLabel(weaponId, state, slot),
  };
}

/** True when the action's resulting part is marked destructive (warning chrome only). */
export function actionShowsDestructiveWarning(
  weaponId: string,
  actionId: string,
): boolean {
  const action = getScavAction(actionId);
  if (!action) return false;
  const platform = platformForWeaponId(weaponId);
  if (!platform) return false;
  let resultId = action.resultPartId;
  if (resultId == null) {
    // Mirror platform-specific resolution from scavWeaponMods without importing private helpers.
    if (action.id === "cut_stock") resultId = platform.id === "sks" ? "sks_stock_cut" : "ak_stock_cut";
    else if (action.id === "wrap_stock")
      resultId = platform.id === "sks" ? "sks_stock_cut_wrapped" : "ak_stock_cut_wrapped";
    else if (action.id === "add_beer_sight")
      resultId = platform.id === "sks" ? "sks_optic_beer_bottle" : "ak_optic_beer_bottle";
    else if (action.id === "saw_barrel")
      resultId = platform.id === "sks" ? "sks_muzzle_sawed" : "ak_muzzle_sawed";
  }
  return !!visualPart(resultId)?.destructive;
}

export function gunBenchWorkspaceTitle(
  previewLabel: string | null,
): { mode: "current" | "preview"; title: string; subtitle: string | null } {
  if (previewLabel) {
    return { mode: "preview", title: "PREVIEW BUILD", subtitle: previewLabel };
  }
  return { mode: "current", title: "CURRENT BUILD", subtitle: null };
}

/** Preferred integer scale so the weapon fills ~target logical width without blur. */
export function preferredWeaponScale(
  platformWidth: number,
  targetCssWidth: number,
  min = 3,
  max = 6,
): number {
  if (platformWidth <= 0) return min;
  const raw = Math.floor(targetCssWidth / platformWidth);
  return Math.max(min, Math.min(max, raw || min));
}

export const GUN_BENCH_TITLE = "GUN BENCH";
