import { beforeEach, describe, expect, it } from "bun:test";
import { ENEMIES, waveScale } from "../data";
import { defaultHitZones } from "../enemyHitZones";
import { MAP_BY_ID, MAP_DEFS } from "../map";
import { spawnedEnemyHp, spawnDurationMs, totalEnemyCount } from "../waves";
import { BALANCE_STORAGE_KEY, applyBalanceOverrides, emptyBalanceOverrides } from "./balance";
import {
  ECONOMY_STORAGE_KEY,
  applyEconomyOverrides,
  emptyEconomyOverrides,
} from "./economy";
import {
  WAVE_CATALOG_MAX,
  WAVE_LAB_STORAGE_KEY,
  addWaveGroup,
  applyWaveLabOverrides,
  canonicalEnemy,
  canonicalWave,
  duplicateEnemy,
  effectiveEnemy,
  effectiveWave,
  emptyWaveLabOverrides,
  enemyCatalog,
  enemyDropSourceId,
  enemyEditorFields,
  formatWaveLabPatch,
  getWaveLabOverrides,
  hydrateWaveLabOverrides,
  loadWaveLabOverrides,
  mapLaneSummary,
  removeWaveGroup,
  requestTestWave,
  resetEnemyItem,
  resetWaveItem,
  setEnemyBehavior,
  setEnemyField,
  setEnemyHitZones,
  setWaveGroups,
  updateWaveGroup,
  waveLabPatchLines,
  waveTotals,
  type StorageLike,
  type WaveLabOverrides,
} from "./waveLabCore";

function memStore(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const woods = MAP_BY_ID["woods"]!;
const factory = MAP_BY_ID["factory"]!;
const kolkhoz = MAP_BY_ID["kolkhoz"]!;

beforeEach(() => {
  applyWaveLabOverrides(emptyWaveLabOverrides(), false, null);
  applyBalanceOverrides(emptyBalanceOverrides(), false, null);
  applyEconomyOverrides(emptyEconomyOverrides(), false, null);
});

describe("Wave Lab enemies", () => {
  it("canonical enemies populate lab", () => {
    expect(enemyCatalog(false).map((e) => e.kind)).toEqual(["scav", "sniperScav", "raider", "pmc"]);
    expect(enemyCatalog(true).map((e) => e.kind)).toEqual(["boss"]);
    expect(canonicalEnemy("boss").name).toBe("Enforcer");
  });

  it("only real stats exposed", () => {
    expect(enemyEditorFields().map((f) => f.key)).toEqual([
      "hp",
      "speed",
      "armor",
      "towerDamage",
      "fireRange",
      "fireCooldown",
      "damage",
      "bounty",
      "size",
    ]);
    const keys = enemyEditorFields().map((f) => f.key as string);
    expect(keys).not.toContain("body");
    expect(keys).not.toContain("gear");
    expect(keys).not.toContain("kind");
  });

  it("enemy draft updates effective test definition", () => {
    const draft = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 85, ENEMIES.scav.hp);
    expect(effectiveEnemy("scav", draft, true).hp).toBe(85);
    expect(effectiveEnemy("scav", draft, true).speed).toBe(ENEMIES.scav.speed);
  });

  it("canonical definition remains unchanged", () => {
    const before = { ...ENEMIES.scav };
    setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 85, ENEMIES.scav.hp);
    expect(ENEMIES.scav).toEqual(before);
  });

  it("APPLY affects newly spawned enemy", () => {
    const draft = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 100, ENEMIES.scav.hp);
    applyWaveLabOverrides(draft, true, memStore());
    const live = effectiveEnemy("scav", getWaveLabOverrides(), true);
    const hp = spawnedEnemyHp(live.hp, 1, woods.hpMult);
    expect(hp).toBe(Math.round(100 * waveScale(1).hp * woods.hpMult));
    expect(hp).not.toBe(spawnedEnemyHp(ENEMIES.scav.hp, 1, woods.hpMult));
  });

  it("existing enemy instance does not magically heal from HP increase", () => {
    const instance = { kind: "scav" as const, hp: 20, maxHp: spawnedEnemyHp(ENEMIES.scav.hp, 1, woods.hpMult) };
    const draft = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 150, ENEMIES.scav.hp);
    applyWaveLabOverrides(draft, true, memStore());
    expect(instance.hp).toBe(20);
    expect(instance.maxHp).toBe(spawnedEnemyHp(ENEMIES.scav.hp, 1, woods.hpMult));
    expect(effectiveEnemy("scav", getWaveLabOverrides(), true).hp).toBe(150);
  });

  it("RESET ITEM restores canonical", () => {
    let over = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 85, ENEMIES.scav.hp);
    over = setEnemyField(over, "pmc", "armor", 20, ENEMIES.pmc.armor);
    over = resetEnemyItem(over, "scav");
    expect(effectiveEnemy("scav", over, true).hp).toBe(ENEMIES.scav.hp);
    expect(effectiveEnemy("pmc", over, true).armor).toBe(20);
  });

  it("RESET ALL restores enemies", () => {
    const over = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 85, ENEMIES.scav.hp);
    expect(effectiveEnemy("scav", emptyWaveLabOverrides(), true).hp).toBe(ENEMIES.scav.hp);
    expect(Object.keys(over.enemies)).toEqual(["scav"]);
    applyWaveLabOverrides(emptyWaveLabOverrides(), true, memStore());
    expect(effectiveEnemy("scav", getWaveLabOverrides(), true).hp).toBe(ENEMIES.scav.hp);
  });

  it("applied override persists when DEV enabled", () => {
    const store = memStore();
    const over = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 85, ENEMIES.scav.hp);
    applyWaveLabOverrides(over, true, store);
    expect(store.getItem(WAVE_LAB_STORAGE_KEY)).toContain("85");
    hydrateWaveLabOverrides(true, store);
    expect(getWaveLabOverrides().enemies["scav"]?.hp).toBe(85);
    expect(loadWaveLabOverrides(true, store).enemies["scav"]?.hp).toBe(85);
  });

  it("override ignored when DEV disabled", () => {
    const over = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 85, ENEMIES.scav.hp);
    expect(effectiveEnemy("scav", over, false).hp).toBe(ENEMIES.scav.hp);
    expect(effectiveWave(woods, 3, over, false).groups).toEqual(canonicalWave(woods, 3).groups);
    const store = memStore({ [WAVE_LAB_STORAGE_KEY]: JSON.stringify(over) });
    expect(loadWaveLabOverrides(false, store)).toEqual(emptyWaveLabOverrides());
  });

  it("duplicate creates new id and copies hitZones/behavior", () => {
    const src = emptyWaveLabOverrides();
    const { overrides, kind } = duplicateEnemy(src, "raider");
    expect(kind).toBe("raider_copy_1");
    expect(kind).not.toBe("raider");
    const live = effectiveEnemy(kind, overrides, true);
    const base = effectiveEnemy("raider", src, true);
    expect(live.custom).toBe(true);
    expect(live.hitZones).toEqual(base.hitZones);
    expect(live.behavior).toEqual(base.behavior);
    expect(overrides.customEnemies[kind]?.kind).toBe(kind);
  });

  it("rename displayName keeps id", () => {
    const { overrides, kind } = duplicateEnemy(emptyWaveLabOverrides(), "scav");
    const renamed = setEnemyField(overrides, kind, "name", "Renamed Scav", overrides.customEnemies[kind]!.name);
    expect(effectiveEnemy(kind, renamed, true).name).toBe("Renamed Scav");
    expect(effectiveEnemy(kind, renamed, true).kind).toBe(kind);
    expect(Object.keys(renamed.customEnemies)).toEqual([kind]);
  });

  it("hit zone shape persists and reset restores base shape/geometry", () => {
    const baseZones = defaultHitZones();
    const headAsRect = baseZones.map((z) =>
      z.id === "head" ? { ...z, shape: "rect" as const, x: 0.1, damageMult: 2 } : z,
    );
    let over = setEnemyHitZones(emptyWaveLabOverrides(), "raider", headAsRect);
    const live = effectiveEnemy("raider", over, true);
    expect(live.hitZones!.find((z) => z.id === "head")!.shape).toBe("rect");
    expect(live.hitZones!.find((z) => z.id === "head")!.x).toBe(0.1);
    const patch = formatWaveLabPatch(over);
    expect(patch).toContain("ellipse");
    expect(patch).toContain("rect");
    expect(patch).toMatch(/HEAD:rect/);
    over = resetEnemyItem(over, "raider");
    const restored = effectiveEnemy("raider", over, true);
    expect(restored.hitZones!.find((z) => z.id === "head")!.shape).toBe("ellipse");
    expect(restored.hitZones!.find((z) => z.id === "head")!.damageMult).toBe(1.75);
  });

  it("canShoot false does not erase behavior LOS fields in overrides", () => {
    const base = effectiveEnemy("raider", emptyWaveLabOverrides(), true).behavior!;
    const over = setEnemyBehavior(emptyWaveLabOverrides(), "raider", {
      ...base,
      canShoot: false,
      requireLosToShoot: true,
      sightRange: 99,
      targetMemoryMs: 2222,
    });
    const live = effectiveEnemy("raider", over, true).behavior!;
    expect(live.canShoot).toBe(false);
    expect(live.requireLosToShoot).toBe(true);
    expect(live.sightRange).toBe(99);
    expect(live.targetMemoryMs).toBe(2222);
  });
});

describe("Wave Lab waves", () => {
  it("canonical maps/waves populate WAVES view", () => {
    expect(MAP_DEFS.map((m) => m.id)).toEqual(["woods", "kolkhoz", "factory"]);
    expect(WAVE_CATALOG_MAX).toBe(20);
    expect(canonicalWave(woods, 3).groups.length).toBeGreaterThan(0);
    expect(canonicalWave(woods, 10).groups.some((g) => g.kind === "boss")).toBe(true);
  });

  it("selected wave exposes actual composition", () => {
    const w = canonicalWave(woods, 3);
    expect(w.groups.map((g) => g.kind)).toEqual(["scav"]);
    expect(w.groups[0]!.count).toBeGreaterThan(0);
  });

  it("total enemy count is correct", () => {
    const w = canonicalWave(woods, 3);
    expect(waveTotals(woods, 3, emptyWaveLabOverrides(), true).count).toBe(totalEnemyCount(w.groups));
  });

  it("total HP is correct", () => {
    const w = canonicalWave(woods, 3);
    const scale = waveScale(3);
    let hp = 0;
    for (const g of w.groups) {
      hp += Math.round(ENEMIES[g.kind]!.hp * scale.hp * woods.hpMult) * g.count;
    }
    expect(waveTotals(woods, 3, emptyWaveLabOverrides(), true).hp).toBe(hp);
  });

  it("total bounty is correct", () => {
    const w = canonicalWave(woods, 3);
    const bounty = w.groups.reduce((a, g) => a + ENEMIES[g.kind]!.bounty * g.count, 0);
    expect(waveTotals(woods, 3, emptyWaveLabOverrides(), true).bounty).toBe(bounty);
  });

  it("spawn duration is correct", () => {
    const w = canonicalWave(woods, 3);
    expect(waveTotals(woods, 3, emptyWaveLabOverrides(), true).spawnDurationMs).toBe(spawnDurationMs(w.groups));
  });

  it("changing enemy count updates totals", () => {
    const base = waveTotals(woods, 3, emptyWaveLabOverrides(), true);
    const draft = updateWaveGroup(emptyWaveLabOverrides(), woods, 3, 0, { count: base.count + 5 });
    const next = waveTotals(woods, 3, draft, true);
    expect(next.count).toBe(base.count + 5);
    expect(next.hp).toBeGreaterThan(base.hp);
    expect(next.bounty).toBeGreaterThan(base.bounty);
  });

  it("changing enemy HP updates wave total HP", () => {
    const base = waveTotals(woods, 3, emptyWaveLabOverrides(), true);
    const draft = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", ENEMIES.scav.hp * 2, ENEMIES.scav.hp);
    const next = waveTotals(woods, 3, draft, true);
    expect(next.hp).toBeGreaterThan(base.hp);
    expect(next.count).toBe(base.count);
  });

  it("ADD ENEMY works if implemented", () => {
    const draft = addWaveGroup(emptyWaveLabOverrides(), woods, 3, "raider");
    const live = effectiveWave(woods, 3, draft, true);
    expect(live.groups[live.groups.length - 1]).toEqual({ kind: "raider", count: 1, gap: 500 });
  });

  it("REMOVE works if implemented", () => {
    let draft = addWaveGroup(emptyWaveLabOverrides(), woods, 3, "raider");
    draft = removeWaveGroup(draft, woods, 3, 1);
    expect(effectiveWave(woods, 3, draft, true).groups.map((g) => g.kind)).toEqual(
      canonicalWave(woods, 3).groups.map((g) => g.kind),
    );
  });

  it("RESET WAVE restores canonical composition", () => {
    let draft = updateWaveGroup(emptyWaveLabOverrides(), woods, 3, 0, { count: 99 });
    draft = resetWaveItem(draft, woods.id, 3);
    expect(effectiveWave(woods, 3, draft, true).groups).toEqual(canonicalWave(woods, 3).groups);
  });

  it("map filtering is correct", () => {
    const pine = canonicalWave(woods, 1);
    const works = canonicalWave(factory, 1);
    expect(totalEnemyCount(pine.groups)).toBeLessThan(totalEnemyCount(works.groups));
    expect(waveTotals(woods, 4, emptyWaveLabOverrides(), true).count).not.toBe(
      waveTotals(factory, 4, emptyWaveLabOverrides(), true).count,
    );
  });

  it("lane data follows canonical wave/map rules", () => {
    expect(mapLaneSummary(woods).count).toBe(1);
    expect(mapLaneSummary(woods).rule).toContain("Single lane");
    expect(mapLaneSummary(kolkhoz).count).toBeGreaterThan(1);
    expect(mapLaneSummary(kolkhoz).rule).toContain("Round-robin");
  });
});

describe("TEST WAVE", () => {
  it("selected DEV wave can be requested for testing", () => {
    const r = requestTestWave(true, true, "woods", 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wave).toBe(4);
    expect(r.events.length).toBe(totalEnemyCount(canonicalWave(woods, 4).groups));
    expect(r.events[0]!.at).toBeGreaterThan(0);
  });

  it("test wave uses effective enemy definitions", () => {
    const draft = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 200, ENEMIES.scav.hp);
    const r = requestTestWave(true, true, "woods", 3, draft);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.every((e) => e.kind === "scav" || effectiveEnemy(e.kind, draft, true).hp === ENEMIES[e.kind]!.hp)).toBe(
      true,
    );
    expect(effectiveEnemy("scav", draft, true).hp).toBe(200);
    expect(spawnedEnemyHp(effectiveEnemy("scav", draft, true).hp, 3, woods.hpMult)).toBe(
      Math.round(200 * waveScale(3).hp * woods.hpMult),
    );
  });

  it("test wave uses effective wave composition", () => {
    const draft = setWaveGroups(emptyWaveLabOverrides(), woods.id, 4, [{ kind: "pmc", count: 3, gap: 100 }]);
    const r = requestTestWave(true, true, "woods", 4, draft);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.map((e) => e.kind)).toEqual(["pmc", "pmc", "pmc"]);
  });

  it("already-spawned enemy instances are not duplicated", () => {
    const live = [{ id: 1, kind: "scav" as const }];
    const r = requestTestWave(true, true, "woods", 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.some((e) => "id" in e)).toBe(false);
    expect(live).toEqual([{ id: 1, kind: "scav" }]);
    expect(r.events.length).toBe(totalEnemyCount(canonicalWave(woods, 3).groups));
  });

  it("test-wave action does not alter persistent progression", () => {
    const meta = { claimed: ["w_pm"], pmc: { level: 2 } };
    const snapshot = structuredClone(meta);
    requestTestWave(true, true, "woods", 12);
    expect(meta).toEqual(snapshot);
  });

  it("normal wave flow remains unchanged without TEST WAVE", () => {
    const prepWave = 2;
    const next = prepWave + 1;
    expect(canonicalWave(woods, next).name).toBe(canonicalWave(woods, 3).name);
    const r = requestTestWave(true, true, "woods", 7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wave).toBe(7);
  });

  it("DEV-off cannot access test-wave action", () => {
    expect(requestTestWave(false, true, "woods", 3)).toEqual({ ok: false, reason: "DEV TOOLS DISABLED" });
    expect(requestTestWave(true, false, "woods", 3)).toEqual({ ok: false, reason: "NOT_IN_RAID" });
  });
});

describe("Wave Lab patch and persistence", () => {
  it("export includes only modified enemy fields", () => {
    const over = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 85, ENEMIES.scav.hp);
    const text = formatWaveLabPatch(over);
    expect(text).toContain("WAVE LAB PATCH");
    expect(text).toContain("SCAV");
    expect(text).toContain("hp: 34 -> 85");
    expect(text).not.toContain("speed:");
    expect(text).not.toContain("GRAPHICS CARD");
  });

  it("export includes only modified waves", () => {
    const over = updateWaveGroup(emptyWaveLabOverrides(), woods, 4, 0, { count: 15 });
    const text = formatWaveLabPatch(over);
    expect(text).toContain("PINE CUT / WAVE 4");
    expect(text).toContain("scav.count:");
    expect(text).not.toContain("WAVE 3");
  });

  it("reset removes corresponding patch entries", () => {
    let over: WaveLabOverrides = setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 85, ENEMIES.scav.hp);
    over = updateWaveGroup(over, woods, 4, 0, { count: 15 });
    over = resetEnemyItem(over, "scav");
    expect(waveLabPatchLines(over).every((l) => l.scope.includes("WAVE"))).toBe(true);
    over = resetWaveItem(over, woods.id, 4);
    expect(formatWaveLabPatch(over)).toContain("(no changes)");
  });

  it("Wave Lab persistence namespace is separate", () => {
    expect(WAVE_LAB_STORAGE_KEY).toBe("scavlord.dev.waveLab.v1");
    expect(WAVE_LAB_STORAGE_KEY).not.toBe(BALANCE_STORAGE_KEY);
    expect(WAVE_LAB_STORAGE_KEY).not.toBe(ECONOMY_STORAGE_KEY);
  });

  it("Balance Lab overrides untouched", () => {
    const store = memStore({ [BALANCE_STORAGE_KEY]: '{"weapons":{"toz":{"damage":1}}}' });
    applyWaveLabOverrides(setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 85, ENEMIES.scav.hp), true, store);
    expect(store.getItem(BALANCE_STORAGE_KEY)).toContain("toz");
  });

  it("Economy Lab overrides untouched", () => {
    const store = memStore({ [ECONOMY_STORAGE_KEY]: '{"items":{"v_gpu":{"value":1650}}}' });
    applyWaveLabOverrides(setEnemyField(emptyWaveLabOverrides(), "scav", "hp", 85, ENEMIES.scav.hp), true, store);
    expect(store.getItem(ECONOMY_STORAGE_KEY)).toContain("v_gpu");
  });

  it("future enemy drop ids are hooks only", () => {
    expect(enemyDropSourceId("scav")).toBe("enemy:scav");
    expect(enemyDropSourceId("boss")).toBe("boss:boss");
  });
});
