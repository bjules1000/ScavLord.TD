import { describe, expect, it } from "bun:test";
import { applyHit, creditKillBook, damageAfterArmor, settleRemovedEnemies, type KillBook } from "./combat";
import { WEAPONS } from "./gear";
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
