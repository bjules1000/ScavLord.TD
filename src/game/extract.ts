import type { Item } from "./gear";

export function settleHaul(
  stash: Item[],
  haul: Item[],
  sellValuableUids: ReadonlySet<number>,
  stashSlots: number,
  leaveUids: ReadonlySet<number> = new Set(),
  valueOf: (item: Item) => number = (item) => item.value,
):
  | { ok: true; next: Item[]; soldValue: number }
  | { ok: false; keptCount: number; room: number } {
  const kept = haul.filter(
    (i) => !leaveUids.has(i.uid) && (i.kind !== "valuable" || !sellValuableUids.has(i.uid)),
  );
  const soldValue = haul
    .filter((i) => i.kind === "valuable" && sellValuableUids.has(i.uid) && !leaveUids.has(i.uid))
    .reduce((a, i) => a + valueOf(i), 0);
  const room = Math.max(0, stashSlots - stash.length);
  if (kept.length > room) return { ok: false, keptCount: kept.length, room };
  return { ok: true, next: [...stash, ...kept], soldValue };
}
