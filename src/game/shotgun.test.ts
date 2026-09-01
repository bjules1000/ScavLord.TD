import { describe, expect, it } from "bun:test";
import { applyHit, creditKillBook, damageAfterArmor, settleRemovedEnemies, type KillBook } from "./combat";
import { TILE } from "./data";
import { incomingCoverProtection, type DefensePiece } from "./defenses";
import { WEAPONS } from "./gear";
import { wallAlongLimit } from "./los";
import { MAP_BY_ID, buildMap } from "./map";
import {
  isShotgunWeapon,
  pelletAngles,
  pelletIntersections,
  resolveShotgunBlast,
  shotgunMaxHits,
  shotgunPelletCount,
  shotgunSecondaryMult,
  strikesForPellet,
  type PelletBody,
} from "./shotgun";
import { pickAutoTarget, selectTarget, type Targetable } from "./targeting";

function body(id: number, x: number, y: number, hp = 100): PelletBody {
  return { id, x, y, hp, leaked: false, counted: false };
}

function tozBlast(enemies: PelletBody[], aim: number, range = 200, radius = 8) {
  const toz = WEAPONS["toz"]!;
  return resolveShotgunBlast({
    origin: { x: 0, y: 0 },
    aim,
    range,
    hitRadius: radius,
    pelletCount: shotgunPelletCount(toz),
    spread: toz.spread ?? 0,
    primaryDamage: toz.damage,
    secondaryMult: shotgunSecondaryMult(toz),
    maxHits: shotgunMaxHits(toz),
    enemies,
    armorOf: () => 0,
    pen: 0,
  });
}

describe("shotgun catalog", () => {
  it("puts every shotgun on the shared pellet system", () => {
    const shotguns = Object.values(WEAPONS).filter((w) => w.cls === "shotgun");
    expect(shotguns.map((w) => w.id).sort()).toEqual(["mp133", "toz"]);
    for (const w of shotguns) {
      expect(isShotgunWeapon(w)).toBe(true);
      expect(shotgunPelletCount(w)).toBeGreaterThan(1);
      expect(w.spread).toBeGreaterThan(0);
      expect(shotgunMaxHits(w)).toBe(2);
      expect(shotgunSecondaryMult(w)).toBe(0.5);
    }
  });

  it("leaves pistols on single-hit behavior", () => {
    const pm = WEAPONS["pm"]!;
    expect(isShotgunWeapon(pm)).toBe(false);
    expect(pm.pellets).toBeUndefined();
    expect(pm.spread).toBeUndefined();
    expect(pm.damage).toBe(15);
  });
});

describe("TOZ pellet profile", () => {
  it("fires 9 pellets at 7 primary damage", () => {
    const toz = WEAPONS["toz"]!;
    expect(shotgunPelletCount(toz)).toBe(9);
    expect(toz.damage).toBe(7);
    expect(toz.damage * shotgunPelletCount(toz)).toBe(63);
    const angles = pelletAngles(0, 9, toz.spread ?? 0);
    expect(angles).toHaveLength(9);
    expect(angles[4]).toBeCloseTo(0);
  });
});

describe("pellet traces", () => {
  it("can strike different enemies in one blast", () => {
    const front = body(1, 40, 0);
    const side = body(2, 40, 12);
    const { strikes } = tozBlast([front, side], 0, 80, 10);
    const ids = new Set(strikes.map((s) => s.enemyId));
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(true);
  });

  it("applies primary then 50% secondary along one pellet, never a third", () => {
    const a = body(1, 30, 0, 100);
    const b = body(2, 60, 0, 100);
    const c = body(3, 90, 0, 100);
    const toz = WEAPONS["toz"]!;
    const intersections = pelletIntersections(0, 0, 0, 200, 8, [c, a, b]);
    expect(intersections.map((h) => h.id)).toEqual([1, 2, 3]);
    const pellet = strikesForPellet(intersections, toz.damage, 0.5, 2);
    expect(pellet).toHaveLength(2);
    expect(pellet[0]).toMatchObject({ enemyId: 1, rank: "primary", damage: 7 });
    expect(pellet[1]).toMatchObject({ enemyId: 2, rank: "secondary", damage: 3.5 });
    resolveShotgunBlast({
      origin: { x: 0, y: 0 },
      aim: 0,
      range: 200,
      hitRadius: 8,
      pelletCount: 1,
      spread: 0,
      primaryDamage: 7,
      secondaryMult: 0.5,
      maxHits: 2,
      enemies: [c, a, b],
      armorOf: () => 0,
      pen: 0,
    });
    expect(a.hp).toBe(100 - damageAfterArmor(7, 0, 0));
    expect(b.hp).toBe(100 - damageAfterArmor(3.5, 0, 0));
    expect(c.hp).toBe(100);
  });

  it("sorts intersections nearest-to-farthest, not array order", () => {
    const far = body(9, 80, 0);
    const near = body(2, 20, 0);
    const mid = body(5, 50, 0);
    const hits = pelletIntersections(0, 0, 0, 200, 8, [far, mid, near]);
    expect(hits.map((h) => h.id)).toEqual([2, 5, 9]);
    expect(hits[0]!.along).toBeLessThan(hits[1]!.along);
    expect(hits[1]!.along).toBeLessThan(hits[2]!.along);
  });

  it("routes pellet damage through applyHit", () => {
    const e = body(1, 40, 0, 80);
    const armor = 4;
    resolveShotgunBlast({
      origin: { x: 0, y: 0 },
      aim: 0,
      range: 80,
      hitRadius: 8,
      pelletCount: 1,
      spread: 0,
      primaryDamage: 7,
      secondaryMult: 0.5,
      maxHits: 2,
      enemies: [e],
      armorOf: () => armor,
      pen: 0,
    });
    const clone = body(1, 40, 0, 80);
    applyHit(clone, 7, armor, 0);
    expect(e.hp).toBe(clone.hp);
    expect(e.hp).toBe(80 - damageAfterArmor(7, armor, 0));
  });

  it("credits a shotgun kill once", () => {
    const e = body(1, 40, 0, 5);
    resolveShotgunBlast({
      origin: { x: 0, y: 0 },
      aim: 0,
      range: 80,
      hitRadius: 8,
      pelletCount: 3,
      spread: 0,
      primaryDamage: 7,
      secondaryMult: 0.5,
      maxHits: 2,
      enemies: [e],
      armorOf: () => 0,
      pen: 0,
    });
    const settled = settleRemovedEnemies([e]);
    expect(settled.kills).toHaveLength(1);
    const book: KillBook = { killed: 0, scavKills: 0, bossKills: 0, roubles: 0 };
    creditKillBook("scav", 20, book);
    expect(book.killed).toBe(1);
    expect(settleRemovedEnemies([e]).kills).toHaveLength(0);
  });
});

describe("shotgun targeting", () => {
  it("aims the cone at the selected target, not an incidental neighbor", () => {
    const weakFront: Targetable = { id: 1, x: 40, y: 0, hp: 8, pathProgress: 3 };
    const strongSide: Targetable = { id: 2, x: 40, y: 30, hp: 40, pathProgress: 2 };
    const origin = { x: 0, y: 0 };
    const strongest = pickAutoTarget("STRONGEST", origin, 80, [weakFront, strongSide]);
    expect(strongest?.id).toBe(2);
    const aim = Math.atan2(strongest!.y - origin.y, strongest!.x - origin.x);
    const angles = pelletAngles(aim, 9, WEAPONS["toz"]!.spread ?? 0);
    expect(angles[4]).toBeCloseTo(aim);
    expect(Math.abs(angles[4]!)).toBeGreaterThan(0.5);
  });

  it("does not retarget MANUAL after an incidental pellet hit", () => {
    const locked = body(1, 40, 0, 80);
    const beside = body(2, 40, 14, 80);
    tozBlast([locked, beside], 0, 80, 10);
    expect(beside.hp).toBeLessThan(80);
    const live: Targetable[] = [
      { id: 1, x: locked.x, y: locked.y, hp: locked.hp, pathProgress: 2 },
      { id: 2, x: beside.x, y: beside.y, hp: beside.hp, pathProgress: 2 },
    ];
    expect(selectTarget("MANUAL", { x: 0, y: 0 }, 80, live, 1)?.id).toBe(1);
  });
});

describe("shotgun obstruction", () => {
  const pal = MAP_BY_ID["woods"]!.palette;
  const map = buildMap({
    id: "sg-los",
    name: "SG",
    threat: 1,
    threatLabel: "T",
    desc: "",
    hpMult: 1,
    lootMult: 1,
    geo: { x: 0, y: 0 },
    sector: "T",
    path: [[0, 0], [1, 0]],
    props: [],
    checkpoint: [],
    cover: [],
    crates: [],
    palette: pal,
    collisionWalls: [],
    mountain: [[4, 2]],
  });
  const ox = 2.5 * TILE;
  const oy = 2.5 * TILE;

  it("a clear pellet behaves as before", () => {
    const e = body(1, 40, 0, 100);
    const { strikes } = tozBlast([e], 0, 80, 10);
    expect(strikes.some((s) => s.enemyId === 1)).toBe(true);
    expect(e.hp).toBeLessThan(100);
  });

  it("a pellet crossing a wall stops and cannot hit behind it", () => {
    const behind = body(1, 5.5 * TILE, 2.5 * TILE, 100);
    const before = body(2, 3.2 * TILE, 2.5 * TILE, 100);
    resolveShotgunBlast({
      origin: { x: ox, y: oy },
      aim: 0,
      range: 200,
      hitRadius: 12,
      pelletCount: 1,
      spread: 0,
      primaryDamage: 7,
      secondaryMult: 0.5,
      maxHits: 2,
      enemies: [behind, before],
      armorOf: () => 0,
      pen: 0,
      maxAlongOf: (angle) =>
        wallAlongLimit(map, { x: ox, y: oy }, ox + Math.cos(angle) * 200, oy + Math.sin(angle) * 200),
    });
    expect(before.hp).toBeLessThan(100);
    expect(behind.hp).toBe(100);
  });

  it("a pellet crossing a SOLID WALL stops and cannot hit behind it", () => {
    const solid = buildMap({
      id: "sg-solid",
      name: "SG",
      threat: 1,
      threatLabel: "T",
      desc: "",
      hpMult: 1,
      lootMult: 1,
      geo: { x: 0, y: 0 },
      sector: "T",
      path: [[0, 0], [1, 0]],
      props: [],
      checkpoint: [],
      cover: [],
      crates: [],
      palette: pal,
      collisionWalls: [{ tx: 3, ty: 2, edge: "E", kind: "SOLID" }],
    });
    const behind = body(1, 5.5 * TILE, 2.5 * TILE, 100);
    const before = body(2, 3.2 * TILE, 2.5 * TILE, 100);
    resolveShotgunBlast({
      origin: { x: ox, y: oy },
      aim: 0,
      range: 200,
      hitRadius: 12,
      pelletCount: 1,
      spread: 0,
      primaryDamage: 7,
      secondaryMult: 0.5,
      maxHits: 2,
      enemies: [behind, before],
      armorOf: () => 0,
      pen: 0,
      maxAlongOf: (angle) =>
        wallAlongLimit(solid, { x: ox, y: oy }, ox + Math.cos(angle) * 200, oy + Math.sin(angle) * 200),
    });
    expect(before.hp).toBeLessThan(100);
    expect(behind.hp).toBe(100);
  });

  it("a pellet whose ray misses a SOLID WALL still proceeds", () => {
    const solid = buildMap({
      id: "sg-solid-miss",
      name: "SG",
      threat: 1,
      threatLabel: "T",
      desc: "",
      hpMult: 1,
      lootMult: 1,
      geo: { x: 0, y: 0 },
      sector: "T",
      path: [[0, 0], [1, 0]],
      props: [],
      checkpoint: [],
      cover: [],
      crates: [],
      palette: pal,
      collisionWalls: [{ tx: 3, ty: 2, edge: "E", kind: "SOLID" }],
    });
    const side = body(1, ox, 0.5 * TILE, 100);
    resolveShotgunBlast({
      origin: { x: ox, y: oy },
      aim: -Math.PI / 2,
      range: 200,
      hitRadius: 12,
      pelletCount: 1,
      spread: 0,
      primaryDamage: 7,
      secondaryMult: 0.5,
      maxHits: 2,
      enemies: [side],
      armorOf: () => 0,
      pen: 0,
      maxAlongOf: (angle) =>
        wallAlongLimit(solid, { x: ox, y: oy }, ox + Math.cos(angle) * 200, oy + Math.sin(angle) * 200),
    });
    expect(side.hp).toBeLessThan(100);
  });

  it("a pellet whose ray misses the wall still proceeds", () => {
    const side = body(1, ox, 0.5 * TILE, 100);
    resolveShotgunBlast({
      origin: { x: ox, y: oy },
      aim: -Math.PI / 2,
      range: 200,
      hitRadius: 12,
      pelletCount: 1,
      spread: 0,
      primaryDamage: 7,
      secondaryMult: 0.5,
      maxHits: 2,
      enemies: [side],
      armorOf: () => 0,
      pen: 0,
      maxAlongOf: (angle) =>
        wallAlongLimit(map, { x: ox, y: oy }, ox + Math.cos(angle) * 200, oy + Math.sin(angle) * 200),
    });
    expect(side.hp).toBeLessThan(100);
  });

  it("different pellets in one blast can be blocked or clear independently", () => {
    const east = body(1, 80, 0, 100);
    const north = body(2, 0, -80, 100);
    resolveShotgunBlast({
      origin: { x: 0, y: 0 },
      aim: 0,
      range: 120,
      hitRadius: 10,
      pelletCount: 2,
      spread: Math.PI / 2,
      primaryDamage: 7,
      secondaryMult: 0.5,
      maxHits: 1,
      enemies: [east, north],
      armorOf: () => 0,
      pen: 0,
      maxAlongOf: (angle) => (Math.abs(angle) < 0.2 ? 30 : null),
    });
    expect(east.hp).toBe(100);
    expect(north.hp).toBeLessThan(100);
  });

  it("secondary penetration still works before a wall and not behind it", () => {
    const a = body(1, 20, 0, 100);
    const b = body(2, 40, 0, 100);
    const c = body(3, 70, 0, 100);
    resolveShotgunBlast({
      origin: { x: 0, y: 0 },
      aim: 0,
      range: 200,
      hitRadius: 8,
      pelletCount: 1,
      spread: 0,
      primaryDamage: 7,
      secondaryMult: 0.5,
      maxHits: 2,
      enemies: [a, b, c],
      armorOf: () => 0,
      pen: 0,
      maxAlongOf: () => 55,
    });
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBeLessThan(100);
    expect(c.hp).toBe(100);
  });

  it("per-pellet barricade uses the same cover prot, not a shotgun-specific percent", () => {
    const protectedTarget = body(1, 40, 0, 100);
    const pieces: DefensePiece[] = [
      {
        id: 1,
        tx: 5,
        ty: 4,
        kind: "barricade",
        hp: 260,
        maxHp: 260,
        level: 1,
        edge: "W",
      },
    ];
    const prot = incomingCoverProtection(
      [],
      pieces,
      5,
      4,
      3 * TILE + TILE / 2,
      4 * TILE + TILE / 2,
      TILE,
    ).prot;
    expect(prot).toBeCloseTo(0.7);
    resolveShotgunBlast({
      origin: { x: 0, y: 0 },
      aim: 0,
      range: 80,
      hitRadius: 8,
      pelletCount: 1,
      spread: 0,
      primaryDamage: 10,
      secondaryMult: 0.5,
      maxHits: 1,
      enemies: [protectedTarget],
      armorOf: () => 0,
      pen: 0,
      coverProtOf: () => prot,
    });
    expect(protectedTarget.hp).toBeCloseTo(100 - 10 * (1 - prot));
  });

  it("shotgun kill settlement remains once with obstruction", () => {
    const e = body(1, 20, 0, 5);
    resolveShotgunBlast({
      origin: { x: 0, y: 0 },
      aim: 0,
      range: 80,
      hitRadius: 8,
      pelletCount: 3,
      spread: 0,
      primaryDamage: 7,
      secondaryMult: 0.5,
      maxHits: 2,
      enemies: [e],
      armorOf: () => 0,
      pen: 0,
      maxAlongOf: () => 60,
    });
    expect(settleRemovedEnemies([e]).kills).toHaveLength(1);
    expect(settleRemovedEnemies([e]).kills).toHaveLength(0);
  });
});
