import { describe, expect, it } from "bun:test";
import { buildWave } from "./data";
import { MAP_BY_ID, buildMap, isBuildable, isRoad, isWater, type MapDef } from "./map";
import {
  RAID_DRAW_PASSES,
  HIGH_GROUND_ACCURACY_BONUS,
  HIGH_GROUND_RANGE_MULT,
  applyHighGroundCombat,
  baseTerrainAt,
  canOccupyHighSurface,
  canOccupyLowSurface,
  canPlaceOperator,
  elevatedSurfaceAt,
  enemyLaneSurface,
  entityDrawPass,
  entitySurface,
  grantsHighGroundCombatBonus,
  hasSuspendedBridge,
  operatorPlacementSurface,
  raidDrawPassIndex,
  terrainCombatMods,
} from "./surfaces";

const pal = MAP_BY_ID["woods"]!.palette;

function testMap(over: Partial<MapDef> = {}) {
  return buildMap({
    id: "surface-test",
    name: "SURFACE TEST",
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

describe("runtime surfaces", () => {
  it("plain GROUND exposes GROUND surface", () => {
    const map = testMap();
    expect(baseTerrainAt(map, 10, 8)).toBe("GROUND");
    expect(elevatedSurfaceAt(map, 10, 8)).toBeNull();
    expect(operatorPlacementSurface(map, 10, 8)).toBe("GROUND");
    expect(entitySurface({ surface: operatorPlacementSurface(map, 10, 8)! })).toBe("GROUND");
  });

  it("ROAD exposes GROUND/LOW surface", () => {
    const map = testMap();
    expect(isRoad(map, 1, 0)).toBe(true);
    expect(baseTerrainAt(map, 1, 0)).toBe("ROAD");
    expect(elevatedSurfaceAt(map, 1, 0)).toBeNull();
    expect(canOccupyLowSurface(map, 1, 0)).toBe(false);
    expect(canPlaceOperator(map, 1, 0)).toBe(false);
  });

  it("HIGH_GROUND exposes HIGH surface", () => {
    const map = testMap({ highGround: [[10, 8]] });
    expect(baseTerrainAt(map, 10, 8)).toBe("GROUND");
    expect(elevatedSurfaceAt(map, 10, 8)).toBe("HIGH_GROUND");
    expect(operatorPlacementSurface(map, 10, 8)).toBe("HIGH");
    expect(entitySurface({ surface: "HIGH" })).toBe("HIGH");
  });

  it("bridge over GROUND exposes HIGH bridge surface", () => {
    const map = testMap({ bridges: [{ tx: 10, ty: 8, orientation: "H" }] });
    expect(baseTerrainAt(map, 10, 8)).toBe("GROUND");
    expect(elevatedSurfaceAt(map, 10, 8)).toBe("SUSPENDED_BRIDGE");
    expect(hasSuspendedBridge(map, 10, 8)).toBe(true);
    expect(operatorPlacementSurface(map, 10, 8)).toBe("HIGH");
  });

  it("bridge over ROAD exposes HIGH bridge surface and keeps ROAD as base", () => {
    const map = testMap({ bridges: [{ tx: 1, ty: 0, orientation: "H" }] });
    expect(isRoad(map, 1, 0)).toBe(true);
    expect(baseTerrainAt(map, 1, 0)).toBe("ROAD");
    expect(elevatedSurfaceAt(map, 1, 0)).toBe("SUSPENDED_BRIDGE");
    expect(isBuildable(map, 1, 0)).toBe(false);
    expect(canOccupyHighSurface(map, 1, 0)).toBe(true);
    expect(canPlaceOperator(map, 1, 0)).toBe(true);
    expect(operatorPlacementSurface(map, 1, 0)).toBe("HIGH");
  });

  it("bridge over WATER exposes HIGH bridge surface and keeps WATER as base", () => {
    const map = testMap({
      water: [[10, 8]],
      bridges: [{ tx: 10, ty: 8, orientation: "H" }],
    });
    expect(isWater(map, 10, 8)).toBe(true);
    expect(baseTerrainAt(map, 10, 8)).toBe("WATER");
    expect(elevatedSurfaceAt(map, 10, 8)).toBe("SUSPENDED_BRIDGE");
    expect(isBuildable(map, 10, 8)).toBe(false);
    expect(canPlaceOperator(map, 10, 8)).toBe(true);
    expect(operatorPlacementSurface(map, 10, 8)).toBe("HIGH");
  });

  it("base terrain remains unchanged under a bridge", () => {
    const ground = testMap();
    const bridged = testMap({
      water: [[10, 8]],
      bridges: [{ tx: 10, ty: 8, orientation: "V" }],
    });
    expect(baseTerrainAt(ground, 1, 0)).toBe(baseTerrainAt(bridged, 1, 0));
    expect(isRoad(bridged, 1, 0)).toBe(true);
    expect(isWater(bridged, 10, 8)).toBe(true);
    expect(bridged.WATER[8]![10]).toBe(true);
    expect(bridged.BLOCKED[8]![10]).toBe(false);
  });

  it("operator placed on HIGH_GROUND or bridge receives HIGH state; ground receives GROUND", () => {
    const map = testMap({
      highGround: [[9, 8]],
      bridges: [{ tx: 10, ty: 8, orientation: "H" }],
    });
    expect(operatorPlacementSurface(map, 9, 8)).toBe("HIGH");
    expect(operatorPlacementSurface(map, 10, 8)).toBe("HIGH");
    expect(operatorPlacementSurface(map, 11, 8)).toBe("GROUND");
  });

  it("enemy following ROAD under a bridge remains GROUND and the lane is unchanged", () => {
    const map = testMap({ bridges: [{ tx: 1, ty: 0, orientation: "H" }] });
    const before = JSON.stringify(map.def.path);
    expect(enemyLaneSurface(map, 1, 0)).toBe("GROUND");
    expect(entitySurface({ surface: enemyLaneSurface(map, 1, 0) })).toBe("GROUND");
    expect(JSON.stringify(map.def.path)).toBe(before);
    expect(map.def.path).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(map.lanes[0]!.PIX).toHaveLength(3);
  });

  it("low entity render pass occurs below the bridge; high entities occur above", () => {
    expect(raidDrawPassIndex("lowEntities")).toBeLessThan(raidDrawPassIndex("elevatedSurface"));
    expect(raidDrawPassIndex("elevatedSurface")).toBeLessThan(raidDrawPassIndex("highEntities"));
    expect(entityDrawPass("GROUND")).toBe("lowEntities");
    expect(entityDrawPass("HIGH")).toBe("highEntities");
    expect(RAID_DRAW_PASSES).toEqual([
      "baseTerrain",
      "lowEntities",
      "elevatedSurface",
      "highEntities",
      "overlays",
    ]);
  });
});

describe("PINE CUT surface contract", () => {
  it("loads unchanged and places operators on the ROAD-under-bridge deck", () => {
    const woods = MAP_BY_ID["woods"]!;
    const map = buildMap(woods);
    expect(woods.path).toEqual([
      [1, 13],
      [1, 12],
      [1, 11],
      [1, 10],
      [2, 10],
      [2, 9],
      [2, 8],
      [1, 8],
      [1, 7],
      [1, 6],
      [1, 5],
      [1, 4],
      [1, 3],
      [2, 3],
      [3, 3],
      [3, 4],
      [3, 5],
      [3, 6],
      [4, 6],
      [5, 6],
      [6, 6],
      [7, 6],
      [7, 5],
      [7, 4],
      [8, 4],
      [9, 4],
      [10, 4],
      [11, 4],
      [11, 5],
      [11, 6],
      [11, 7],
      [12, 7],
      [13, 7],
      [14, 7],
      [15, 7],
      [15, 6],
      [15, 5],
      [15, 4],
      [15, 3],
      [16, 3],
      [17, 3],
      [17, 2],
      [17, 1],
      [17, 0],
      [17, -1],
    ]);
    expect(woods.bridges).toEqual([
      { tx: 13, ty: 5, orientation: "V" },
      { tx: 13, ty: 6, orientation: "V" },
      { tx: 13, ty: 7, orientation: "V" },
    ]);
    expect(woods.collisionWalls).toHaveLength(91);
    expect(woods.highGround).toBeDefined();
    expect(woods.mountain).toBeDefined();
    expect(woods.crates).toEqual([
      [19, 7],
      [19, 11],
      [3, 12],
    ]);

    expect(isRoad(map, 13, 7)).toBe(true);
    expect(baseTerrainAt(map, 13, 7)).toBe("ROAD");
    expect(elevatedSurfaceAt(map, 13, 7)).toBe("SUSPENDED_BRIDGE");
    expect(isBuildable(map, 13, 7)).toBe(false);
    expect(canPlaceOperator(map, 13, 7)).toBe(true);
    expect(operatorPlacementSurface(map, 13, 7)).toBe("HIGH");

    expect(baseTerrainAt(map, 13, 5)).toBe("GROUND");
    expect(elevatedSurfaceAt(map, 13, 5)).toBe("SUSPENDED_BRIDGE");
    expect(canPlaceOperator(map, 13, 5)).toBe(true);
    expect(operatorPlacementSurface(map, 13, 5)).toBe("HIGH");

    expect(enemyLaneSurface(map, 13, 7)).toBe("GROUND");
    expect(woods.path.some(([x, y]) => x === 13 && y === 7)).toBe(true);
  });

  it("does not change kill/leak/wave construction", () => {
    const wave = buildWave(1, MAP_BY_ID["woods"]!.waveMods);
    expect(wave.groups.length).toBeGreaterThan(0);
    expect(wave.groups.every((g) => g.count > 0)).toBe(true);
  });
});

describe("HIGH_GROUND combat bonus", () => {
  it("does not boost GROUND or a suspended bridge, and does boost HIGH_GROUND", () => {
    const woods = buildMap(MAP_BY_ID["woods"]!);
    const groundTx = 0;
    const groundTy = 8;
    const ground = applyHighGroundCombat(100, 0.5, woods, groundTx, groundTy);
    expect(grantsHighGroundCombatBonus(woods, groundTx, groundTy)).toBe(false);
    expect(ground.range).toBe(100);
    expect(ground.accuracy).toBe(0.5);

    expect(elevatedSurfaceAt(woods, 4, 1)).toBe("HIGH_GROUND");
    const high = applyHighGroundCombat(100, 0.5, woods, 4, 1);
    expect(terrainCombatMods(woods, 4, 1)).toEqual({
      rangeMult: HIGH_GROUND_RANGE_MULT,
      accuracyBonus: HIGH_GROUND_ACCURACY_BONUS,
    });
    expect(high.range).toBeCloseTo(100 * HIGH_GROUND_RANGE_MULT);
    expect(high.accuracy).toBeCloseTo(0.55);

    expect(elevatedSurfaceAt(woods, 13, 7)).toBe("SUSPENDED_BRIDGE");
    expect(entitySurface({ surface: "HIGH" })).toBe("HIGH");
    const bridge = applyHighGroundCombat(100, 0.5, woods, 13, 7);
    expect(grantsHighGroundCombatBonus(woods, 13, 7)).toBe(false);
    expect(bridge.range).toBe(100);
    expect(bridge.accuracy).toBe(0.5);
    expect(isRoad(woods, 13, 7)).toBe(true);
  });

  it("clamps accuracy to the legal maximum after the HIGH_GROUND bonus", () => {
    const woods = buildMap(MAP_BY_ID["woods"]!);
    const clamped = applyHighGroundCombat(80, 0.97, woods, 4, 1);
    expect(clamped.accuracy).toBe(0.99);
  });

  it("recalculates when the operator moves between terrain types", () => {
    const woods = buildMap(MAP_BY_ID["woods"]!);
    const onGround = applyHighGroundCombat(80, 0.6, woods, 0, 8);
    const onHill = applyHighGroundCombat(80, 0.6, woods, 4, 1);
    const onBridge = applyHighGroundCombat(80, 0.6, woods, 13, 5);
    expect(onGround.range).toBe(80);
    expect(onHill.range).toBeCloseTo(80 * HIGH_GROUND_RANGE_MULT);
    expect(onBridge.range).toBe(80);
    expect(onHill.accuracy).toBeCloseTo(0.65);
    expect(onBridge.accuracy).toBe(0.6);
  });
});
