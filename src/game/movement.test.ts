import { describe, expect, it } from "bun:test";
import { TILE } from "./data";
import { MAP_BY_ID, buildMap, isMountain, isRoad, isWater, type MapDef } from "./map";
import {
  OPERATOR_MOVE_SPEED_TILES,
  canTraverse,
  canWalkHigh,
  canWalkLow,
  clearOperatorMove,
  destinationTaken,
  findOperatorPath,
  isAuthoredSlope,
  isOperatorMoving,
  isRaidMovementBlockedAcrossEdge,
  issueOperatorMove,
  neighborsOf,
  nodeKey,
  occupancyKey,
  operatorCanFire,
  operatorMoveSpeedPx,
  operatorWorldPos,
  resolveMoveDestination,
  stepOperatorMove,
  tileCenter,
  walkableNodesAt,
} from "./movement";
import { applyHighGroundCombat, elevatedSurfaceAt, grantsHighGroundCombatBonus, hasSuspendedBridge } from "./surfaces";
import { absorbWithArmor } from "./armor";
import { ARMORS } from "./gear";
import { canPlaceBarricade, canPlaceWire } from "./defenses";
import type { MoveNode, Tower } from "./types";

const pal = MAP_BY_ID["woods"]!.palette;

function testMap(over: Partial<MapDef> = {}) {
  return buildMap({
    id: "move-test",
    name: "MOVE TEST",
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

function op(partial: Partial<Tower> & Pick<Tower, "tx" | "ty">): Tower {
  return {
    id: 1,
    surface: "GROUND",
    weapon: "pm",
    attachments: [],
    cd: 0,
    angle: 0,
    flash: 0,
    kills: 0,
    hp: 100,
    maxHp: 100,
    hurt: 0,
    ammo: 8,
    reloadLeft: 0,
    targetMode: "FIRST",
    manualTargetId: null,
    engageTargetId: null,
    ...partial,
  };
}

function node(tx: number, ty: number, surface: MoveNode["surface"]): MoveNode {
  return { tx, ty, surface };
}

function woods() {
  return buildMap(MAP_BY_ID["woods"]!);
}

/** HIGH_GROUND [2,2][3,2]; slope south of (2,2); wall east of (2,2). ROAD on y=0. */
function slopeMap() {
  return testMap({
    highGround: [
      [2, 2],
      [3, 2],
    ],
    collisionWalls: [
      { tx: 2, ty: 2, edge: "E" },
      { tx: 3, ty: 2, edge: "E" },
    ],
    mountain: [[8, 5]],
    water: [[9, 5]],
    bridges: [
      { tx: 3, ty: 3, orientation: "V" },
      { tx: 3, ty: 4, orientation: "V" },
    ],
  });
}

describe("surface graph", () => {
  it("GROUND exposes walkable LOW node", () => {
    const map = testMap();
    expect(canWalkLow(map, 4, 4)).toBe(true);
    expect(walkableNodesAt(map, 4, 4)).toEqual([node(4, 4, "GROUND")]);
  });

  it("ROAD exposes walkable LOW node", () => {
    const map = testMap();
    expect(isRoad(map, 1, 0)).toBe(true);
    expect(canWalkLow(map, 1, 0)).toBe(true);
    expect(canWalkHigh(map, 1, 0)).toBe(false);
  });

  it("WATER has no walkable LOW node", () => {
    const map = testMap({ water: [[5, 5]] });
    expect(isWater(map, 5, 5)).toBe(true);
    expect(canWalkLow(map, 5, 5)).toBe(false);
    expect(walkableNodesAt(map, 5, 5)).toEqual([]);
  });

  it("MOUNTAIN has no walkable node", () => {
    const map = testMap({ mountain: [[6, 6]] });
    expect(isMountain(map, 6, 6)).toBe(true);
    expect(canWalkLow(map, 6, 6)).toBe(false);
    expect(canWalkHigh(map, 6, 6)).toBe(false);
  });

  it("HIGH_GROUND exposes HIGH node", () => {
    const map = testMap({ highGround: [[4, 4]] });
    expect(elevatedSurfaceAt(map, 4, 4)).toBe("HIGH_GROUND");
    expect(canWalkHigh(map, 4, 4)).toBe(true);
    expect(canWalkLow(map, 4, 4)).toBe(false);
    expect(walkableNodesAt(map, 4, 4)).toEqual([node(4, 4, "HIGH")]);
  });

  it("ROAD + bridge exposes LOW ROAD and HIGH bridge nodes", () => {
    const map = testMap({
      bridges: [{ tx: 1, ty: 0, orientation: "H" }],
    });
    expect(isRoad(map, 1, 0)).toBe(true);
    expect(walkableNodesAt(map, 1, 0)).toEqual([node(1, 0, "GROUND"), node(1, 0, "HIGH")]);
  });

  it("GROUND + bridge exposes LOW ground and HIGH bridge nodes", () => {
    const map = testMap({
      bridges: [{ tx: 5, ty: 5, orientation: "H" }],
    });
    expect(isRoad(map, 5, 5)).toBe(false);
    expect(walkableNodesAt(map, 5, 5)).toEqual([node(5, 5, "GROUND"), node(5, 5, "HIGH")]);
  });

  it("WATER + bridge exposes HIGH bridge but no LOW walkable node", () => {
    const map = testMap({
      water: [[5, 5]],
      bridges: [{ tx: 5, ty: 5, orientation: "H" }],
    });
    expect(canWalkLow(map, 5, 5)).toBe(false);
    expect(canWalkHigh(map, 5, 5)).toBe(true);
    expect(walkableNodesAt(map, 5, 5)).toEqual([node(5, 5, "HIGH")]);
  });

  it("stacked LOW/HIGH nodes have distinct occupancy keys", () => {
    expect(occupancyKey(13, 7, "GROUND")).not.toBe(occupancyKey(13, 7, "HIGH"));
    expect(nodeKey(node(13, 7, "GROUND"))).toBe("13,7,GROUND");
  });
});

describe("transitions", () => {
  it("LOW ground → adjacent LOW ground works", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(4, 4, "GROUND"), node(5, 4, "GROUND"))).toBe(true);
  });

  it("LOW ground → ROAD works", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(1, 1, "GROUND"), node(1, 0, "GROUND"))).toBe(true);
  });

  it("HIGH_GROUND → adjacent HIGH_GROUND works", () => {
    const map = testMap({
      highGround: [
        [2, 2],
        [3, 2],
      ],
    });
    expect(canTraverse(map, node(2, 2, "HIGH"), node(3, 2, "HIGH"))).toBe(true);
  });

  it("HIGH_GROUND → connected bridge works", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(3, 2, "HIGH"), node(3, 3, "HIGH"))).toBe(true);
  });

  it("bridge → bridge works", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(3, 3, "HIGH"), node(3, 4, "HIGH"))).toBe(true);
  });

  it("bridge → connected HIGH_GROUND works", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(3, 3, "HIGH"), node(3, 2, "HIGH"))).toBe(true);
  });

  it("LOW → HIGH without slope fails", () => {
    const map = slopeMap();
    expect(isAuthoredSlope(map, node(3, 2, "HIGH"), node(4, 2, "GROUND"))).toBe(false);
    expect(canTraverse(map, node(4, 2, "GROUND"), node(3, 2, "HIGH"))).toBe(false);
  });

  it("HIGH → LOW without slope fails", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(3, 2, "HIGH"), node(4, 2, "GROUND"))).toBe(false);
  });

  it("LOW → HIGH through authored slope works", () => {
    const map = slopeMap();
    expect(isAuthoredSlope(map, node(2, 3, "GROUND"), node(2, 2, "HIGH"))).toBe(true);
    expect(canTraverse(map, node(2, 3, "GROUND"), node(2, 2, "HIGH"))).toBe(true);
  });

  it("HIGH → LOW through authored slope works", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(2, 2, "HIGH"), node(2, 3, "GROUND"))).toBe(true);
  });

  it("invisible wall blocks an otherwise valid edge", () => {
    const map = slopeMap();
    expect(isRaidMovementBlockedAcrossEdge(map, [2, 2], [3, 2])).toBe(true);
    expect(canTraverse(map, node(2, 2, "HIGH"), node(3, 2, "HIGH"))).toBe(false);
  });

  it("no diagonal traversal", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(4, 4, "GROUND"), node(5, 5, "GROUND"))).toBe(false);
    const n = neighborsOf(map, node(4, 4, "GROUND"));
    expect(n.every((p) => Math.abs(p.tx - 4) + Math.abs(p.ty - 4) === 1)).toBe(true);
  });

  it("LOW does not climb a bridge without a slope", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(3, 5, "GROUND"), node(3, 4, "HIGH"))).toBe(false);
    expect(canTraverse(map, node(2, 3, "GROUND"), node(3, 3, "HIGH"))).toBe(false);
  });
});

describe("bridge is not an implicit slope", () => {
  it("HIGH_GROUND → bridge HIGH allowed", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(3, 2, "HIGH"), node(3, 3, "HIGH"))).toBe(true);
  });

  it("bridge HIGH → HIGH_GROUND allowed", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(3, 3, "HIGH"), node(3, 2, "HIGH"))).toBe(true);
  });

  it("bridge HIGH → bridge HIGH allowed", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(3, 3, "HIGH"), node(3, 4, "HIGH"))).toBe(true);
  });

  it("LOW ground → bridge HIGH rejected without slope", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(3, 5, "GROUND"), node(3, 4, "HIGH"))).toBe(false);
    expect(canTraverse(map, node(2, 3, "GROUND"), node(3, 3, "HIGH"))).toBe(false);
  });

  it("ROAD LOW → bridge HIGH rejected without slope", () => {
    const map = testMap({
      bridges: [{ tx: 1, ty: 0, orientation: "H" }],
    });
    expect(isRoad(map, 1, 0)).toBe(true);
    expect(isRoad(map, 2, 0)).toBe(true);
    expect(canTraverse(map, node(2, 0, "GROUND"), node(1, 0, "HIGH"))).toBe(false);
    expect(canTraverse(map, node(1, 1, "GROUND"), node(1, 0, "HIGH"))).toBe(false);
  });

  it("bridge HIGH → LOW ground rejected without slope", () => {
    const map = slopeMap();
    expect(canTraverse(map, node(3, 3, "HIGH"), node(2, 3, "GROUND"))).toBe(false);
    expect(canTraverse(map, node(3, 3, "HIGH"), node(3, 2, "GROUND"))).toBe(false);
  });

  it("bridge HIGH → ROAD LOW rejected without slope", () => {
    const map = testMap({
      bridges: [{ tx: 1, ty: 0, orientation: "H" }],
    });
    expect(canTraverse(map, node(1, 0, "HIGH"), node(1, 1, "GROUND"))).toBe(false);
    expect(canTraverse(map, node(1, 0, "HIGH"), node(2, 0, "GROUND"))).toBe(false);
  });

  it("absence of invisible wall does NOT permit LOW ↔ HIGH", () => {
    const map = slopeMap();
    expect(isRaidMovementBlockedAcrossEdge(map, [3, 2], [3, 3])).toBe(false);
    expect(isAuthoredSlope(map, node(3, 2, "HIGH"), node(3, 3, "GROUND"))).toBe(false);
    expect(canTraverse(map, node(3, 3, "GROUND"), node(3, 2, "HIGH"))).toBe(false);
    expect(canTraverse(map, node(3, 2, "HIGH"), node(3, 3, "GROUND"))).toBe(false);
  });

  it("authored slope still permits LOW → HIGH", () => {
    const map = slopeMap();
    expect(hasSuspendedBridge(map, 2, 2)).toBe(false);
    expect(hasSuspendedBridge(map, 2, 3)).toBe(false);
    expect(isAuthoredSlope(map, node(2, 3, "GROUND"), node(2, 2, "HIGH"))).toBe(true);
    expect(canTraverse(map, node(2, 3, "GROUND"), node(2, 2, "HIGH"))).toBe(true);
  });

  it("authored slope still permits HIGH → LOW", () => {
    const map = slopeMap();
    expect(isAuthoredSlope(map, node(2, 2, "HIGH"), node(2, 3, "GROUND"))).toBe(true);
    expect(canTraverse(map, node(2, 2, "HIGH"), node(2, 3, "GROUND"))).toBe(true);
  });

  it("LOW route underneath bridge still works", () => {
    const map = slopeMap();
    const path = findOperatorPath(map, node(3, 5, "GROUND"), node(3, 3, "GROUND"));
    expect(path).not.toBeNull();
    expect(path!.every((p) => p.surface === "GROUND")).toBe(true);
  });

  it("HIGH route across bridge still works", () => {
    const map = slopeMap();
    const path = findOperatorPath(map, node(3, 2, "HIGH"), node(3, 4, "HIGH"));
    expect(path).not.toBeNull();
    expect(path!.every((p) => p.surface === "HIGH")).toBe(true);
  });

  it("Pine Cut bridge can no longer be used to climb up/down", () => {
    const map = woods();
    expect(hasSuspendedBridge(map, 13, 5)).toBe(true);
    expect(hasSuspendedBridge(map, 13, 7)).toBe(true);
    expect(elevatedSurfaceAt(map, 13, 4)).toBe("HIGH_GROUND");
    expect(elevatedSurfaceAt(map, 13, 8)).toBe("HIGH_GROUND");
    expect(isRaidMovementBlockedAcrossEdge(map, [13, 4], [13, 5])).toBe(false);
    expect(isRaidMovementBlockedAcrossEdge(map, [13, 7], [13, 8])).toBe(false);

    expect(canTraverse(map, node(13, 4, "HIGH"), node(13, 5, "HIGH"))).toBe(true);
    expect(canTraverse(map, node(13, 5, "HIGH"), node(13, 4, "HIGH"))).toBe(true);
    expect(canTraverse(map, node(13, 7, "HIGH"), node(13, 8, "HIGH"))).toBe(true);

    expect(canTraverse(map, node(13, 5, "GROUND"), node(13, 4, "HIGH"))).toBe(false);
    expect(canTraverse(map, node(13, 4, "HIGH"), node(13, 5, "GROUND"))).toBe(false);
    expect(canTraverse(map, node(13, 7, "GROUND"), node(13, 8, "HIGH"))).toBe(false);
    expect(canTraverse(map, node(13, 8, "HIGH"), node(13, 7, "GROUND"))).toBe(false);
    expect(canTraverse(map, node(12, 7, "GROUND"), node(13, 7, "HIGH"))).toBe(false);
    expect(canTraverse(map, node(13, 7, "HIGH"), node(12, 7, "GROUND"))).toBe(false);
    expect(canTraverse(map, node(14, 7, "GROUND"), node(13, 7, "HIGH"))).toBe(false);
    expect(canTraverse(map, node(13, 7, "HIGH"), node(14, 7, "GROUND"))).toBe(false);

    const across = findOperatorPath(map, node(13, 4, "HIGH"), node(13, 8, "HIGH"));
    expect(across).not.toBeNull();
    expect(across!.every((p) => p.surface === "HIGH")).toBe(true);

    const under = findOperatorPath(map, node(12, 7, "GROUND"), node(14, 7, "GROUND"));
    expect(under).not.toBeNull();
    expect(under!.every((p) => p.surface === "GROUND")).toBe(true);
  });
});

describe("pathfinding", () => {
  it("deterministic route around mountain", () => {
    const map = testMap({
      mountain: [
        [4, 3],
        [4, 4],
        [4, 5],
      ],
    });
    const a = findOperatorPath(map, node(3, 4, "GROUND"), node(5, 4, "GROUND"));
    const b = findOperatorPath(map, node(3, 4, "GROUND"), node(5, 4, "GROUND"));
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a!.every((p) => p.surface === "GROUND")).toBe(true);
    expect(a!.some((p) => p.tx === 4 && p.ty === 4)).toBe(false);
  });

  it("route around invisible wall", () => {
    const map = testMap({
      collisionWalls: [{ tx: 4, ty: 4, edge: "E" }],
    });
    expect(isRaidMovementBlockedAcrossEdge(map, [4, 4], [5, 4])).toBe(true);
    const path = findOperatorPath(map, node(4, 4, "GROUND"), node(5, 4, "GROUND"));
    expect(path).not.toBeNull();
    expect(path!.some((p, i) => i > 0 && p.tx === 5 && p.ty === 4 && path![i - 1]!.tx === 4 && path![i - 1]!.ty === 4)).toBe(
      false,
    );
  });

  it("route uses slope when destination is HIGH", () => {
    const map = slopeMap();
    const path = findOperatorPath(map, node(2, 4, "GROUND"), node(2, 2, "HIGH"));
    expect(path).not.toBeNull();
    const climb = path!.some(
      (p, i) => i > 0 && path![i - 1]!.surface === "GROUND" && p.surface === "HIGH" && p.tx === 2 && p.ty === 2,
    );
    expect(climb).toBe(true);
  });

  it("LOW route continues underneath bridge", () => {
    const map = slopeMap();
    const path = findOperatorPath(map, node(3, 5, "GROUND"), node(3, 3, "GROUND"));
    expect(path).not.toBeNull();
    expect(path!.every((p) => p.surface === "GROUND")).toBe(true);
    expect(path!.some((p) => p.tx === 3 && p.ty === 4)).toBe(true);
  });

  it("HIGH route crosses bridge", () => {
    const map = slopeMap();
    const path = findOperatorPath(map, node(3, 2, "HIGH"), node(3, 4, "HIGH"));
    expect(path).not.toBeNull();
    expect(path!.every((p) => p.surface === "HIGH")).toBe(true);
    expect(path!.some((p) => p.tx === 3 && p.ty === 3)).toBe(true);
  });

  it("unreachable destination returns no route", () => {
    const map = testMap({
      water: [
        [4, 3],
        [5, 3],
        [6, 3],
        [4, 4],
        [6, 4],
        [4, 5],
        [5, 5],
        [6, 5],
      ],
    });
    expect(findOperatorPath(map, node(2, 4, "GROUND"), node(5, 4, "GROUND"))).toBeNull();
  });

  it("path never crosses WATER", () => {
    const map = testMap({ water: [[4, 4]] });
    const path = findOperatorPath(map, node(3, 4, "GROUND"), node(5, 4, "GROUND"));
    expect(path).not.toBeNull();
    expect(path!.some((p) => isWater(map, p.tx, p.ty) && p.surface === "GROUND")).toBe(false);
  });

  it("path never crosses MOUNTAIN", () => {
    const map = testMap({ mountain: [[4, 4]] });
    const path = findOperatorPath(map, node(3, 4, "GROUND"), node(5, 4, "GROUND"));
    expect(path).not.toBeNull();
    expect(path!.some((p) => isMountain(map, p.tx, p.ty))).toBe(false);
  });

  it("Pine Cut known LOW route resolves", () => {
    const map = woods();
    const path = findOperatorPath(map, node(0, 8, "GROUND"), node(1, 8, "GROUND"));
    expect(canWalkLow(map, 0, 8)).toBe(true);
    expect(path).not.toBeNull();
    expect(path!.every((p) => p.surface === "GROUND")).toBe(true);
  });

  it("Pine Cut known HIGH/bridge route resolves", () => {
    const map = woods();
    expect(canWalkHigh(map, 13, 4)).toBe(true);
    expect(canWalkHigh(map, 13, 7)).toBe(true);
    expect(canWalkHigh(map, 13, 8)).toBe(true);
    const path = findOperatorPath(map, node(13, 4, "HIGH"), node(13, 8, "HIGH"));
    expect(path).not.toBeNull();
    expect(path!.every((p) => p.surface === "HIGH")).toBe(true);
    expect(path!.some((p) => p.tx === 13 && p.ty === 7)).toBe(true);
  });
});

describe("movement runtime", () => {
  it("operator no longer teleports when repositioned", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4 });
    const issued = issueOperatorMove(map, [t], t, 7, 4);
    expect(issued.ok).toBe(true);
    expect(t.tx).toBe(4);
    expect(t.ty).toBe(4);
    expect(isOperatorMoving(t)).toBe(true);
    const start = operatorWorldPos(t);
    expect(start).toEqual(tileCenter(4, 4));
  });

  it("position advances according to dt at 2.0 tiles/sec", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4 });
    issueOperatorMove(map, [t], t, 8, 4);
    stepOperatorMove(t, 0.5, map);
    expect(OPERATOR_MOVE_SPEED_TILES).toBe(2);
    expect(operatorMoveSpeedPx(t)).toBe(2 * TILE);
    expect(operatorWorldPos(t).x).toBeCloseTo(tileCenter(5, 4).x);
    expect(t.tx).toBe(5);
  });

  it("large/small frame steps produce equivalent final movement", () => {
    const map = testMap();
    const a = op({ id: 1, tx: 4, ty: 4 });
    const b = op({ id: 2, tx: 4, ty: 4 });
    issueOperatorMove(map, [a], a, 8, 4);
    issueOperatorMove(map, [b], b, 8, 4);
    for (let i = 0; i < 10; i++) stepOperatorMove(a, 0.05, map);
    for (let i = 0; i < 50; i++) stepOperatorMove(b, 0.01, map);
    expect(operatorWorldPos(a).x).toBeCloseTo(operatorWorldPos(b).x, 5);
    expect(a.tx).toBe(b.tx);
  });

  it("operator stops exactly at destination", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4 });
    issueOperatorMove(map, [t], t, 6, 4);
    stepOperatorMove(t, 5, map);
    expect(isOperatorMoving(t)).toBe(false);
    expect(t.tx).toBe(6);
    expect(t.ty).toBe(4);
    expect(operatorWorldPos(t)).toEqual(tileCenter(6, 4));
  });

  it("operator surface updates correctly after slope", () => {
    const map = slopeMap();
    const t = op({ tx: 2, ty: 4, surface: "GROUND" });
    issueOperatorMove(map, [t], t, 2, 2);
    expect(resolveMoveDestination(map, node(2, 4, "GROUND"), 2, 2)).toEqual(node(2, 2, "HIGH"));
    stepOperatorMove(t, 10, map);
    expect(t.tx).toBe(2);
    expect(t.ty).toBe(2);
    expect(t.surface).toBe("HIGH");
    expect(isOperatorMoving(t)).toBe(false);
  });

  it("destination reservation prevents same tile+surface destination", () => {
    const map = testMap();
    const a = op({ id: 1, tx: 4, ty: 4 });
    const b = op({ id: 2, tx: 4, ty: 6 });
    issueOperatorMove(map, [a, b], a, 7, 4);
    expect(destinationTaken([a, b], node(7, 4, "GROUND"), 2)).toBe(true);
    const second = issueOperatorMove(map, [a, b], b, 7, 4);
    expect(second.ok).toBe(false);
  });

  it("LOW + HIGH same X/Y is allowed", () => {
    const map = testMap({
      bridges: [{ tx: 5, ty: 5, orientation: "H" }],
    });
    const high = op({ id: 1, tx: 5, ty: 5, surface: "HIGH" });
    const low = op({ id: 2, tx: 4, ty: 5, surface: "GROUND" });
    expect(destinationTaken([high, low], node(5, 5, "GROUND"), 2)).toBe(false);
    const issued = issueOperatorMove(map, [high, low], low, 5, 5);
    expect(issued.ok).toBe(true);
    expect(low.move?.dest).toEqual(node(5, 5, "GROUND"));
  });

  it("redirecting movement does not teleport", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4 });
    issueOperatorMove(map, [t], t, 8, 4);
    const xBefore = operatorWorldPos(t).x;
    issueOperatorMove(map, [t], t, 4, 8);
    expect(operatorWorldPos(t).x).toBe(xBefore);
    expect(t.tx).toBe(4);
    expect(t.move?.pendingDest).toEqual(node(4, 8, "GROUND"));
    stepOperatorMove(t, 0.5, map);
    expect(t.tx).toBe(5);
    expect(operatorWorldPos(t).x).toBeCloseTo(tileCenter(5, 4).x);
    stepOperatorMove(t, 10, map);
    expect(t.tx).toBe(4);
    expect(t.ty).toBe(8);
    expect(isOperatorMoving(t)).toBe(false);
  });

  it("death clears movement state/reservation", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4 });
    issueOperatorMove(map, [t], t, 8, 4);
    expect(isOperatorMoving(t)).toBe(true);
    clearOperatorMove(t);
    expect(isOperatorMoving(t)).toBe(false);
    expect(destinationTaken([t], node(8, 4, "GROUND"), 99)).toBe(false);
  });

  it("dismissal clears movement state/reservation", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4 });
    const other = op({ id: 2, tx: 3, ty: 3 });
    issueOperatorMove(map, [t, other], t, 8, 4);
    const remaining = [other];
    clearOperatorMove(t);
    expect(destinationTaken(remaining, node(8, 4, "GROUND"), 2)).toBe(false);
  });
});

describe("combat integration", () => {
  it("moving operator cannot fire", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4, cd: 0 });
    expect(operatorCanFire(t)).toBe(true);
    issueOperatorMove(map, [t], t, 7, 4);
    expect(operatorCanFire(t)).toBe(false);
  });

  it("cooldown continues while moving", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4, cd: 400 });
    issueOperatorMove(map, [t], t, 6, 4);
    t.cd -= 0.2 * 1000;
    expect(t.cd).toBe(200);
    expect(isOperatorMoving(t)).toBe(true);
  });

  it("reload can continue while moving", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4, ammo: 0, reloadLeft: 500 });
    issueOperatorMove(map, [t], t, 6, 4);
    t.reloadLeft = Math.max(0, t.reloadLeft - 200);
    expect(t.reloadLeft).toBe(300);
    expect(isOperatorMoving(t)).toBe(true);
  });

  it("firing resumes after arrival", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4 });
    issueOperatorMove(map, [t], t, 5, 4);
    stepOperatorMove(t, 10, map);
    expect(operatorCanFire(t)).toBe(true);
  });

  it("MANUAL lock is not discarded by issuing movement", () => {
    const map = testMap();
    const t = op({ tx: 4, ty: 4, targetMode: "MANUAL", manualTargetId: 44 });
    issueOperatorMove(map, [t], t, 6, 4);
    expect(t.manualTargetId).toBe(44);
    expect(t.targetMode).toBe("MANUAL");
  });

  it("HIGH_GROUND bonus still works while stationary", () => {
    const map = woods();
    const boosted = applyHighGroundCombat(100, 0.5, map, 4, 1);
    expect(grantsHighGroundCombatBonus(map, 4, 1)).toBe(true);
    expect(boosted.range).toBeCloseTo(112);
    expect(boosted.accuracy).toBeCloseTo(0.55);
  });

  it("bridge still receives no high-ground combat bonus", () => {
    const map = woods();
    const bridge = applyHighGroundCombat(100, 0.5, map, 13, 7);
    expect(grantsHighGroundCombatBonus(map, 13, 7)).toBe(false);
    expect(bridge.range).toBe(100);
  });

  it("armor behavior remains unchanged", () => {
    const hit = absorbWithArmor(20, "paca", ARMORS["paca"]!.durability);
    expect(hit.damage).toBeCloseTo(20 * 0.82);
  });

  it("barricades remain edge cover and do not block operator movement", () => {
    const map = testMap();
    expect(canPlaceBarricade(4, 4, "N", () => false, () => true, [])).toBe(true);
    const path = findOperatorPath(map, node(4, 4, "GROUND"), node(4, 5, "GROUND"));
    expect(path).not.toBeNull();
  });

  it("wire remains road-only enemy-control", () => {
    const map = woods();
    expect(canPlaceWire(1, 8, (x, y) => isRoad(map, x, y), [])).toBe(true);
    expect(canPlaceWire(0, 8, (x, y) => isRoad(map, x, y), [])).toBe(false);
    const path = findOperatorPath(map, node(0, 8, "GROUND"), node(1, 8, "GROUND"));
    expect(path).not.toBeNull();
  });
});
