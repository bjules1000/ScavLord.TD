import { describe, expect, it } from "bun:test";
import { absorbWithArmor } from "./armor";
import { applyHit } from "./combat";
import { TILE } from "./data";
import {
  BARRICADE_HP,
  COVER_MISS_FACTOR,
  canPlaceBarricade,
  coveredDamage,
  incomingCoverProtection,
  type DefensePiece,
} from "./defenses";
import { ARMORS } from "./gear";
import {
  bridgeDeckSeparates,
  clipWorldSegment,
  crossedTileEdges,
  firstWallAlong,
  hasLineOfSight,
  isRaidSightBlockedAcrossEdge,
  tileCenterWorld,
  traceLineOfSight,
  wallAlongLimit,
  worldToTile,
} from "./los";
import { MAP_BY_ID, buildMap, type MapDef } from "./map";
import {
  findOperatorPath,
  isRaidMovementBlockedAcrossEdge,
  operatorCanFire,
} from "./movement";
import { applyHighGroundCombat, grantsHighGroundCombatBonus } from "./surfaces";
import { pickAutoTarget, pickManualTarget, selectTarget, type Targetable } from "./targeting";
import type { SurfaceLevel, Tower } from "./types";

const pal = MAP_BY_ID["woods"]!.palette;

function testMap(over: Partial<MapDef> = {}) {
  return buildMap({
    id: "los-test",
    name: "LOS TEST",
    threat: 1,
    threatLabel: "TEST",
    desc: "",
    hpMult: 1,
    lootMult: 1,
    geo: { x: 0, y: 0 },
    sector: "T",
    path: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    props: [],
    checkpoint: [],
    cover: [],
    crates: [],
    palette: pal,
    ...over,
  });
}

function at(tx: number, ty: number, surface: SurfaceLevel = "GROUND", fx = 0.5, fy = 0.5) {
  return { x: (tx + fx) * TILE, y: (ty + fy) * TILE, surface };
}

function foe(partial: Partial<Targetable> & Pick<Targetable, "id">): Targetable {
  return { x: 0, y: 0, hp: 10, pathProgress: 0, ...partial };
}

function bag(edge: "N" | "E" | "S" | "W", hp = BARRICADE_HP): DefensePiece {
  return {
    id: 1,
    tx: 5,
    ty: 4,
    kind: "barricade",
    hp,
    maxHp: BARRICADE_HP,
    level: 1,
    edge,
  };
}

describe("LOS geometry", () => {
  it("adjacent tiles with no wall have LOS", () => {
    const map = testMap();
    expect(hasLineOfSight(map, at(3, 3), at(4, 3))).toBe(true);
    expect(isRaidSightBlockedAcrossEdge(map, [3, 3], [4, 3])).toBe(false);
  });

  it("wall between adjacent tiles blocks LOS", () => {
    const map = testMap({ collisionWalls: [{ tx: 3, ty: 3, edge: "E" }] });
    expect(hasLineOfSight(map, at(3, 3), at(4, 3))).toBe(false);
    expect(traceLineOfSight(map, at(3, 3), at(4, 3)).blocker).toBe("WALL");
  });

  it("same wall blocks the reverse ray", () => {
    const map = testMap({ collisionWalls: [{ tx: 3, ty: 3, edge: "E" }] });
    expect(hasLineOfSight(map, at(4, 3), at(3, 3))).toBe(false);
    expect(isRaidSightBlockedAcrossEdge(map, [4, 3], [3, 3])).toBe(true);
  });

  it("multi-tile ray with no walls is clear", () => {
    const map = testMap();
    expect(hasLineOfSight(map, at(1, 2), at(6, 2))).toBe(true);
    expect(crossedTileEdges(at(1, 2).x, at(1, 2).y, at(6, 2).x, at(6, 2).y).length).toBeGreaterThan(1);
  });

  it("multi-tile ray crossing a wall is blocked", () => {
    const map = testMap({ collisionWalls: [{ tx: 3, ty: 2, edge: "E" }] });
    expect(hasLineOfSight(map, at(1, 2), at(6, 2))).toBe(false);
  });

  it("wall not intersected by the ray does not block", () => {
    const map = testMap({ collisionWalls: [{ tx: 3, ty: 4, edge: "S" }] });
    expect(hasLineOfSight(map, at(1, 2), at(6, 2))).toBe(true);
  });

  it("exact-corner traversal cannot peek through a blocked L", () => {
    const map = testMap({
      collisionWalls: [
        { tx: 2, ty: 2, edge: "E" },
        { tx: 2, ty: 2, edge: "S" },
      ],
    });
    const a = at(2, 2);
    const d = at(3, 3);
    expect(hasLineOfSight(map, a, d)).toBe(false);
    expect(hasLineOfSight(map, d, a)).toBe(false);
  });

  it("nearby corner ray is deterministic", () => {
    const map = testMap({
      collisionWalls: [
        { tx: 2, ty: 2, edge: "E" },
        { tx: 2, ty: 2, edge: "S" },
      ],
    });
    const a = at(2, 2);
    const northOf = { x: at(3, 3).x, y: at(3, 3).y + 2, surface: "GROUND" as const };
    const eastOf = { x: at(3, 3).x + 2, y: at(3, 3).y, surface: "GROUND" as const };
    expect(hasLineOfSight(map, a, northOf)).toBe(false);
    expect(hasLineOfSight(map, a, eastOf)).toBe(false);
  });

  it("continuous non-center world positions work", () => {
    const map = testMap({ collisionWalls: [{ tx: 2, ty: 5, edge: "E" }] });
    const from = at(2, 5, "GROUND", 0.2, 0.7);
    const to = at(3, 5, "GROUND", 0.8, 0.3);
    expect(hasLineOfSight(map, from, to)).toBe(false);
    expect(hasLineOfSight(testMap(), from, to)).toBe(true);
  });

  it("map bounds are handled safely", () => {
    const map = testMap();
    expect(hasLineOfSight(map, { x: -40, y: TILE / 2, surface: "GROUND" }, at(1, 0))).toBe(true);
    expect(hasLineOfSight(map, at(18, 11), { x: 30 * TILE, y: 20 * TILE, surface: "GROUND" })).toBe(true);
    expect(() => worldToTile(-8, -8)).not.toThrow();
    expect(clipWorldSegment(map, at(1, 1), at(2, 1).x, at(2, 1).y)).toEqual({
      x: at(2, 1).x,
      y: at(2, 1).y,
    });
  });
});

describe("LOS surfaces and bridge deck", () => {
  it("LOW → LOW is clear when no wall", () => {
    const map = testMap();
    expect(hasLineOfSight(map, at(4, 4, "GROUND"), at(5, 4, "GROUND"))).toBe(true);
  });

  it("HIGH → HIGH is clear when no wall", () => {
    const map = testMap({ highGround: [[4, 4], [5, 4]] });
    expect(hasLineOfSight(map, at(4, 4, "HIGH"), at(5, 4, "HIGH"))).toBe(true);
  });

  it("HIGH_GROUND wall still blocks LOS", () => {
    const map = testMap({
      highGround: [[4, 4], [5, 4]],
      collisionWalls: [{ tx: 4, ty: 4, edge: "E" }],
    });
    expect(hasLineOfSight(map, at(4, 4, "HIGH"), at(5, 4, "HIGH"))).toBe(false);
    expect(grantsHighGroundCombatBonus(map, 4, 4)).toBe(true);
  });

  it("HIGH bridge → HIGH bridge is clear where geometry allows", () => {
    const map = testMap({
      bridges: [
        { tx: 6, ty: 3, orientation: "H" },
        { tx: 7, ty: 3, orientation: "H" },
      ],
    });
    expect(hasLineOfSight(map, at(6, 3, "HIGH"), at(7, 3, "HIGH"))).toBe(true);
  });

  it("LOW road beneath a bridge remains a valid LOS plane", () => {
    const map = testMap({
      bridges: [
        { tx: 6, ty: 3, orientation: "H" },
        { tx: 7, ty: 3, orientation: "H" },
      ],
    });
    expect(hasLineOfSight(map, at(6, 3, "GROUND"), at(7, 3, "GROUND"))).toBe(true);
  });

  it("HIGH bridge cannot shoot LOW under the same footprint", () => {
    const map = testMap({
      bridges: [
        { tx: 6, ty: 3, orientation: "H" },
        { tx: 7, ty: 3, orientation: "H" },
      ],
    });
    expect(bridgeDeckSeparates(map, at(6, 3, "HIGH"), at(6, 3, "GROUND"))).toBe(true);
    expect(hasLineOfSight(map, at(6, 3, "HIGH"), at(6, 3, "GROUND"))).toBe(false);
    expect(traceLineOfSight(map, at(6, 3, "HIGH"), at(7, 3, "GROUND")).blocker).toBe("BRIDGE_DECK");
  });

  it("LOW under the bridge cannot shoot HIGH on the deck", () => {
    const map = testMap({
      bridges: [{ tx: 6, ty: 3, orientation: "H" }],
    });
    expect(hasLineOfSight(map, at(6, 3, "GROUND"), at(6, 3, "HIGH"))).toBe(false);
  });

  it("bridge deck does not globally block HIGH→LOW outside the footprint", () => {
    const map = testMap({
      bridges: [{ tx: 6, ty: 3, orientation: "H" }],
    });
    expect(hasLineOfSight(map, at(6, 3, "HIGH"), at(8, 5, "GROUND"))).toBe(true);
    expect(bridgeDeckSeparates(map, at(6, 3, "HIGH"), at(8, 5, "GROUND"))).toBe(false);
  });

  it("LOS helpers do not change movement or pathfinding", () => {
    const map = testMap({
      highGround: [[2, 2]],
      collisionWalls: [{ tx: 4, ty: 4, edge: "E" }],
      bridges: [{ tx: 3, ty: 3, orientation: "V" }],
    });
    expect(isRaidMovementBlockedAcrossEdge(map, [4, 4], [5, 4])).toBe(true);
    expect(isRaidSightBlockedAcrossEdge(map, [4, 4], [5, 4])).toBe(true);
    const path = findOperatorPath(map, { tx: 3, ty: 4, surface: "GROUND" }, { tx: 6, ty: 4, surface: "GROUND" });
    expect(path).not.toBeNull();
    expect(path!.some((n) => n.tx === 4 && n.ty === 4 && n.surface === "HIGH")).toBe(false);
  });

  it("MOUNTAIN occupancy is not an extra LOS body without an authored wall", () => {
    const map = testMap({ mountain: [[5, 5]] });
    expect(hasLineOfSight(map, at(4, 5), at(6, 5))).toBe(true);
  });

  it("trees and crates do not block LOS", () => {
    const map = testMap({
      props: [{ tx: 5, ty: 4, type: "tree" }],
      crates: [[5, 5]],
    });
    expect(hasLineOfSight(map, at(4, 4), at(6, 4))).toBe(true);
    expect(hasLineOfSight(map, at(4, 5), at(6, 5))).toBe(true);
  });
});

describe("targeting with LOS", () => {
  const origin = { x: 0, y: 0 };
  const pack: Targetable[] = [
    foe({ id: 1, x: 10, y: 0, hp: 8, pathProgress: 4.2 }),
    foe({ id: 2, x: 30, y: 0, hp: 40, pathProgress: 1.1 }),
    foe({ id: 3, x: 50, y: 0, hp: 40, pathProgress: 2.5 }),
  ];
  const hidden = (id: number) => (e: Targetable) => e.id !== id;

  it("FIRST ignores LOS-blocked enemies", () => {
    expect(pickAutoTarget("FIRST", origin, 100, pack, hidden(1))?.id).toBe(3);
  });

  it("LAST ignores LOS-blocked enemies", () => {
    expect(pickAutoTarget("LAST", origin, 100, pack, hidden(2))?.id).toBe(3);
  });

  it("CLOSEST ignores LOS-blocked enemies", () => {
    expect(pickAutoTarget("CLOSEST", origin, 100, pack, hidden(1))?.id).toBe(2);
  });

  it("STRONGEST ignores LOS-blocked enemies", () => {
    expect(pickAutoTarget("STRONGEST", origin, 100, pack, hidden(3))?.id).toBe(2);
  });

  it("visible candidate ranking is unchanged", () => {
    expect(pickAutoTarget("FIRST", origin, 100, pack)?.id).toBe(1);
    expect(pickAutoTarget("LAST", origin, 100, pack)?.id).toBe(2);
    expect(pickAutoTarget("CLOSEST", origin, 100, pack)?.id).toBe(1);
    expect(pickAutoTarget("STRONGEST", origin, 100, pack)?.id).toBe(3);
  });

  it("holds fire when no visible enemy is in range", () => {
    expect(pickAutoTarget("FIRST", origin, 100, pack, () => false)).toBeNull();
    expect(selectTarget("FIRST", origin, 5, pack, null, () => true)).toBeNull();
  });

  it("MANUAL blocked target holds fire but lock stays valid", () => {
    expect(pickManualTarget(2, origin, 100, pack)?.id).toBe(2);
    expect(selectTarget("MANUAL", origin, 100, pack, 2, () => false)).toBeNull();
    expect(pickManualTarget(2, origin, 100, pack)?.id).toBe(2);
  });

  it("MANUAL fires again when LOS clears", () => {
    expect(selectTarget("MANUAL", origin, 100, pack, 2, () => false)).toBeNull();
    expect(selectTarget("MANUAL", origin, 100, pack, 2, () => true)?.id).toBe(2);
  });

  it("out-of-range MANUAL behavior is unchanged", () => {
    expect(pickManualTarget(2, origin, 20, pack)).toBeNull();
    expect(selectTarget("MANUAL", origin, 20, pack, 2)?.id).toBeUndefined();
  });
});

describe("barricade cover vs LOS", () => {
  const opTx = 5;
  const opTy = 4;
  const north = 5 * TILE + TILE / 2;
  const fromN = { x: north, y: 3 * TILE + TILE / 2 };
  const fromS = { x: north, y: 6 * TILE + TILE / 2 };
  const fromE = { x: 6 * TILE + TILE / 2, y: 4 * TILE + TILE / 2 };
  const fromW = { x: 4 * TILE + TILE / 2, y: 4 * TILE + TILE / 2 };

  it("barricade does not block target acquisition", () => {
    const map = testMap();
    expect(hasLineOfSight(map, at(5, 3), at(5, 4))).toBe(true);
  });

  it("NORTH barricade protects from the north only", () => {
    const pieces = [bag("N")];
    const n = incomingCoverProtection([], pieces, opTx, opTy, fromN.x, fromN.y, TILE);
    const s = incomingCoverProtection([], pieces, opTx, opTy, fromS.x, fromS.y, TILE);
    expect(n.prot).toBeGreaterThan(0.4);
    expect(s.prot).toBe(0);
    expect(n.shield?.edge).toBe("N");
  });

  it("EAST SOUTH WEST directional cases", () => {
    expect(incomingCoverProtection([], [bag("E")], opTx, opTy, fromE.x, fromE.y, TILE).prot).toBeGreaterThan(0.4);
    expect(incomingCoverProtection([], [bag("E")], opTx, opTy, fromW.x, fromW.y, TILE).prot).toBe(0);
    expect(incomingCoverProtection([], [bag("S")], opTx, opTy, fromS.x, fromS.y, TILE).prot).toBeGreaterThan(0.4);
    expect(incomingCoverProtection([], [bag("S")], opTx, opTy, fromN.x, fromN.y, TILE).prot).toBe(0);
    expect(incomingCoverProtection([], [bag("W")], opTx, opTy, fromW.x, fromW.y, TILE).prot).toBeGreaterThan(0.4);
    expect(incomingCoverProtection([], [bag("W")], opTx, opTy, fromE.x, fromE.y, TILE).prot).toBe(0);
  });

  it("destroyed barricade provides no protection", () => {
    const pieces = [bag("N", 0)];
    expect(incomingCoverProtection([], pieces, opTx, opTy, fromN.x, fromN.y, TILE).prot).toBe(0);
  });

  it("outgoing fire is not blocked by the protected operator's own barricade", () => {
    const map = testMap();
    expect(hasLineOfSight(map, at(5, 4), at(5, 2))).toBe(true);
    expect(incomingCoverProtection([], [bag("N")], opTx, opTy, at(5, 4).x, at(5, 4).y, TILE).prot).toBe(0);
  });

  it("existing cover math is unchanged when cover applies", () => {
    const n = incomingCoverProtection([], [bag("N")], opTx, opTy, fromN.x, fromN.y, TILE);
    expect(n.prot).toBeCloseTo(0.7);
    expect(coveredDamage(10, n.prot)).toBeCloseTo(3);
    expect(COVER_MISS_FACTOR).toBe(0.55);
  });

  it("armor still resolves after cover", () => {
    const incoming = coveredDamage(20, 0.7);
    const paca = absorbWithArmor(incoming, "paca", ARMORS["paca"]!.durability);
    const raw = absorbWithArmor(20, "paca", ARMORS["paca"]!.durability);
    expect(paca.damage).toBeLessThan(raw.damage);
    expect(paca.damage).toBeCloseTo(incoming * (1 - ARMORS["paca"]!.reduction));
  });

  it("barricades remain non-blocking for movement", () => {
    const map = testMap();
    expect(canPlaceBarricade(4, 4, "N", () => false, () => true, [])).toBe(true);
    const path = findOperatorPath(map, { tx: 4, ty: 4, surface: "GROUND" }, { tx: 6, ty: 4, surface: "GROUND" });
    expect(path).not.toBeNull();
  });
});

describe("combat integration with LOS", () => {
  it("blocked LOS means the operator cannot engage that target", () => {
    const map = testMap({ collisionWalls: [{ tx: 2, ty: 2, edge: "E" }] });
    const origin = tileCenterWorld(2, 2);
    const enemies = [foe({ id: 1, x: tileCenterWorld(3, 2).x, y: tileCenterWorld(3, 2).y, pathProgress: 1 })];
    const visible = (e: Targetable) =>
      hasLineOfSight(map, { ...origin, surface: "GROUND" }, { x: e.x, y: e.y, surface: "GROUND" });
    expect(selectTarget("FIRST", origin, 200, enemies, null, visible)).toBeNull();
  });

  it("clear LOS still leaves accuracy as a separate check", () => {
    const map = testMap();
    expect(hasLineOfSight(map, at(1, 1), at(3, 1))).toBe(true);
    const boosted = applyHighGroundCombat(100, 0.5, map, 1, 1);
    expect(boosted.accuracy).toBe(0.5);
  });

  it("cover is not a second LOS miss", () => {
    const map = testMap();
    expect(hasLineOfSight(map, at(5, 3), at(5, 4))).toBe(true);
    const prot = incomingCoverProtection([], [bag("N")], 5, 4, at(5, 3).x, at(5, 3).y, TILE).prot;
    expect(prot).toBeGreaterThan(0);
  });

  it("moving operators still cannot fire", () => {
    const moving = { move: { x: 0, y: 0, path: [{ tx: 1, ty: 1, surface: "GROUND" as const }], dest: { tx: 1, ty: 1, surface: "GROUND" as const }, pendingDest: null } };
    expect(operatorCanFire(moving as Pick<Tower, "move">)).toBe(false);
    expect(operatorCanFire({ move: null })).toBe(true);
  });

  it("HIGH_GROUND keeps +12% range and +0.05 accuracy", () => {
    const map = testMap({ highGround: [[4, 4]] });
    const boosted = applyHighGroundCombat(100, 0.7, map, 4, 4);
    expect(boosted.range).toBeCloseTo(112);
    expect(boosted.accuracy).toBeCloseTo(0.75);
  });

  it("suspended bridge gets no high-ground combat bonus", () => {
    const map = testMap({ bridges: [{ tx: 6, ty: 3, orientation: "H" }] });
    const boosted = applyHighGroundCombat(100, 0.7, map, 6, 3);
    expect(boosted.range).toBe(100);
    expect(boosted.accuracy).toBe(0.7);
    expect(grantsHighGroundCombatBonus(map, 6, 3)).toBe(false);
  });

  it("weight does not affect LOS", () => {
    const map = testMap({ collisionWalls: [{ tx: 2, ty: 2, edge: "E" }] });
    expect(hasLineOfSight(map, at(2, 2), at(3, 2))).toBe(false);
    expect(hasLineOfSight(testMap(), at(2, 2), at(3, 2))).toBe(true);
  });

  it("kills still settle once after a covered hit", () => {
    const e = { hp: 3, leaked: false, counted: false };
    applyHit(e, coveredDamage(10, 0.7), 0, 0);
    expect(e.hp).toBeLessThanOrEqual(0);
  });

  it("Pine Cut authored walls are unchanged", () => {
    expect(MAP_BY_ID["woods"]!.collisionWalls).toHaveLength(91);
  });

  it("wallAlongLimit clips a tracer to the obstruction", () => {
    const map = testMap({ collisionWalls: [{ tx: 2, ty: 2, edge: "E" }] });
    const from = at(2, 2);
    const to = at(4, 2);
    const along = wallAlongLimit(map, from, to.x, to.y);
    expect(along).not.toBeNull();
    expect(along!).toBeLessThan(Math.hypot(to.x - from.x, to.y - from.y));
    const clip = clipWorldSegment(map, from, to.x, to.y);
    expect(clip.x).toBeCloseTo(from.x + TILE / 2, 5);
  });
});
