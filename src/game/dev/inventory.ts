import { ITEMS, makeItem, type Item, type ItemDef, type ItemKind } from "../gear";

/** Shop-only pack upgrades never occupy raid backpack slots. */
const RAID_BACKPACK_KINDS: readonly ItemKind[] = ["weapon", "attachment", "armor", "meds", "throwable", "valuable"];

export type DevPickerCategory = "ALL" | "WEAPONS" | "ARMOR" | "ATTACHMENTS" | "LOOT";

const CATEGORY_KINDS: Record<DevPickerCategory, readonly ItemKind[] | null> = {
  ALL: null,
  WEAPONS: ["weapon"],
  ARMOR: ["armor"],
  ATTACHMENTS: ["attachment"],
  LOOT: ["valuable", "meds", "throwable"],
};

export const DEV_PICKER_CATEGORIES: readonly DevPickerCategory[] = [
  "ALL",
  "WEAPONS",
  "ARMOR",
  "ATTACHMENTS",
  "LOOT",
];

export function isRaidBackpackItemDef(def: ItemDef): boolean {
  return RAID_BACKPACK_KINDS.includes(def.kind);
}

/** Canonical raid-backpack catalog. Same ITEMS list as loot/shop, minus shop-only packs. */
export function raidBackpackItemDefs(): ItemDef[] {
  return ITEMS.filter(isRaidBackpackItemDef);
}

export function filterDevPickerItems(
  defs: readonly ItemDef[],
  category: DevPickerCategory,
  query: string,
): ItemDef[] {
  const kinds = CATEGORY_KINDS[category];
  const q = query.trim().toLowerCase();
  return defs.filter((d) => {
    if (kinds && !kinds.includes(d.kind)) return false;
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q) ||
      d.kind.toLowerCase().includes(q) ||
      (d.ref ?? "").toLowerCase().includes(q)
    );
  });
}

export type DevAddResult =
  | { ok: true; item: Item; backpack: Item[] }
  | { ok: false; reason: "BACKPACK FULL" | "UNKNOWN ITEM" | "DEV TOOLS DISABLED" };

export function devAddToBackpack(
  defId: string,
  backpack: readonly Item[],
  capacity: number,
  uid: number,
  enabled: boolean,
): DevAddResult {
  if (!enabled) return { ok: false, reason: "DEV TOOLS DISABLED" };
  if (backpack.length >= capacity) return { ok: false, reason: "BACKPACK FULL" };
  const item = makeItem(defId, uid);
  if (!item || !isRaidBackpackItemDef(item)) return { ok: false, reason: "UNKNOWN ITEM" };
  return { ok: true, item, backpack: [...backpack, item] };
}

export type DevClearResult =
  | { ok: true; backpack: Item[] }
  | { ok: false; reason: "DEV TOOLS DISABLED" };

/** Empties loose raid-backpack contents only. Equipped kit is not passed in. */
export function clearRaidBackpack(backpack: readonly Item[], enabled: boolean): DevClearResult {
  if (!enabled) return { ok: false, reason: "DEV TOOLS DISABLED" };
  return { ok: true, backpack: [] };
}
