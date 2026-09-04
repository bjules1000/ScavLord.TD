/**
 * Crew-centric hideout equipment — shared stash, per-operator worn kits.
 * Leader (Ash / PMC) uses stable id LEADER_EQUIPMENT_OWNER_ID; crew use PersistentOperator.id.
 */

import { ATTACHMENTS, ARMORS, WEAPONS, makeItem, type Item } from "../gear";
import type { Meta, PmcState } from "../meta";
import { getEquippedWeight } from "../armor";
import {
  getOperatorMoveSpeed,
  OPERATOR_MOVE_SPEED_TILES,
  operatorSpeedMultiplier,
} from "../movement";
import { STARTER_WEAPON_ID } from "../weapons";
import {
  armorItemId,
  attachItemId,
  weaponAttachmentCapacity,
  weaponItemId,
} from "../raidGear";
import {
  canInstallAttachmentOnWeapon,
  installAttachmentInMounts,
  mountRowsForWeapon,
  normalizeInstalledAttachments,
  slotOf,
} from "../weaponAttachments";
import { aliveOperators, findOperator } from "./crew";
import {
  applyOperatorEquipToMeta,
  equipArmorOnOperator,
  equipAttachmentOnOperator,
  equipWeaponOnOperator,
  unequipOperatorSlot,
  type EquipOperatorResult,
} from "./equipment";
import { operatorEffectiveWeight, resolveCombatMods } from "./runtime";
import type { OperatorEquipment, PersistentOperator } from "./types";
import { scavVisualMods } from "../weaponVisuals";

import { STARTING_OPERATOR, STARTING_OPERATOR_ID } from "./startingOperator";

/** Stable equipment owner id for the camp leader (Meta.pmc). Not an array index. */
export const LEADER_EQUIPMENT_OWNER_ID = STARTING_OPERATOR_ID;

export type EquipmentOwnerId = typeof LEADER_EQUIPMENT_OWNER_ID | (string & {});

export type EquipmentSlotKind = "weapon" | "armor" | "attachment";

/** Generic hideout equipment mutation — for quests / telemetry. No Wolf hard-coding. */
export interface OperatorEquipmentChangeEvent {
  type: "OPERATOR_EQUIPMENT_CHANGED";
  operatorId: EquipmentOwnerId;
  slot: EquipmentSlotKind;
  previousItemId: string | null;
  newItemId: string | null;
}

export interface CrewEquipmentRow {
  ownerId: EquipmentOwnerId;
  name: string;
  roleLabel: string;
  weaponId: string;
  armorId: string | null;
  editable: boolean;
  kind: "leader" | "operator";
  uniqueId?: string;
}

export type CrewEquipResult =
  | {
      ok: true;
      stash: Item[];
      meta: Meta;
      message: string;
      change: OperatorEquipmentChangeEvent;
    }
  | { ok: false; reason: string };

function pmcAsEquipment(pmc: PmcState): OperatorEquipment {
  const eq: OperatorEquipment = {
    weapon: pmc.weapon,
    attachments: [...pmc.attachments],
    armor: pmc.armor,
  };
  if (pmc.scavMods !== undefined) {
    eq.scavMods = pmc.scavMods
      ? { platformId: pmc.scavMods.platformId, parts: { ...pmc.scavMods.parts } }
      : null;
  }
  return eq;
}

function writePmcEquipment(pmc: PmcState, eq: OperatorEquipment): PmcState {
  return {
    ...pmc,
    weapon: eq.weapon,
    attachments: [...eq.attachments],
    armor: eq.armor,
    scavMods: eq.scavMods ? { ...eq.scavMods, parts: { ...eq.scavMods.parts } } : eq.scavMods ?? null,
  };
}

/** Living crew + leader for Equipment / Raid Prep navigation. */
export function listCrewEquipmentRows(meta: Meta): CrewEquipmentRow[] {
  const rows: CrewEquipmentRow[] = [
    {
      ownerId: LEADER_EQUIPMENT_OWNER_ID,
      name: meta.pmc.name,
      roleLabel: STARTING_OPERATOR.roleLabel,
      weaponId: meta.pmc.weapon,
      armorId: meta.pmc.armor,
      editable: true,
      kind: "leader",
    },
  ];
  for (const op of aliveOperators(meta)) {
    const row: CrewEquipmentRow = {
      ownerId: op.id,
      name: op.name,
      roleLabel: op.roleLabel,
      weaponId: op.equipment.weapon,
      armorId: op.equipment.armor,
      editable: true,
      kind: "operator",
    };
    if (op.uniqueId) row.uniqueId = op.uniqueId;
    rows.push(row);
  }
  return rows;
}

export function isEditableEquipmentOwner(meta: Meta, ownerId: EquipmentOwnerId): boolean {
  if (ownerId === LEADER_EQUIPMENT_OWNER_ID) return true;
  const op = findOperator(meta, ownerId);
  return !!op && op.status === "alive";
}

export function resolveEquipmentOwnerId(
  meta: Meta,
  sel: { operatorId?: string; uniqueId?: string },
): EquipmentOwnerId | null {
  if (sel.uniqueId) {
    const op = meta.crew.operators.find((o) => o.uniqueId === sel.uniqueId && o.status === "alive");
    return op?.id ?? null;
  }
  if (sel.operatorId === LEADER_EQUIPMENT_OWNER_ID) return LEADER_EQUIPMENT_OWNER_ID;
  if (sel.operatorId && findOperator(meta, sel.operatorId)) return sel.operatorId;
  return null;
}

export function getOwnerEquipment(meta: Meta, ownerId: EquipmentOwnerId): OperatorEquipment | null {
  if (ownerId === LEADER_EQUIPMENT_OWNER_ID) return pmcAsEquipment(meta.pmc);
  const op = findOperator(meta, ownerId);
  if (!op) return null;
  const eq: OperatorEquipment = {
    weapon: op.equipment.weapon,
    attachments: [...op.equipment.attachments],
    armor: op.equipment.armor,
  };
  if (op.equipment.scavMods !== undefined) {
    eq.scavMods = op.equipment.scavMods
      ? { platformId: op.equipment.scavMods.platformId, parts: { ...op.equipment.scavMods.parts } }
      : null;
  }
  return eq;
}

export function getOperatorEquippedWeapon(meta: Meta, ownerId: EquipmentOwnerId): string | null {
  return getOwnerEquipment(meta, ownerId)?.weapon ?? null;
}

export function getOperatorEquippedArmor(meta: Meta, ownerId: EquipmentOwnerId): string | null {
  const eq = getOwnerEquipment(meta, ownerId);
  return eq ? eq.armor : null;
}

export function operatorHasArmor(meta: Meta, ownerId: EquipmentOwnerId): boolean {
  return !!getOperatorEquippedArmor(meta, ownerId);
}

export function operatorWeaponDiffersFrom(
  meta: Meta,
  ownerId: EquipmentOwnerId,
  baselineWeaponId: string,
): boolean {
  const weapon = getOperatorEquippedWeapon(meta, ownerId);
  return weapon != null && weapon !== baselineWeaponId;
}

export function weaponDisplayName(weaponId: string): string {
  return WEAPONS[weaponId]?.name ?? "SIDEARM";
}

export function armorDisplayName(armorId: string | null): string {
  if (!armorId) return "NO ARMOR";
  return ARMORS[armorId]?.name ?? "ARMOR";
}

export function attachmentDisplayName(attId: string): string {
  return ATTACHMENTS[attId]?.name ?? attId;
}

/** Derived load summary for the selected kit (leader uses raw weight; crew apply mobility). */
export function ownerLoadSummary(
  meta: Meta,
  ownerId: EquipmentOwnerId,
): { weight: number; moveTilesPerSec: number } {
  const eq = getOwnerEquipment(meta, ownerId);
  if (!eq) return { weight: 0, moveTilesPerSec: getOperatorMoveSpeed({}) };
  const kit = { weapon: eq.weapon, armor: eq.armor, attachments: eq.attachments };
  const scav = scavVisualMods(eq.weapon, eq.scavMods);
  if (ownerId === LEADER_EQUIPMENT_OWNER_ID) {
    const weight = getEquippedWeight(kit) + scav.weightAdd;
    return {
      weight,
      moveTilesPerSec: getOperatorMoveSpeed(kit) * scav.moveMult,
    };
  }
  const op = findOperator(meta, ownerId);
  if (!op) {
    const weight = getEquippedWeight(kit) + scav.weightAdd;
    return {
      weight,
      moveTilesPerSec: getOperatorMoveSpeed(kit) * scav.moveMult,
    };
  }
  const weight = operatorEffectiveWeight(kit, resolveCombatMods(op)) + scav.weightAdd;
  return {
    weight,
    moveTilesPerSec: OPERATOR_MOVE_SPEED_TILES * operatorSpeedMultiplier(weight) * scav.moveMult,
  };
}

function changeEvent(
  operatorId: EquipmentOwnerId,
  slot: EquipmentSlotKind,
  previousItemId: string | null,
  newItemId: string | null,
): OperatorEquipmentChangeEvent {
  return { type: "OPERATOR_EQUIPMENT_CHANGED", operatorId, slot, previousItemId, newItemId };
}

function equipOnLeader(
  pmc: PmcState,
  stash: readonly Item[],
  uid: number,
  itemUid: number,
):
  | { ok: true; stash: Item[]; pmc: PmcState; message: string; change: OperatorEquipmentChangeEvent }
  | { ok: false; reason: string } {
  const item = stash.find((i) => i.uid === itemUid);
  if (!item) return { ok: false, reason: "Item not in stash." };
  let nextStash = stash.filter((i) => i.uid !== itemUid);
  const back: Item[] = [];
  const eq = pmcAsEquipment(pmc);

  if (item.kind === "weapon" && item.ref && WEAPONS[item.ref]) {
    const prev = eq.weapon;
    const oldWid = weaponItemId(eq.weapon);
    if (oldWid && eq.weapon !== STARTER_WEAPON_ID) {
      const old = makeItem(oldWid, uid);
      if (old) {
        if (eq.attachments.length) old.installed = [...eq.attachments];
        if (eq.scavMods) old.scavMods = { ...eq.scavMods, parts: { ...eq.scavMods.parts } };
        back.push(old);
      }
    } else if (oldWid && eq.weapon === STARTER_WEAPON_ID && eq.attachments.length) {
      for (const att of eq.attachments) {
        const aid = attachItemId(att);
        if (aid) {
          const m = makeItem(aid, uid + back.length + 1);
          if (m) back.push(m);
        }
      }
    }
    const installed = normalizeInstalledAttachments(item.ref, [...(item.installed ?? [])]);
    const nextEq: OperatorEquipment = {
      weapon: item.ref,
      attachments: installed,
      armor: eq.armor,
      scavMods: item.scavMods
        ? { ...item.scavMods, parts: { ...item.scavMods.parts } }
        : null,
    };
    nextStash = [...nextStash, ...back];
    return {
      ok: true,
      stash: nextStash,
      pmc: writePmcEquipment(pmc, nextEq),
      message: `${item.name} fitted to ${pmc.name}.`,
      change: changeEvent(LEADER_EQUIPMENT_OWNER_ID, "weapon", prev, item.ref),
    };
  }

  if (item.kind === "armor" && item.ref) {
    const prev = eq.armor;
    if (eq.armor) {
      const oldId = armorItemId(eq.armor);
      const old = oldId ? makeItem(oldId, uid) : null;
      if (old) back.push(old);
    }
    nextStash = [...nextStash, ...back];
    return {
      ok: true,
      stash: nextStash,
      pmc: writePmcEquipment(pmc, { ...eq, armor: item.ref }),
      message: `${item.name} fitted to ${pmc.name}.`,
      change: changeEvent(LEADER_EQUIPMENT_OWNER_ID, "armor", prev, item.ref),
    };
  }

  if (item.kind === "attachment" && item.ref && ATTACHMENTS[item.ref]) {
    const install = installAttachmentInMounts(eq.weapon, eq.attachments, item.ref);
    if (!install.ok) return { ok: false, reason: install.reason };
    let resultStash = nextStash;
    if (install.replaced) {
      const oldAid = attachItemId(install.replaced);
      const oldItem = oldAid ? makeItem(oldAid, uid) : null;
      if (!oldItem) return { ok: false, reason: "Unknown attachment." };
      resultStash = [...resultStash, oldItem];
    }
    return {
      ok: true,
      stash: resultStash,
      pmc: writePmcEquipment(pmc, { ...eq, attachments: install.attachments }),
      message: `${item.name} installed on ${pmc.name}.`,
      change: changeEvent(LEADER_EQUIPMENT_OWNER_ID, "attachment", install.replaced, item.ref),
    };
  }

  return { ok: false, reason: "Only weapons, mods, and armor can be equipped." };
}

function unequipLeaderSlot(
  pmc: PmcState,
  stash: readonly Item[],
  uid: number,
  slot: "weapon" | "armor" | number,
):
  | { ok: true; stash: Item[]; pmc: PmcState; message: string; change: OperatorEquipmentChangeEvent }
  | { ok: false; reason: string } {
  const eq = pmcAsEquipment(pmc);
  const back: Item[] = [];
  if (slot === "weapon") {
    if (eq.weapon === STARTER_WEAPON_ID) return { ok: false, reason: "They keep a sidearm as a fallback." };
    const prev = eq.weapon;
    const wid = weaponItemId(eq.weapon);
    const gun = wid ? makeItem(wid, uid) : null;
    if (gun) {
      if (eq.attachments.length) gun.installed = [...eq.attachments];
      if (eq.scavMods) gun.scavMods = { ...eq.scavMods, parts: { ...eq.scavMods.parts } };
      back.push(gun);
    }
    return {
      ok: true,
      stash: [...stash, ...back],
      pmc: writePmcEquipment(pmc, { weapon: STARTER_WEAPON_ID, attachments: [], armor: eq.armor, scavMods: null }),
      message: "Gear returned to stash.",
      change: changeEvent(LEADER_EQUIPMENT_OWNER_ID, "weapon", prev, STARTER_WEAPON_ID),
    };
  }
  if (slot === "armor") {
    if (!eq.armor) return { ok: false, reason: "No armor fitted." };
    const prev = eq.armor;
    const aid = armorItemId(eq.armor);
    const ar = aid ? makeItem(aid, uid) : null;
    if (ar) back.push(ar);
    return {
      ok: true,
      stash: [...stash, ...back],
      pmc: writePmcEquipment(pmc, { ...eq, armor: null }),
      message: "Gear returned to stash.",
      change: changeEvent(LEADER_EQUIPMENT_OWNER_ID, "armor", prev, null),
    };
  }
  const rows = mountRowsForWeapon(eq.weapon, eq.attachments);
  const row = rows[slot as number];
  if (!row?.attachmentId) return { ok: false, reason: "Empty mod slot." };
  const att = row.attachmentId;
  const aid = attachItemId(att);
  const item = aid ? makeItem(aid, uid) : null;
  if (item) back.push(item);
  return {
    ok: true,
    stash: [...stash, ...back],
    pmc: writePmcEquipment(pmc, {
      ...eq,
      attachments: eq.attachments.filter((id) => id !== att),
    }),
    message: "Gear returned to stash.",
    change: changeEvent(LEADER_EQUIPMENT_OWNER_ID, "attachment", att, null),
  };
}

function changeFromOperatorResult(
  ownerId: EquipmentOwnerId,
  before: OperatorEquipment,
  after: OperatorEquipment,
  itemKind: "weapon" | "armor" | "attachment" | "unequip",
  unequipSlot?: "weapon" | "armor" | number,
): OperatorEquipmentChangeEvent {
  if (itemKind === "weapon" || (itemKind === "unequip" && unequipSlot === "weapon")) {
    return changeEvent(ownerId, "weapon", before.weapon, after.weapon);
  }
  if (itemKind === "armor" || (itemKind === "unequip" && unequipSlot === "armor")) {
    return changeEvent(ownerId, "armor", before.armor, after.armor);
  }
  const removed =
    before.attachments.find((a) => !after.attachments.includes(a)) ?? null;
  const added = after.attachments.find((a) => !before.attachments.includes(a)) ?? null;
  return changeEvent(ownerId, "attachment", removed, added);
}

/**
 * Atomic equip from shared stash onto leader or a living operator.
 * On failure, caller must not persist — helpers return without mutating meta until apply.
 */
export function equipOnEquipmentOwner(
  meta: Meta,
  ownerId: EquipmentOwnerId,
  stash: readonly Item[],
  nextUid: number,
  itemUid: number,
  stashCap: number,
): CrewEquipResult {
  if (!isEditableEquipmentOwner(meta, ownerId)) {
    return { ok: false, reason: "That operator cannot be equipped." };
  }

  if (ownerId === LEADER_EQUIPMENT_OWNER_ID) {
    const result = equipOnLeader(meta.pmc, stash, nextUid, itemUid);
    if (!result.ok) return result;
    if (result.stash.length > stashCap) return { ok: false, reason: "Stash is full." };
    meta.pmc = result.pmc;
    return {
      ok: true,
      stash: result.stash,
      meta,
      message: result.message,
      change: result.change,
    };
  }

  const op = findOperator(meta, ownerId);
  if (!op) return { ok: false, reason: "Operator not found." };
  const item = stash.find((i) => i.uid === itemUid);
  if (!item) return { ok: false, reason: "Item not in stash." };
  const before = { ...op.equipment, attachments: [...op.equipment.attachments] };

  let result: EquipOperatorResult;
  let kind: "weapon" | "armor" | "attachment";
  if (item.kind === "weapon") {
    result = equipWeaponOnOperator(op, stash, nextUid, itemUid);
    kind = "weapon";
  } else if (item.kind === "armor") {
    result = equipArmorOnOperator(op, stash, nextUid, itemUid);
    kind = "armor";
  } else if (item.kind === "attachment") {
    result = equipAttachmentOnOperator(op, stash, nextUid, itemUid);
    kind = "attachment";
  } else {
    return { ok: false, reason: "Only weapons, mods, and armor can be equipped." };
  }
  if (!result.ok) return result;
  const applied = applyOperatorEquipToMeta(meta, ownerId, result, stashCap);
  if (!applied.ok) return applied;
  return {
    ok: true,
    stash: applied.stash,
    meta,
    message: applied.message,
    change: changeFromOperatorResult(ownerId, before, applied.operator.equipment, kind),
  };
}

export function unequipFromEquipmentOwner(
  meta: Meta,
  ownerId: EquipmentOwnerId,
  stash: readonly Item[],
  nextUid: number,
  slot: "weapon" | "armor" | number,
  stashCap: number,
): CrewEquipResult {
  if (!isEditableEquipmentOwner(meta, ownerId)) {
    return { ok: false, reason: "That operator cannot be equipped." };
  }

  if (ownerId === LEADER_EQUIPMENT_OWNER_ID) {
    const result = unequipLeaderSlot(meta.pmc, stash, nextUid, slot);
    if (!result.ok) return result;
    if (result.stash.length > stashCap) return { ok: false, reason: "Stash is full." };
    meta.pmc = result.pmc;
    return {
      ok: true,
      stash: result.stash,
      meta,
      message: result.message,
      change: result.change,
    };
  }

  const op = findOperator(meta, ownerId);
  if (!op) return { ok: false, reason: "Operator not found." };
  const before = { ...op.equipment, attachments: [...op.equipment.attachments] };
  const result = unequipOperatorSlot(op, stash, nextUid, slot);
  if (!result.ok) return result;
  const applied = applyOperatorEquipToMeta(meta, ownerId, result, stashCap);
  if (!applied.ok) return applied;
  return {
    ok: true,
    stash: applied.stash,
    meta,
    message: applied.message,
    change: changeFromOperatorResult(
      ownerId,
      before,
      applied.operator.equipment,
      "unequip",
      slot,
    ),
  };
}

export function kitActionsForOwner(
  meta: Meta,
  ownerId: EquipmentOwnerId,
): {
  attachments: string[];
  attachmentSlots: number;
  weaponId: string;
  mountRows: ReturnType<typeof mountRowsForWeapon>;
} {
  const eq = getOwnerEquipment(meta, ownerId);
  if (!eq) {
    return { attachments: [], attachmentSlots: 1, weaponId: "pm", mountRows: [] };
  }
  const rows = mountRowsForWeapon(eq.weapon, eq.attachments);
  return {
    attachments: [...eq.attachments],
    attachmentSlots: rows.length,
    weaponId: eq.weapon,
    mountRows: rows,
  };
}

/** Prefer a valid editable owner; fall back to leader. */
export function coerceEquipmentOwnerId(
  meta: Meta,
  preferred: EquipmentOwnerId | null | undefined,
): EquipmentOwnerId {
  if (preferred && isEditableEquipmentOwner(meta, preferred)) return preferred;
  return LEADER_EQUIPMENT_OWNER_ID;
}

export function findOperatorByUniqueId(
  meta: Meta,
  uniqueId: string,
): PersistentOperator | undefined {
  return meta.crew.operators.find((o) => o.uniqueId === uniqueId);
}

/** Apply a scav Bench visual state onto the owner's equipped weapon. */
export function setOwnerScavMods(
  meta: Meta,
  ownerId: EquipmentOwnerId,
  scavMods: import("../weaponVisuals").WeaponVisualState | null,
): { ok: true; meta: Meta } | { ok: false; reason: string } {
  if (!isEditableEquipmentOwner(meta, ownerId)) {
    return { ok: false, reason: "That operator cannot be equipped." };
  }
  const next =
    scavMods == null
      ? null
      : { platformId: scavMods.platformId, parts: { ...scavMods.parts } };
  if (ownerId === LEADER_EQUIPMENT_OWNER_ID) {
    meta.pmc = { ...meta.pmc, scavMods: next };
    return { ok: true, meta };
  }
  const idx = meta.crew.operators.findIndex((o) => o.id === ownerId);
  if (idx < 0) return { ok: false, reason: "Operator not found." };
  const op = meta.crew.operators[idx]!;
  meta.crew.operators[idx] = {
    ...op,
    equipment: { ...op.equipment, scavMods: next },
  };
  return { ok: true, meta };
}
