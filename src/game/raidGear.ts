import {
  ARMORS,
  ATTACHMENTS,
  ITEMS,
  WEAPONS,
  makeItem,
  type Item,
} from "./gear";
import { clampAmmo } from "./weapons";
import {
  canInstallAttachmentOnWeapon,
  detachAttachmentFromMounts,
  getEffectiveMagazineCapacity,
  installAttachmentInMounts,
  MOUNT_LABEL,
  normalizeInstalledAttachments,
  slotOf,
  type AttachMount,
  weaponMounts,
} from "./weaponAttachments";
import { attachmentDef, weaponDef } from "./weapons";

export type { AttachMount };
export { MOUNT_LABEL as SLOT_LABEL, slotOf };

export const ATTACH_SLOT: Record<string, AttachMount> = {
  red_dot: "optic",
  optic_2x: "optic",
  optic: "optic",
  marksman_scope: "optic",
  thermal: "optic",
  light_comp: "muzzle",
  brake: "muzzle",
  tight_choke: "muzzle",
  wide_choke: "muzzle",
  supp: "muzzle",
  ar_drum: "magazine",
  ak_drum: "magazine",
  pistol_ext: "magazine",
  pistol_drum: "magazine",
  stanag_ext: "magazine",
  quick_mag: "magazine",
  dvl_ext: "magazine",
  mag: "magazine",
  grip: "underbarrel",
  angled_grip: "underbarrel",
  heavy_grip: "underbarrel",
  laser: "underbarrel",
  m995: "underbarrel",
};

export function weaponItemId(weaponId: string): string | null {
  return ITEMS.find((i) => i.kind === "weapon" && i.ref === weaponId)?.id ?? null;
}

export function attachItemId(attachId: string): string | null {
  return ITEMS.find((i) => i.kind === "attachment" && i.ref === attachId)?.id ?? null;
}

export function armorItemId(armorId: string): string | null {
  return ITEMS.find((i) => i.kind === "armor" && i.ref === armorId)?.id ?? null;
}

export function packWeaponItem(weaponId: string, attachments: readonly string[], uid: number): Item | null {
  const id = weaponItemId(weaponId);
  if (!id) return null;
  const item = makeItem(id, uid);
  if (!item) return null;
  item.installed = normalizeInstalledAttachments(weaponId, attachments);
  return item;
}

export function equippedMagSize(weaponId: string, attachments: readonly string[]): number {
  return getEffectiveMagazineCapacity(weaponId, attachments);
}

export function canEquipAttachment(attachId: string, weaponId?: string): boolean {
  if (!ATTACHMENTS[attachId] || slotOf(attachId) == null) return false;
  if (!weaponId) return true;
  return canInstallAttachmentOnWeapon(weaponId, attachId).ok;
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
  armor?: string | null;
  armorHp?: number;
};
export type RaidEquipErr = { ok: false; reason: string };
export type RaidEquipResult = RaidEquipOk | RaidEquipErr;

export function detachAttachment(
  attachId: string,
  attachments: readonly string[],
  backpack: readonly Item[],
  capacity: number,
  uid: number,
  ammo: number,
  weaponId: string,
): RaidEquipResult {
  const detached = detachAttachmentFromMounts(attachments, attachId);
  if (!detached.ok) return detached;
  if (backpack.length >= capacity) return { ok: false, reason: "BACKPACK FULL" };
  const aid = attachItemId(attachId);
  if (!aid) return { ok: false, reason: "Unknown attachment." };
  const item = makeItem(aid, uid);
  if (!item) return { ok: false, reason: "Unknown attachment." };
  const next = detached.attachments;
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
  _slots: number,
  ammo: number,
  weaponId: string,
): RaidEquipResult {
  if (item.kind !== "attachment" || !item.ref) return { ok: false, reason: "Not an attachment." };
  if (!canEquipAttachment(item.ref, weaponId)) {
    const check = canInstallAttachmentOnWeapon(weaponId, item.ref);
    return { ok: false, reason: check.ok ? "Incompatible attachment." : check.reason };
  }

  const install = installAttachmentInMounts(weaponId, attachments, item.ref);
  if (!install.ok) return install;

  const idx = backpack.findIndex((i) => i.uid === item.uid);
  if (idx < 0) return { ok: false, reason: "Item is not in the raid backpack." };

  let nextPack = backpack.filter((it) => it.uid !== item.uid);
  if (install.replaced) {
    const oldAid = attachItemId(install.replaced);
    const oldItem = oldAid ? makeItem(oldAid, item.uid) : null;
    if (!oldItem) return { ok: false, reason: "Unknown attachment." };
    nextPack = backpack.map((it, i) => (i === idx ? { ...oldItem, uid: item.uid } : it));
  }

  return {
    ok: true,
    attachments: install.attachments,
    backpack: nextPack,
    ammo: clampAmmo(ammo, equippedMagSize(weaponId, install.attachments)),
    weapon: weaponId,
    message: install.message,
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
  const installed = normalizeInstalledAttachments(
    incoming.ref,
    [...(incoming.installed ?? [])],
  );
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

export function dropEquippedGear(
  weaponId: string,
  attachments: readonly string[],
  nextUid: () => number,
  armorId?: string | null,
): Item[] {
  const items: Item[] = [];
  const wid = weaponItemId(weaponId);
  if (wid) {
    const gun = makeItem(wid, nextUid());
    if (gun) items.push(gun);
  }
  for (const a of attachments) {
    const aid = attachItemId(a);
    if (!aid) continue;
    const item = makeItem(aid, nextUid());
    if (item) items.push(item);
  }
  if (armorId) {
    const aid = armorItemId(armorId);
    if (aid) {
      const item = makeItem(aid, nextUid());
      if (item) items.push(item);
    }
  }
  return items;
}

export function equipArmor(
  item: Item,
  currentArmor: string | null | undefined,
  backpack: readonly Item[],
): RaidEquipResult {
  if (item.kind !== "armor" || !item.ref) return { ok: false, reason: "Not armor." };
  const def = ARMORS[item.ref];
  if (!def) return { ok: false, reason: "Incompatible armor." };
  const idx = backpack.findIndex((i) => i.uid === item.uid);
  if (idx < 0) return { ok: false, reason: "Item is not in the raid backpack." };
  if (currentArmor) {
    const oldAid = armorItemId(currentArmor);
    const oldItem = oldAid ? makeItem(oldAid, item.uid) : null;
    if (!oldItem) return { ok: false, reason: "Unknown armor." };
    const nextPack = backpack.map((it, i) => (i === idx ? { ...oldItem, uid: item.uid } : it));
    return {
      ok: true,
      attachments: [],
      backpack: nextPack,
      ammo: 0,
      weapon: "",
      armor: item.ref,
      armorHp: def.durability,
      message: `${item.name} swapped in.`,
    };
  }
  const nextPack = backpack.filter((it) => it.uid !== item.uid);
  return {
    ok: true,
    attachments: [],
    backpack: nextPack,
    ammo: 0,
    weapon: "",
    armor: item.ref,
    armorHp: def.durability,
    message: `${item.name} strapped on — ${Math.round(def.reduction * 100)}% incoming absorbed.`,
  };
}

export function detachArmor(
  currentArmor: string | null | undefined,
  backpack: readonly Item[],
  capacity: number,
  uid: number,
): RaidEquipResult {
  if (!currentArmor) return { ok: false, reason: "Nothing to detach." };
  if (backpack.length >= capacity) return { ok: false, reason: "BACKPACK FULL" };
  const aid = armorItemId(currentArmor);
  if (!aid) return { ok: false, reason: "Unknown armor." };
  const item = makeItem(aid, uid);
  if (!item) return { ok: false, reason: "Unknown armor." };
  return {
    ok: true,
    attachments: [],
    backpack: [...backpack, item],
    ammo: 0,
    weapon: "",
    armor: null,
    armorHp: 0,
    message: `${item.name} detached.`,
  };
}

export function weaponAttachmentCapacity(weaponId: string): number {
  return weaponMounts(weaponDef(weaponId)).length;
}
