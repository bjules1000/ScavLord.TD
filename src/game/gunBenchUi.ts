/**
 * Pure Gun Bench UI helpers — slot selection, factory mount bridging, preview framing.
 */

import type { AttachMount, Item } from "./gear";
import { WEAPONS } from "./gear";
import {
  getScavAction,
  listScavActionsForSlot,
  type ScavBenchAction,
} from "./scavWeaponMods";
import {
  currentPartLabel,
  platformForWeaponId,
  resolveSlotHitAreas,
  resolveVisualState,
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
): { slotLabel: string; partLabel: string; flavor: string } {
  const resolved = resolveVisualState(weaponId, state);
  const id = resolved?.parts[slot] ?? null;
  const part = visualPart(id);
  let flavor = "Stock configuration.";
  if (!id) flavor = "Nothing mounted here.";
  else if (part?.destructive) flavor = "Destructive scav work. Heavy tradeoffs.";
  else if (part?.improvised) flavor = "Improvised scav work. Ugly, but it holds.";
  return {
    slotLabel: slotLabel(slot),
    partLabel: currentPartLabel(weaponId, state, slot),
    flavor,
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

export type BenchRequirementRow = {
  label: string;
  kind: "tool" | "item";
  /** Display-only for now — no consumption. */
  amount?: number;
};

/** Future-ready requirement rows from action metadata (no economy yet). */
export function actionRequirementRows(action: ScavBenchAction): BenchRequirementRow[] {
  const rows: BenchRequirementRow[] = [];
  for (const tool of action.requiredTools ?? []) {
    rows.push({ label: tool.replace(/_/g, " ").toUpperCase(), kind: "tool" });
  }
  for (const cost of action.cost ?? []) {
    rows.push({
      label: cost.itemId.replace(/_/g, " ").toUpperCase(),
      kind: "item",
      amount: cost.amount,
    });
  }
  return rows;
}

export type BenchWeaponSwapCandidate = {
  kind: "equipped" | "stash";
  weaponId: string;
  name: string;
  stashUid?: number;
  attachmentCount: number;
  scavSummary: string;
  weight: number;
};

export function scavModsSummary(state: WeaponVisualState | null | undefined): string {
  if (!state) return "STOCK";
  const tags: string[] = [];
  for (const id of Object.values(state.parts)) {
    if (!id) continue;
    const part = visualPart(id);
    if (part?.improvised || part?.destructive) tags.push(part.name);
  }
  return tags.length ? tags.slice(0, 3).join(" · ") : "STOCK";
}

/** Stash weapons available to equip onto the selected crew member. */
export function listBenchWeaponSwapCandidates(
  equippedWeaponId: string,
  equippedAttachments: readonly string[],
  equippedScavMods: WeaponVisualState | null | undefined,
  stash: readonly Item[],
): BenchWeaponSwapCandidate[] {
  const out: BenchWeaponSwapCandidate[] = [
    {
      kind: "equipped",
      weaponId: equippedWeaponId,
      name: WEAPONS[equippedWeaponId]?.name ?? equippedWeaponId,
      attachmentCount: equippedAttachments.length,
      scavSummary: scavModsSummary(equippedScavMods ?? null),
      weight: WEAPONS[equippedWeaponId]?.weight ?? 0,
    },
  ];
  for (const item of stash) {
    if (item.kind !== "weapon" || !item.ref || !WEAPONS[item.ref]) continue;
    out.push({
      kind: "stash",
      weaponId: item.ref,
      name: item.name || WEAPONS[item.ref]!.name,
      stashUid: item.uid,
      attachmentCount: item.installed?.length ?? 0,
      scavSummary: scavModsSummary(item.scavMods ?? null),
      weight: WEAPONS[item.ref]!.weight,
    });
  }
  return out;
}

export const GUN_BENCH_TITLE = "GUN BENCH";
