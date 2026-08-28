import {
  ATTACHMENTS,
  ITEMS,
  WEAPONS,
  applyAttachmentMods,
  makeItem,
  type Item,
} from "./gear";
import { clampAmmo, weaponDef } from "./weapons";

export type AttachSlot = "optic" | "barrel" | "magazine" | "mod";

export const ATTACH_SLOT: Record<string, AttachSlot> = {
  optic: "optic",
  thermal: "optic",
  brake: "barrel",
  supp: "barrel",
  mag: "magazine",
  grip: "mod",
  laser: "mod",
  m995: "mod",
};

export const SLOT_LABEL: Record<AttachSlot, string> = {
  optic: "OPTIC",
  barrel: "BARREL",
  magazine: "MAGAZINE",
  mod: "MOD",
};

export function slotOf(attachId: string): AttachSlot | null {
  return ATTACH_SLOT[attachId] ?? null;
}

export function weaponItemId(weaponId: string): string | null {
  return ITEMS.find((i) => i.kind === "weapon" && i.ref === weaponId)?.id ?? null;
}

export function attachItemId(attachId: string): string | null {
  return ITEMS.find((i) => i.kind === "attachment" && i.ref === attachId)?.id ?? null;
}

export function packWeaponItem(weaponId: string, attachments: readonly string[], uid: number): Item | null {
  const id = weaponItemId(weaponId);
  if (!id) return null;
  const item = makeItem(id, uid);
  if (!item) return null;
  item.installed = [...attachments];
  return item;
}

export function equippedMagSize(weaponId: string, attachments: readonly string[]): number {
  return applyAttachmentMods(weaponDef(weaponId), attachments).magSize;
}

export function canEquipAttachment(attachId: string): boolean {
  return !!ATTACHMENTS[attachId] && slotOf(attachId) != null;
}

/** Unpack a packed raid weapon so extract/stash (defId-only) cannot lose installed mods. */
export function expandPackedWeapon(item: Item, nextUid: () => number): Item[] {
  const installed = item.kind === "weapon" ? item.installed ?? [] : [];
  const gun: Item = { ...item };
  delete gun.installed;
  if (!installed.length) return [gun];
  const extras: Item[] = [];
  for (const a of installed) {
    const aid = attachItemId(a);
    if (!aid) continue;
    const att = makeItem(aid, nextUid());
    if (att) extras.push(att);
  }
  return [gun, ...extras];
}

export type RaidEquipOk = {
  ok: true;
  attachments: string[];
  backpack: Item[];
  ammo: number;
  weapon: string;
  message: string;
};
export type RaidEquipErr = { ok: false; reason: string };
export type RaidEquipResult = RaidEquipOk | RaidEquipErr;

function fittedInSlot(attachments: readonly string[], slot: AttachSlot): number {
  return attachments.findIndex((id) => slotOf(id) === slot);
}

export function detachAttachment(
  attachId: string,
  attachments: readonly string[],
  backpack: readonly Item[],
  capacity: number,
  uid: number,
  ammo: number,
  weaponId: string,
): RaidEquipResult {
  if (!attachments.includes(attachId)) return { ok: false, reason: "Nothing to detach." };
  if (backpack.length >= capacity) return { ok: false, reason: "BACKPACK FULL" };
  const aid = attachItemId(attachId);
  if (!aid) return { ok: false, reason: "Unknown attachment." };
  const item = makeItem(aid, uid);
  if (!item) return { ok: false, reason: "Unknown attachment." };
  const next = attachments.filter((id) => id !== attachId);
  return {
    ok: true,
    attachments: next,
    backpack: [...backpack, item],
    ammo: clampAmmo(ammo, equippedMagSize(weaponId, next)),
    weapon: weaponId,
    message: `${item.name} detached.`,
  };
}

export function equipAttachment(
  item: Item,
  attachments: readonly string[],
  backpack: readonly Item[],
  slots: number,
  ammo: number,
  weaponId: string,
): RaidEquipResult {
  if (item.kind !== "attachment" || !item.ref) return { ok: false, reason: "Not an attachment." };
  if (!canEquipAttachment(item.ref)) return { ok: false, reason: "Incompatible attachment." };
  if (attachments.includes(item.ref)) return { ok: false, reason: "Already installed." };
  const slot = slotOf(item.ref)!;
  const idx = backpack.findIndex((i) => i.uid === item.uid);
  if (idx < 0) return { ok: false, reason: "Item is not in the raid backpack." };
  const occupied = slot === "mod" ? -1 : fittedInSlot(attachments, slot);
  if (occupied >= 0) {
    const oldId = attachments[occupied]!;
    const oldAid = attachItemId(oldId);
    const oldItem = oldAid ? makeItem(oldAid, item.uid) : null;
    if (!oldItem) return { ok: false, reason: "Unknown attachment." };
    const next = [...attachments];
    next[occupied] = item.ref;
    const nextPack = backpack.map((it, i) => (i === idx ? { ...oldItem, uid: item.uid } : it));
    return {
      ok: true,
      attachments: next,
      backpack: nextPack,
      ammo: clampAmmo(ammo, equippedMagSize(weaponId, next)),
      weapon: weaponId,
      message: `${item.name} swapped in.`,
    };
  }
  if (attachments.length >= slots) {
    return { ok: false, reason: `${weaponDef(weaponId).name} has no free slots (${slots}).` };
  }
  const next = [...attachments, item.ref];
  const nextPack = backpack.filter((it) => it.uid !== item.uid);
  return {
    ok: true,
    attachments: next,
    backpack: nextPack,
    ammo: clampAmmo(ammo, equippedMagSize(weaponId, next)),
    weapon: weaponId,
    message: `${item.name} installed.`,
  };
}

export function swapRaidWeapon(
  incoming: Item,
  currentWeapon: string,
  currentAttachments: readonly string[],
  backpack: readonly Item[],
  ammo: number,
): RaidEquipResult {
  if (incoming.kind !== "weapon" || !incoming.ref) return { ok: false, reason: "Not a weapon." };
  if (!WEAPONS[incoming.ref]) return { ok: false, reason: "Unknown weapon." };
  const idx = backpack.findIndex((i) => i.uid === incoming.uid);
  if (idx < 0) return { ok: false, reason: "Item is not in the raid backpack." };
  const packed = packWeaponItem(currentWeapon, currentAttachments, incoming.uid);
  if (!packed) return { ok: false, reason: "Unknown weapon." };
  const installed = [...(incoming.installed ?? [])].slice(0, weaponDef(incoming.ref).slots);
  const nextPack = backpack.map((it, i) => (i === idx ? packed : it));
  return {
    ok: true,
    weapon: incoming.ref,
    attachments: installed,
    backpack: nextPack,
    ammo: clampAmmo(ammo, equippedMagSize(incoming.ref, installed)),
    message: `Operator now running the ${incoming.name}.`,
  };
}

export function dropEquippedGear(weaponId: string, attachments: readonly string[], uidStart: number): Item[] {
  const items: Item[] = [];
  let uid = uidStart;
  const wid = weaponItemId(weaponId);
  if (wid) {
    const gun = makeItem(wid, uid++);
    if (gun) items.push(gun);
  }
  for (const a of attachments) {
    const aid = attachItemId(a);
    if (!aid) continue;
    const item = makeItem(aid, uid++);
    if (item) items.push(item);
  }
  return items;
}
