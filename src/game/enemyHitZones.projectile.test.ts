import { describe, expect, it } from "bun:test";
import { ENEMIES, SCALE } from "./data";
import {
  enemyBroadphaseRadius,
  enemyWorldBounds,
  resolveEnemyHitZones,
  resolveHitZoneAtPoint,
  zoneWorldRect,
} from "./enemyHitZones";
import { spawnProjectile, tickProjectile } from "./shooting";
import { MAP_BY_ID, buildMap, type MapDef } from "./map";

const pal = MAP_BY_ID["woods"]!.palette;

function testMap() {
  return buildMap({
    id: "hz-test",
    name: "HZ",
    threat: 1,
    threatLabel: "T",
    desc: "",
    hpMult: 1,
    lootMult: 1,
    geo: { x: 0, y: 0 },
    sector: "T",
    path: [
      [0, 0],
      [2, 0],
    ],
    props: [],
    checkpoint: [],
    cover: [],
    crates: [],
    palette: pal,
  } as MapDef);
}

describe("projectile hit-zone integration", () => {
  const map = testMap();

  it("HEAD hit uses configured multiplier", () => {
    const def = ENEMIES.raider!;
    const zones = resolveEnemyHitZones(def.hitZones);
    const e = {
      id: 1,
      x: 200,
      y: 200,
      hp: 1000,
      kind: "raider",
      surface: "GROUND" as const,
      leaked: false,
      counted: false,
    };

    const p = spawnProjectile({
      id: 9,
      shooterId: 1,
      origin: { x: 150, y: 200 },
      angle: 0,
      speed: 2000,
      range: 400,
      damage: 20,
      pen: 0,
      color: "#fff",
      surface: "GROUND",
    });

    const result = tickProjectile(
      p,
      0.1,
      [e],
      () => 0,
      map,
      enemyBroadphaseRadius(def.size, SCALE),
      () => ({ damageMult: 1.75, zoneId: "head" }),
    );

    expect(result.hits.length).toBe(1);
    expect(result.hits[0]!.hitZoneId).toBe("head");
    expect(result.hits[0]!.hitZoneMult).toBeCloseTo(1.75);
    expect(e.hp).toBe(1000 - 35);
  });

  it("disabled zones cause no damage despite broadphase", () => {
    const def = ENEMIES.raider!;
    const zones = resolveEnemyHitZones(def.hitZones).map((z) => ({ ...z, enabled: false }));
    const e = {
      id: 2,
      x: 200,
      y: 200,
      hp: 500,
      kind: "raider",
      surface: "GROUND" as const,
      leaked: false,
      counted: false,
    };
    const p = spawnProjectile({
      id: 10,
      shooterId: 1,
      origin: { x: 150, y: 200 },
      angle: 0,
      speed: 2000,
      range: 400,
      damage: 40,
      pen: 0,
      color: "#fff",
      surface: "GROUND",
    });
    const result = tickProjectile(
      p,
      0.1,
      [e],
      () => 0,
      map,
      enemyBroadphaseRadius(def.size, SCALE),
      (enemy, hitX, hitY) => {
        const hit = resolveHitZoneAtPoint(
          zones,
          enemyWorldBounds(enemy.x, enemy.y, def.size, SCALE),
          hitX,
          hitY,
        );
        if (!hit) return null;
        return { damageMult: hit.damageMult, zoneId: hit.zone.id };
      },
    );
    expect(result.hits.length).toBe(0);
    expect(e.hp).toBe(500);
  });
});
