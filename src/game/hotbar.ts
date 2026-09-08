import { ITEMS, type Item } from "./gear";
import { GRENADE_DEFS, GRENADE_ORDER, grenadeDef, type GrenadeKind } from "./grenades";

export type HotbarSlot = { kind: "meds"; medId: string } | { kind: "grenade"; grenade: GrenadeKind } | null;

export const HOTBAR_SIZE = 8;

/** Declaration order in gear.ts's ITEMS — low-to-high heal amount, a sensible default. */
const MED_ORDER: readonly string[] = ITEMS.filter((i) => i.kind === "meds").map((i) => i.id);

export function emptyHotbar(): HotbarSlot[] {
  return Array.from({ length: HOTBAR_SIZE }, () => null);
}

/** Fills in canonical order (grenades, then meds) from whatever's actually carried. Never reshuffles later. */
export function autoPopulateHotbar(backpack: readonly Pick<Item, "id">[]): HotbarSlot[] {
  const carried = new Set(backpack.map((i) => i.id));
  const slots: HotbarSlot[] = [];
  for (const grenade of GRENADE_ORDER) {
    if (carried.has(GRENADE_DEFS[grenade].itemId)) slots.push({ kind: "grenade", grenade });
  }
  for (const medId of MED_ORDER) {
    if (carried.has(medId)) slots.push({ kind: "meds", medId });
  }
  return [...slots.slice(0, HOTBAR_SIZE), ...emptyHotbar()].slice(0, HOTBAR_SIZE);
}

/** The hotbar slot a backpack item would bind to, if any (weapons/attachments/armor/valuables don't belong on it). */
export function hotbarSlotFromItem(item: Pick<Item, "id" | "kind">): HotbarSlot {
  if (item.kind === "meds") return { kind: "meds", medId: item.id };
  if (item.kind === "throwable") {
    const grenade = GRENADE_ORDER.find((k) => GRENADE_DEFS[k].itemId === item.id);
    return grenade ? { kind: "grenade", grenade } : null;
  }
  return null;
}

/** Item id a slot resolves to, for counting how many are left in the backpack. */
export function hotbarSlotItemId(slot: HotbarSlot): string | null {
  if (!slot) return null;
  return slot.kind === "meds" ? slot.medId : GRENADE_DEFS[slot.grenade].itemId;
}

/** Binding the same item to a second slot moves it there rather than duplicating the key. */
export function bindHotbarSlot(hotbar: readonly HotbarSlot[], index: number, slot: HotbarSlot): HotbarSlot[] {
  if (index < 0 || index >= hotbar.length) return [...hotbar];
  const itemId = hotbarSlotItemId(slot);
  const next = hotbar.map((existing, i) =>
    i !== index && itemId != null && hotbarSlotItemId(existing) === itemId ? null : existing,
  );
  next[index] = slot;
  return next;
}

export function clearHotbarSlot(hotbar: readonly HotbarSlot[], index: number): HotbarSlot[] {
  return bindHotbarSlot(hotbar, index, null);
}

export function hotbarSlotCount(slot: HotbarSlot, backpack: readonly Pick<Item, "id">[]): number {
  const itemId = hotbarSlotItemId(slot);
  if (!itemId) return 0;
  return backpack.filter((i) => i.id === itemId).length;
}

export function hotbarSlotLabel(slot: HotbarSlot): string {
  if (!slot) return "";
  if (slot.kind === "grenade") return grenadeDef(slot.grenade).label;
  return ITEMS.find((i) => i.id === slot.medId)?.name ?? slot.medId;
}
