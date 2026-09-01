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
  earliestPositiveChanceWave,
  expectedAppearances,
  firstSlotChance,
  generateChoices,
  generateCrate,
  isLootableKind,
  itemEligibleAtWave,
  lootableItems,
  type LootRules,
  type LootRuntime,
  type LootWeights,
  poolShare,
  progressionPreview,
  rewardExpectedValue,
  type ExpectedAppearancesResult,
  type LootEvResult,
  type ProgressionRow,
  validateLootPoolWarnings,
} from "../loot";
import {
  canonicalLootSources,
  canonicalProfileEntry,
  isCanonicalLootSourceId,
  lootSourceId,
  resolveProfileEntry,
  validateProfileOverrides,
  type LootProfile,
  type LootProfileOverride,
  type LootSourceContext,
  type ProfileIssue,
} from "../lootProfiles";
import { MAP_DEFS, type MapDef } from "../map";
import { DEV_TOOLS_ENABLED } from "./tools";

export const ECONOMY_STORAGE_KEY = "scavlord.dev.economyLab.v1";

export type EconomyItemOverride = {
  value?: number;
  price?: number;
};

export type EconomyOverrides = {
  items: Record<string, EconomyItemOverride>;
  /** Legacy global weights; migrated into per-source profiles on load. */
  weights: Record<string, number>;
  profiles: Record<string, Record<string, LootProfileOverride>>;
  rules: Partial<LootRules>;
  maps: Record<string, { lootMult?: number }>;
};

export type EconomyCategory = "ALL" | "WEAPONS" | "ARMOR" | "ATTACHMENTS" | "LOOT";

export type EconomyLabView = "items" | "sources";

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
  | { ok: false; reason: "NEGATIVE_WEIGHT" | "UNKNOWN_ITEM" | "NOT_LOOTABLE" | "UNKNOWN_SOURCE" | "MIN_WAVE" | "MAX_WAVE" };

export type SetNumberResult =
  | { ok: true; overrides: EconomyOverrides }
  | { ok: false; reason: "NEGATIVE" | "UNKNOWN_ITEM" | "FIELD_ABSENT" };

/** Future source kinds Economy Lab can grow into without a rebuild. */
export type LootSourceType = "crate" | "reward" | "shop" | "enemy" | "boss" | "quest" | "special_zone";

export type LootSourceFilter = "ALL" | "CRATE" | "REWARD" | "SHOP";

export type LootSource = {
  id: string;
  type: LootSourceType;
  label: string;
  groupLabel: string;
  implemented: boolean;
  mapIds: string[];
  mapId?: string;
  profileId?: string;
  /** True only when two contexts intentionally share profileId. */
  shared: boolean;
  /** False for hideout shop — not a loot roll. */
  roll: boolean;
};

export type LootSourceGroup = {
  id: string;
  label: string;
  kind: "map" | "shop";
  mapId?: string;
  children: LootSource[];
};

export type ItemSourceRow = {
  sourceId: string;
  type: LootSourceType;
  label: string;
  groupLabel: string;
  shared: boolean;
  mapIds: string[];
  mapNames: string[];
  enabled: boolean;
  weight: number;
  minWave: number;
  maxWave?: number;
  eligible: boolean;
  poolShare: number;
  firstSlotChance: number;
  expectedAppearances?: ExpectedAppearancesResult;
  implemented: boolean;
};

export const FUTURE_SOURCE_TYPES: readonly LootSourceType[] = ["enemy", "boss", "quest", "special_zone"];
/** Economy Lab drop ids for later: enemy:<kind> / boss:<kind> / quest:<questId>. */

export const DEFAULT_LOOT_SOURCE_ID = lootSourceId("woods", "crate");

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
  return { items: {}, weights: {}, profiles: {}, rules: {}, maps: {} };
}

function cloneProfileBag(src: Record<string, LootProfileOverride> | undefined): Record<string, LootProfileOverride> {
  return Object.fromEntries(Object.entries(src ?? {}).map(([k, v]) => [k, { ...v }]));
}

function cloneOverrides(src: EconomyOverrides): EconomyOverrides {
  return {
    items: { ...Object.fromEntries(Object.entries(src.items).map(([k, v]) => [k, { ...v }])) },
    weights: { ...src.weights },
    profiles: Object.fromEntries(Object.entries(src.profiles ?? {}).map(([k, v]) => [k, cloneProfileBag(v)])),
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

function pruneProfileEntry(entry: LootProfileOverride): LootProfileOverride | undefined {
  const canonical = canonicalProfileEntry();
  const next: LootProfileOverride = {};
  if (typeof entry.enabled === "boolean" && entry.enabled !== canonical.enabled) next.enabled = entry.enabled;
  if (typeof entry.weight === "number" && Number.isFinite(entry.weight) && !nearlyEqual(entry.weight, canonical.weight)) {
    next.weight = entry.weight;
  }
  if (typeof entry.minWave === "number" && Number.isFinite(entry.minWave) && entry.minWave !== canonical.minWave) {
    next.minWave = entry.minWave;
  }
  if (typeof entry.maxWave === "number" && Number.isFinite(entry.maxWave)) next.maxWave = entry.maxWave;
  return Object.keys(next).length ? next : undefined;
}

export function pruneEconomyOverrides(src: EconomyOverrides): EconomyOverrides {
  const rules: Partial<LootRules> = {};
  for (const [key, value] of Object.entries(src.rules) as Array<[keyof LootRules, number | undefined]>) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (nearlyEqual(value, CANONICAL_LOOT_RULES[key])) continue;
    rules[key] = value;
  }
  const profiles: Record<string, Record<string, LootProfileOverride>> = {};
  for (const [sourceId, bag] of Object.entries(src.profiles ?? {})) {
    const nextBag: Record<string, LootProfileOverride> = {};
    for (const [itemId, entry] of Object.entries(bag ?? {})) {
      const pruned = pruneProfileEntry(entry);
      if (pruned) nextBag[itemId] = pruned;
    }
    if (Object.keys(nextBag).length) profiles[sourceId] = nextBag;
  }
  return {
    items: pruneEmpty(src.items),
    weights: {},
    profiles,
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
  return {};
}

export function effectiveProfile(
  sourceId: string | undefined,
  overrides: EconomyOverrides = getEconomyOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): LootProfile | undefined {
  if (!enabled || !sourceId) return undefined;
  return overrides.profiles[sourceId];
}

export function resolvedProfileEntry(
  sourceId: string,
  itemId: string,
  overrides: EconomyOverrides = emptyEconomyOverrides(),
  enabled = true,
) {
  return resolveProfileEntry(itemId, effectiveProfile(sourceId, overrides, enabled), CANONICAL_ITEM_WEIGHT);
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

export function lootRuntimeForSource(sourceId: string, rng?: () => number): LootRuntime | undefined {
  return lootRuntime(getEconomyOverrides(), DEV_TOOLS_ENABLED, rng, sourceId);
}

export function lootRuntime(
  overrides: EconomyOverrides = getEconomyOverrides(),
  enabled = DEV_TOOLS_ENABLED,
  rng?: () => number,
  sourceId?: string,
): LootRuntime | undefined {
  if (!enabled) {
    if (!sourceId) return undefined;
    const runtime: LootRuntime = {
      catalog: ITEMS,
      rules: CANONICAL_LOOT_RULES,
      weights: {},
      sourceId,
    };
    if (rng) runtime.rng = rng;
    return runtime;
  }
  const runtime: LootRuntime = {
    catalog: effectiveItemCatalog(overrides, true),
    rules: effectiveLootRules(overrides, true),
    weights: {},
  };
  if (sourceId) {
    runtime.sourceId = sourceId;
    const profile = overrides.profiles?.[sourceId];
    if (profile) runtime.profile = profile;
  }
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

export function setItemWeight(
  src: EconomyOverrides,
  id: string,
  weight: number,
  sourceId: string = DEFAULT_LOOT_SOURCE_ID,
): SetWeightResult {
  return setSourceProfileField(src, sourceId, id, { weight });
}

export type ProfileFieldPatch = {
  enabled?: boolean;
  weight?: number;
  minWave?: number;
  maxWave?: number | null;
};

export function setSourceProfileField(
  src: EconomyOverrides,
  sourceId: string,
  itemId: string,
  patch: ProfileFieldPatch,
): SetWeightResult {
  const def = ITEM_BY_ID[itemId];
  if (!def) return { ok: false, reason: "UNKNOWN_ITEM" };
  if (!isLootableKind(def.kind)) return { ok: false, reason: "NOT_LOOTABLE" };
  if (!isCanonicalLootSourceId(sourceId)) return { ok: false, reason: "UNKNOWN_SOURCE" };
  if (patch.weight != null && (!Number.isFinite(patch.weight) || patch.weight < 0)) {
    return { ok: false, reason: "NEGATIVE_WEIGHT" };
  }
  if (patch.minWave != null && (!Number.isFinite(patch.minWave) || patch.minWave < 1)) {
    return { ok: false, reason: "MIN_WAVE" };
  }
  const next = cloneOverrides(src);
  const bag = { ...(next.profiles[sourceId] ?? {}) };
  const cur: LootProfileOverride = { ...(bag[itemId] ?? {}) };
  const resolved = resolveProfileEntry(itemId, { [itemId]: cur }, CANONICAL_ITEM_WEIGHT);
  if (patch.enabled != null) cur.enabled = patch.enabled;
  if (patch.weight != null) cur.weight = patch.weight;
  if (patch.minWave != null) cur.minWave = Math.round(patch.minWave);
  if (patch.maxWave === null) delete cur.maxWave;
  else if (patch.maxWave != null) cur.maxWave = Math.round(patch.maxWave);
  const minWave = cur.minWave ?? resolved.minWave;
  const maxWave = cur.maxWave;
  if (maxWave != null && maxWave < minWave) return { ok: false, reason: "MAX_WAVE" };
  bag[itemId] = cur;
  next.profiles[sourceId] = bag;
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
  for (const sourceId of Object.keys(next.profiles)) {
    const bag = { ...next.profiles[sourceId] };
    delete bag[id];
    if (Object.keys(bag).length === 0) delete next.profiles[sourceId];
    else next.profiles[sourceId] = bag;
  }
  return pruneEconomyOverrides(next);
}

export function resetEconomySource(src: EconomyOverrides, sourceId: string): EconomyOverrides {
  const next = cloneOverrides(src);
  delete next.profiles[sourceId];
  return pruneEconomyOverrides(next);
}

export function resetEconomyTable(src: EconomyOverrides, sourceId: string): EconomyOverrides {
  return resetEconomySource(src, sourceId);
}

export function modifiedEconomyCount(overrides: EconomyOverrides): number {
  const clean = pruneEconomyOverrides(overrides);
  let profileItems = 0;
  for (const bag of Object.values(clean.profiles)) profileItems += Object.keys(bag).length;
  return Object.keys(clean.items).length + profileItems + Object.keys(clean.rules).length + Object.keys(clean.maps).length;
}

export function itemOverrideCount(overrides: EconomyOverrides, id: string): number {
  const bag = overrides.items[id];
  let n = bag ? Object.keys(bag).length : 0;
  for (const profile of Object.values(overrides.profiles ?? {})) {
    const entry = profile[id];
    if (entry) n += Object.keys(entry).length;
  }
  return n;
}

export function economyOverridesEqual(a: EconomyOverrides, b: EconomyOverrides): boolean {
  return JSON.stringify(pruneEconomyOverrides(a)) === JSON.stringify(pruneEconomyOverrides(b));
}

export function lootSourceFromContext(ctx: LootSourceContext): LootSource {
  const map = MAP_DEFS.find((m) => m.id === ctx.mapId);
  const mapLabel = map?.name ?? ctx.mapId;
  const label = ctx.type === "crate" ? "Supply Crate" : "Wave Reward";
  return {
    id: ctx.id,
    type: ctx.type,
    label,
    groupLabel: mapLabel,
    implemented: true,
    mapIds: [ctx.mapId],
    mapId: ctx.mapId,
    profileId: ctx.profileId,
    shared: false,
    roll: true,
  };
}

export function lootSourceCatalog(): LootSource[] {
  const sources = canonicalLootSources().map(lootSourceFromContext);
  sources.push({
    id: "shop",
    type: "shop",
    label: "Hideout Shop",
    groupLabel: "SHOP",
    implemented: true,
    mapIds: [],
    shared: true,
    roll: false,
  });
  return sources;
}

export function lootSourceGroups(): LootSourceGroup[] {
  const catalog = lootSourceCatalog();
  const groups: LootSourceGroup[] = MAP_DEFS.map((m) => ({
    id: `map:${m.id}`,
    label: m.name,
    kind: "map" as const,
    mapId: m.id,
    children: catalog.filter((s) => s.mapId === m.id),
  }));
  groups.push({
    id: "shop-group",
    label: "SHOP",
    kind: "shop",
    children: catalog.filter((s) => s.type === "shop"),
  });
  return groups;
}

export function sourceTitle(source: Pick<LootSource, "groupLabel" | "label">): string {
  return `${source.groupLabel} / ${source.label}`.toUpperCase();
}

export function filterLootSources(
  sources: readonly LootSource[],
  filter: LootSourceFilter,
  query: string,
): LootSource[] {
  const q = query.trim().toLowerCase();
  return sources.filter((s) => {
    if (!s.implemented) return false;
    if (filter === "CRATE" && s.type !== "crate") return false;
    if (filter === "REWARD" && s.type !== "reward") return false;
    if (filter === "SHOP" && s.type !== "shop") return false;
    if (!q) return true;
    return (
      s.label.toLowerCase().includes(q) ||
      s.groupLabel.toLowerCase().includes(q) ||
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
  if (source.type === "shop") return "Hideout — not a loot roll";
  if (source.shared) return `Shared profile · ${source.mapIds.map(mapName).join(", ")}`;
  return source.mapIds.map(mapName).join(", ");
}

export function diagnosticLootMult(
  source: LootSource,
  overrides: EconomyOverrides,
  enabled: boolean,
): number {
  if (source.mapId) {
    const map = MAP_DEFS.find((m) => m.id === source.mapId);
    if (map) return effectiveLootMult(map, overrides, enabled);
  }
  return 1;
}

function rowFromLootSource(
  itemId: string,
  source: LootSource,
  catalog: ItemDef[],
  rules: ReturnType<typeof effectiveLootRules>,
  overrides: EconomyOverrides,
  enabled: boolean,
  wave: number,
): ItemSourceRow {
  const lootMult = diagnosticLootMult(source, overrides, enabled);
  const profile = effectiveProfile(source.id, overrides, enabled);
  const entry = resolveProfileEntry(itemId, profile, CANONICAL_ITEM_WEIGHT);
  const appearances =
    source.type === "crate" || source.type === "reward"
      ? expectedAppearances(itemId, source.type, wave, lootMult, catalog, rules, {}, profile)
      : undefined;
  const row: ItemSourceRow = {
    sourceId: source.id,
    type: source.type,
    label: sourceTitle(source),
    groupLabel: source.groupLabel,
    shared: source.shared,
    mapIds: source.mapIds,
    mapNames: source.mapIds.map(mapName),
    enabled: entry.enabled,
    weight: entry.weight,
    minWave: entry.minWave,
    eligible: itemEligibleAtWave(itemId, wave, catalog, {}, profile),
    poolShare: poolShare(itemId, catalog, {}, profile, wave),
    firstSlotChance: firstSlotChance(itemId, wave, lootMult, catalog, rules, {}, true, profile),
    implemented: true,
  };
  if (entry.maxWave != null) row.maxWave = entry.maxWave;
  if (appearances) row.expectedAppearances = appearances;
  return row;
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
  const sources = lootSourceCatalog();
  const rows: ItemSourceRow[] = [];

  if (isLootableKind(def.kind)) {
    for (const source of sources.filter((s) => s.roll)) {
      rows.push(rowFromLootSource(itemId, source, catalog, rules, overrides, enabled, wave));
    }
  }

  if (def.price != null) {
    const shop = sources.find((s) => s.id === "shop");
    if (shop) {
      rows.push({
        sourceId: shop.id,
        type: "shop",
        label: sourceTitle(shop),
        groupLabel: shop.groupLabel,
        shared: true,
        mapIds: [],
        mapNames: [],
        enabled: false,
        weight: 0,
        minWave: 1,
        eligible: false,
        poolShare: 0,
        firstSlotChance: 0,
        implemented: true,
      });
    }
  }

  return rows;
}

export type EarliestLootSummary =
  | { available: true; sourceId: string; label: string; wave: number }
  | { available: false };

export function earliestLootSummary(
  itemId: string,
  overrides: EconomyOverrides = emptyEconomyOverrides(),
  enabled = true,
): EarliestLootSummary {
  const def = ITEM_BY_ID[itemId];
  if (!def || !isLootableKind(def.kind)) return { available: false };
  const catalog = effectiveItemCatalog(overrides, enabled);
  const rules = effectiveLootRules(overrides, enabled);
  let best: EarliestLootSummary = { available: false };
  for (const source of lootSourceCatalog().filter((s) => s.roll)) {
    const profile = effectiveProfile(source.id, overrides, enabled);
    const lootMult = diagnosticLootMult(source, overrides, enabled);
    const wave = earliestPositiveChanceWave(itemId, lootMult, catalog, rules, {}, profile);
    if (wave == null) continue;
    if (!best.available || wave < best.wave) {
      best = { available: true, sourceId: source.id, label: sourceTitle(source), wave };
    }
  }
  return best;
}

export function itemProgression(
  itemId: string,
  sourceId: string,
  overrides: EconomyOverrides = emptyEconomyOverrides(),
  enabled = true,
): ProgressionRow[] {
  const source = lootSourceCatalog().find((s) => s.id === sourceId);
  if (!source?.roll) return [];
  const catalog = effectiveItemCatalog(overrides, enabled);
  const rules = effectiveLootRules(overrides, enabled);
  const profile = effectiveProfile(sourceId, overrides, enabled);
  return progressionPreview(itemId, diagnosticLootMult(source, overrides, enabled), catalog, rules, {}, profile);
}

export type LootTableEntry = {
  itemId: string;
  name: string;
  kind: ItemKind;
  rarity: ItemDef["rarity"];
  enabled: boolean;
  minWave: number;
  maxWave?: number;
  baseWeight: number;
  testWeight: number;
  eligible: boolean;
  poolShare: number;
  firstSlotChance: number;
  expectedAppearances?: ExpectedAppearancesResult;
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
          enabled: false,
          minWave: 1,
          baseWeight: 0,
          testWeight: 0,
          eligible: false,
          poolShare: 0,
          firstSlotChance: 0,
          value: i.value,
        }));
    }
    return [];
  }
  const catalog = effectiveItemCatalog(overrides, enabled);
  const rules = effectiveLootRules(overrides, enabled);
  const profile = effectiveProfile(sourceId, overrides, enabled);
  const lootMult = diagnosticLootMult(source, overrides, enabled);
  return lootableItems(catalog).map((i) => {
    const entry = resolveProfileEntry(i.id, profile, CANONICAL_ITEM_WEIGHT);
    const row: LootTableEntry = {
      itemId: i.id,
      name: i.name,
      kind: i.kind,
      rarity: i.rarity,
      enabled: entry.enabled,
      minWave: entry.minWave,
      baseWeight: CANONICAL_ITEM_WEIGHT,
      testWeight: entry.weight,
      eligible: itemEligibleAtWave(i.id, wave, catalog, {}, profile),
      poolShare: poolShare(i.id, catalog, {}, profile, wave),
      firstSlotChance: firstSlotChance(i.id, wave, lootMult, catalog, rules, {}, true, profile),
      expectedAppearances: expectedAppearances(
        i.id,
        source.type === "reward" ? "reward" : "crate",
        wave,
        lootMult,
        catalog,
        rules,
        {},
        profile,
      ),
      value: i.value,
    };
    if (entry.maxWave != null) row.maxWave = entry.maxWave;
    return row;
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
  const source = lootSourceCatalog().find((s) => s.id === sourceId);
  if (!source?.roll) return { supported: false, reason: "Unknown source." };
  if (source.type === "crate") return crateEvForSource(sourceId, overrides, enabled, wave) ?? { supported: false, reason: "Unknown source." };
  if (source.type === "reward") return rewardEvForSource(sourceId, overrides, enabled, wave) ?? { supported: false, reason: "Unknown source." };
  return { supported: false, reason: "Unknown source." };
}

function sourceMathArgs(sourceId: string, overrides: EconomyOverrides, enabled: boolean, wave: number) {
  const source = lootSourceCatalog().find((s) => s.id === sourceId);
  const catalog = effectiveItemCatalog(overrides, enabled);
  const rules = effectiveLootRules(overrides, enabled);
  const profile = effectiveProfile(sourceId, overrides, enabled);
  const lootMult = source ? diagnosticLootMult(source, overrides, enabled) : 1;
  return { source, catalog, rules, profile, lootMult, wave };
}

export function crateEvForSource(
  sourceId: string,
  overrides: EconomyOverrides,
  enabled: boolean,
  wave = DEFAULT_DIAGNOSTIC_WAVE,
): LootEvResult | null {
  const { source, catalog, rules, profile, lootMult } = sourceMathArgs(sourceId, overrides, enabled, wave);
  if (!source || source.type !== "crate") return null;
  return crateExpectedValue(wave, lootMult, catalog, rules, {}, profile);
}

export function rewardEvForSource(
  sourceId: string,
  overrides: EconomyOverrides,
  enabled: boolean,
  wave = DEFAULT_DIAGNOSTIC_WAVE,
): LootEvResult | null {
  const { source, catalog, rules, profile, lootMult } = sourceMathArgs(sourceId, overrides, enabled, wave);
  if (!source || source.type !== "reward") return null;
  return rewardExpectedValue(wave, lootMult, catalog, rules, {}, profile);
}

export function sourcePoolWarnings(
  sourceId: string,
  overrides: EconomyOverrides,
  enabled: boolean,
  wave = DEFAULT_DIAGNOSTIC_WAVE,
): ProfileIssue[] {
  const structural = validateProfileOverrides(overrides.profiles ?? {}, ITEMS).filter((i) => i.sourceId === sourceId);
  const { catalog, rules, profile } = sourceMathArgs(sourceId, overrides, enabled, wave);
  return [...structural, ...validateLootPoolWarnings(sourceId, wave, catalog, rules, {}, profile)];
}

export function rollEffectiveCrate(
  wave: number,
  uidStart: number,
  lootMult: number,
  overrides: EconomyOverrides,
  enabled: boolean,
  rng?: () => number,
  sourceId: string = DEFAULT_LOOT_SOURCE_ID,
): Item[] {
  const runtime = lootRuntime(overrides, enabled, rng, sourceId);
  if (!runtime) return generateCrate(wave, uidStart, lootMult, { catalog: ITEMS, sourceId });
  return generateCrate(wave, uidStart, lootMult, runtime);
}

export function rollEffectiveChoices(
  wave: number,
  uidStart: number,
  lootMult: number,
  overrides: EconomyOverrides,
  enabled: boolean,
  rng?: () => number,
  sourceId: string = lootSourceId("woods", "reward"),
): Item[] {
  const runtime = lootRuntime(overrides, enabled, rng, sourceId);
  if (!runtime) return generateChoices(wave, uidStart, lootMult, { catalog: ITEMS, sourceId });
  return generateChoices(wave, uidStart, lootMult, runtime);
}

export type EconomyPatchLine = {
  scope: string;
  field: string;
  from: string | number | boolean;
  to: string | number | boolean;
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
  const canonical = canonicalProfileEntry();
  for (const [sourceId, bag] of Object.entries(clean.profiles)) {
    const source = lootSourceCatalog().find((s) => s.id === sourceId);
    const scope = source ? sourceTitle(source) : sourceId;
    for (const [itemId, entry] of Object.entries(bag)) {
      const item = ITEM_BY_ID[itemId];
      const name = item?.name ?? itemId;
      if (typeof entry.enabled === "boolean" && entry.enabled !== canonical.enabled) {
        lines.push({ scope: `${scope} / ${name}`, field: "enabled", from: canonical.enabled, to: entry.enabled });
      }
      if (typeof entry.weight === "number" && !nearlyEqual(entry.weight, canonical.weight)) {
        lines.push({ scope: `${scope} / ${name}`, field: "weight", from: canonical.weight, to: entry.weight });
      }
      if (typeof entry.minWave === "number" && entry.minWave !== canonical.minWave) {
        lines.push({ scope: `${scope} / ${name}`, field: "minWave", from: canonical.minWave, to: entry.minWave });
      }
      if (typeof entry.maxWave === "number") {
        lines.push({ scope: `${scope} / ${name}`, field: "maxWave", from: "—", to: entry.maxWave });
      }
    }
  }
  for (const [key, to] of Object.entries(clean.rules) as Array<[keyof LootRules, number]>) {
    lines.push({
      scope: "SHARED GENERATOR RULES",
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
  const clean = pruneEconomyOverrides(overrides);
  const lines = economyPatchLines(clean);
  if (lines.length === 0) return "ECONOMY PATCH\n\n(no changes)\n";

  const parts = ["ECONOMY PATCH", ""];

  for (const [id, fields] of Object.entries(clean.items)) {
    const base = ITEM_BY_ID[id];
    if (!base) continue;
    const rows: string[] = [];
    if (typeof fields.value === "number") rows.push(`value: ${base.value} -> ${fields.value}`);
    if (typeof fields.price === "number" && base.price != null) rows.push(`price: ${base.price} -> ${fields.price}`);
    if (rows.length) {
      parts.push(base.name);
      parts.push(...rows);
      parts.push("");
    }
  }

  for (const ctx of canonicalLootSources()) {
    const bag = clean.profiles[ctx.id];
    if (!bag || Object.keys(bag).length === 0) continue;
    const source = lootSourceFromContext(ctx);
    parts.push(sourceTitle(source));
    parts.push("");
    const canonical = canonicalProfileEntry();
    for (const [itemId, entry] of Object.entries(bag)) {
      const item = ITEM_BY_ID[itemId];
      parts.push(item?.name ?? itemId);
      if (typeof entry.enabled === "boolean") parts.push(`enabled: ${canonical.enabled} -> ${entry.enabled}`);
      if (typeof entry.weight === "number") parts.push(`weight: ${canonical.weight} -> ${entry.weight}`);
      if (typeof entry.minWave === "number") parts.push(`minWave: ${canonical.minWave} -> ${entry.minWave}`);
      if (typeof entry.maxWave === "number") parts.push(`maxWave: — -> ${entry.maxWave}`);
      parts.push("");
    }
  }

  const ruleLines = lines.filter((l) => l.scope === "SHARED GENERATOR RULES");
  if (ruleLines.length) {
    parts.push("SHARED GENERATOR RULES");
    for (const line of ruleLines) parts.push(`${line.field}: ${line.from} -> ${line.to}`);
    parts.push("");
  }
  for (const [mapId, bag] of Object.entries(clean.maps)) {
    const map = MAP_DEFS.find((m) => m.id === mapId);
    if (!map || bag.lootMult == null) continue;
    parts.push(map.name);
    parts.push(`lootMult: ${map.lootMult} -> ${bag.lootMult}`);
    parts.push("");
  }

  return parts.join("\n").trim() + "\n";
}

function migrateLegacyWeights(parsed: Partial<EconomyOverrides>): Record<string, Record<string, LootProfileOverride>> {
  const profiles: Record<string, Record<string, LootProfileOverride>> = {};
  for (const [sourceId, bag] of Object.entries(parsed.profiles ?? {})) {
    if (bag && typeof bag === "object") profiles[sourceId] = { ...bag };
  }
  const weights = parsed.weights && typeof parsed.weights === "object" ? parsed.weights : {};
  if (Object.keys(profiles).length === 0 && Object.keys(weights).length > 0) {
    for (const ctx of canonicalLootSources()) {
      const bag: Record<string, LootProfileOverride> = {};
      for (const [id, w] of Object.entries(weights)) {
        if (typeof w === "number" && Number.isFinite(w)) bag[id] = { weight: w };
      }
      profiles[ctx.profileId] = bag;
    }
  }
  return profiles;
}

export function parseStoredEconomy(raw: string | null): EconomyOverrides {
  if (!raw) return emptyEconomyOverrides();
  try {
    const parsed = JSON.parse(raw) as Partial<EconomyOverrides>;
    return pruneEconomyOverrides({
      items: parsed.items && typeof parsed.items === "object" ? parsed.items : {},
      weights: {},
      profiles: migrateLegacyWeights(parsed),
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
