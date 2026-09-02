import {
  ATTACHMENTS,
  ITEM_BY_ID,
  WEAPONS,
  makeItem,
  type Item,
} from "../gear";
import {
  attachItemId,
  armorItemId,
  weaponItemId,
} from "../raidGear";
import type { Meta, StashEntry } from "../meta";
import type { OperatorEquipment, PersistentOperator } from "./types";

export function itemToStashEntry(item: Item): StashEntry {
  const entry: StashEntry = { defId: item.id };
  if (item.kind === "weapon" && item.installed?.length) entry.installed = [...item.installed];
  return entry;
}

export function stashEntriesFromItems(items: readonly Item[]): StashEntry[] {
  return items.map(itemToStashEntry);
}

function weaponSlots(weaponId: string): number {
  return WEAPONS[weaponId]?.slots ?? 1;
}

export type EquipOperatorResult =
  | { ok: true; stash: Item[]; operator: PersistentOperator; message: string }
  | { ok: false; reason: string };

export function equipWeaponOnOperator(
  op: PersistentOperator,
  stash: readonly Item[],
  uid: number,
  itemUid: number,
): EquipOperatorResult {
  const item = stash.find((i) => i.uid === itemUid);
  if (!item || item.kind !== "weapon" || !item.ref || !WEAPONS[item.ref])
    return { ok: false, reason: "Not a valid weapon." };
  let nextStash = stash.filter((i) => i.uid !== itemUid);
  const back: Item[] = [];
  const oldWid = weaponItemId(op.equipment.weapon);
  if (oldWid && op.equipment.weapon !== "pm") {
    const old = makeItem(oldWid, uid);
    if (old) {
      if (op.equipment.attachments.length) old.installed = [...op.equipment.attachments];
      back.push(old);
    }
  }
  const installed = [...(item.installed ?? [])].slice(0, weaponSlots(item.ref));
  const nextOp: PersistentOperator = {
    ...op,
    equipment: { weapon: item.ref, attachments: installed, armor: op.equipment.armor },
  };
  nextStash = [...nextStash, ...back];
  return {
    ok: true,
    stash: nextStash,
    operator: nextOp,
    message: `${item.name} assigned to ${op.name}.`,
  };
}

export function equipArmorOnOperator(
  op: PersistentOperator,
  stash: readonly Item[],
  uid: number,
  itemUid: number,
): EquipOperatorResult {
  const item = stash.find((i) => i.uid === itemUid);
  if (!item || item.kind !== "armor" || !item.ref) return { ok: false, reason: "Not armor." };
  let nextStash = stash.filter((i) => i.uid !== itemUid);
  const back: Item[] = [];
  if (op.equipment.armor) {
    const oldId = armorItemId(op.equipment.armor);
    const old = oldId ? makeItem(oldId, uid) : null;
    if (old) back.push(old);
  }
  const nextOp: PersistentOperator = {
    ...op,
    equipment: { ...op.equipment, armor: item.ref },
  };
  nextStash = [...nextStash, ...back];
  return { ok: true, stash: nextStash, operator: nextOp, message: `${item.name} fitted to ${op.name}.` };
}

export function equipAttachmentOnOperator(
  op: PersistentOperator,
  stash: readonly Item[],
  uid: number,
  itemUid: number,
): EquipOperatorResult {
  const item = stash.find((i) => i.uid === itemUid);
  if (!item || item.kind !== "attachment" || !item.ref || !ATTACHMENTS[item.ref])
    return { ok: false, reason: "Not an attachment." };
  const slots = weaponSlots(op.equipment.weapon);
  if (op.equipment.attachments.length >= slots)
    return { ok: false, reason: "No free mod slots on that gun." };
  if (op.equipment.attachments.includes(item.ref))
    return { ok: false, reason: "That mod is already fitted." };
  const nextStash = stash.filter((i) => i.uid !== itemUid);
  const nextOp: PersistentOperator = {
    ...op,
    equipment: { ...op.equipment, attachments: [...op.equipment.attachments, item.ref] },
  };
  return { ok: true, stash: nextStash, operator: nextOp, message: `${item.name} installed on ${op.name}.` };
}

export function unequipOperatorSlot(
  op: PersistentOperator,
  stash: readonly Item[],
  uid: number,
  slot: "weapon" | "armor" | number,
): EquipOperatorResult {
  const back: Item[] = [];
  const eq = { ...op.equipment };
  if (slot === "weapon") {
    if (eq.weapon === "pm") return { ok: false, reason: "They keep a sidearm as a fallback." };
    const wid = weaponItemId(eq.weapon);
    const gun = wid ? makeItem(wid, uid) : null;
    if (gun) {
      if (eq.attachments.length) gun.installed = [...eq.attachments];
      back.push(gun);
    }
    eq.weapon = "pm";
    eq.attachments = [];
  } else if (slot === "armor") {
    if (!eq.armor) return { ok: false, reason: "No armor fitted." };
    const aid = armorItemId(eq.armor);
    const ar = aid ? makeItem(aid, uid) : null;
    if (ar) back.push(ar);
    eq.armor = null;
  } else {
    const att = eq.attachments[slot];
    if (!att) return { ok: false, reason: "Empty mod slot." };
    const aid = attachItemId(att);
    const item = aid ? makeItem(aid, uid) : null;
    if (item) back.push(item);
    eq.attachments = eq.attachments.filter((_, i) => i !== slot);
  }
  return {
    ok: true,
    stash: [...stash, ...back],
    operator: { ...op, equipment: eq },
    message: "Gear returned to stash.",
  };
}

export function applyOperatorEquipToMeta(
  meta: Meta,
  operatorId: string,
  result: Extract<EquipOperatorResult, { ok: true }>,
  stashCap: number,
): EquipOperatorResult | { ok: false; reason: string } {
  if (result.stash.length > stashCap) return { ok: false, reason: "Stash is full." };
  const idx = meta.crew.operators.findIndex((o) => o.id === operatorId);
  if (idx < 0) return { ok: false, reason: "Operator not found." };
  meta.crew.operators[idx] = result.operator;
  meta.stash = stashEntriesFromItems(result.stash);
  return result;
}

export function emptyEquipment(): OperatorEquipment {
  return { weapon: "toz", attachments: [], armor: null };
}
