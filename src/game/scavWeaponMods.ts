/**
 * Scav Gun Bench actions — data-driven transforms of WeaponVisualState.
 * Distinct from factory AttachMount installs.
 */

import {
  cloneVisualState,
  defaultVisualState,
  platformForWeaponId,
  resolveVisualState,
  setPartInState,
  visualPart,
  type WeaponVisualPlatformId,
  type WeaponVisualSlot,
  type WeaponVisualState,
} from "./weaponVisuals";

export type ScavBenchAction = {
  id: string;
  label: string;
  platforms: readonly WeaponVisualPlatformId[];
  /** Slot this action writes. */
  slot: WeaponVisualSlot;
  /** Allowed current part ids (or null = empty/none). */
  requiresCurrent: readonly (string | null)[];
  /** Resulting part id (null clears the slot). */
  resultPartId: string | null;
  /** Optional future tools/resources — not consumed yet. */
  requiredTools?: readonly string[];
  cost?: readonly { itemId: string; amount: number }[];
  desc: string;
};

export const SCAV_BENCH_ACTIONS: readonly ScavBenchAction[] = [
  {
    id: "remove_stock",
    label: "REMOVE STOCK",
    platforms: ["ak"],
    slot: "stock",
    requiresCurrent: ["ak_stock_default", "ak_stock_welded", "ak_stock_cut", "ak_stock_cut_wrapped"],
    resultPartId: "ak_stock_none",
    desc: "Yank the stock. Lighter. Worse control.",
  },
  {
    id: "cut_stock",
    label: "CUT STOCK",
    platforms: ["ak", "sks"],
    slot: "stock",
    requiresCurrent: ["ak_stock_default", "sks_stock_default", "ak_stock_welded"],
    resultPartId: null, // platform-specific — resolved in apply
    desc: "Saw the stock shorter. Mobility up, control down.",
  },
  {
    id: "wrap_stock",
    label: "WRAP WITH CLOTH",
    platforms: ["ak", "sks"],
    slot: "stock",
    requiresCurrent: ["ak_stock_cut", "sks_stock_cut"],
    resultPartId: null,
    requiredTools: ["cloth"],
    desc: "Tape cloth around the cut stock. Softens the downside a bit.",
  },
  {
    id: "weld_stock",
    label: "WELD STOCK",
    platforms: ["ak"],
    slot: "stock",
    requiresCurrent: ["ak_stock_none", "ak_stock_cut", "ak_stock_cut_wrapped"],
    resultPartId: "ak_stock_welded",
    requiredTools: ["welder", "scrap"],
    desc: "Weld on a crude replacement stock. Heavy but steadier.",
  },
  {
    id: "tape_mags",
    label: "TAPE MAGS",
    platforms: ["ak"],
    slot: "magazine",
    requiresCurrent: ["ak_mag_default"],
    resultPartId: "ak_mag_taped",
    requiredTools: ["duct_tape"],
    desc: "Jungle-tape two mags. Faster reloads, more weight.",
  },
  {
    id: "untape_mags",
    label: "UNTAPE MAGS",
    platforms: ["ak"],
    slot: "magazine",
    requiresCurrent: ["ak_mag_taped"],
    resultPartId: "ak_mag_default",
    desc: "Pull the tape. Back to a single mag.",
  },
  {
    id: "add_taped_grip",
    label: "ADD TAPED GRIP",
    platforms: ["ak"],
    slot: "underbarrel",
    requiresCurrent: [null],
    resultPartId: "ak_grip_taped",
    requiredTools: ["duct_tape"],
    desc: "Nail/tape a scrap grip under the barrel.",
  },
  {
    id: "remove_taped_grip",
    label: "REMOVE GRIP",
    platforms: ["ak"],
    slot: "underbarrel",
    requiresCurrent: ["ak_grip_taped"],
    resultPartId: null,
    desc: "Rip the improvised grip off.",
  },
  {
    id: "add_beer_sight",
    label: "ADD BEER BOTTLE SIGHT",
    platforms: ["ak", "sks"],
    slot: "optic",
    requiresCurrent: [null],
    resultPartId: null,
    requiredTools: ["duct_tape"],
    desc: "Tape a bottle on top. Janky sight, modest help.",
  },
  {
    id: "remove_beer_sight",
    label: "REMOVE BOTTLE SIGHT",
    platforms: ["ak", "sks"],
    slot: "optic",
    requiresCurrent: ["ak_optic_beer_bottle", "sks_optic_beer_bottle"],
    resultPartId: null,
    desc: "Take the bottle off.",
  },
  {
    id: "saw_barrel",
    label: "SAW BARREL",
    platforms: ["ak", "sks"],
    slot: "muzzle",
    requiresCurrent: ["ak_muzzle_default", "sks_muzzle_default"],
    resultPartId: null,
    requiredTools: ["saw"],
    desc: "Shorten the barrel. Less reach, wider cone, lighter.",
  },
];

function resultPartFor(
  action: ScavBenchAction,
  platformId: WeaponVisualPlatformId,
): string | null {
  if (action.resultPartId != null) return action.resultPartId;
  switch (action.id) {
    case "cut_stock":
      return platformId === "sks" ? "sks_stock_cut" : "ak_stock_cut";
    case "wrap_stock":
      return platformId === "sks" ? "sks_stock_cut_wrapped" : "ak_stock_cut_wrapped";
    case "add_beer_sight":
      return platformId === "sks" ? "sks_optic_beer_bottle" : "ak_optic_beer_bottle";
    case "saw_barrel":
      return platformId === "sks" ? "sks_muzzle_sawed" : "ak_muzzle_sawed";
    default:
      return null;
  }
}

export function listScavActionsForWeapon(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
): ScavBenchAction[] {
  const platform = platformForWeaponId(weaponId);
  const resolved = resolveVisualState(weaponId, state);
  if (!platform || !resolved) return [];
  return SCAV_BENCH_ACTIONS.filter((a) => canApplyScavAction(weaponId, resolved, a.id).ok);
}

/** Bench actions that write the given visual slot and are currently valid. */
export function listScavActionsForSlot(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
  slot: WeaponVisualSlot,
): ScavBenchAction[] {
  return listScavActionsForWeapon(weaponId, state).filter((a) => a.slot === slot);
}

export function getScavAction(actionId: string): ScavBenchAction | null {
  return SCAV_BENCH_ACTIONS.find((a) => a.id === actionId) ?? null;
}

export function canApplyScavAction(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
  actionId: string,
): { ok: true } | { ok: false; reason: string } {
  const action = getScavAction(actionId);
  if (!action) return { ok: false, reason: "Unknown action." };
  const platform = platformForWeaponId(weaponId);
  if (!platform) return { ok: false, reason: "This gun has no Bench work yet." };
  if (!action.platforms.includes(platform.id)) {
    return { ok: false, reason: "Action not valid for this platform." };
  }
  if (!platform.supportedSlots.includes(action.slot)) {
    return { ok: false, reason: "This platform has no such slot." };
  }
  const resolved = resolveVisualState(weaponId, state) ?? defaultVisualState(weaponId);
  if (!resolved) return { ok: false, reason: "No visual state." };
  const current = resolved.parts[action.slot] ?? null;
  if (!action.requiresCurrent.includes(current)) {
    return { ok: false, reason: "Wrong current part for this work." };
  }
  const nextId = resultPartFor(action, platform.id);
  if (nextId != null) {
    const part = visualPart(nextId);
    if (!part || part.platformId !== platform.id || part.slot !== action.slot) {
      return { ok: false, reason: "Resulting part missing." };
    }
  }
  return { ok: true };
}

/** Preview next visual state without mutating. */
export function previewScavAction(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
  actionId: string,
): WeaponVisualState | null {
  const check = canApplyScavAction(weaponId, state, actionId);
  if (!check.ok) return null;
  const action = getScavAction(actionId)!;
  const platform = platformForWeaponId(weaponId)!;
  const resolved = resolveVisualState(weaponId, state) ?? defaultVisualState(weaponId);
  if (!resolved) return null;
  const nextId = resultPartFor(action, platform.id);
  return setPartInState(cloneVisualState(resolved), action.slot, nextId);
}

/** Apply action; returns new state. */
export function applyScavAction(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
  actionId: string,
): { ok: true; state: WeaponVisualState } | { ok: false; reason: string } {
  const check = canApplyScavAction(weaponId, state, actionId);
  if (!check.ok) return check;
  const next = previewScavAction(weaponId, state, actionId);
  if (!next) return { ok: false, reason: "Could not preview." };
  return { ok: true, state: next };
}

export function ensureVisualState(weaponId: string, state: WeaponVisualState | null | undefined): WeaponVisualState | null {
  return resolveVisualState(weaponId, state) ?? defaultVisualState(weaponId);
}
