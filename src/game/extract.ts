/**
 * Extraction haul settlement — backpack loot + hired-operator recoveries only.
 * Persistent operator kit (PMC / recruited crew) is retained via writeback, not stash deposit.
 */

import type { Item } from "./gear";
import { makeItem } from "./gear";
import { armorItemId, attachItemId, weaponItemId } from "./raidGear";

export function settleHaul(
  stash: Item[],
  haul: Item[],
  sellValuableUids: ReadonlySet<number>,
  stashSlots: number,
  leaveUids: ReadonlySet<number> = new Set(),
  valueOf: (item: Item) => number = (item) => item.value,
): { ok: true; next: Item[]; soldValue: number } | { ok: false; keptCount: number; room: number } {
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

/** Tower fields needed to decide extract recovery vs retained kit. */
export type ExtractKitTower = {
  pmc?: boolean;
  operatorId?: string | null;
  weapon: string;
  attachments: readonly string[];
  armor?: string | null;
};

/**
 * Persistent kit owners keep equipment across successful extract via meta writeback.
 * Their worn gear must NOT be minted into the extract haul (would duplicate into stash).
 */
export function isPersistentKitOwner(t: { pmc?: boolean; operatorId?: string | null }): boolean {
  return !!t.pmc || (t.operatorId != null && t.operatorId !== "");
}

/**
 * Build stash-bound recovered gear from surviving towers.
 *
 * - PMC / recruited crew → skip (retained equipment, not loot)
 * - Mid-raid hired (no persistent owner) → flatten kit into haul (toz stock gun skipped)
 *
 * Backpack items are separate and always part of the haul.
 */
export function recoveredLootFromSurvivingTowers(
  towers: readonly ExtractKitTower[],
  nextUid: () => number,
): Item[] {
  const carried: Item[] = [];
  for (const t of towers) {
    if (isPersistentKitOwner(t)) continue;
    const wid = weaponItemId(t.weapon);
    if (wid && t.weapon !== "toz") {
      const gun = makeItem(wid, nextUid());
      if (gun) carried.push(gun);
    }
    for (const a of t.attachments) {
      const aid = attachItemId(a);
      if (!aid) continue;
      const item = makeItem(aid, nextUid());
      if (item) carried.push(item);
    }
    if (t.armor) {
      const aid = armorItemId(t.armor);
      if (!aid) continue;
      const item = makeItem(aid, nextUid());
      if (item) carried.push(item);
    }
  }
  return carried;
}

/** Canonical extract haul = backpack loot + recovered hired-kit only. */
export function buildExtractHaul(backpack: readonly Item[], recovered: readonly Item[]): Item[] {
  return [...backpack, ...recovered];
}
