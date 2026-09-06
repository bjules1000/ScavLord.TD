import { describe, expect, it } from "bun:test";
import { ENEMIES, SCALE } from "./data";
import {
  enemyBroadphaseRadius,
  enemyWorldBounds,
  resolveEnemyHitZones,
  resolveHitZoneAlongSegment,
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
      (_enemy, ax, ay) => ({ damageMult: 1.75, zoneId: "head", x: ax, y: ay }),
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
      (enemy, ax, ay, bx, by) => {
        const hit = resolveHitZoneAlongSegment(
          zones,
          enemyWorldBounds(enemy.x, enemy.y, def.size, SCALE),
          ax,
          ay,
          bx,
          by,
        );
        if (!hit) return null;
        return { damageMult: hit.damageMult, zoneId: hit.zone.id, x: hit.x, y: hit.y };
      },
    );
    expect(result.hits.length).toBe(0);
    expect(e.hp).toBe(500);
  });

  it("a zone narrower than one frame of travel still registers a hit", () => {
    // Regression for F1: at low fps a fast bullet's per-frame segment can be
    // much wider than a hit zone. A single end-of-frame point sample would
    // straddle the zone and miss; the swept segment test must not.
    const def = ENEMIES.scav!;
    const zones = resolveEnemyHitZones(def.hitZones);
    const bounds = enemyWorldBounds(200, 200, def.size, SCALE);
    const bodyZone = zones.find((z) => z.id === "body")!;
    const bodyRect = {
      left: bounds.left + bodyZone.x * bounds.width,
      top: bounds.top + bodyZone.y * bounds.height,
      width: bodyZone.width * bounds.width,
      height: bodyZone.height * bounds.height,
    };
    // Confirm the authored zone really is narrower than one low-fps frame step.
    const lowFpsStep = 2000 * (1 / 20);
    expect(bodyRect.width).toBeLessThan(lowFpsStep);

    const e = {
      id: 3,
      x: 200,
      y: 200,
      hp: 1000,
      kind: "scav",
      surface: "GROUND" as const,
      leaked: false,
      counted: false,
    };
    const p = spawnProjectile({
      id: 11,
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
    const hitZoneOf = (enemy: typeof e, ax: number, ay: number, bx: number, by: number) => {
      const hit = resolveHitZoneAlongSegment(
        zones,
        enemyWorldBounds(enemy.x, enemy.y, def.size, SCALE),
        ax,
        ay,
        bx,
        by,
      );
      if (!hit) return null;
      return { damageMult: hit.damageMult, zoneId: hit.zone.id, x: hit.x, y: hit.y };
    };
    const result = tickProjectile(
      p,
      1 / 20,
      [e],
      () => 0,
      map,
      enemyBroadphaseRadius(def.size, SCALE),
      hitZoneOf,
    );
    expect(result.hits.length).toBe(1);
  });
});
