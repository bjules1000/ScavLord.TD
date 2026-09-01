import { describe, expect, it } from "bun:test";
import { TILE } from "./data";
import {
  MAP_BY_ID,
  buildMap,
  coverProtectionFrom,
  isBuildable,
  isHighGround,
  isMountain,
  isRoad,
  isWater,
  type MapDef,
} from "./map";
import { hasSuspendedBridge } from "./surfaces";
import {
  BARRICADE_BUILD_COST,
  BARRICADE_COST,
  BARRICADE_EDGES,
  BARRICADE_HP,
  BARRICADE_REPAIR_COST,
  WIRE_BUILD_COST,
  WIRE_HP,
  WIRE_REPAIR_COST,
  WIRE_SLOW_DURATION,
  WIRE_SPEED_MULT,
  WIRE_WEAR_PER_CROSS,
  applyWireCrossing,
  barricadeCoverCell,
  canPlaceBarricade,
  canPlaceWire,
  canRepairDefense,
  clearWireContact,
  damageDefense,
  defenseStatus,
  edgeFromCursor,
  incomingCoverProtection,
  interceptingBarricade,
  liveWireAt,
  obstacleDrawAlpha,
  payDefense,
  repairDefense,
  type BarricadeEdge,
  type DefensePiece,
} from "./defenses";

function wall(partial: Partial<DefensePiece> & Pick<DefensePiece, "id" | "kind">): DefensePiece {
  const max = partial.kind === "wire" ? WIRE_HP : BARRICADE_HP;
  return {
    tx: 4,
    ty: 2,
    hp: max,
    maxHp: max,
    level: 1,
    ...partial,
  };
}

function woods() {
  return buildMap(MAP_BY_ID["woods"]!);
}

function placeFns(map: ReturnType<typeof woods>) {
  return {
    isRoadAt: (x: number, y: number) => isRoad(map, x, y),
    isBuildableAt: (x: number, y: number) => isBuildable(map, x, y),
    isBridgeAt: (x: number, y: number) => hasSuspendedBridge(map, x, y),
  };
}

function findGround(map: ReturnType<typeof woods>) {
  for (let ty = 0; ty < 13; ty++) {
    for (let tx = 0; tx < 20; tx++) {
      if (isRoad(map, tx, ty) || hasSuspendedBridge(map, tx, ty)) continue;
      if (isBuildable(map, tx, ty)) return { tx, ty };
    }
  }
  throw new Error("no legal ground tile");
}

function placeOn(
  pieces: DefensePiece[],
  tx: number,
  ty: number,
  edge: BarricadeEdge,
  id: number,
): DefensePiece {
  const piece = wall({ id, kind: "barricade", tx, ty, edge });
  pieces.push(piece);
  return piece;
}

const pal = MAP_BY_ID["woods"]!.palette;
function testMap(over: Partial<MapDef> = {}) {
  return buildMap({
    id: "def-test",
    name: "DEF TEST",
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

describe("four-sided barricade occupancy", () => {
  it("lets a legal GROUND tile hold NORTH, EAST, SOUTH, and WEST", () => {
    const map = woods();
    const { tx, ty } = findGround(map);
    const { isRoadAt, isBuildableAt, isBridgeAt } = placeFns(map);
    const pieces: DefensePiece[] = [];
    for (const edge of BARRICADE_EDGES) {
      expect(canPlaceBarricade(tx, ty, edge, isRoadAt, isBuildableAt, pieces, isBridgeAt)).toBe(true);
      placeOn(pieces, tx, ty, edge, pieces.length + 1);
    }
    expect(pieces.map((p) => p.edge)).toEqual(["N", "E", "S", "W"]);
    expect(pieces.every((p) => p.tx === tx && p.ty === ty)).toBe(true);
  });

  it("rejects a duplicate NORTH on the same tile while another edge stays valid", () => {
    const map = woods();
    const { tx, ty } = findGround(map);
    const { isRoadAt, isBuildableAt, isBridgeAt } = placeFns(map);
    const pieces: DefensePiece[] = [];
    placeOn(pieces, tx, ty, "N", 1);
    expect(canPlaceBarricade(tx, ty, "N", isRoadAt, isBuildableAt, pieces, isBridgeAt)).toBe(false);
    expect(canPlaceBarricade(tx, ty, "E", isRoadAt, isBuildableAt, pieces, isBridgeAt)).toBe(true);
  });

  it("rejects every edge on a ROAD tile", () => {
    const map = woods();
    const { isRoadAt, isBuildableAt, isBridgeAt } = placeFns(map);
    let roads = 0;
    for (let ty = 0; ty < 13; ty++) {
      for (let tx = 0; tx < 20; tx++) {
        if (!isRoad(map, tx, ty)) continue;
        roads += 1;
        for (const edge of BARRICADE_EDGES) {
          expect(canPlaceBarricade(tx, ty, edge, isRoadAt, isBuildableAt, [], isBridgeAt)).toBe(false);
        }
      }
    }
    expect(roads).toBeGreaterThan(0);
  });

  it("rejects WATER and MOUNTAIN tiles", () => {
    const map = testMap({ water: [[10, 8]], mountain: [[11, 8]] });
    const isRoadAt = (x: number, y: number) => isRoad(map, x, y);
    const isBuildableAt = (x: number, y: number) => isBuildable(map, x, y);
    expect(isWater(map, 10, 8)).toBe(true);
    expect(isMountain(map, 11, 8)).toBe(true);
    expect(canPlaceBarricade(10, 8, "N", isRoadAt, isBuildableAt, [])).toBe(false);
    expect(canPlaceBarricade(11, 8, "E", isRoadAt, isBuildableAt, [])).toBe(false);
  });

  it("allows HIGH_GROUND tiles that are not suspended bridges", () => {
    const map = woods();
    const { isRoadAt, isBuildableAt, isBridgeAt } = placeFns(map);
    let found = false;
    for (let ty = 0; ty < 13; ty++) {
      for (let tx = 0; tx < 20; tx++) {
        if (!isHighGround(map, tx, ty) || hasSuspendedBridge(map, tx, ty) || isRoad(map, tx, ty)) continue;
        if (!isBuildable(map, tx, ty)) continue;
        found = true;
        expect(canPlaceBarricade(tx, ty, "N", isRoadAt, isBuildableAt, [], isBridgeAt)).toBe(true);
      }
    }
    expect(found).toBe(true);
  });

  it("rejects suspended bridge overlays even over GROUND", () => {
    const map = woods();
    const { isRoadAt, isBuildableAt, isBridgeAt } = placeFns(map);
    expect(hasSuspendedBridge(map, 13, 5)).toBe(true);
    expect(hasSuspendedBridge(map, 13, 7)).toBe(true);
    for (const edge of BARRICADE_EDGES) {
      expect(canPlaceBarricade(13, 5, edge, isRoadAt, isBuildableAt, [], isBridgeAt)).toBe(false);
      expect(canPlaceBarricade(13, 7, edge, isRoadAt, isBuildableAt, [], isBridgeAt)).toBe(false);
    }
  });

  it("treats a destroyed edge as still occupied so it is repaired, not replaced", () => {
    const map = woods();
    const { tx, ty } = findGround(map);
    const { isRoadAt, isBuildableAt, isBridgeAt } = placeFns(map);
    const wreck = wall({ id: 1, kind: "barricade", tx, ty, edge: "N", hp: 0 });
    expect(canPlaceBarricade(tx, ty, "N", isRoadAt, isBuildableAt, [wreck], isBridgeAt)).toBe(false);
  });
});

describe("cursor edge preview", () => {
  it("identifies NORTH EAST SOUTH WEST from cursor vs tile center", () => {
    const tx = 5;
    const ty = 4;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    expect(edgeFromCursor(cx, cy - 10, tx, ty, TILE)).toBe("N");
    expect(edgeFromCursor(cx + 10, cy, tx, ty, TILE)).toBe("E");
    expect(edgeFromCursor(cx, cy + 10, tx, ty, TILE)).toBe("S");
    expect(edgeFromCursor(cx - 10, cy, tx, ty, TILE)).toBe("W");
  });

  it("is deterministic on the tile center and on a diagonal tie", () => {
    const tx = 5;
    const ty = 4;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    expect(edgeFromCursor(cx, cy, tx, ty, TILE)).toBe("N");
    expect(edgeFromCursor(cx + 8, cy - 8, tx, ty, TILE)).toBe("N");
  });

  it("draws a placed barricade at full opacity and a ghost below that", () => {
    expect(obstacleDrawAlpha(1, false)).toBe(1);
    expect(obstacleDrawAlpha(1, true)).toBeLessThan(1);
    expect(obstacleDrawAlpha(1, true)).toBeGreaterThan(0);
  });
});

describe("barricades never stop the route", () => {
  it("does not treat a barricade tile as a path occupant or a wire tile", () => {
    const map = woods();
    const { tx, ty } = findGround(map);
    const bags = wall({ id: 1, kind: "barricade", tx, ty, edge: "N" });
    expect(isRoad(map, bags.tx, bags.ty)).toBe(false);
    expect(liveWireAt([bags], bags.tx, bags.ty)).toBeNull();
    const cover = barricadeCoverCell(bags.tx, bags.ty, bags.edge!);
    expect(cover.tx !== bags.tx || cover.ty !== bags.ty).toBe(true);
  });
});

describe("directional cover", () => {
  it("protects from fire through the defended edge, not the opposite side", () => {
    const opTx = 5;
    const opTy = 4;
    const cover = [{ tx: 5, ty: 3, type: "full" as const }];
    const fromNorth = coverProtectionFrom(cover, opTx, opTy, 5 * TILE + TILE / 2, 3 * TILE + TILE / 2);
    const fromSouth = coverProtectionFrom(cover, opTx, opTy, 5 * TILE + TILE / 2, 6 * TILE + TILE / 2);
    expect(fromNorth).toBeGreaterThan(0.4);
    expect(fromSouth).toBe(0);
    const bags = barricadeCoverCell(5, 4, "N");
    expect(bags).toEqual({ tx: 5, ty: 3 });
  });

  it("uses each built edge independently instead of a stacked generic bonus", () => {
    const opTx = 5;
    const opTy = 4;
    const n = barricadeCoverCell(opTx, opTy, "N");
    const e = barricadeCoverCell(opTx, opTy, "E");
    const cover = [
      { tx: n.tx, ty: n.ty, type: "full" as const },
      { tx: e.tx, ty: e.ty, type: "full" as const },
    ];
    const north = coverProtectionFrom(cover, opTx, opTy, 5 * TILE + TILE / 2, 3 * TILE + TILE / 2);
    const east = coverProtectionFrom(cover, opTx, opTy, 6 * TILE + TILE / 2, 4 * TILE + TILE / 2);
    const south = coverProtectionFrom(cover, opTx, opTy, 5 * TILE + TILE / 2, 6 * TILE + TILE / 2);
    const west = coverProtectionFrom(cover, opTx, opTy, 4 * TILE + TILE / 2, 4 * TILE + TILE / 2);
    expect(north).toBeGreaterThan(0.4);
    expect(east).toBeGreaterThan(0.4);
    expect(south).toBe(0);
    expect(west).toBe(0);
    expect(north).toBe(east);
  });

  it("soaks hostile fire on the incoming edge only", () => {
    const pieces = [
      wall({ id: 1, kind: "barricade", tx: 5, ty: 4, edge: "N" }),
      wall({ id: 2, kind: "barricade", tx: 5, ty: 4, edge: "E" }),
    ];
    const fromNorth = interceptingBarricade(pieces, 5, 4, 5 * TILE + TILE / 2, 3 * TILE + TILE / 2, TILE);
    const fromEast = interceptingBarricade(pieces, 5, 4, 6 * TILE + TILE / 2, 4 * TILE + TILE / 2, TILE);
    expect(fromNorth?.id).toBe(1);
    expect(fromEast?.id).toBe(2);
  });

  it("incomingCoverProtection uses ray entry, not a second cover formula", () => {
    const pieces = [wall({ id: 1, kind: "barricade", tx: 5, ty: 4, edge: "N" })];
    const fromNorth = incomingCoverProtection(
      [],
      pieces,
      5,
      4,
      5 * TILE + TILE / 2,
      3 * TILE + TILE / 2,
      TILE,
    );
    const fromSouth = incomingCoverProtection(
      [],
      pieces,
      5,
      4,
      5 * TILE + TILE / 2,
      6 * TILE + TILE / 2,
      TILE,
    );
    expect(fromNorth.prot).toBeCloseTo(0.7);
    expect(fromSouth.prot).toBe(0);
  });
});

describe("barricade durability", () => {
  it("has deterministic max HP, independent edge state, and prep-only repair", () => {
    const north = wall({ id: 1, kind: "barricade", tx: 5, ty: 4, edge: "N" });
    const east = wall({ id: 2, kind: "barricade", tx: 5, ty: 4, edge: "E" });
    expect(north.hp).toBe(BARRICADE_HP);
    damageDefense(north, 80);
    expect(north.hp).toBe(BARRICADE_HP - 80);
    expect(east.hp).toBe(BARRICADE_HP);
    expect(canRepairDefense("combat", north.hp, north.maxHp)).toBe(false);
    expect(repairDefense(north, "combat", 500, "barricade").ok).toBe(false);
    const paid = repairDefense(north, "prep", 500, "barricade");
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(paid.roubles).toBe(500 - BARRICADE_REPAIR_COST.amount);
    expect(north.hp).toBe(BARRICADE_HP);
    expect(east.hp).toBe(BARRICADE_HP);
  });
});

describe("barricade build cost", () => {
  it("is 300 raid roubles from a single centralized definition", () => {
    expect(BARRICADE_BUILD_COST.resource).toBe("RAID_ROUBLES");
    expect(BARRICADE_BUILD_COST.amount).toBe(300);
    expect(BARRICADE_COST).toBe(BARRICADE_BUILD_COST.amount);
    expect(BARRICADE_REPAIR_COST.amount).toBe(80);
    const paid = payDefense(400, BARRICADE_BUILD_COST);
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(paid.roubles).toBe(100);
    expect(payDefense(299, BARRICADE_BUILD_COST).ok).toBe(false);
  });
});

describe("wire slow and durability", () => {
  it("is road-only", () => {
    const map = woods();
    expect(canPlaceWire(13, 7, (x, y) => isRoad(map, x, y), [])).toBe(true);
    expect(canPlaceWire(4, 1, (x, y) => isRoad(map, x, y), [])).toBe(false);
  });

  it("slows on first contact and wears durability once per traversal", () => {
    const wire = wall({ id: 7, kind: "wire" });
    const enemy = { contactingWireId: null as number | null };
    const first = applyWireCrossing(wire, enemy);
    expect(first.slowed).toBe(true);
    expect(first.wore).toBe(true);
    expect(wire.hp).toBe(WIRE_HP - WIRE_WEAR_PER_CROSS);
    expect(enemy.contactingWireId).toBe(7);
    const held = applyWireCrossing(wire, enemy);
    expect(held.slowed).toBe(true);
    expect(held.wore).toBe(false);
    expect(wire.hp).toBe(WIRE_HP - WIRE_WEAR_PER_CROSS);
    expect(WIRE_SLOW_DURATION).toBeGreaterThan(0);
    expect(WIRE_SPEED_MULT).toBe(0.45);
  });

  it("lets multiple enemies each consume one crossing", () => {
    const wire = wall({ id: 7, kind: "wire" });
    applyWireCrossing(wire, { contactingWireId: null });
    applyWireCrossing(wire, { contactingWireId: null });
    expect(wire.hp).toBe(WIRE_HP - WIRE_WEAR_PER_CROSS * 2);
  });

  it("cannot drop durability below zero and stops slowing when destroyed", () => {
    const wire = wall({ id: 7, kind: "wire", hp: WIRE_WEAR_PER_CROSS / 2, maxHp: WIRE_HP });
    const enemy = { contactingWireId: null as number | null };
    applyWireCrossing(wire, enemy);
    expect(wire.hp).toBe(0);
    const again = applyWireCrossing(wire, enemy);
    expect(again.slowed).toBe(false);
    expect(liveWireAt([wire], wire.tx, wire.ty)).toBeNull();
  });

  it("clears contact when the enemy leaves so a later re-entry wears again", () => {
    const wire = wall({ id: 7, kind: "wire" });
    const enemy = { contactingWireId: null as number | null };
    applyWireCrossing(wire, enemy);
    clearWireContact(enemy, null);
    expect(enemy.contactingWireId).toBeNull();
    applyWireCrossing(wire, enemy);
    expect(wire.hp).toBe(WIRE_HP - WIRE_WEAR_PER_CROSS * 2);
  });

  it("repairs destroyed wire between waves for 50₽ and refuses mid-wave repair", () => {
    const wire = wall({ id: 7, kind: "wire", hp: 0, maxHp: WIRE_HP });
    expect(repairDefense(wire, "combat", 500, "wire").ok).toBe(false);
    const paid = repairDefense(wire, "prep", 500, "wire");
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(paid.roubles).toBe(500 - WIRE_REPAIR_COST.amount);
    expect(WIRE_REPAIR_COST.amount).toBe(50);
    expect(wire.hp).toBe(WIRE_HP);
    expect(liveWireAt([wire], wire.tx, wire.ty)?.id).toBe(7);
  });
});

describe("maps", () => {
  it("loads Pine Cut and GRAIN GATE", () => {
    expect(MAP_BY_ID["woods"]).toBeDefined();
    expect(MAP_BY_ID["kolkhoz"]).toBeDefined();
    for (const id of ["woods", "kolkhoz"] as const) {
      const map = buildMap(MAP_BY_ID[id]!);
      expect(map.lanes.length).toBeGreaterThan(0);
      expect(map.PIX.length).toBeGreaterThan(1);
    }
  });
});
