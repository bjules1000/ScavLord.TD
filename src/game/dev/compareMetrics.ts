/**
 * Arsenal comparison metrics for Balance Lab.
 *
 * All helpers take a WeaponDef. Draft/applied resolution happens at the call
 * site by merging overrides onto the canonical def — this file does not read
 * Balance Lab store state.
 *
 * Formulas
 * --------
 * damagePerShot (MAX RAW / SHOT)
 *   damage × (pellets ?? 1)
 *   Theoretical max raw from one trigger. Shotguns are not assumed to hit every pellet.
 *
 * RPM
 *   60000 / cooldownMs
 *
 * burstDps
 *   damagePerShot × 1000 / cooldownMs
 *   Magazine-empty fire, reload ignored. Theoretical.
 *
 * sustainedDps — MAGAZINE
 *   After the last shot, reload starts immediately and overlaps remaining cycle.
 *   cycleMs = (magSize - 1) × cooldown + max(reloadMs, cooldown)
 *   sustainedDps = magSize × damagePerShot × 1000 / cycleMs
 *
 * sustainedDps — PER_ROUND (shotguns)
 *   With a live target, maybeStartReload / tickReload load ONE shell then stop.
 *   Steady combat is therefore shoot → load one → shoot, not a full-tube refill.
 *   cycleMs = max(reloadMs, cooldown)
 *   sustainedDps = damagePerShot × 1000 / cycleMs
 *
 * Ranking
 *   Higher-is-better: largest value is #1.
 *   Lower-is-better (reload, weight): smallest value is #1.
 *   Ties: value first, then canonical weapon id (localeCompare). Unique ranks.
 *
 * Median
 *   Midpoint of the sorted TEST values in the current visible group.
 *   Even count: mean of the two central values.
 */
import { WEAPONS, type WeaponClass, type WeaponDef } from "../gear";
import { OPERATOR_MOVE_SPEED_TILES, operatorSpeedMultiplier } from "../movement";
import type { BalanceTone } from "./balance";

function nearlyEqualNum(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

export type CompareClass = "SIDEARMS" | "SHOTGUNS" | "RIFLES" | "LMG" | "BOLT" | "SPECIAL";
export type CompareCategory = "ALL" | CompareClass;

export const COMPARE_CLASS_BY_WEAPON_CLS: Record<WeaponClass, CompareClass> = {
  pistolCarbine: "SIDEARMS",
  shotgun: "SHOTGUNS",
  rifle: "RIFLES",
  lmg: "LMG",
  sniper: "BOLT",
  launcher: "SPECIAL",
};

export const COMPARE_CATEGORIES: readonly CompareCategory[] = [
  "ALL",
  "SIDEARMS",
  "SHOTGUNS",
  "RIFLES",
  "LMG",
  "BOLT",
  "SPECIAL",
];

export type CompareMetric =
  | "overview"
  | "damage"
  | "burstDps"
  | "sustainedDps"
  | "accuracy"
  | "range"
  | "rpm"
  | "mag"
  | "reload"
  | "weight";

export const COMPARE_METRICS: readonly CompareMetric[] = [
  "overview",
  "damage",
  "burstDps",
  "sustainedDps",
  "accuracy",
  "range",
  "rpm",
  "mag",
  "reload",
  "weight",
];

export const COMPARE_METRIC_LABEL: Record<CompareMetric, string> = {
  overview: "OVERVIEW",
  damage: "DAMAGE",
  burstDps: "BURST DPS",
  sustainedDps: "SUSTAINED DPS",
  accuracy: "ACCURACY",
  range: "RANGE",
  rpm: "RPM",
  mag: "MAG",
  reload: "RELOAD",
  weight: "WEIGHT",
};

export type ScalarMetric = Exclude<CompareMetric, "overview">;

/** Stats shown in the stacked Weapon Compare graph. Overview is not a compare axis. */
export const STACK_METRICS: readonly ScalarMetric[] = [
  "damage",
  "burstDps",
  "sustainedDps",
  "accuracy",
  "range",
  "rpm",
  "mag",
  "reload",
  "weight",
];

export const OVERVIEW_METRICS: readonly ScalarMetric[] = [
  "damage",
  "sustainedDps",
  "range",
  "accuracy",
  "weight",
];

export const BENCHMARK_METRICS: readonly ScalarMetric[] = [
  "damage",
  "burstDps",
  "sustainedDps",
  "range",
  "accuracy",
  "weight",
];

export const LOWER_IS_BETTER_METRICS = new Set<CompareMetric>(["reload", "weight"]);

export type LabView = "editor" | "compare";
export type BenchmarkScope = "category" | "all";

export type CompareSession = {
  view: LabView;
  compareCategory: CompareCategory;
  benchmarkScope: BenchmarkScope;
  query: string;
  selectedId: string | null;
  selectedKind: "weapon" | "armor" | "attachment" | null;
};

export function emptyCompareSession(): CompareSession {
  return {
    view: "editor",
    compareCategory: "ALL",
    benchmarkScope: "category",
    query: "",
    selectedId: null,
    selectedKind: null,
  };
}

export function switchLabView(session: CompareSession, view: LabView): CompareSession {
  return { ...session, view };
}

export function setCompareCategory(session: CompareSession, compareCategory: CompareCategory): CompareSession {
  return { ...session, compareCategory };
}

export function setBenchmarkScope(session: CompareSession, benchmarkScope: BenchmarkScope): CompareSession {
  return { ...session, benchmarkScope };
}

export function selectCompareWeapon(session: CompareSession, id: string): CompareSession {
  return { ...session, selectedId: id, selectedKind: "weapon", view: "editor" };
}

export function compareClassOf(weapon: Pick<WeaponDef, "cls">): CompareClass {
  return COMPARE_CLASS_BY_WEAPON_CLS[weapon.cls];
}

export function mergeWeaponDef(base: WeaponDef, over?: object): WeaponDef {
  if (!over || Object.keys(over).length === 0) return base;
  return { ...base, ...(over as Partial<WeaponDef>) };
}

export function damagePerShot(weapon: WeaponDef): number {
  return weapon.damage * (pelletsOf(weapon));
}

function pelletsOf(weapon: WeaponDef): number {
  return weapon.pellets ?? 1;
}

export function weaponRpm(weapon: WeaponDef): number {
  return 60000 / Math.max(1, weapon.cooldown);
}

export function burstDps(weapon: WeaponDef): number {
  return (damagePerShot(weapon) * 1000) / Math.max(1, weapon.cooldown);
}

/** MAGAZINE: last-shot cooldown overlaps reload. */
export function magazineSustainedCycleMs(weapon: WeaponDef): number {
  const n = Math.max(1, weapon.magSize);
  return (n - 1) * weapon.cooldown + Math.max(weapon.reloadMs, weapon.cooldown);
}

/**
 * PER_ROUND with a target: one shell is seated, then loading stops so the
 * operator can fire. Steady combat is not a full-tube refill.
 */
export function perRoundSustainedCycleMs(weapon: WeaponDef): number {
  return Math.max(weapon.reloadMs, weapon.cooldown);
}

export function sustainedCycleMs(weapon: WeaponDef): number {
  return weapon.reloadType === "PER_ROUND" ? perRoundSustainedCycleMs(weapon) : magazineSustainedCycleMs(weapon);
}

export function sustainedDps(weapon: WeaponDef): number {
  if (weapon.reloadType === "PER_ROUND") {
    return (damagePerShot(weapon) * 1000) / Math.max(1, perRoundSustainedCycleMs(weapon));
  }
  return (weapon.magSize * damagePerShot(weapon) * 1000) / Math.max(1, magazineSustainedCycleMs(weapon));
}

export function moveSpeedWithWeaponOnly(weight: number): number {
  return OPERATOR_MOVE_SPEED_TILES * operatorSpeedMultiplier(weight);
}

export type WeaponCombatMetrics = {
  id: string;
  name: string;
  cls: WeaponClass;
  compareClass: CompareClass;
  pelletDamage: number | null;
  pelletCount: number;
  damagePerShot: number;
  rpm: number;
  burstDps: number;
  sustainedDps: number;
  accuracy: number;
  range: number;
  magSize: number;
  reloadMs: number;
  reloadType: WeaponDef["reloadType"];
  weight: number;
  cooldown: number;
};

export function weaponCombatMetrics(weapon: WeaponDef): WeaponCombatMetrics {
  const pellets = pelletsOf(weapon);
  return {
    id: weapon.id,
    name: weapon.name,
    cls: weapon.cls,
    compareClass: compareClassOf(weapon),
    pelletDamage: weapon.pellets != null ? weapon.damage : null,
    pelletCount: pellets,
    damagePerShot: damagePerShot(weapon),
    rpm: weaponRpm(weapon),
    burstDps: burstDps(weapon),
    sustainedDps: sustainedDps(weapon),
    accuracy: weapon.accuracy,
    range: weapon.range,
    magSize: weapon.magSize,
    reloadMs: weapon.reloadMs,
    reloadType: weapon.reloadType,
    weight: weapon.weight,
    cooldown: weapon.cooldown,
  };
}

export function metricValue(metrics: WeaponCombatMetrics, metric: Exclude<CompareMetric, "overview">): number {
  switch (metric) {
    case "damage":
      return metrics.damagePerShot;
    case "burstDps":
      return metrics.burstDps;
    case "sustainedDps":
      return metrics.sustainedDps;
    case "accuracy":
      return metrics.accuracy;
    case "range":
      return metrics.range;
    case "rpm":
      return metrics.rpm;
    case "mag":
      return metrics.magSize;
    case "reload":
      return metrics.reloadMs;
    case "weight":
      return metrics.weight;
  }
}

export function metricLowerIsBetter(metric: CompareMetric): boolean {
  return LOWER_IS_BETTER_METRICS.has(metric);
}

export function defaultSortDir(metric: CompareMetric): "asc" | "desc" {
  if (metric === "overview") return "asc";
  return metricLowerIsBetter(metric) ? "asc" : "desc";
}

export function compareMetricTone(metric: CompareMetric, base: number, test: number): BalanceTone {
  return valueTone(base, test, metricLowerIsBetter(metric));
}

export function formatMetricValue(metric: CompareMetric, n: number): string {
  if (metric === "accuracy") return `${Math.round(n * 100)}%`;
  if (metric === "reload") return `${(n / 1000).toFixed(2)}s`;
  if (metric === "rpm") return n.toFixed(0);
  if (metric === "burstDps" || metric === "sustainedDps") return (Math.round(n * 10) / 10).toFixed(1);
  if (metric === "weight") {
    if (nearlyEqualNum(n, Math.round(n))) return String(Math.round(n));
    return String(Math.round(n * 100) / 100);
  }
  if (nearlyEqualNum(n, Math.round(n))) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

export function formatRank(rank: number, total: number): string {
  return `#${rank} / ${total}`;
}

export function filterCompareWeapons(
  weapons: readonly WeaponDef[],
  category: CompareCategory,
  query: string,
  nameOf: (w: WeaponDef) => string = (w) => w.name,
): WeaponDef[] {
  const q = query.trim().toLowerCase();
  return weapons.filter((w) => {
    if (category !== "ALL" && compareClassOf(w) !== category) return false;
    if (!q) return true;
    return nameOf(w).toLowerCase().includes(q) || w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q);
  });
}

export function allCanonicalWeapons(): WeaponDef[] {
  return Object.values(WEAPONS);
}

export function weaponsInCategory(category: CompareCategory): WeaponDef[] {
  return filterCompareWeapons(allCanonicalWeapons(), category, "");
}

/**
 * Unique ranks. Sort by value (best first), then canonical id.
 */
export function rankByValue(
  items: readonly { id: string; value: number }[],
  lowerIsBetter: boolean,
): Map<string, number> {
  const sorted = [...items].sort((a, b) => {
    const diff = lowerIsBetter ? a.value - b.value : b.value - a.value;
    if (nearlyEqualNum(a.value, b.value)) return a.id.localeCompare(b.id);
    return diff < 0 ? -1 : 1;
  });
  const ranks = new Map<string, number>();
  sorted.forEach((item, i) => ranks.set(item.id, i + 1));
  return ranks;
}

export function medianValue(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid]!;
  return (s[mid - 1]! + s[mid]!) / 2;
}

export function scaleDomain(values: readonly number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (nearlyEqualNum(min, max)) {
    const pad = Math.abs(min) * 0.1 || 1;
    return { min: min - pad, max: max + pad };
  }
  return { min, max };
}

export function scalePosition(value: number, min: number, max: number): number {
  if (nearlyEqualNum(min, max)) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function sortWeaponIds(
  items: readonly { id: string; value: number; name: string }[],
  dir: "asc" | "desc",
): string[] {
  return [...items]
    .sort((a, b) => {
      const diff = dir === "asc" ? a.value - b.value : b.value - a.value;
      if (nearlyEqualNum(a.value, b.value)) {
        const idCmp = a.id.localeCompare(b.id);
        if (idCmp !== 0) return idCmp;
        return a.name.localeCompare(b.name);
      }
      return diff < 0 ? -1 : 1;
    })
    .map((i) => i.id);
}

export type CompareSortDir = "desc" | "asc";

export function axisTicks(min: number, max: number, count = 5): number[] {
  if (count < 2) return [min];
  if (nearlyEqualNum(min, max)) return [min];
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(min + ((max - min) * i) / (count - 1));
  return out;
}

export type StackedCompareView = {
  weapons: WeaponDef[];
  rows: MetricPair[];
  order: string[];
  domain: { min: number; max: number };
  median: number;
  ranksTest: Map<string, number>;
  metric: ScalarMetric;
  category: CompareCategory;
  sortDir: CompareSortDir;
};

/**
 * Single pipeline for Weapon Compare: category × metric × search × sort.
 * Displayed values are TEST/draft via testOf.
 */
export function composeStackedCompare(
  allWeapons: readonly WeaponDef[],
  testOf: (w: WeaponDef) => WeaponDef,
  category: CompareCategory,
  metric: ScalarMetric,
  query: string,
  sortDir: CompareSortDir,
  nameOf: (w: WeaponDef) => string = (w) => w.name,
): StackedCompareView {
  const weapons = filterCompareWeapons(allWeapons, category, query, nameOf);
  const built = buildCompareRows(weapons, testOf, metric);
  const order = sortWeaponIds(
    built.rows.map((r) => {
      const w = weapons.find((x) => x.id === r.id)!;
      return { id: r.id, value: r.test, name: nameOf(testOf(w)) };
    }),
    sortDir,
  );
  return {
    weapons,
    rows: built.rows,
    order,
    domain: built.domain,
    median: built.median,
    ranksTest: built.ranksTest,
    metric,
    category,
    sortDir,
  };
}

export type MetricPair = {
  id: string;
  name: string;
  base: number;
  test: number;
  changed: boolean;
};

export function metricPairForWeapon(
  canonical: WeaponDef,
  testWeapon: WeaponDef,
  metric: Exclude<CompareMetric, "overview">,
): MetricPair {
  const base = metricValue(weaponCombatMetrics(canonical), metric);
  const test = metricValue(weaponCombatMetrics(testWeapon), metric);
  return {
    id: canonical.id,
    name: testWeapon.name,
    base,
    test,
    changed: !nearlyEqualNum(base, test),
  };
}

export function buildCompareRows(
  canonicals: readonly WeaponDef[],
  testOf: (w: WeaponDef) => WeaponDef,
  metric: Exclude<CompareMetric, "overview">,
): {
  rows: MetricPair[];
  ranksTest: Map<string, number>;
  ranksBase: Map<string, number>;
  median: number;
  domain: { min: number; max: number };
} {
  return buildValueCompareRows(
    canonicals,
    testOf,
    (w) => metricValue(weaponCombatMetrics(w), metric),
    metricLowerIsBetter(metric),
  );
}

export function buildValueCompareRows(
  canonicals: readonly WeaponDef[],
  testOf: (w: WeaponDef) => WeaponDef,
  valueOf: (w: WeaponDef) => number,
  lowerIsBetter: boolean,
): {
  rows: MetricPair[];
  ranksTest: Map<string, number>;
  ranksBase: Map<string, number>;
  median: number;
  domain: { min: number; max: number };
} {
  const rows: MetricPair[] = canonicals.map((base) => {
    const b = valueOf(base);
    const testWeapon = testOf(base);
    const t = valueOf(testWeapon);
    return {
      id: base.id,
      name: testWeapon.name,
      base: b,
      test: t,
      changed: !nearlyEqualNum(b, t),
    };
  });
  const ranksTest = rankByValue(
    rows.map((r) => ({ id: r.id, value: r.test })),
    lowerIsBetter,
  );
  const ranksBase = rankByValue(
    rows.map((r) => ({ id: r.id, value: r.base })),
    lowerIsBetter,
  );
  const testValues = rows.map((r) => r.test);
  const domain = scaleDomain([...rows.flatMap((r) => (r.changed ? [r.base, r.test] : [r.test]))]);
  return { rows, ranksTest, ranksBase, median: medianValue(testValues), domain };
}

export function benchmarkScopeCategory(weapon: WeaponDef, scope: BenchmarkScope): CompareCategory {
  return scope === "all" ? "ALL" : compareClassOf(weapon);
}

export type EditorBenchmarkKey =
  | ScalarMetric
  | "cooldown"
  | "pellets"
  | "pelletDamage"
  | "spread"
  | "maxPelletHits"
  | "secondaryHitMult"
  | "splash";

/** Shotgun/launcher identity stats are never ranked against the whole arsenal. */
export const CATEGORY_LOCKED_KEYS = new Set<EditorBenchmarkKey>([
  "pellets",
  "pelletDamage",
  "spread",
  "maxPelletHits",
  "secondaryHitMult",
  "splash",
]);

export function editorFieldToBenchmarkKey(fieldKey: string, weapon: WeaponDef): EditorBenchmarkKey | null {
  switch (fieldKey) {
    case "weight":
      return "weight";
    case "damage":
      return weapon.pellets != null ? "pelletDamage" : "damage";
    case "pellets":
      return "pellets";
    case "range":
      return "range";
    case "accuracy":
      return "accuracy";
    case "cooldown":
      return "cooldown";
    case "reloadMs":
      return "reload";
    case "magSize":
      return "mag";
    case "spread":
      return "spread";
    case "maxPelletHits":
      return "maxPelletHits";
    case "secondaryHitMult":
      return "secondaryHitMult";
    case "splash":
      return "splash";
    default:
      return null;
  }
}

export function derivedKeyToBenchmarkKey(derivedKey: string): EditorBenchmarkKey | null {
  switch (derivedKey) {
    case "blast":
      return "damage";
    case "rpm":
      return "rpm";
    case "burstDps":
      return "burstDps";
    case "sustainedDps":
      return "sustainedDps";
    case "magSize":
      return "mag";
    case "weight":
      return "weight";
    default:
      return null;
  }
}

export function fieldLowerIsBetter(key: EditorBenchmarkKey): boolean {
  return key === "weight" || key === "reload" || key === "cooldown" || key === "spread";
}

export function extractFieldValue(weapon: WeaponDef, key: EditorBenchmarkKey): number {
  switch (key) {
    case "pelletDamage":
      return weapon.damage;
    case "pellets":
      return weapon.pellets ?? 0;
    case "cooldown":
      return weapon.cooldown;
    case "spread":
      return weapon.spread ?? 0;
    case "maxPelletHits":
      return weapon.maxPelletHits ?? 0;
    case "secondaryHitMult":
      return weapon.secondaryHitMult ?? 0;
    case "splash":
      return weapon.splash;
    default:
      return metricValue(weaponCombatMetrics(weapon), key);
  }
}

export function valueTone(base: number, test: number, lowerIsBetter: boolean): BalanceTone {
  if (nearlyEqualNum(base, test)) return "neutral";
  const increased = test > base;
  if (lowerIsBetter) return increased ? "nerf" : "buff";
  return increased ? "buff" : "nerf";
}

export function editorBenchmarkPool(
  selected: WeaponDef,
  allWeapons: readonly WeaponDef[],
  scope: BenchmarkScope,
  key: EditorBenchmarkKey,
): { weapons: WeaponDef[]; category: CompareCategory; forcedCategory: boolean } {
  const forcedCategory = CATEGORY_LOCKED_KEYS.has(key);
  const category = forcedCategory ? compareClassOf(selected) : benchmarkScopeCategory(selected, scope);
  return {
    weapons: filterCompareWeapons(allWeapons, category, ""),
    category,
    forcedCategory,
  };
}

export type EditorBenchmark = {
  key: EditorBenchmarkKey;
  base: number;
  test: number;
  changed: boolean;
  baseRank: number;
  testRank: number;
  rankChanged: boolean;
  total: number;
  domain: { min: number; max: number };
  category: CompareCategory;
  forcedCategory: boolean;
  tone: BalanceTone;
};

export function editorFieldBenchmark(
  selected: WeaponDef,
  testOf: (w: WeaponDef) => WeaponDef,
  allWeapons: readonly WeaponDef[],
  scope: BenchmarkScope,
  key: EditorBenchmarkKey,
): EditorBenchmark | null {
  const pool = editorBenchmarkPool(selected, allWeapons, scope, key);
  if (pool.weapons.length === 0) return null;
  const built = buildValueCompareRows(pool.weapons, testOf, (w) => extractFieldValue(w, key), fieldLowerIsBetter(key));
  const row = built.rows.find((r) => r.id === selected.id);
  if (!row) return null;
  const baseRank = built.ranksBase.get(selected.id) ?? pool.weapons.length;
  const testRank = built.ranksTest.get(selected.id) ?? pool.weapons.length;
  return {
    key,
    base: row.base,
    test: row.test,
    changed: row.changed,
    baseRank,
    testRank,
    rankChanged: baseRank !== testRank,
    total: pool.weapons.length,
    domain: built.domain,
    category: pool.category,
    forcedCategory: pool.forcedCategory,
    tone: valueTone(row.base, row.test, fieldLowerIsBetter(key)),
  };
}

export function formatEditorRank(bench: EditorBenchmark): string {
  const suffix = bench.forcedCategory && bench.category !== "ALL" ? ` ${bench.category}` : "";
  if (bench.changed && bench.rankChanged) {
    return `${formatRank(bench.baseRank, bench.total)} → ${formatRank(bench.testRank, bench.total)}${suffix}`;
  }
  return `${formatRank(bench.testRank, bench.total)}${suffix}`;
}

export function compareMetricFromEditorKey(key: EditorBenchmarkKey): ScalarMetric | null {
  if (key === "cooldown") return "rpm";
  if (
    key === "pellets" ||
    key === "pelletDamage" ||
    key === "spread" ||
    key === "maxPelletHits" ||
    key === "secondaryHitMult" ||
    key === "splash"
  ) {
    return null;
  }
  return key;
}
