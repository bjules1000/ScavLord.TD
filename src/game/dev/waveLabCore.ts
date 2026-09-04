/**
 * DEV Wave Lab override layer.
 *
 * canonical EnemyDef / buildWave + DEV override = effective test definition.
 * Separate namespace from Balance Lab and Economy Lab.
 */

import { ENEMIES, buildWave, waveScale, type Wave, type WaveGroup, type WaveTuning } from "../data";
import {
  builtinBehaviorForKind,
  cloneBehavior,
  derivedBehaviorSummary,
  type EnemyBehaviorConfig,
} from "../enemyBehavior";
import { cloneHitZones, type EnemyHitZone } from "../enemyHitZones";
import { MAP_DEFS, type MapDef } from "../map";
import { mapLaneDefs } from "../lanes";
import type { EnemyDef, EnemyKind } from "../types";
import {
  cloneWaveGroups,
  compositionShares,
  spawnDurationMs,
  totalEnemyCount,
  scheduleWave,
  type WaveSpawnEvent,
} from "../waves";
import { DEV_TOOLS_ENABLED } from "./tools";
import { enemyDerived } from "./enemyMetrics";

export const WAVE_LAB_STORAGE_KEY = "scavlord.dev.waveLab.v1";
export const WAVE_CATALOG_MAX = 20;

/** Future Economy Lab drop-source ids. No drop tables are defined. */
export function enemyDropSourceId(kind: EnemyKind): string {
  return kind === "boss" || String(kind).startsWith("boss_") ? `boss:${kind}` : `enemy:${kind}`;
}

export type EnemyOverride = Partial<
  Pick<
    EnemyDef,
    | "name"
    | "hp"
    | "speed"
    | "bounty"
    | "armor"
    | "damage"
    | "fireRange"
    | "fireCooldown"
    | "towerDamage"
    | "size"
    | "hitZones"
    | "behavior"
    | "attackProfile"
    | "artProfile"
    | "disabled"
  >
>;

export type WaveOverride = {
  name?: string;
  groups?: WaveGroup[];
};

export type WaveLabOverrides = {
  enemies: Record<string, EnemyOverride>;
  customEnemies: Record<string, EnemyDef>;
  waves: Record<string, WaveOverride>;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type WaveLabView = "waves" | "enemies" | "bosses";

export type EnemyEditorField = {
  key: keyof EnemyOverride;
  label: string;
  step: number;
};

export function emptyWaveLabOverrides(): WaveLabOverrides {
  return { enemies: {}, customEnemies: {}, waves: {} };
}

function cloneWaveOverride(v: WaveOverride): WaveOverride {
  const next: WaveOverride = {};
  if (v.name !== undefined) next.name = v.name;
  if (v.groups) next.groups = cloneWaveGroups(v.groups);
  return next;
}

export function cloneEnemyDef(def: EnemyDef): EnemyDef {
  const next: EnemyDef = {
    kind: def.kind,
    name: def.name,
    hp: def.hp,
    speed: def.speed,
    bounty: def.bounty,
    armor: def.armor,
    damage: def.damage,
    fireRange: def.fireRange,
    fireCooldown: def.fireCooldown,
    towerDamage: def.towerDamage,
    body: def.body,
    gear: def.gear,
    size: def.size,
  };
  if (def.attackProfile !== undefined) next.attackProfile = def.attackProfile;
  if (def.artProfile !== undefined) next.artProfile = def.artProfile;
  if (def.hitZones) next.hitZones = cloneHitZones(def.hitZones);
  if (def.behavior) next.behavior = cloneBehavior(def.behavior);
  if (def.custom !== undefined) next.custom = def.custom;
  if (def.disabled !== undefined) next.disabled = def.disabled;
  return next;
}

function cloneEnemyOverride(v: EnemyOverride): EnemyOverride {
  const next: EnemyOverride = { ...v };
  delete next.hitZones;
  delete next.behavior;
  if (v.hitZones) next.hitZones = cloneHitZones(v.hitZones);
  if (v.behavior) next.behavior = cloneBehavior(v.behavior);
  return next;
}

function cloneOverrides(src: WaveLabOverrides): WaveLabOverrides {
  return {
    enemies: {
      ...Object.fromEntries(Object.entries(src.enemies ?? {}).map(([k, v]) => [k, cloneEnemyOverride(v)])),
    },
    customEnemies: {
      ...Object.fromEntries(
        Object.entries(src.customEnemies ?? {}).map(([k, v]) => [k, cloneEnemyDef(v)]),
      ),
    },
    waves: {
      ...Object.fromEntries(Object.entries(src.waves ?? {}).map(([k, v]) => [k, cloneWaveOverride(v)])),
    },
  };
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function pruneEmpty<T extends Record<string, unknown>>(rec: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, fields] of Object.entries(rec)) {
    const keys = Object.keys(fields).filter((k) => (fields as Record<string, unknown>)[k] !== undefined);
    if (keys.length > 0) out[id] = fields;
  }
  return out;
}

function safeScavClone(kind: EnemyKind): EnemyDef {
  const scav = ENEMIES.scav;
  const next = cloneEnemyDef(scav);
  next.kind = kind;
  next.name = String(kind);
  next.custom = true;
  next.behavior = builtinBehaviorForKind(kind);
  if (scav.hitZones) next.hitZones = cloneHitZones(scav.hitZones);
  return next;
}

export function pruneWaveLabOverrides(src: WaveLabOverrides): WaveLabOverrides {
  const waves: Record<string, WaveOverride> = {};
  for (const [id, w] of Object.entries(src.waves ?? {})) {
    const next: WaveOverride = {};
    if (typeof w.name === "string" && w.name.trim()) next.name = w.name;
    if (w.groups && w.groups.length >= 0) next.groups = cloneWaveGroups(w.groups);
    if (next.name || next.groups) waves[id] = next;
  }
  const customEnemies: Record<string, EnemyDef> = {};
  for (const [id, def] of Object.entries(src.customEnemies ?? {})) {
    if (def && typeof def === "object") customEnemies[id] = cloneEnemyDef({ ...def, kind: id, custom: true });
  }
  return {
    enemies: pruneEmpty(src.enemies ?? {}),
    customEnemies,
    waves,
  };
}

export function waveKey(mapId: string, wave: number): string {
  return `${mapId}:${wave}`;
}

export function parseWaveKey(key: string): { mapId: string; wave: number } | null {
  const idx = key.lastIndexOf(":");
  if (idx <= 0) return null;
  const mapId = key.slice(0, idx);
  const wave = Number(key.slice(idx + 1));
  if (!Number.isInteger(wave) || wave < 1) return null;
  return { mapId, wave };
}

export function isBossKind(kind: EnemyKind): boolean {
  return kind === "boss" || String(kind).startsWith("boss_");
}

export function canonicalEnemy(
  kind: EnemyKind,
  overrides: WaveLabOverrides = getWaveLabOverrides(),
): EnemyDef {
  const custom = overrides.customEnemies?.[kind];
  if (custom) return cloneEnemyDef(custom);
  const base = ENEMIES[kind];
  if (base) return base;
  return safeScavClone(kind);
}

export function listAllEnemyKinds(overrides: WaveLabOverrides = getWaveLabOverrides()): EnemyKind[] {
  const kinds = new Set<string>([...Object.keys(ENEMIES), ...Object.keys(overrides.customEnemies ?? {})]);
  return [...kinds];
}

export function enemyCatalog(
  bosses: boolean,
  overrides: WaveLabOverrides = getWaveLabOverrides(),
): EnemyDef[] {
  const byKind = new Map<string, EnemyDef>();
  for (const e of Object.values(ENEMIES)) byKind.set(e.kind, e);
  for (const e of Object.values(overrides.customEnemies ?? {})) byKind.set(e.kind, e);
  return [...byKind.values()].filter((e) => (bosses ? isBossKind(e.kind) : !isBossKind(e.kind)));
}

export function enemyEditorFields(): EnemyEditorField[] {
  return [
    { key: "hp", label: "HP", step: 1 },
    { key: "speed", label: "Speed", step: 1 },
    { key: "armor", label: "Armor (flat)", step: 1 },
    { key: "towerDamage", label: "Operator damage", step: 1 },
    { key: "fireRange", label: "Fire range", step: 1 },
    { key: "fireCooldown", label: "Fire cycle ms", step: 50 },
    { key: "damage", label: "Leak damage", step: 1 },
    { key: "bounty", label: "Bounty", step: 1 },
    { key: "size", label: "Size", step: 1 },
  ];
}

function resolveBaseEnemy(
  kind: EnemyKind,
  overrides: WaveLabOverrides,
  enabled: boolean,
): EnemyDef {
  if (enabled) {
    const custom = overrides.customEnemies?.[kind];
    if (custom) return cloneEnemyDef(custom);
  }
  const base = ENEMIES[kind];
  if (base) return base;
  return safeScavClone(kind);
}

export function effectiveEnemy(
  kind: EnemyKind,
  overrides: WaveLabOverrides = getWaveLabOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): EnemyDef {
  const base = resolveBaseEnemy(kind, overrides, enabled);
  if (!enabled) {
    const out = cloneEnemyDef(base);
    out.behavior = base.behavior ?? builtinBehaviorForKind(kind);
    return out;
  }
  const over = overrides.enemies?.[kind];
  const merged = cloneEnemyDef(over && Object.keys(over).length > 0 ? { ...base, ...over } : base);
  merged.behavior = over?.behavior ?? base.behavior ?? builtinBehaviorForKind(kind);
  if (over?.hitZones) merged.hitZones = cloneHitZones(over.hitZones);
  else if (base.hitZones) merged.hitZones = cloneHitZones(base.hitZones);
  else delete merged.hitZones;
  if (over?.attackProfile !== undefined) merged.attackProfile = over.attackProfile;
  if (over?.artProfile !== undefined) merged.artProfile = over.artProfile;
  if (over?.disabled !== undefined) merged.disabled = over.disabled;
  return merged;
}

export function enemyBehaviorShortLabel(cfg: EnemyBehaviorConfig | undefined): string {
  const b = cfg ?? builtinBehaviorForKind("scav");
  if (!b.canShoot) return "Unarmed";
  if (b.engagedSpeedMult < 0.5) return "Engage/Slow";
  if (b.fireWhileMoving) return "Moving fire";
  return "Engage";
}

export function mapWaveTuning(map: MapDef): WaveTuning {
  return map.waveMods ?? { countMult: 1, heavyDelay: 0 };
}

export function canonicalWave(map: MapDef, n: number): Wave {
  return buildWave(n, map.waveMods);
}

export function effectiveWave(
  map: MapDef,
  n: number,
  overrides: WaveLabOverrides = getWaveLabOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): Wave {
  const base = canonicalWave(map, n);
  if (!enabled) return base;
  const over = overrides.waves[waveKey(map.id, n)];
  if (!over) return base;
  return {
    name: over.name ?? base.name,
    groups: over.groups ? cloneWaveGroups(over.groups) : cloneWaveGroups(base.groups),
  };
}

export function setEnemyField(
  src: WaveLabOverrides,
  kind: EnemyKind,
  key: keyof EnemyOverride,
  value: number | string | boolean | undefined,
  canonical: number | string | boolean,
): WaveLabOverrides {
  const next = cloneOverrides(src);
  const cur = { ...(next.enemies[kind] ?? {}) } as Record<string, unknown>;
  if (typeof value === "boolean") {
    if (value === canonical) delete cur[key];
    else cur[key] = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === canonical) delete cur[key];
    else cur[key] = trimmed;
  } else if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return pruneWaveLabOverrides(src);
  } else if (typeof canonical === "number" && nearlyEqual(value, canonical)) {
    delete cur[key];
  } else {
    cur[key] = value;
  }
  if (Object.keys(cur).length === 0) delete next.enemies[kind];
  else next.enemies[kind] = cur as EnemyOverride;
  return pruneWaveLabOverrides(next);
}

export function setEnemyHitZones(
  src: WaveLabOverrides,
  kind: EnemyKind,
  zones: EnemyHitZone[],
): WaveLabOverrides {
  const next = cloneOverrides(src);
  const cur = { ...(next.enemies[kind] ?? {}) };
  cur.hitZones = cloneHitZones(zones);
  next.enemies[kind] = cur;
  return pruneWaveLabOverrides(next);
}

export function setEnemyBehavior(
  src: WaveLabOverrides,
  kind: EnemyKind,
  behavior: EnemyBehaviorConfig,
): WaveLabOverrides {
  const next = cloneOverrides(src);
  const cur = { ...(next.enemies[kind] ?? {}) };
  cur.behavior = cloneBehavior(behavior);
  next.enemies[kind] = cur;
  return pruneWaveLabOverrides(next);
}

export function setEnemyAttackProfile(
  src: WaveLabOverrides,
  kind: EnemyKind,
  profile: EnemyDef["attackProfile"],
): WaveLabOverrides {
  const next = cloneOverrides(src);
  const base = resolveBaseEnemy(kind, src, true);
  const cur = { ...(next.enemies[kind] ?? {}) };
  if (profile === undefined || profile === base.attackProfile) delete cur.attackProfile;
  else cur.attackProfile = profile;
  if (Object.keys(cur).length === 0) delete next.enemies[kind];
  else next.enemies[kind] = cur;
  return pruneWaveLabOverrides(next);
}

export function setEnemyArtProfile(
  src: WaveLabOverrides,
  kind: EnemyKind,
  profile: EnemyDef["artProfile"],
): WaveLabOverrides {
  const next = cloneOverrides(src);
  const base = resolveBaseEnemy(kind, src, true);
  const cur = { ...(next.enemies[kind] ?? {}) };
  if (profile === undefined || profile === base.artProfile) delete cur.artProfile;
  else cur.artProfile = profile;
  if (Object.keys(cur).length === 0) delete next.enemies[kind];
  else next.enemies[kind] = cur;
  return pruneWaveLabOverrides(next);
}

function nextCustomEnemyId(sourceKind: string, taken: Set<string>): string {
  let n = 1;
  let id = `${sourceKind}_copy_${n}`;
  while (taken.has(id)) {
    n += 1;
    id = `${sourceKind}_copy_${n}`;
  }
  return id;
}

export function duplicateEnemy(
  src: WaveLabOverrides,
  sourceKind: EnemyKind,
): { overrides: WaveLabOverrides; kind: string } {
  const live = effectiveEnemy(sourceKind, src, true);
  const taken = new Set(listAllEnemyKinds(src).map(String));
  const kind = nextCustomEnemyId(String(sourceKind), taken);
  const next = cloneOverrides(src);
  const def = cloneEnemyDef(live);
  def.kind = kind;
  def.name = `${live.name} Copy`;
  def.custom = true;
  if (!def.behavior) def.behavior = cloneBehavior(builtinBehaviorForKind(sourceKind));
  next.customEnemies[kind] = def;
  return { overrides: pruneWaveLabOverrides(next), kind };
}

export function createBlankEnemy(src: WaveLabOverrides): { overrides: WaveLabOverrides; kind: string } {
  const taken = new Set(listAllEnemyKinds(src).map(String));
  const kind = nextCustomEnemyId("custom", taken);
  const scav = ENEMIES.scav;
  const next = cloneOverrides(src);
  const def = cloneEnemyDef(scav);
  def.kind = kind;
  def.name = "New Enemy";
  def.custom = true;
  def.behavior = builtinBehaviorForKind("scav");
  next.customEnemies[kind] = def;
  return { overrides: pruneWaveLabOverrides(next), kind };
}

export function deleteCustomEnemy(src: WaveLabOverrides, kind: EnemyKind): WaveLabOverrides {
  const next = cloneOverrides(src);
  if (!next.customEnemies[kind]) return src;
  delete next.customEnemies[kind];
  delete next.enemies[kind];
  return pruneWaveLabOverrides(next);
}

export function setWaveGroups(src: WaveLabOverrides, mapId: string, wave: number, groups: WaveGroup[]): WaveLabOverrides {
  const next = cloneOverrides(src);
  const key = waveKey(mapId, wave);
  const cur = { ...(next.waves[key] ?? {}) };
  cur.groups = cloneWaveGroups(groups);
  next.waves[key] = cur;
  return pruneWaveLabOverrides(next);
}

export function setWaveName(src: WaveLabOverrides, mapId: string, wave: number, name: string, canonical: string): WaveLabOverrides {
  const next = cloneOverrides(src);
  const key = waveKey(mapId, wave);
  const cur = { ...(next.waves[key] ?? {}) };
  if (!name.trim() || name === canonical) delete cur.name;
  else cur.name = name;
  if (!cur.name && !cur.groups) delete next.waves[key];
  else next.waves[key] = cur;
  return pruneWaveLabOverrides(next);
}

export function addWaveGroup(src: WaveLabOverrides, map: MapDef, wave: number, kind: EnemyKind = "scav"): WaveLabOverrides {
  const live = effectiveWave(map, wave, src, true);
  return setWaveGroups(src, map.id, wave, [...live.groups, { kind, count: 1, gap: 500 }]);
}

export function removeWaveGroup(src: WaveLabOverrides, map: MapDef, wave: number, index: number): WaveLabOverrides {
  const live = effectiveWave(map, wave, src, true);
  return setWaveGroups(
    src,
    map.id,
    wave,
    live.groups.filter((_, i) => i !== index),
  );
}

export function updateWaveGroup(
  src: WaveLabOverrides,
  map: MapDef,
  wave: number,
  index: number,
  patch: Partial<WaveGroup>,
): WaveLabOverrides {
  const live = effectiveWave(map, wave, src, true);
  const groups = cloneWaveGroups(live.groups);
  const cur = groups[index];
  if (!cur) return src;
  if (patch.count != null && (!Number.isFinite(patch.count) || patch.count < 0)) return src;
  if (patch.gap != null && (!Number.isFinite(patch.gap) || patch.gap < 0)) return src;
  groups[index] = { ...cur, ...patch };
  return setWaveGroups(src, map.id, wave, groups);
}

export function resetEnemyItem(src: WaveLabOverrides, kind: EnemyKind): WaveLabOverrides {
  const next = cloneOverrides(src);
  delete next.enemies[kind];
  return pruneWaveLabOverrides(next);
}

export function resetWaveItem(src: WaveLabOverrides, mapId: string, wave: number): WaveLabOverrides {
  const next = cloneOverrides(src);
  delete next.waves[waveKey(mapId, wave)];
  return pruneWaveLabOverrides(next);
}

export function modifiedWaveLabCount(overrides: WaveLabOverrides): number {
  const clean = pruneWaveLabOverrides(overrides);
  return (
    Object.keys(clean.enemies).length +
    Object.keys(clean.customEnemies).length +
    Object.keys(clean.waves).length
  );
}

export function enemyOverrideCount(overrides: WaveLabOverrides, kind: EnemyKind): number {
  const bag = overrides.enemies[kind];
  const custom = overrides.customEnemies?.[kind] ? 1 : 0;
  return (bag ? Object.keys(bag).length : 0) + custom;
}

export function waveOverrideCount(overrides: WaveLabOverrides, mapId: string, wave: number): number {
  const bag = overrides.waves[waveKey(mapId, wave)];
  if (!bag) return 0;
  return (bag.name ? 1 : 0) + (bag.groups ? 1 : 0);
}

export function waveLabOverridesEqual(a: WaveLabOverrides, b: WaveLabOverrides): boolean {
  return JSON.stringify(pruneWaveLabOverrides(a)) === JSON.stringify(pruneWaveLabOverrides(b));
}

export type ScaledWaveTotals = {
  count: number;
  hp: number;
  bounty: number;
  spawnDurationMs: number;
  ehpVs10: number;
  shares: { kind: EnemyKind; count: number; share: number }[];
};

export function waveTotals(
  map: MapDef,
  n: number,
  overrides: WaveLabOverrides,
  enabled: boolean,
): ScaledWaveTotals {
  const wave = effectiveWave(map, n, overrides, enabled);
  const scale = waveScale(n);
  let hp = 0;
  let bounty = 0;
  let ehpVs10 = 0;
  for (const g of wave.groups) {
    const def = effectiveEnemy(g.kind, overrides, enabled);
    const count = Math.max(0, Math.round(g.count));
    const scaledHp = Math.round(def.hp * scale.hp * map.hpMult);
    hp += scaledHp * count;
    bounty += def.bounty * count;
    ehpVs10 += enemyDerived({ ...def, hp: scaledHp }).ehpVs10 * count;
  }
  return {
    count: totalEnemyCount(wave.groups),
    hp,
    bounty,
    spawnDurationMs: spawnDurationMs(wave.groups),
    ehpVs10,
    shares: compositionShares(wave.groups),
  };
}

export function mapLaneSummary(map: MapDef): { id: string; count: number; rule: string } {
  const lanes = mapLaneDefs(map);
  return {
    id: map.id,
    count: lanes.length,
    rule:
      lanes.length <= 1
        ? `Single lane ${lanes[0]?.id ?? "MAIN"}`
        : `Round-robin across ${lanes.map((l) => l.id).join(", ")} (assignSpawnLane)`,
  };
}

export type TestWaveResult =
  | { ok: true; wave: number; name: string; events: WaveSpawnEvent[]; laneCount: number }
  | { ok: false; reason: "DEV TOOLS DISABLED" | "NOT_IN_RAID" | "UNKNOWN_MAP" };

export function requestTestWave(
  enabled: boolean,
  inRaid: boolean,
  mapId: string,
  wave: number,
  overrides: WaveLabOverrides = getWaveLabOverrides(),
): TestWaveResult {
  if (!enabled) return { ok: false, reason: "DEV TOOLS DISABLED" };
  if (!inRaid) return { ok: false, reason: "NOT_IN_RAID" };
  const map = MAP_DEFS.find((m) => m.id === mapId);
  if (!map) return { ok: false, reason: "UNKNOWN_MAP" };
  const live = effectiveWave(map, wave, overrides, true);
  const laneCount = mapLaneDefs(map).length;
  return {
    ok: true,
    wave,
    name: live.name,
    events: scheduleWave(live.groups, laneCount),
    laneCount,
  };
}

export type WavePatchLine = { scope: string; field: string; from: string | number; to: string | number };

function summarizeHitZones(zones: EnemyHitZone[] | undefined): string {
  if (!zones || zones.length === 0) return "(fallback body)";
  return zones
    .filter((z) => z.enabled)
    .map((z) => `${z.displayName}:${z.shape}×${z.damageMult}@(${z.x.toFixed(2)},${z.y.toFixed(2)})`)
    .join(", ");
}

function summarizeBehavior(cfg: EnemyBehaviorConfig | undefined, kind: string): string {
  const b = cfg ?? builtinBehaviorForKind(kind);
  return derivedBehaviorSummary(b).slice(0, 2).join(" · ");
}

export function waveLabPatchLines(overrides: WaveLabOverrides): WavePatchLine[] {
  const clean = pruneWaveLabOverrides(overrides);
  const lines: WavePatchLine[] = [];

  for (const [kind, def] of Object.entries(clean.customEnemies)) {
    lines.push({
      scope: def.name.toUpperCase(),
      field: "customEnemy",
      from: "(none)",
      to: kind,
    });
    if (def.hitZones) {
      lines.push({
        scope: def.name.toUpperCase(),
        field: "hitZones",
        from: "(builtin)",
        to: summarizeHitZones(def.hitZones),
      });
    }
    if (def.behavior) {
      lines.push({
        scope: def.name.toUpperCase(),
        field: "behavior",
        from: "(builtin)",
        to: summarizeBehavior(def.behavior, kind),
      });
    }
  }

  for (const [kind, fields] of Object.entries(clean.enemies)) {
    const base = resolveBaseEnemy(kind, clean, true);
    const scope = overrideName(fields, base);
    for (const [field, to] of Object.entries(fields)) {
      if (field === "hitZones") {
        lines.push({
          scope,
          field: "hitZones",
          from: summarizeHitZones(base.hitZones),
          to: summarizeHitZones(to as EnemyHitZone[]),
        });
        continue;
      }
      if (field === "behavior") {
        lines.push({
          scope,
          field: "behavior",
          from: summarizeBehavior(base.behavior, kind),
          to: summarizeBehavior(to as EnemyBehaviorConfig, kind),
        });
        continue;
      }
      const from = base[field as keyof EnemyDef];
      if (typeof to === "string" && typeof from === "string" && to !== from) {
        lines.push({ scope, field, from, to });
      } else if (typeof to === "number" && typeof from === "number" && !nearlyEqual(from, to)) {
        lines.push({ scope, field, from, to });
      } else if (typeof to === "boolean" && typeof from === "boolean" && to !== from) {
        lines.push({ scope, field, from: String(from), to: String(to) });
      } else if (typeof to === "string" && (field === "attackProfile" || field === "artProfile")) {
        lines.push({ scope, field, from: String(from ?? "(default)"), to });
      }
    }
  }
  for (const [key, over] of Object.entries(clean.waves)) {
    const parsed = parseWaveKey(key);
    if (!parsed) continue;
    const map = MAP_DEFS.find((m) => m.id === parsed.mapId);
    if (!map) continue;
    const base = canonicalWave(map, parsed.wave);
    const scope = `${map.name} / WAVE ${parsed.wave}`;
    if (over.name && over.name !== base.name) {
      lines.push({ scope, field: "name", from: base.name, to: over.name });
    }
    if (over.groups) {
      over.groups.forEach((g, i) => {
        const bg = base.groups[i];
        if (!bg) {
          lines.push({ scope, field: `groups[${i}].kind`, from: "(none)", to: g.kind });
          lines.push({ scope, field: `groups[${i}].count`, from: 0, to: g.count });
          lines.push({ scope, field: `${g.kind}.count`, from: 0, to: g.count });
          return;
        }
        if (bg.kind !== g.kind) lines.push({ scope, field: `groups[${i}].kind`, from: bg.kind, to: g.kind });
        if (bg.count !== g.count) {
          lines.push({ scope, field: `${g.kind}.count`, from: bg.count, to: g.count });
        }
        if (bg.gap !== g.gap) lines.push({ scope, field: `groups[${i}].gap`, from: bg.gap, to: g.gap });
      });
      if (over.groups.length < base.groups.length) {
        lines.push({
          scope,
          field: "groups.length",
          from: base.groups.length,
          to: over.groups.length,
        });
      }
    }
  }
  return lines;
}

function overrideName(fields: EnemyOverride, base: EnemyDef): string {
  return (typeof fields.name === "string" ? fields.name : base.name).toUpperCase();
}

export function formatWaveLabPatch(overrides: WaveLabOverrides): string {
  const lines = waveLabPatchLines(overrides);
  if (lines.length === 0) return "WAVE LAB PATCH\n\n(no changes)\n";
  const groups = new Map<string, WavePatchLine[]>();
  for (const line of lines) {
    const list = groups.get(line.scope) ?? [];
    list.push(line);
    groups.set(line.scope, list);
  }
  const parts = ["WAVE LAB PATCH", ""];
  for (const [scope, group] of groups) {
    parts.push(scope);
    for (const line of group) parts.push(`${line.field}: ${line.from} -> ${line.to}`);
    parts.push("");
  }
  return parts.join("\n").trim() + "\n";
}

export function parseStoredWaveLab(raw: string | null): WaveLabOverrides {
  if (!raw) return emptyWaveLabOverrides();
  try {
    const parsed = JSON.parse(raw) as Partial<WaveLabOverrides>;
    return pruneWaveLabOverrides({
      enemies: parsed.enemies && typeof parsed.enemies === "object" ? parsed.enemies : {},
      customEnemies:
        parsed.customEnemies && typeof parsed.customEnemies === "object" ? parsed.customEnemies : {},
      waves: parsed.waves && typeof parsed.waves === "object" ? parsed.waves : {},
    });
  } catch {
    return emptyWaveLabOverrides();
  }
}

export function loadWaveLabOverrides(enabled: boolean, storage: StorageLike | null): WaveLabOverrides {
  if (!enabled || !storage) return emptyWaveLabOverrides();
  return parseStoredWaveLab(storage.getItem(WAVE_LAB_STORAGE_KEY));
}

export function saveWaveLabOverrides(overrides: WaveLabOverrides, enabled: boolean, storage: StorageLike | null): void {
  if (!storage) return;
  if (!enabled) {
    storage.removeItem(WAVE_LAB_STORAGE_KEY);
    return;
  }
  storage.setItem(WAVE_LAB_STORAGE_KEY, JSON.stringify(pruneWaveLabOverrides(overrides)));
}

let applied: WaveLabOverrides = emptyWaveLabOverrides();
const listeners = new Set<() => void>();

function memoryStorage(): StorageLike | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function getWaveLabOverrides(): WaveLabOverrides {
  return applied;
}

export function hydrateWaveLabOverrides(enabled: boolean, storage: StorageLike | null = memoryStorage()): void {
  applied = enabled ? loadWaveLabOverrides(true, storage) : emptyWaveLabOverrides();
  for (const fn of listeners) fn();
}

export function applyWaveLabOverrides(
  next: WaveLabOverrides,
  enabled: boolean,
  storage: StorageLike | null = memoryStorage(),
): WaveLabOverrides {
  applied = pruneWaveLabOverrides(cloneOverrides(next));
  saveWaveLabOverrides(applied, enabled, storage);
  for (const fn of listeners) fn();
  return applied;
}

export function subscribeWaveLab(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (DEV_TOOLS_ENABLED) {
  hydrateWaveLabOverrides(true);
}
