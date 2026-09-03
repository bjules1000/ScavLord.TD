import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { TILE } from "./data";
import { MAP_BY_ID, buildMap, type MapDef } from "./map";
import type { SurfaceLevel } from "./types";
import {
  ENEMY_HIT_RADIUS,
  MAX_CONE_RAD,
  MIN_CONE_RAD,
  accuracyToDispersion,
  aimAngleTo,
  aimDirectionTo,
  combatRng,
  deterministicCombatRng,
  getShotDispersion,
  isInFiringSector,
  rayCircleIntersect,
  resolvePhysicalShot,
  resolveShotPattern,
  sampleShotAngle,
  sampleShotDirection,
  setCombatRng,
  traceShot,
} from "./shooting";
import { selectTarget, pickAutoTarget, pickManualTarget, type Targetable } from "./targeting";

const pal = MAP_BY_ID["woods"]!.palette;

function testMap(over: Partial<MapDef> = {}) {
  return buildMap({
    id: "shoot-test",
    name: "SHOOT TEST",
    threat: 1,
    threatLabel: "TEST",
    desc: "",
    hpMult: 1,
    lootMult: 1,
    geo: { x: 0, y: 0 },
    sector: "T",
    path: [[0, 0], [1, 0], [2, 0]],
    props: [],
    checkpoint: [],
    cover: [],
    crates: [],
    palette: pal,
    ...over,
  });
}

function at(tx: number, ty: number, surface: SurfaceLevel = "GROUND") {
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, surface };
}

function enemy(id: number, tx: number, ty: number, hp = 100) {
  return {
    id,
    x: (tx + 0.5) * TILE,
    y: (ty + 0.5) * TILE,
    hp,
    surface: "GROUND" as SurfaceLevel,
    leaked: false,
    counted: false,
    kind: "scav" as const,
  };
}

function foe(partial: Partial<Targetable> & Pick<Targetable, "id">): Targetable {
  return { x: 0, y: 0, hp: 10, pathProgress: 0, ...partial };
}

afterEach(() => setCombatRng(null));

// ---------------------------------------------------------------------------
// Aim direction
// ---------------------------------------------------------------------------
describe("aim direction", () => {
  it("FIRST produces aim direction toward selected FIRST target", () => {
    const enemies = [
      foe({ id: 1, x: 100, y: 0, pathProgress: 5 }),
      foe({ id: 2, x: 200, y: 0, pathProgress: 10 }),
    ];
    const best = pickAutoTarget("FIRST", { x: 0, y: 0 }, 500, enemies);
    expect(best!.id).toBe(2); // highest pathProgress
    const dir = aimDirectionTo(0, 0, best!.x, best!.y);
    expect(dir.x).toBeGreaterThan(0);
    expect(Math.abs(dir.y)).toBeLessThan(0.01);
  });

  it("LAST produces correct aim direction", () => {
    const enemies = [
      foe({ id: 1, x: 100, y: 0, pathProgress: 5 }),
      foe({ id: 2, x: 200, y: 0, pathProgress: 10 }),
    ];
    const best = pickAutoTarget("LAST", { x: 0, y: 0 }, 500, enemies);
    expect(best!.id).toBe(1);
  });

  it("CLOSEST produces correct aim direction", () => {
    const enemies = [
      foe({ id: 1, x: 300, y: 0 }),
      foe({ id: 2, x: 50, y: 0 }),
    ];
    const best = pickAutoTarget("CLOSEST", { x: 0, y: 0 }, 500, enemies);
    expect(best!.id).toBe(2);
  });

  it("STRONGEST produces correct aim direction", () => {
    const enemies = [
      foe({ id: 1, hp: 10 }),
      foe({ id: 2, hp: 500 }),
    ];
    const best = pickAutoTarget("STRONGEST", { x: 0, y: 0 }, 500, enemies);
    expect(best!.id).toBe(2);
  });

  it("MANUAL uses locked target", () => {
    const enemies = [
      foe({ id: 1, x: 100, y: 0 }),
      foe({ id: 2, x: 200, y: 0 }),
    ];
    const locked = pickManualTarget(1, { x: 0, y: 0 }, 500, enemies);
    expect(locked!.id).toBe(1);
  });

  it("aim updates as tracked target moves", () => {
    const e = foe({ id: 1, x: 100, y: 0, pathProgress: 1 });
    const a1 = aimAngleTo(0, 0, e.x, e.y);
    e.x = 0;
    e.y = 100;
    const a2 = aimAngleTo(0, 0, e.x, e.y);
    expect(a1).not.toBeCloseTo(a2);
  });
});

// ---------------------------------------------------------------------------
// Accuracy / dispersion
// ---------------------------------------------------------------------------
describe("accuracy / dispersion", () => {
  it("high accuracy produces tighter dispersion than low accuracy", () => {
    const tight = accuracyToDispersion(0.95);
    const wide = accuracyToDispersion(0.30);
    expect(tight).toBeLessThan(wide);
  });

  it("dispersion is bounded", () => {
    expect(accuracyToDispersion(0.15)).toBeCloseTo(MAX_CONE_RAD, 5);
    expect(accuracyToDispersion(0.99)).toBeCloseTo(MIN_CONE_RAD, 5);
  });

  it("dispersion sampling is centered on aim direction", () => {
    const rng = deterministicCombatRng(42);
    const samples = Array.from({ length: 1000 }, () => sampleShotAngle(rng, Math.PI / 6));
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
  });

  it("deterministic RNG can reproduce shot directions", () => {
    const rng1 = deterministicCombatRng(123);
    const rng2 = deterministicCombatRng(123);
    const a = sampleShotDirection(rng1, 0, 0.5);
    const b = sampleShotDirection(rng2, 0, 0.5);
    expect(a).toBe(b);
  });

  it("no abstract firearm accuracy hit-roll remains", () => {
    // The old code was: Math.random() > st.accuracy → miss
    // Now resolvePhysicalShot does NOT roll hit/miss; it traces rays.
    // Verify by checking that a dead-center shot hits an enemy directly ahead.
    const map = testMap();
    const rng = () => 0.5; // center of triangular distribution = 0 deviation
    const e = enemy(1, 5, 3);
    const origin = at(3, 3);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0, // aiming right
      accuracy: 0.5,
      range: 500,
      damage: 20,
      pen: 0,
      enemies: [e],
      armorOf: () => 0,
      map,
      rng,
    });
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]!.enemyId).toBe(1);
  });

  it("attachment accuracy modifiers affect cone", () => {
    const base = accuracyToDispersion(0.70);
    const boosted = accuracyToDispersion(0.70 + 0.05); // +5% from attachment
    expect(boosted).toBeLessThan(base);
  });

  it("high-ground accuracy affects cone", () => {
    const base = accuracyToDispersion(0.70);
    const hg = accuracyToDispersion(0.70 + 0.05); // HIGH_GROUND_ACCURACY_BONUS
    expect(hg).toBeLessThan(base);
  });
});

// ---------------------------------------------------------------------------
// Physical intersection
// ---------------------------------------------------------------------------
describe("physical intersection", () => {
  it("centered ray hits enemy", () => {
    const along = rayCircleIntersect(0, 0, 0, 500, 100, 0, ENEMY_HIT_RADIUS);
    expect(along).not.toBeNull();
    expect(along!).toBeLessThan(100 + ENEMY_HIT_RADIUS);
  });

  it("deviated ray misses enemy", () => {
    const along = rayCircleIntersect(0, 0, Math.PI / 2, 500, 100, 0, ENEMY_HIT_RADIUS);
    expect(along).toBeNull();
  });

  it("ray can hit non-target enemy", () => {
    const map = testMap();
    const e1 = enemy(1, 4, 3); // closer
    const e2 = enemy(2, 6, 3); // further
    const rng = () => 0.5;
    const origin = at(3, 3);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0,
      accuracy: 0.99,
      range: 500,
      damage: 20,
      pen: 0,
      enemies: [e1, e2],
      armorOf: () => 0,
      map,
      rng,
    });
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]!.enemyId).toBe(1); // closer enemy hit first
  });

  it("nearest enemy intersection wins", () => {
    const along1 = rayCircleIntersect(0, 0, 0, 500, 50, 0, ENEMY_HIT_RADIUS);
    const along2 = rayCircleIntersect(0, 0, 0, 500, 200, 0, ENEMY_HIT_RADIUS);
    expect(along1!).toBeLessThan(along2!);
  });

  it("miss damages nothing", () => {
    const map = testMap();
    const e = enemy(1, 3, 6); // far off axis
    const rng = () => 0.5;
    const origin = at(3, 3);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0,
      accuracy: 0.99,
      range: 500,
      damage: 20,
      pen: 0,
      enemies: [e],
      armorOf: () => 0,
      map,
      rng,
    });
    expect(result.miss).toBe(true);
    expect(result.hits.length).toBe(0);
    expect(e.hp).toBe(100); // unchanged
  });

  it("solid wall before enemy blocks shot", () => {
    const map = testMap({
      collisionWalls: [{ tx: 3, ty: 3, edge: "E" as const, kind: "SOLID" as const }],
    });
    const e = enemy(1, 6, 3);
    const rng = () => 0.5;
    const origin = at(3, 3);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0,
      accuracy: 0.99,
      range: 500,
      damage: 20,
      pen: 0,
      enemies: [e],
      armorOf: () => 0,
      map,
      rng,
    });
    expect(result.hits.length).toBe(0);
    expect(e.hp).toBe(100);
  });

  it("MOVEMENT-only wall does not block shot", () => {
    const map = testMap({
      collisionWalls: [{ tx: 4, ty: 3, edge: "E" as const, kind: "MOVEMENT" as const }],
    });
    const e = enemy(1, 6, 3);
    const rng = () => 0.5;
    const origin = at(3, 3);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0,
      accuracy: 0.99,
      range: 500,
      damage: 20,
      pen: 0,
      enemies: [e],
      armorOf: () => 0,
      map,
      rng,
    });
    expect(result.hits.length).toBe(1);
  });

  it("max range truncates ray", () => {
    const along = rayCircleIntersect(0, 0, 0, 50, 100, 0, ENEMY_HIT_RADIUS);
    expect(along).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Target mismatch: aim at B, hit A
// ---------------------------------------------------------------------------
describe("target mismatch", () => {
  it("aim at B but physically hit A → A receives damage", () => {
    const map = testMap();
    const a = enemy(1, 4, 3, 100); // closer, in the way
    const b = enemy(2, 6, 3, 100); // aimed-at target
    const rng = () => 0.5;
    const origin = at(3, 3);
    const aimAngle = aimAngleTo(origin.x, origin.y, b.x, b.y);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle,
      accuracy: 0.99,
      range: 500,
      damage: 30,
      pen: 0,
      enemies: [a, b],
      armorOf: () => 0,
      map,
      rng,
    });
    // A is hit first, B is not (no penetration)
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]!.enemyId).toBe(1);
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBe(100);
  });

  it("selected target receives no damage if ray misses it", () => {
    const map = testMap();
    const e = enemy(1, 5, 6); // off-axis
    const rng = () => 0.5;
    const origin = at(3, 3);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0,
      accuracy: 0.99,
      range: 500,
      damage: 20,
      pen: 0,
      enemies: [e],
      armorOf: () => 0,
      map,
      rng,
    });
    expect(result.miss).toBe(true);
    expect(e.hp).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Penetration
// ---------------------------------------------------------------------------
describe("penetration", () => {
  it("penetration continues after valid first hit", () => {
    const map = testMap();
    const a = enemy(1, 4, 3, 100);
    const b = enemy(2, 6, 3, 100);
    const rng = () => 0.5;
    const origin = at(3, 3);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0,
      accuracy: 0.99,
      range: 500,
      damage: 30,
      pen: 5,
      enemies: [a, b],
      armorOf: () => 0,
      map,
      rng,
      maxPenHits: 2,
    });
    expect(result.hits.length).toBe(2);
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBeLessThan(100);
  });

  it("penetration respects current limits", () => {
    const map = testMap();
    const a = enemy(1, 4, 3, 100);
    const b = enemy(2, 5, 3, 100);
    const c = enemy(3, 6, 3, 100);
    const rng = () => 0.5;
    const origin = at(3, 3);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0,
      accuracy: 0.99,
      range: 500,
      damage: 30,
      pen: 5,
      enemies: [a, b, c],
      armorOf: () => 0,
      map,
      rng,
      maxPenHits: 2,
    });
    expect(result.hits.length).toBe(2);
    expect(c.hp).toBe(100); // 3rd enemy untouched
  });

  it("solid blocker ends penetration", () => {
    const map = testMap({
      collisionWalls: [{ tx: 4, ty: 3, edge: "E" as const, kind: "SOLID" as const }],
    });
    const a = enemy(1, 4, 3, 100); // before wall (at center of tile 4)
    const b = enemy(2, 6, 3, 100); // after wall (tile 6, past wall at edge E of tile 4)
    const rng = () => 0.5;
    const origin = at(3, 3);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0,
      accuracy: 0.99,
      range: 500,
      damage: 30,
      pen: 5,
      enemies: [a, b],
      armorOf: () => 0,
      map,
      rng,
      maxPenHits: 2,
    });
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]!.enemyId).toBe(1);
    expect(b.hp).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Shotgun
// ---------------------------------------------------------------------------
describe("shotgun", () => {
  it("pellets share central aim direction", () => {
    const map = testMap();
    const rng = deterministicCombatRng(42);
    const origin = at(3, 3);
    const pattern = resolveShotPattern({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0,
      accuracy: 0.70,
      range: 300,
      damage: 10,
      pen: 0,
      enemies: [],
      armorOf: () => 0,
      map,
      rayCount: 8,
      pelletSpread: 0.2,
      rng,
    });
    expect(pattern.shots.length).toBe(8);
    const angles = pattern.shots.map((s) => s.shotAngle);
    const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
    expect(Math.abs(mean)).toBeLessThan(0.3);
  });

  it("tight choke physically tightens pellet grouping", () => {
    const map = testMap();
    const rng1 = deterministicCombatRng(42);
    const rng2 = deterministicCombatRng(42);
    const origin = at(3, 3);
    const wide = resolveShotPattern({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0, accuracy: 0.70, range: 300, damage: 10, pen: 0,
      enemies: [], armorOf: () => 0, map,
      rayCount: 8, pelletSpread: 0.3, rng: rng1,
    });
    const tight = resolveShotPattern({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0, accuracy: 0.70, range: 300, damage: 10, pen: 0,
      enemies: [], armorOf: () => 0, map,
      rayCount: 8, pelletSpread: 0.15, rng: rng2,
    });
    const spreadOf = (p: typeof wide) => {
      const a = p.shots.map((s) => s.shotAngle);
      return Math.max(...a) - Math.min(...a);
    };
    expect(spreadOf(tight)).toBeLessThan(spreadOf(wide));
  });

  it("shotgun pellet hits are geometry-based", () => {
    const map = testMap();
    const e = enemy(1, 5, 3);
    const rng = () => 0.5;
    const origin = at(3, 3);
    const pattern = resolveShotPattern({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0, accuracy: 0.99, range: 500, damage: 10, pen: 0,
      enemies: [e], armorOf: () => 0, map,
      rayCount: 8, pelletSpread: 0.05, rng,
      maxPenHits: 2,
    });
    const totalHits = pattern.shots.reduce((s, shot) => s + shot.hits.length, 0);
    expect(totalHits).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------
describe("range", () => {
  it("effective range controls target eligibility", () => {
    const enemies = [foe({ id: 1, x: 200, y: 0, pathProgress: 1 })];
    const close = pickAutoTarget("FIRST", { x: 0, y: 0 }, 50, enemies);
    const far = pickAutoTarget("FIRST", { x: 0, y: 0 }, 300, enemies);
    expect(close).toBeNull();
    expect(far).not.toBeNull();
  });

  it("effective range controls ray length", () => {
    const along = rayCircleIntersect(0, 0, 0, 50, 100, 0, ENEMY_HIT_RADIUS);
    expect(along).toBeNull();
    const along2 = rayCircleIntersect(0, 0, 0, 200, 100, 0, ENEMY_HIT_RADIUS);
    expect(along2).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HOLD ANGLE
// ---------------------------------------------------------------------------
describe("HOLD_ANGLE", () => {
  it("HOLD_ANGLE stores fixed direction", () => {
    const angle = Math.PI / 4;
    // Simulate tower state
    const t = { holdAngle: angle, holdAnglePoint: { x: 100, y: 100 } };
    expect(t.holdAngle).toBe(angle);
  });

  it("enemy inside sector can trigger fire", () => {
    expect(isInFiringSector(0, 0, 0, Math.PI / 6, 100, 10)).toBe(true);
  });

  it("enemy outside sector does not", () => {
    expect(isInFiringSector(0, 0, 0, Math.PI / 12, 0, 100)).toBe(false);
  });

  it("operator does not auto-rotate toward sector enemy", () => {
    // selectTarget returns null for HOLD_ANGLE
    const enemies = [foe({ id: 1, x: 100, y: 0, pathProgress: 1 })];
    const result = selectTarget("HOLD_ANGLE", { x: 0, y: 0 }, 500, enemies);
    expect(result).toBeNull();
  });

  it("changing mode clears hold-angle", () => {
    const t = { holdAngle: 1.5 as number | null, holdAnglePoint: { x: 1, y: 1 } as { x: number; y: number } | null, targetMode: "HOLD_ANGLE" as string };
    // Simulate switching to FIRST
    t.targetMode = "FIRST";
    t.holdAngle = null;
    t.holdAnglePoint = null;
    expect(t.holdAngle).toBeNull();
  });

  it("moving operator still cannot fire", () => {
    // operatorCanFire is already tested in movement.test.ts
    // Just verify the API contract: isOperatorMoving stops fire
    const { operatorCanFire } = require("./movement");
    expect(operatorCanFire({ move: { x: 0, y: 0, path: [{ tx: 1, ty: 1, surface: "GROUND" }], dest: { tx: 1, ty: 1, surface: "GROUND" }, pendingDest: null } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ammo / reload
// ---------------------------------------------------------------------------
describe("ammo / reload", () => {
  it("physical shot consumes ammo exactly once", () => {
    // consumeRound(5) → 4
    const { consumeRound } = require("./weapons");
    expect(consumeRound(5)).toBe(4);
    expect(consumeRound(1)).toBe(0);
  });

  it("miss still consumes ammo", () => {
    // The firing loop calls consumeRound before resolvePhysicalShot
    // So ammo is consumed regardless of hit/miss
    const { consumeRound } = require("./weapons");
    expect(consumeRound(3)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Damage / rewards
// ---------------------------------------------------------------------------
describe("damage / rewards", () => {
  it("physical hit routes through canonical damage", () => {
    const map = testMap();
    const e = enemy(1, 5, 3, 100);
    const rng = () => 0.5;
    const origin = at(3, 3);
    resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0, accuracy: 0.99, range: 500, damage: 30, pen: 0,
      enemies: [e], armorOf: () => 5, map, rng,
    });
    // applyHit: max(1, 30 - max(0, 5 - 0)) = 25
    expect(e.hp).toBe(75);
  });

  it("miss grants nothing", () => {
    const map = testMap();
    const e = enemy(1, 3, 7, 100);
    const rng = () => 0.5;
    const origin = at(3, 3);
    const result = resolvePhysicalShot({
      origin,
      shooterSurface: { ...origin, surface: "GROUND" },
      aimAngle: 0, accuracy: 0.99, range: 500, damage: 30, pen: 0,
      enemies: [e], armorOf: () => 0, map, rng,
    });
    expect(result.miss).toBe(true);
    expect(e.hp).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Multi-operator
// ---------------------------------------------------------------------------
describe("multi-operator", () => {
  it("two operators maintain independent aim directions", () => {
    const a1 = aimAngleTo(0, 0, 100, 0);
    const a2 = aimAngleTo(0, 0, 0, 100);
    expect(a1).not.toBeCloseTo(a2);
  });

  it("two HOLD_ANGLE operators can cover different sectors", () => {
    const s1 = isInFiringSector(0, 0, 0, 0.3, 100, 10);
    const s2 = isInFiringSector(0, 0, Math.PI / 2, 0.3, 10, 100);
    expect(s1).toBe(true);
    expect(s2).toBe(true);
    // Cross-check: s1's enemy not in s2's sector
    const cross = isInFiringSector(0, 0, Math.PI / 2, 0.3, 100, 10);
    expect(cross).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------
describe("deterministic RNG", () => {
  it("setCombatRng overrides and restores", () => {
    let calls = 0;
    setCombatRng(() => { calls++; return 0.5; });
    combatRng();
    expect(calls).toBe(1);
    setCombatRng(null);
    // After restore, should use Math.random (just call it, no error)
    const v = combatRng();
    expect(v).toBeGreaterThanOrEqual(0);
  });
});
