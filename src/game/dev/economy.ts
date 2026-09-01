/**
 * DEV Economy Lab override layer.
 *
 * canonical economy data + optional DEV override = effective test definition.
 * Applied overrides never mutate ITEMS, loot rule constants, or map defs.
 */

import { ITEMS, ITEM_BY_ID, type Item, type ItemDef, type ItemKind } from "../gear";
import {
  CANONICAL_ITEM_WEIGHT,
  CANONICAL_LOOT_RULES,
  crateExpectedValue,
  firstSlotChance,
  generateChoices,
  generateCrate,
  isLootableKind,
  lootableItems,
  type LootRules,
  type LootRuntime,
  type LootWeights,
  poolShare,
  rewardExpectedValue,
  type LootEvResult,
} from "../loot";
import { MAP_DEFS, type MapDef } from "../map";
import { DEV_TOOLS_ENABLED } from "./tools";

export const ECONOMY_STORAGE_KEY = "scavlord.dev.economyLab.v1";

export type EconomyItemOverride = {
  value?: number;
  price?: number;
};

export type EconomyOverrides = {
  items: Record<string, EconomyItemOverride>;
  weights: Record<string, number>;
  rules: Partial<LootRules>;
  maps: Record<string, { lootMult?: number }>;
};

export type EconomyCategory = "ALL" | "WEAPONS" | "ARMOR" | "ATTACHMENTS" | "LOOT";

export type EconomyLabView = "items" | "tables";

export type EconomyItemEntry = {
  id: string;
  name: string;
  kind: ItemKind;
};

export type EconomyFieldKey = "value" | "price";

export type EconomyField = {
  key: EconomyFieldKey;
  label: string;
  step: number;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type SetWeightResult =
  | { ok: true; overrides: EconomyOverrides }
  | { ok: false; reason: "NEGATIVE_WEIGHT" | "UNKNOWN_ITEM" | "NOT_LOOTABLE" };

export type SetNumberResult =
  | { ok: true; overrides: EconomyOverrides }
  | { ok: false; reason: "NEGATIVE" | "UNKNOWN_ITEM" | "FIELD_ABSENT" };

/** Future source kinds Economy Lab can grow into without a rebuild. */
export type LootSourceType = "crate" | "reward" | "map" | "shop" | "enemy" | "boss" | "quest";

export type LootSourceFilter = "ALL" | "MAP" | "CRATE" | "REWARD";

export type LootSource = {
  id: string;
  type: LootSourceType;
  label: string;
  implemented: boolean;
  /** Maps this source appears on. Empty = not map-bound (shop) or shared. */
  mapIds: string[];
  shared: boolean;
};

export type ItemSourceRow = {
  sourceId: string;
  type: LootSourceType;
  label: string;
  shared: boolean;
  mapIds: string[];
  mapNames: string[];
  weight: number;
  poolShare: number;
  firstSlotChance: number;
  implemented: boolean;
};

export const FUTURE_SOURCE_TYPES: readonly LootSourceType[] = ["enemy", "boss", "quest"];
/** Economy Lab drop ids for later: enemy:<kind> / boss:<kind> / quest:<questId>. */

export const ECONOMY_CATEGORIES: readonly EconomyCategory[] = ["ALL", "WEAPONS", "ARMOR", "ATTACHMENTS", "LOOT"];

const CATEGORY_KINDS: Record<EconomyCategory, readonly ItemKind[] | null> = {
  ALL: null,
  WEAPONS: ["weapon"],
  ARMOR: ["armor"],
  ATTACHMENTS: ["attachment"],
  LOOT: ["valuable", "meds"],
};

export const DEFAULT_DIAGNOSTIC_WAVE = 1;

export function emptyEconomyOverrides(): EconomyOverrides {
  return { items: {}, weights: {}, rules: {}, maps: {} };
}

function cloneOverrides(src: EconomyOverrides): EconomyOverrides {
  return {
    items: { ...Object.fromEntries(Object.entries(src.items).map(([k, v]) => [k, { ...v }])) },
    weights: { ...src.weights },
    rules: { ...src.rules },
    maps: { ...Object.fromEntries(Object.entries(src.maps).map(([k, v]) => [k, { ...v }])) },
  };
}

function pruneEmpty<T extends Record<string, unknown>>(rec: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, fields] of Object.entries(rec)) {
    if (Object.keys(fields).length > 0) out[id] = fields;
  }
  return out;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

export function pruneEconomyOverrides(src: EconomyOverrides): EconomyOverrides {
  const rules: Partial<LootRules> = {};
  for (const [key, value] of Object.entries(src.rules) as Array<[keyof LootRules, number | undefined]>) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (nearlyEqual(value, CANONICAL_LOOT_RULES[key])) continue;
    rules[key] = value;
  }
  const weights: Record<string, number> = {};
  for (const [id, w] of Object.entries(src.weights)) {
    if (typeof w !== "number" || !Number.isFinite(w)) continue;
    if (nearlyEqual(w, CANONICAL_ITEM_WEIGHT)) continue;
    weights[id] = w;
  }
  return {
    items: pruneEmpty(src.items),
    weights,
    rules,
    maps: pruneEmpty(src.maps),
  };
}

export function economyLabCatalog(): EconomyItemEntry[] {
  return ITEMS.map((i) => ({ id: i.id, name: i.name, kind: i.kind }));
}

export function filterEconomyCatalog(
  entries: readonly EconomyItemEntry[],
  category: EconomyCategory,
  query: string,
): EconomyItemEntry[] {
  const kinds = CATEGORY_KINDS[category];
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (kinds && !kinds.includes(e.kind)) return false;
    if (!q) return true;
    return e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.kind.includes(q);
  });
}

export function canonicalItem(id: string): ItemDef | undefined {
  return ITEM_BY_ID[id];
}

export function itemEconomyFields(def: ItemDef): EconomyField[] {
  const fields: EconomyField[] = [{ key: "value", label: "Item value (sell/stash)", step: 10 }];
  if (def.price != null) fields.push({ key: "price", label: "Shop price", step: 10 });
  return fields;
}

export function effectiveItemDef(
  id: string,
  overrides: EconomyOverrides = getEconomyOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): ItemDef | undefined {
  const base = ITEM_BY_ID[id];
  if (!base) return undefined;
  if (!enabled) return base;
  const over = overrides.items[id];
  if (!over) return base;
  const next = { ...base };
  if (typeof over.value === "number") next.value = over.value;
  if (typeof over.price === "number") next.price = over.price;
  return next;
}

export function effectiveItemCatalog(
  overrides: EconomyOverrides = getEconomyOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): ItemDef[] {
  return ITEMS.map((i) => effectiveItemDef(i.id, overrides, enabled) ?? i);
}

export function effectiveItemValue(
  id: string,
  overrides: EconomyOverrides = getEconomyOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): number | undefined {
  return effectiveItemDef(id, overrides, enabled)?.value;
}

export function saleValueOf(
  item: Item,
  overrides: EconomyOverrides = getEconomyOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): number {
  const live = effectiveItemValue(item.id, overrides, enabled);
  return live ?? item.value;
}

export function effectiveLootRules(
  overrides: EconomyOverrides = getEconomyOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): LootRules {
  if (!enabled) return CANONICAL_LOOT_RULES;
  return { ...CANONICAL_LOOT_RULES, ...overrides.rules };
}

export function effectiveWeights(
  overrides: EconomyOverrides = getEconomyOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): LootWeights {
  if (!enabled) return {};
  return overrides.weights;
}

export function effectiveLootMult(
  map: MapDef,
  overrides: EconomyOverrides = getEconomyOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): number {
  if (!enabled) return map.lootMult;
  const over = overrides.maps[map.id]?.lootMult;
  return typeof over === "number" ? over : map.lootMult;
}

export function lootRuntime(
  overrides: EconomyOverrides = getEconomyOverrides(),
  enabled = DEV_TOOLS_ENABLED,
  rng?: () => number,
): LootRuntime | undefined {
  if (!enabled) return undefined;
  const runtime: LootRuntime = {
    catalog: effectiveItemCatalog(overrides, true),
    rules: effectiveLootRules(overrides, true),
    weights: effectiveWeights(overrides, true),
  };
  if (rng) runtime.rng = rng;
  return runtime;
}

export function setItemEconomyField(
  src: EconomyOverrides,
  id: string,
  key: EconomyFieldKey,
  value: number | undefined,
  canonical: number | undefined,
): SetNumberResult {
  const def = ITEM_BY_ID[id];
  if (!def) return { ok: false, reason: "UNKNOWN_ITEM" };
  if (key === "price" && def.price == null) return { ok: false, reason: "FIELD_ABSENT" };
  if (value != null && (!Number.isFinite(value) || value < 0)) return { ok: false, reason: "NEGATIVE" };
  const next = cloneOverrides(src);
  const cur = { ...(next.items[id] ?? {}) };
  const same =
    value === undefined ||
    canonical === undefined ||
    nearlyEqual(value, canonical);
  if (same) delete cur[key];
  else cur[key] = value;
  if (Object.keys(cur).length === 0) delete next.items[id];
  else next.items[id] = cur;
  return { ok: true, overrides: pruneEconomyOverrides(next) };
}

export function setItemWeight(src: EconomyOverrides, id: string, weight: number): SetWeightResult {
  const def = ITEM_BY_ID[id];
  if (!def) return { ok: false, reason: "UNKNOWN_ITEM" };
  if (!isLootableKind(def.kind)) return { ok: false, reason: "NOT_LOOTABLE" };
  if (!Number.isFinite(weight) || weight < 0) return { ok: false, reason: "NEGATIVE_WEIGHT" };
  const next = cloneOverrides(src);
  if (nearlyEqual(weight, CANONICAL_ITEM_WEIGHT)) delete next.weights[id];
  else next.weights[id] = weight;
  return { ok: true, overrides: pruneEconomyOverrides(next) };
}

export function setLootRule(
  src: EconomyOverrides,
  key: keyof LootRules,
  value: number,
): { ok: true; overrides: EconomyOverrides } | { ok: false; reason: "NEGATIVE" } {
  if (!Number.isFinite(value) || value < 0) return { ok: false, reason: "NEGATIVE" };
  const next = cloneOverrides(src);
  if (nearlyEqual(value, CANONICAL_LOOT_RULES[key])) delete next.rules[key];
  else next.rules[key] = value;
  return { ok: true, overrides: pruneEconomyOverrides(next) };
}

export function setMapLootMult(
  src: EconomyOverrides,
  mapId: string,
  lootMult: number,
): { ok: true; overrides: EconomyOverrides } | { ok: false; reason: "NEGATIVE" | "UNKNOWN_MAP" } {
  const map = MAP_DEFS.find((m) => m.id === mapId);
  if (!map) return { ok: false, reason: "UNKNOWN_MAP" };
  if (!Number.isFinite(lootMult) || lootMult < 0) return { ok: false, reason: "NEGATIVE" };
  const next = cloneOverrides(src);
  const bag = { ...(next.maps[mapId] ?? {}) };
  if (nearlyEqual(lootMult, map.lootMult)) delete bag.lootMult;
  else bag.lootMult = lootMult;
  if (Object.keys(bag).length === 0) delete next.maps[mapId];
  else next.maps[mapId] = bag;
  return { ok: true, overrides: pruneEconomyOverrides(next) };
}

export function resetEconomyItem(src: EconomyOverrides, id: string): EconomyOverrides {
  const next = cloneOverrides(src);
  delete next.items[id];
  delete next.weights[id];
  return pruneEconomyOverrides(next);
}

export function resetEconomyTable(src: EconomyOverrides, sourceId: string): EconomyOverrides {
  const next = cloneOverrides(src);
  if (sourceId === "crate" || sourceId === "reward" || sourceId === "pool") {
    next.weights = {};
    next.rules = {};
    return pruneEconomyOverrides(next);
  }
  if (sourceId.startsWith("map:")) {
    delete next.maps[sourceId.slice(4)];
    return pruneEconomyOverrides(next);
  }
  return pruneEconomyOverrides(next);
}

export function modifiedEconomyCount(overrides: EconomyOverrides): number {
  const clean = pruneEconomyOverrides(overrides);
  return (
    Object.keys(clean.items).length +
    Object.keys(clean.weights).length +
    Object.keys(clean.rules).length +
    Object.keys(clean.maps).length
  );
}

export function itemOverrideCount(overrides: EconomyOverrides, id: string): number {
  const bag = overrides.items[id];
  let n = bag ? Object.keys(bag).length : 0;
  if (overrides.weights[id] != null) n += 1;
  return n;
}

export function economyOverridesEqual(a: EconomyOverrides, b: EconomyOverrides): boolean {
  return JSON.stringify(pruneEconomyOverrides(a)) === JSON.stringify(pruneEconomyOverrides(b));
}

export function lootSourceCatalog(): LootSource[] {
  const crateMaps = MAP_DEFS.filter((m) => m.crates.length > 0);
  const allMaps = MAP_DEFS;
  const sources: LootSource[] = [
    {
      id: "crate",
      type: "crate",
      label: "SUPPLY CRATE",
      implemented: true,
      mapIds: crateMaps.map((m) => m.id),
      shared: true,
    },
    {
      id: "reward",
      type: "reward",
      label: "WAVE REWARD",
      implemented: true,
      mapIds: allMaps.map((m) => m.id),
      shared: true,
    },
    {
      id: "shop",
      type: "shop",
      label: "HIDEOUT SHOP",
      implemented: true,
      mapIds: [],
      shared: true,
    },
    ...MAP_DEFS.map((m) => ({
      id: `map:${m.id}`,
      type: "map" as const,
      label: m.name,
      implemented: true,
      mapIds: [m.id],
      shared: false,
    })),
  ];
  return sources;
}

export function filterLootSources(
  sources: readonly LootSource[],
  filter: LootSourceFilter,
  query: string,
): LootSource[] {
  const q = query.trim().toLowerCase();
  return sources.filter((s) => {
    if (!s.implemented) return false;
    if (filter === "MAP" && s.type !== "map") return false;
    if (filter === "CRATE" && s.type !== "crate") return false;
    if (filter === "REWARD" && s.type !== "reward") return false;
    if (!q) return true;
    return (
      s.label.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.type.includes(q) ||
      s.mapIds.some((id) => {
        const map = MAP_DEFS.find((m) => m.id === id);
        return id.includes(q) || (map?.name.toLowerCase().includes(q) ?? false);
      })
    );
  });
}

export function mapName(id: string): string {
  return MAP_DEFS.find((m) => m.id === id)?.name ?? id;
}

export function sourceMapsLabel(source: LootSource): string {
  if (source.mapIds.length === 0) return "Not map-bound";
  if (source.shared) return `Shared · ${source.mapIds.map(mapName).join(", ")}`;
  return source.mapIds.map(mapName).join(", ");
}

function diagnosticLootMult(
  source: LootSource,
  overrides: EconomyOverrides,
  enabled: boolean,
): number {
  if (source.type === "map" && source.mapIds[0]) {
    const map = MAP_DEFS.find((m) => m.id === source.mapIds[0]);
    if (map) return effectiveLootMult(map, overrides, enabled);
  }
  return 1;
}

export function itemSourceRows(
  itemId: string,
  overrides: EconomyOverrides = emptyEconomyOverrides(),
  enabled = true,
  wave = DEFAULT_DIAGNOSTIC_WAVE,
): ItemSourceRow[] {
  const def = effectiveItemDef(itemId, overrides, enabled) ?? ITEM_BY_ID[itemId];
  if (!def) return [];
  const catalog = effectiveItemCatalog(overrides, enabled);
  const rules = effectiveLootRules(overrides, enabled);
  const weights = effectiveWeights(overrides, enabled);
  const sources = lootSourceCatalog();
  const rows: ItemSourceRow[] = [];

  if (isLootableKind(def.kind)) {
    for (const source of sources.filter((s) => s.type === "crate" || s.type === "reward")) {
      const lootMult = diagnosticLootMult(source, overrides, enabled);
      rows.push({
        sourceId: source.id,
        type: source.type,
        label: source.label,
        shared: source.shared,
        mapIds: source.mapIds,
        mapNames: source.mapIds.map(mapName),
        weight: itemWeightOrCanonical(itemId, weights),
        poolShare: poolShare(itemId, catalog, weights),
        firstSlotChance: firstSlotChance(itemId, wave, lootMult, catalog, rules, weights, true),
        implemented: true,
      });
    }
    for (const map of MAP_DEFS) {
      const source = sources.find((s) => s.id === `map:${map.id}`);
      if (!source) continue;
      const lootMult = effectiveLootMult(map, overrides, enabled);
      const crateOnMap = map.crates.length > 0;
      rows.push({
        sourceId: source.id,
        type: "map",
        label: `${map.name} / WAVE REWARD`,
        shared: true,
        mapIds: [map.id],
        mapNames: [map.name],
        weight: itemWeightOrCanonical(itemId, weights),
        poolShare: poolShare(itemId, catalog, weights),
        firstSlotChance: firstSlotChance(itemId, wave, lootMult, catalog, rules, weights, true),
        implemented: true,
      });
      if (crateOnMap) {
        rows.push({
          sourceId: `${source.id}/crate`,
          type: "crate",
          label: `${map.name} / SUPPLY CRATE`,
          shared: true,
          mapIds: [map.id],
          mapNames: [map.name],
          weight: itemWeightOrCanonical(itemId, weights),
          poolShare: poolShare(itemId, catalog, weights),
          firstSlotChance: firstSlotChance(itemId, wave, lootMult, catalog, rules, weights, true),
          implemented: true,
        });
      }
    }
  }

  if (def.price != null) {
    const shop = sources.find((s) => s.id === "shop");
    if (shop) {
      rows.push({
        sourceId: shop.id,
        type: "shop",
        label: shop.label,
        shared: true,
        mapIds: [],
        mapNames: [],
        weight: 0,
        poolShare: 0,
        firstSlotChance: 0,
        implemented: true,
      });
    }
  }

  return rows;
}

function itemWeightOrCanonical(id: string, weights: LootWeights): number {
  const w = weights[id];
  return typeof w === "number" ? w : CANONICAL_ITEM_WEIGHT;
}

export type LootTableEntry = {
  itemId: string;
  name: string;
  kind: ItemKind;
  rarity: ItemDef["rarity"];
  baseWeight: number;
  testWeight: number;
  poolShare: number;
  firstSlotChance: number;
  value: number;
};

export function lootTableEntries(
  sourceId: string,
  overrides: EconomyOverrides = emptyEconomyOverrides(),
  enabled = true,
  wave = DEFAULT_DIAGNOSTIC_WAVE,
): LootTableEntry[] {
  const source = lootSourceCatalog().find((s) => s.id === sourceId);
  if (!source || source.type === "shop") {
    if (sourceId === "shop") {
      return effectiveItemCatalog(overrides, enabled)
        .filter((i) => i.price != null)
        .map((i) => ({
          itemId: i.id,
          name: i.name,
          kind: i.kind,
          rarity: i.rarity,
          baseWeight: 0,
          testWeight: 0,
          poolShare: 0,
          firstSlotChance: 0,
          value: i.value,
        }));
    }
    return [];
  }
  const catalog = effectiveItemCatalog(overrides, enabled);
  const rules = effectiveLootRules(overrides, enabled);
  const weights = effectiveWeights(overrides, enabled);
  const lootMult = diagnosticLootMult(source, overrides, enabled);
  return lootableItems(catalog).map((i) => {
    const test = itemWeightOrCanonical(i.id, weights);
    return {
      itemId: i.id,
      name: i.name,
      kind: i.kind,
      rarity: i.rarity,
      baseWeight: CANONICAL_ITEM_WEIGHT,
      testWeight: test,
      poolShare: poolShare(i.id, catalog, weights),
      firstSlotChance: firstSlotChance(i.id, wave, lootMult, catalog, rules, weights, true),
      value: i.value,
    };
  });
}

export function sourceExpectedValue(
  sourceId: string,
  overrides: EconomyOverrides = emptyEconomyOverrides(),
  enabled = true,
  wave = DEFAULT_DIAGNOSTIC_WAVE,
): LootEvResult {
  if (sourceId === "shop") {
    return { supported: false, reason: "Shop is a buy list, not a loot roll." };
  }
  if (FUTURE_SOURCE_TYPES.includes(sourceId as LootSourceType)) {
    return { supported: false, reason: "NOT IMPLEMENTED" };
  }
  const crateEv = crateEvForSource(sourceId, overrides, enabled, wave);
  if (sourceId === "crate") return crateEv ?? { supported: false, reason: "Unknown source." };
  const rewardEv = rewardEvForSource(sourceId, overrides, enabled, wave);
  if (sourceId === "reward") return rewardEv ?? { supported: false, reason: "Unknown source." };
  if (sourceId.startsWith("map:")) {
    return rewardEv ?? crateEv ?? { supported: false, reason: "Unknown source." };
  }
  return { supported: false, reason: "Unknown source." };
}

export function crateEvForSource(
  sourceId: string,
  overrides: EconomyOverrides,
  enabled: boolean,
  wave = DEFAULT_DIAGNOSTIC_WAVE,
): LootEvResult | null {
  const catalog = effectiveItemCatalog(overrides, enabled);
  const rules = effectiveLootRules(overrides, enabled);
  const weights = effectiveWeights(overrides, enabled);
  if (sourceId === "crate") return crateExpectedValue(wave, 1, catalog, rules, weights);
  if (sourceId.startsWith("map:")) {
    const map = MAP_DEFS.find((m) => m.id === sourceId.slice(4));
    if (!map || map.crates.length === 0) return null;
    return crateExpectedValue(wave, effectiveLootMult(map, overrides, enabled), catalog, rules, weights);
  }
  return null;
}

export function rewardEvForSource(
  sourceId: string,
  overrides: EconomyOverrides,
  enabled: boolean,
  wave = DEFAULT_DIAGNOSTIC_WAVE,
): LootEvResult | null {
  const catalog = effectiveItemCatalog(overrides, enabled);
  const rules = effectiveLootRules(overrides, enabled);
  const weights = effectiveWeights(overrides, enabled);
  if (sourceId === "reward") return rewardExpectedValue(wave, 1, catalog, rules, weights);
  if (sourceId.startsWith("map:")) {
    const map = MAP_DEFS.find((m) => m.id === sourceId.slice(4));
    if (!map) return null;
    return rewardExpectedValue(wave, effectiveLootMult(map, overrides, enabled), catalog, rules, weights);
  }
  return null;
}

export function rollEffectiveCrate(
  wave: number,
  uidStart: number,
  lootMult: number,
  overrides: EconomyOverrides,
  enabled: boolean,
  rng?: () => number,
): Item[] {
  const runtime = lootRuntime(overrides, enabled, rng);
  if (!runtime) return generateCrate(wave, uidStart, lootMult, { catalog: ITEMS });
  return generateCrate(wave, uidStart, lootMult, runtime);
}

export function rollEffectiveChoices(
  wave: number,
  uidStart: number,
  lootMult: number,
  overrides: EconomyOverrides,
  enabled: boolean,
  rng?: () => number,
): Item[] {
  const runtime = lootRuntime(overrides, enabled, rng);
  if (!runtime) return generateChoices(wave, uidStart, lootMult, { catalog: ITEMS });
  return generateChoices(wave, uidStart, lootMult, runtime);
}

export type EconomyPatchLine = {
  scope: string;
  field: string;
  from: number;
  to: number;
};

export function economyPatchLines(overrides: EconomyOverrides): EconomyPatchLine[] {
  const clean = pruneEconomyOverrides(overrides);
  const lines: EconomyPatchLine[] = [];
  for (const [id, fields] of Object.entries(clean.items)) {
    const base = ITEM_BY_ID[id];
    if (!base) continue;
    const scope = base.name;
    if (typeof fields.value === "number" && !nearlyEqual(fields.value, base.value)) {
      lines.push({ scope, field: "value", from: base.value, to: fields.value });
    }
    if (typeof fields.price === "number" && base.price != null && !nearlyEqual(fields.price, base.price)) {
      lines.push({ scope, field: "price", from: base.price, to: fields.price });
    }
  }
  for (const [id, w] of Object.entries(clean.weights)) {
    const base = ITEM_BY_ID[id];
    if (!base) continue;
    lines.push({
      scope: "RAID LOOT POOL",
      field: `${id}.weight`,
      from: CANONICAL_ITEM_WEIGHT,
      to: w,
    });
  }
  for (const [key, to] of Object.entries(clean.rules) as Array<[keyof LootRules, number]>) {
    lines.push({
      scope: "RAID LOOT POOL",
      field: key,
      from: CANONICAL_LOOT_RULES[key],
      to,
    });
  }
  for (const [mapId, bag] of Object.entries(clean.maps)) {
    const map = MAP_DEFS.find((m) => m.id === mapId);
    if (!map || bag.lootMult == null) continue;
    lines.push({ scope: map.name, field: "lootMult", from: map.lootMult, to: bag.lootMult });
  }
  return lines;
}

export function formatEconomyPatch(overrides: EconomyOverrides): string {
  const lines = economyPatchLines(overrides);
  if (lines.length === 0) return "ECONOMY PATCH\n\n(no changes)\n";
  const groups = new Map<string, EconomyPatchLine[]>();
  for (const line of lines) {
    const list = groups.get(line.scope) ?? [];
    list.push(line);
    groups.set(line.scope, list);
  }
  const parts = ["ECONOMY PATCH", ""];
  for (const [scope, group] of groups) {
    parts.push(scope);
    for (const line of group) parts.push(`${line.field}: ${line.from} -> ${line.to}`);
    parts.push("");
  }
  return parts.join("\n").trim() + "\n";
}

export function parseStoredEconomy(raw: string | null): EconomyOverrides {
  if (!raw) return emptyEconomyOverrides();
  try {
    const parsed = JSON.parse(raw) as Partial<EconomyOverrides>;
    return pruneEconomyOverrides({
      items: parsed.items && typeof parsed.items === "object" ? parsed.items : {},
      weights: parsed.weights && typeof parsed.weights === "object" ? parsed.weights : {},
      rules: parsed.rules && typeof parsed.rules === "object" ? parsed.rules : {},
      maps: parsed.maps && typeof parsed.maps === "object" ? parsed.maps : {},
    });
  } catch {
    return emptyEconomyOverrides();
  }
}

export function loadEconomyOverrides(enabled: boolean, storage: StorageLike | null): EconomyOverrides {
  if (!enabled || !storage) return emptyEconomyOverrides();
  return parseStoredEconomy(storage.getItem(ECONOMY_STORAGE_KEY));
}

export function saveEconomyOverrides(
  overrides: EconomyOverrides,
  enabled: boolean,
  storage: StorageLike | null,
): void {
  if (!storage) return;
  if (!enabled) {
    storage.removeItem(ECONOMY_STORAGE_KEY);
    return;
  }
  storage.setItem(ECONOMY_STORAGE_KEY, JSON.stringify(pruneEconomyOverrides(overrides)));
}

let applied: EconomyOverrides = emptyEconomyOverrides();
const listeners = new Set<() => void>();

function memoryStorage(): StorageLike | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function getEconomyOverrides(): EconomyOverrides {
  return applied;
}

export function hydrateEconomyOverrides(enabled: boolean, storage: StorageLike | null = memoryStorage()): void {
  applied = enabled ? loadEconomyOverrides(true, storage) : emptyEconomyOverrides();
  for (const fn of listeners) fn();
}

export function applyEconomyOverrides(
  next: EconomyOverrides,
  enabled: boolean,
  storage: StorageLike | null = memoryStorage(),
): EconomyOverrides {
  applied = pruneEconomyOverrides(cloneOverrides(next));
  saveEconomyOverrides(applied, enabled, storage);
  for (const fn of listeners) fn();
  return applied;
}

export function subscribeEconomy(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (DEV_TOOLS_ENABLED) {
  hydrateEconomyOverrides(true);
}
