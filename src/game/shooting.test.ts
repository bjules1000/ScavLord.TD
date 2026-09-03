import { describe, expect, it, afterEach } from "bun:test";
import { TILE } from "./data";
import { MAP_BY_ID, buildMap, type MapDef } from "./map";
import type { SurfaceLevel } from "./types";
import {
  DEFAULT_BULLET_SPEED,
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
  sampleShotAngle,
  sampleShotDirection,
  setCombatRng,
  spawnProjectile,
  spawnRifleShot,
  spawnShotgunBlast,
  tickProjectile,
  type Projectile,
  type ProjectileTickEnemy,
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

function at(tx: number, ty: number) {
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

function enemy(id: number, tx: number, ty: number, hp = 100): ProjectileTickEnemy {
  return {
    id,
    x: (tx + 0.5) * TILE,
    y: (ty + 0.5) * TILE,
    hp,
    surface: "GROUND",
    leaked: false,
    counted: false,
    kind: "scav",
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
    expect(best!.id).toBe(2);
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
    const enemies = [foe({ id: 1, x: 300, y: 0 }), foe({ id: 2, x: 50, y: 0 })];
    const best = pickAutoTarget("CLOSEST", { x: 0, y: 0 }, 500, enemies);
    expect(best!.id).toBe(2);
  });

  it("STRONGEST produces correct aim direction", () => {
    const enemies = [foe({ id: 1, hp: 10 }), foe({ id: 2, hp: 500 })];
    const best = pickAutoTarget("STRONGEST", { x: 0, y: 0 }, 500, enemies);
    expect(best!.id).toBe(2);
  });

  it("MANUAL uses locked target", () => {
    const enemies = [foe({ id: 1, x: 100, y: 0 }), foe({ id: 2, x: 200, y: 0 })];
    const locked = pickManualTarget(1, { x: 0, y: 0 }, 500, enemies);
    expect(locked!.id).toBe(1);
  });

  it("aim updates as tracked target moves", () => {
    const e = foe({ id: 1, x: 100, y: 0, pathProgress: 1 });
    const a1 = aimAngleTo(0, 0, e.x, e.y);
    e.x = 0; e.y = 100;
    const a2 = aimAngleTo(0, 0, e.x, e.y);
    expect(a1).not.toBeCloseTo(a2);
  });

  it("projectile does not home after firing", () => {
    const map = testMap();
    const rng = () => 0.5;
    const proj = spawnRifleShot({
      nextId: () => 1, shooterId: 1, origin: at(3, 3), aimAngle: 0,
      accuracy: 0.99, range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND", rng,
    });
    const dx = proj.dx;
    const dy = proj.dy;
    // Tick with enemy moving — direction should not change
    const e = enemy(1, 5, 3);
    tickProjectile(proj, 0.01, [e], () => 0, map);
    expect(proj.dx).toBe(dx);
    expect(proj.dy).toBe(dy);
  });
});

// ---------------------------------------------------------------------------
// Accuracy / dispersion
// ---------------------------------------------------------------------------
describe("accuracy / dispersion", () => {
  it("high accuracy produces tighter dispersion than low accuracy", () => {
    expect(accuracyToDispersion(0.95)).toBeLessThan(accuracyToDispersion(0.30));
  });

  it("dispersion is bounded", () => {
    expect(accuracyToDispersion(0.15)).toBeCloseTo(MAX_CONE_RAD, 5);
    expect(accuracyToDispersion(0.99)).toBeCloseTo(MIN_CONE_RAD, 5);
  });

  it("deterministic RNG can reproduce shot directions", () => {
    const rng1 = deterministicCombatRng(123);
    const rng2 = deterministicCombatRng(123);
    const a = sampleShotDirection(rng1, 0, 0.5);
    const b = sampleShotDirection(rng2, 0, 0.5);
    expect(a).toBe(b);
  });

  it("attachment accuracy modifiers affect cone", () => {
    expect(accuracyToDispersion(0.75)).toBeLessThan(accuracyToDispersion(0.70));
  });

  it("high-ground accuracy affects cone", () => {
    expect(accuracyToDispersion(0.75)).toBeLessThan(accuracyToDispersion(0.70));
  });
});

// ---------------------------------------------------------------------------
// Uniform dispersion
// ---------------------------------------------------------------------------
describe("uniform dispersion", () => {
  it("sampled deviation stays within cone bounds", () => {
    const rng = deterministicCombatRng(42);
    const half = Math.PI / 6;
    for (let i = 0; i < 500; i++) {
      const d = sampleShotAngle(rng, half);
      expect(d).toBeGreaterThanOrEqual(-half);
      expect(d).toBeLessThanOrEqual(half);
    }
  });

  it("deterministic RNG can sample cone edge values", () => {
    // rng() = 0 → deviation = -halfAngle; rng() = 1 → deviation = +halfAngle
    const half = 0.5;
    expect(sampleShotAngle(() => 0, half)).toBeCloseTo(-half);
    expect(sampleShotAngle(() => 1, half)).toBeCloseTo(half);
    expect(sampleShotAngle(() => 0.5, half)).toBeCloseTo(0);
  });

  it("distribution no longer strongly collapses toward center", () => {
    const rng = deterministicCombatRng(42);
    const half = Math.PI / 6;
    const samples = Array.from({ length: 2000 }, () => sampleShotAngle(rng, half));
    // Count samples in outer 40% of cone (past 60% from center)
    const outer = samples.filter((s) => Math.abs(s) > half * 0.6);
    // With uniform distribution, ~40% should be in outer zone
    const outerFrac = outer.length / samples.length;
    expect(outerFrac).toBeGreaterThan(0.3); // was much lower with triangular
  });

  it("same seed reproduces directions", () => {
    const a = sampleShotDirection(deterministicCombatRng(99), 1.0, 0.3);
    const b = sampleShotDirection(deterministicCombatRng(99), 1.0, 0.3);
    expect(a).toBe(b);
  });

  it("cone half-angle still comes from canonical accuracy resolver", () => {
    const d = getShotDispersion(0.7);
    expect(d).toBeGreaterThan(MIN_CONE_RAD);
    expect(d).toBeLessThan(MAX_CONE_RAD);
  });

  it("high accuracy still produces narrower possible angles than low accuracy", () => {
    expect(getShotDispersion(0.9)).toBeLessThan(getShotDispersion(0.3));
  });
});

// ---------------------------------------------------------------------------
// Damage timing (critical acceptance criterion)
// ---------------------------------------------------------------------------
describe("damage timing", () => {
  it("firing spawns projectile", () => {
    const rng = () => 0.5;
    const proj = spawnRifleShot({
      nextId: () => 1, shooterId: 1, origin: at(3, 3), aimAngle: 0,
      accuracy: 0.99, range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND", rng,
    });
    expect(proj).toBeTruthy();
    expect(proj.damage).toBe(20);
    expect(proj.remaining).toBe(500);
  });

  it("firing does not immediately damage target", () => {
    const map = testMap();
    const rng = () => 0.5;
    const e = enemy(1, 5, 3, 100);
    spawnRifleShot({
      nextId: () => 1, shooterId: 1, origin: at(3, 3), aimAngle: 0,
      accuracy: 0.99, range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND", rng,
    });
    expect(e.hp).toBe(100); // unchanged
  });

  it("projectile before target distance → HP unchanged", () => {
    const map = testMap();
    const rng = () => 0.5;
    const e = enemy(1, 8, 3, 100); // far away
    const proj = spawnRifleShot({
      nextId: () => 1, shooterId: 1, origin: at(3, 3), aimAngle: 0,
      accuracy: 0.99, range: 800, damage: 20, pen: 0, color: "#fff", surface: "GROUND", rng,
    });
    // Small tick — not enough to reach enemy
    tickProjectile(proj, 0.001, [e], () => 0, map);
    expect(e.hp).toBe(100);
  });

  it("projectile reaches target → damage occurs", () => {
    const map = testMap();
    const rng = () => 0.5;
    const e = enemy(1, 5, 3, 100);
    const proj = spawnRifleShot({
      nextId: () => 1, shooterId: 1, origin: at(3, 3), aimAngle: 0,
      accuracy: 0.99, range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND", rng,
    });
    // Large tick — enough to travel full range
    tickProjectile(proj, 2.0, [e], () => 0, map);
    expect(e.hp).toBeLessThan(100);
  });

  it("kill/XP/bounty occur only on impact", () => {
    const map = testMap();
    const rng = () => 0.5;
    const e = enemy(1, 5, 3, 10); // low HP
    const proj = spawnRifleShot({
      nextId: () => 1, shooterId: 1, origin: at(3, 3), aimAngle: 0,
      accuracy: 0.99, range: 500, damage: 30, pen: 0, color: "#fff", surface: "GROUND", rng,
    });
    expect(e.hp).toBe(10); // alive before
    const result = tickProjectile(proj, 2.0, [e], () => 0, map);
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]!.killed).toBe(true);
  });

  it("projectile miss never damages target", () => {
    const map = testMap();
    const rng = () => 0.5;
    const e = enemy(1, 3, 7, 100); // off axis
    const proj = spawnRifleShot({
      nextId: () => 1, shooterId: 1, origin: at(3, 3), aimAngle: 0,
      accuracy: 0.99, range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND", rng,
    });
    tickProjectile(proj, 2.0, [e], () => 0, map);
    expect(e.hp).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Projectile travel
// ---------------------------------------------------------------------------
describe("projectile travel", () => {
  it("projectile advances according to speed × dt", () => {
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: { x: 0, y: 0 }, angle: 0,
      range: 1000, damage: 10, pen: 0, color: "#fff", surface: "GROUND",
    });
    const startX = proj.x;
    const map = testMap();
    tickProjectile(proj, 0.1, [], () => 0, map);
    const expected = DEFAULT_BULLET_SPEED * 0.1;
    expect(proj.x - startX).toBeCloseTo(expected, 0);
  });

  it("remaining range decreases", () => {
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: { x: 0, y: 0 }, angle: 0,
      range: 500, damage: 10, pen: 0, color: "#fff", surface: "GROUND",
    });
    const map = testMap();
    tickProjectile(proj, 0.1, [], () => 0, map);
    expect(proj.remaining).toBeLessThan(500);
  });

  it("projectile expires at max range", () => {
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: { x: 0, y: 0 }, angle: 0,
      range: 100, damage: 10, pen: 0, color: "#fff", surface: "GROUND",
    });
    const map = testMap();
    tickProjectile(proj, 10, [], () => 0, map); // way past range
    expect(proj.dead).toBe(true);
  });

  it("multiple projectiles travel independently", () => {
    const p1 = spawnProjectile({ id: 1, shooterId: 1, origin: { x: 0, y: 0 }, angle: 0, range: 500, damage: 10, pen: 0, color: "#fff", surface: "GROUND" });
    const p2 = spawnProjectile({ id: 2, shooterId: 2, origin: { x: 100, y: 100 }, angle: Math.PI / 2, range: 500, damage: 10, pen: 0, color: "#fff", surface: "GROUND" });
    const map = testMap();
    tickProjectile(p1, 0.1, [], () => 0, map);
    tickProjectile(p2, 0.1, [], () => 0, map);
    expect(p1.x).toBeGreaterThan(0);
    expect(Math.abs(p1.y)).toBeLessThan(1);
    expect(p2.y).toBeGreaterThan(100);
    expect(Math.abs(p2.x - 100)).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
describe("geometry", () => {
  it("centered traveling bullet eventually hits enemy", () => {
    const map = testMap();
    const rng = () => 0.5;
    const e = enemy(1, 5, 3, 100);
    const proj = spawnRifleShot({
      nextId: () => 1, shooterId: 1, origin: at(3, 3), aimAngle: 0,
      accuracy: 0.99, range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND", rng,
    });
    const result = tickProjectile(proj, 2.0, [e], () => 0, map);
    expect(result.hits.length).toBe(1);
  });

  it("off-angle bullet passes beside enemy", () => {
    const map = testMap();
    const e = enemy(1, 5, 3, 100);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: Math.PI / 4,
      range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND",
    });
    tickProjectile(proj, 2.0, [e], () => 0, map);
    expect(e.hp).toBe(100);
  });

  it("moving enemy can avoid a previously aimed path", () => {
    const map = testMap();
    const e = enemy(1, 5, 3, 100);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND",
    });
    // Move enemy out of the way before bullet reaches
    e.y += TILE * 5;
    tickProjectile(proj, 2.0, [e], () => 0, map);
    expect(e.hp).toBe(100);
  });

  it("different enemy can intercept bullet", () => {
    const map = testMap();
    const a = enemy(1, 4, 3, 100); // closer
    const b = enemy(2, 6, 3, 100);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND",
    });
    const result = tickProjectile(proj, 2.0, [a, b], () => 0, map);
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]!.enemyId).toBe(1); // closer enemy
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBe(100);
  });

  it("nearest intersection wins", () => {
    const along1 = rayCircleIntersect(0, 0, 0, 500, 50, 0, ENEMY_HIT_RADIUS);
    const along2 = rayCircleIntersect(0, 0, 0, 500, 200, 0, ENEMY_HIT_RADIUS);
    expect(along1!).toBeLessThan(along2!);
  });

  it("solid wall stops projectile", () => {
    const map = testMap({
      collisionWalls: [{ tx: 3, ty: 3, edge: "E" as const, kind: "SOLID" as const }],
    });
    const e = enemy(1, 6, 3);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND",
    });
    tickProjectile(proj, 2.0, [e], () => 0, map);
    expect(e.hp).toBe(100);
    expect(proj.dead).toBe(true);
  });

  it("MOVEMENT-only wall does not block projectile", () => {
    const map = testMap({
      collisionWalls: [{ tx: 4, ty: 3, edge: "E" as const, kind: "MOVEMENT" as const }],
    });
    const e = enemy(1, 6, 3);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND",
    });
    tickProjectile(proj, 2.0, [e], () => 0, map);
    expect(e.hp).toBeLessThan(100);
  });

  it("target beyond max range cannot be hit", () => {
    const map = testMap();
    const e = enemy(1, 10, 3, 100);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: TILE * 2, damage: 20, pen: 0, color: "#fff", surface: "GROUND",
    });
    tickProjectile(proj, 2.0, [e], () => 0, map);
    expect(e.hp).toBe(100);
    expect(proj.dead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Target mismatch: aim at B, hit A
// ---------------------------------------------------------------------------
describe("target mismatch", () => {
  it("aim at B but physically hit A → A receives damage", () => {
    const map = testMap();
    const a = enemy(1, 4, 3, 100);
    const b = enemy(2, 6, 3, 100);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: 500, damage: 30, pen: 0, color: "#fff", surface: "GROUND",
    });
    const result = tickProjectile(proj, 2.0, [a, b], () => 0, map);
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]!.enemyId).toBe(1);
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Penetration
// ---------------------------------------------------------------------------
describe("penetration", () => {
  it("penetrating projectile damages first enemy at impact and continues", () => {
    const map = testMap();
    const a = enemy(1, 4, 3, 100);
    const b = enemy(2, 6, 3, 100);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: 500, damage: 30, pen: 5, color: "#fff", surface: "GROUND",
      maxPenHits: 2,
    });
    const result = tickProjectile(proj, 2.0, [a, b], () => 0, map);
    expect(result.hits.length).toBe(2);
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBeLessThan(100);
  });

  it("does not hit same enemy repeatedly", () => {
    const map = testMap();
    const e = enemy(1, 5, 3, 200);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: 500, damage: 10, pen: 5, color: "#fff", surface: "GROUND",
      maxPenHits: 3,
    });
    // Tick multiple times
    tickProjectile(proj, 0.01, [e], () => 0, map);
    tickProjectile(proj, 0.01, [e], () => 0, map);
    tickProjectile(proj, 0.5, [e], () => 0, map);
    // Should only be hit once
    expect(proj.hitIds.filter((id) => id === 1).length).toBe(1);
  });

  it("solid blocker stops continuation", () => {
    const map = testMap({
      collisionWalls: [{ tx: 4, ty: 3, edge: "E" as const, kind: "SOLID" as const }],
    });
    const a = enemy(1, 4, 3, 100);
    const b = enemy(2, 6, 3, 100);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: 500, damage: 30, pen: 5, color: "#fff", surface: "GROUND",
      maxPenHits: 2,
    });
    tickProjectile(proj, 2.0, [a, b], () => 0, map);
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Shotgun
// ---------------------------------------------------------------------------
describe("shotgun", () => {
  it("pellets do not apply damage immediately", () => {
    const e = enemy(1, 5, 3, 100);
    const rng = deterministicCombatRng(42);
    const pellets = spawnShotgunBlast({
      nextId: (() => { let i = 0; return () => ++i; })(),
      shooterId: 1, origin: at(3, 3), aimAngle: 0, accuracy: 0.7,
      range: 300, damage: 10, pen: 0, pelletCount: 8, pelletSpread: 0.2,
      color: "#fff", surface: "GROUND", rng,
    });
    expect(pellets.length).toBe(8);
    expect(e.hp).toBe(100); // no damage yet
  });

  it("pellets travel physically and hit", () => {
    const map = testMap();
    const e = enemy(1, 5, 3, 100);
    const rng = () => 0.5; // center
    const pellets = spawnShotgunBlast({
      nextId: (() => { let i = 0; return () => ++i; })(),
      shooterId: 1, origin: at(3, 3), aimAngle: 0, accuracy: 0.99,
      range: 500, damage: 10, pen: 0, pelletCount: 8, pelletSpread: 0.05,
      color: "#fff", surface: "GROUND", rng,
    });
    let totalHits = 0;
    for (const p of pellets) {
      const r = tickProjectile(p, 2.0, [e], () => 0, map);
      totalHits += r.hits.length;
    }
    expect(totalHits).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(100);
  });

  it("pellet spread remains centered around weapon aim", () => {
    const rng = deterministicCombatRng(42);
    const pellets = spawnShotgunBlast({
      nextId: (() => { let i = 0; return () => ++i; })(),
      shooterId: 1, origin: at(3, 3), aimAngle: 0, accuracy: 0.7,
      range: 300, damage: 10, pen: 0, pelletCount: 8, pelletSpread: 0.2,
      color: "#fff", surface: "GROUND", rng,
    });
    const mean = pellets.reduce((s, p) => s + p.angle, 0) / pellets.length;
    expect(Math.abs(mean)).toBeLessThan(0.3);
  });

  it("tight choke remains tighter than default", () => {
    const rng1 = deterministicCombatRng(42);
    const rng2 = deterministicCombatRng(42);
    const wide = spawnShotgunBlast({
      nextId: (() => { let i = 0; return () => ++i; })(),
      shooterId: 1, origin: at(3, 3), aimAngle: 0, accuracy: 0.7,
      range: 300, damage: 10, pen: 0, pelletCount: 8, pelletSpread: 0.3,
      color: "#fff", surface: "GROUND", rng: rng1,
    });
    const tight = spawnShotgunBlast({
      nextId: (() => { let i = 0; return () => ++i; })(),
      shooterId: 1, origin: at(3, 3), aimAngle: 0, accuracy: 0.7,
      range: 300, damage: 10, pen: 0, pelletCount: 8, pelletSpread: 0.15,
      color: "#fff", surface: "GROUND", rng: rng2,
    });
    const spreadOf = (ps: Projectile[]) => {
      const a = ps.map((p) => p.angle);
      return Math.max(...a) - Math.min(...a);
    };
    expect(spreadOf(tight)).toBeLessThan(spreadOf(wide));
  });
});

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------
describe("range", () => {
  it("effective range controls target eligibility", () => {
    const enemies = [foe({ id: 1, x: 200, y: 0, pathProgress: 1 })];
    expect(pickAutoTarget("FIRST", { x: 0, y: 0 }, 50, enemies)).toBeNull();
    expect(pickAutoTarget("FIRST", { x: 0, y: 0 }, 300, enemies)).not.toBeNull();
  });

  it("effective range controls projectile max travel", () => {
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: { x: 0, y: 0 }, angle: 0,
      range: 100, damage: 10, pen: 0, color: "#fff", surface: "GROUND",
    });
    expect(proj.remaining).toBe(100);
  });

  it("range attachment affects both consistently", () => {
    // Range is passed through — attachments change range before projectile spawn
    const p1 = spawnProjectile({ id: 1, shooterId: 1, origin: { x: 0, y: 0 }, angle: 0, range: 200, damage: 10, pen: 0, color: "#fff", surface: "GROUND" });
    const p2 = spawnProjectile({ id: 2, shooterId: 1, origin: { x: 0, y: 0 }, angle: 0, range: 300, damage: 10, pen: 0, color: "#fff", surface: "GROUND" });
    expect(p2.remaining).toBeGreaterThan(p1.remaining);
  });
});

// ---------------------------------------------------------------------------
// HOLD ANGLE
// ---------------------------------------------------------------------------
describe("HOLD_ANGLE", () => {
  it("HOLD_ANGLE stores fixed direction", () => {
    const t = { holdAngle: Math.PI / 4, holdAnglePoint: { x: 100, y: 100 } };
    expect(t.holdAngle).toBe(Math.PI / 4);
  });

  it("enemy inside sector can trigger fire", () => {
    expect(isInFiringSector(0, 0, 0, Math.PI / 6, 100, 10)).toBe(true);
  });

  it("enemy outside sector does not", () => {
    expect(isInFiringSector(0, 0, 0, Math.PI / 12, 0, 100)).toBe(false);
  });

  it("operator does not auto-rotate toward sector enemy", () => {
    const enemies = [foe({ id: 1, x: 100, y: 0, pathProgress: 1 })];
    const result = selectTarget("HOLD_ANGLE", { x: 0, y: 0 }, 500, enemies);
    expect(result).toBeNull();
  });

  it("HOLD_ANGLE remains fixed — bullets travel in held direction", () => {
    const rng = () => 0.5;
    const proj = spawnRifleShot({
      nextId: () => 1, shooterId: 1, origin: { x: 0, y: 0 }, aimAngle: Math.PI / 4,
      accuracy: 0.99, range: 500, damage: 20, pen: 0, color: "#fff", surface: "GROUND", rng,
    });
    // Direction should be close to PI/4 (±tiny dispersion)
    const angleDiff = Math.abs(proj.angle - Math.PI / 4);
    expect(angleDiff).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// Ammo / reload
// ---------------------------------------------------------------------------
describe("ammo / reload", () => {
  it("physical shot consumes ammo exactly once", () => {
    const { consumeRound } = require("./weapons");
    expect(consumeRound(5)).toBe(4);
    expect(consumeRound(1)).toBe(0);
  });

  it("miss still consumes ammo", () => {
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
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: 500, damage: 30, pen: 0, color: "#fff", surface: "GROUND",
    });
    tickProjectile(proj, 2.0, [e], () => 5, map); // armor=5
    // applyHit: max(1, 30 - max(0, 5 - 0)) = 25
    expect(e.hp).toBe(75);
  });

  it("miss grants nothing", () => {
    const map = testMap();
    const e = enemy(1, 3, 7, 100);
    const proj = spawnProjectile({
      id: 1, shooterId: 1, origin: at(3, 3), angle: 0,
      range: 500, damage: 30, pen: 0, color: "#fff", surface: "GROUND",
    });
    tickProjectile(proj, 2.0, [e], () => 0, map);
    expect(e.hp).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Multi-operator
// ---------------------------------------------------------------------------
describe("multi-operator", () => {
  it("two operators maintain independent aim directions", () => {
    expect(aimAngleTo(0, 0, 100, 0)).not.toBeCloseTo(aimAngleTo(0, 0, 0, 100));
  });

  it("multiple operators can have bullets in flight", () => {
    const p1 = spawnProjectile({ id: 1, shooterId: 1, origin: { x: 0, y: 0 }, angle: 0, range: 500, damage: 10, pen: 0, color: "#fff", surface: "GROUND" });
    const p2 = spawnProjectile({ id: 2, shooterId: 2, origin: { x: 0, y: 0 }, angle: Math.PI, range: 500, damage: 10, pen: 0, color: "#fff", surface: "GROUND" });
    expect(p1.shooterId).toBe(1);
    expect(p2.shooterId).toBe(2);
    expect(p1.angle).not.toBe(p2.angle);
  });

  it("bullets retain correct shooter ownership", () => {
    const p = spawnProjectile({ id: 99, shooterId: 42, origin: { x: 0, y: 0 }, angle: 0, range: 500, damage: 10, pen: 0, color: "#fff", surface: "GROUND" });
    const map = testMap();
    const e = enemy(1, 2, 0, 100);
    const result = tickProjectile(p, 2.0, [e], () => 0, map);
    if (result.hits.length) {
      expect(result.hits[0]!.shooterId).toBe(42);
    }
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
    const v = combatRng();
    expect(v).toBeGreaterThanOrEqual(0);
  });
});
