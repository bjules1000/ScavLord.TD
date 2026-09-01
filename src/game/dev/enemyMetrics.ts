/**
 * Derived enemy combat metrics for Wave Lab.
 * Pure: callers pass canonical/test EnemyDef. No override store reads.
 *
 * attacksPerSec = 1000 / fireCooldown
 * dps = towerDamage * attacksPerSec
 *   Theoretical operator DPS. Live cadence is fireCooldown * (0.75..1.25); this uses the authored cooldown.
 * ehpVs10 = hp * 10 / damageAfterArmor(10, armor, 0)
 *   Effective HP against 10-raw 0-pen hits. Armor is flat, so EHP depends on assumed hit size.
 * bountyPerHp = bounty / hp
 */

import { damageAfterArmor } from "../combat";
import { ENEMIES } from "../data";
import type { EnemyDef, EnemyKind } from "../types";
import { rankByValue } from "./compareMetrics";
import type { BalanceTone } from "./balance";

export const EHP_REFERENCE_HIT = 10;

export type EnemyMetricKey = "hp" | "towerDamage" | "dps" | "speed" | "fireRange" | "armor" | "bounty" | "leak";

export const ENEMY_COMPARE_METRICS: readonly EnemyMetricKey[] = [
  "hp",
  "towerDamage",
  "dps",
  "speed",
  "fireRange",
  "armor",
  "bounty",
  "leak",
];

export const ENEMY_METRIC_LABEL: Record<EnemyMetricKey, string> = {
  hp: "HP",
  towerDamage: "DAMAGE",
  dps: "DPS",
  speed: "SPEED",
  fireRange: "RANGE",
  armor: "ARMOR",
  bounty: "BOUNTY",
  leak: "LEAK",
};

export type EnemyCategory = "ALL" | "UNARMORED" | "ARMORED";

export const ENEMY_CATEGORIES: readonly EnemyCategory[] = ["ALL", "UNARMORED", "ARMORED"];

export type EnemyDerived = {
  attacksPerSec: number;
  dps: number;
  ehpVs10: number;
  bountyPerHp: number;
};

export function enemyDerived(def: EnemyDef): EnemyDerived {
  const attacksPerSec = def.fireCooldown > 0 ? 1000 / def.fireCooldown : 0;
  const dps = def.towerDamage * attacksPerSec;
  const perHit = damageAfterArmor(EHP_REFERENCE_HIT, def.armor, 0);
  const ehpVs10 = perHit > 0 ? (def.hp * EHP_REFERENCE_HIT) / perHit : def.hp;
  const bountyPerHp = def.hp > 0 ? def.bounty / def.hp : 0;
  return { attacksPerSec, dps, ehpVs10, bountyPerHp };
}

export function enemyMetricValue(def: EnemyDef, metric: EnemyMetricKey): number {
  if (metric === "dps") return enemyDerived(def).dps;
  if (metric === "leak") return def.damage;
  if (metric === "hp") return def.hp;
  if (metric === "towerDamage") return def.towerDamage;
  if (metric === "speed") return def.speed;
  if (metric === "fireRange") return def.fireRange;
  if (metric === "armor") return def.armor;
  return def.bounty;
}

export function enemyMetricLowerIsBetter(metric: EnemyMetricKey): boolean {
  return false;
}

export function enemyCategoryOf(def: EnemyDef): Exclude<EnemyCategory, "ALL"> {
  return def.armor > 0 ? "ARMORED" : "UNARMORED";
}

export function allCanonicalEnemies(): EnemyDef[] {
  return Object.values(ENEMIES);
}

export function filterEnemies(
  defs: readonly EnemyDef[],
  category: EnemyCategory,
  query: string,
  nameOf: (d: EnemyDef) => string = (d) => d.name,
): EnemyDef[] {
  const q = query.trim().toLowerCase();
  return defs.filter((d) => {
    if (category === "ARMORED" && d.armor <= 0) return false;
    if (category === "UNARMORED" && d.armor > 0) return false;
    if (!q) return true;
    return (
      nameOf(d).toLowerCase().includes(q) ||
      d.name.toLowerCase().includes(q) ||
      d.kind.toLowerCase().includes(q)
    );
  });
}

export function enemyRanks(
  defs: readonly EnemyDef[],
  metric: EnemyMetricKey,
  testOf: (d: EnemyDef) => EnemyDef,
): Map<string, number> {
  return rankByValue(
    defs.map((d) => ({ id: d.kind, value: enemyMetricValue(testOf(d), metric) })),
    enemyMetricLowerIsBetter(metric),
  );
}

export function formatEnemyRank(rank: number, total: number, baseRank?: number): string {
  if (baseRank != null && baseRank !== rank) return `#${baseRank} → #${rank} / ${total}`;
  return `#${rank} / ${total}`;
}

const LOWER_IS_STRONGER = new Set(["fireCooldown"]);
const NEUTRAL_FIELDS = new Set(["bounty", "name", "size"]);

export function enemyFieldTone(key: string, base: number, current: number): BalanceTone {
  if (Math.abs(base - current) < 1e-9) return "neutral";
  if (NEUTRAL_FIELDS.has(key)) return "neutral";
  const increased = current > base;
  if (LOWER_IS_STRONGER.has(key)) return increased ? "nerf" : "buff";
  return increased ? "buff" : "nerf";
}

export type EnemyCompareRow = {
  id: EnemyKind;
  name: string;
  base: number;
  test: number;
  changed: boolean;
};

export function composeEnemyCompare(
  all: readonly EnemyDef[],
  testOf: (d: EnemyDef) => EnemyDef,
  category: EnemyCategory,
  metric: EnemyMetricKey,
  query: string,
  sortDir: "asc" | "desc",
  nameOf: (d: EnemyDef) => string,
): {
  defs: EnemyDef[];
  rows: EnemyCompareRow[];
  order: EnemyKind[];
  domain: { min: number; max: number };
  ranksTest: Map<string, number>;
  ranksBase: Map<string, number>;
} {
  const defs = filterEnemies(all, category, query, nameOf);
  const rows: EnemyCompareRow[] = defs.map((d) => {
    const test = testOf(d);
    const base = enemyMetricValue(d, metric);
    const t = enemyMetricValue(test, metric);
    return { id: d.kind, name: nameOf(test), base, test: t, changed: Math.abs(base - t) > 1e-9 };
  });
  const ranksTest = rankByValue(
    rows.map((r) => ({ id: r.id, value: r.test })),
    enemyMetricLowerIsBetter(metric),
  );
  const ranksBase = rankByValue(
    rows.map((r) => ({ id: r.id, value: r.base })),
    enemyMetricLowerIsBetter(metric),
  );
  const sorted = [...rows].sort((a, b) => {
    const diff = sortDir === "asc" ? a.test - b.test : b.test - a.test;
    if (Math.abs(diff) < 1e-9) return a.id.localeCompare(b.id);
    return diff < 0 ? -1 : 1;
  });
  const values = rows.flatMap((r) => [r.base, r.test]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const domain =
    Math.abs(min - max) < 1e-9
      ? { min: min - (Math.abs(min) * 0.1 || 1), max: max + (Math.abs(max) * 0.1 || 1) }
      : { min, max };
  return { defs, rows, order: sorted.map((r) => r.id), domain, ranksTest, ranksBase };
}
