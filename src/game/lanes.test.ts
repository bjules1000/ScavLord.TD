import { describe, expect, it } from "bun:test";
import { assignSpawnLane, lanePathProgress, mapLaneDefs } from "./lanes";
import { MAP_BY_ID, buildMap, isBuildable, isRoad, isWater, laneRoute, pathPoint } from "./map";

describe("lane spawn split", () => {
  it("round-robins across two lanes with MAIN first", () => {
    expect(assignSpawnLane(0, 2)).toBe(0);
    expect(assignSpawnLane(1, 2)).toBe(1);
    expect(assignSpawnLane(2, 2)).toBe(0);
    expect(assignSpawnLane(3, 2)).toBe(1);
  });

  it("stays on lane 0 when a map has one path", () => {
    expect(assignSpawnLane(0, 1)).toBe(0);
    expect(assignSpawnLane(7, 1)).toBe(0);
    expect(assignSpawnLane(4, 0)).toBe(0);
  });

  it("normalizes route progress so a near-extract MAIN enemy beats a mid-route A enemy", () => {
    const mainNearEnd = lanePathProgress(18, 0.5, 19);
    const aMid = lanePathProgress(12, 0, 24);
    expect(mainNearEnd).toBeGreaterThan(aMid);
  });
});

describe("GRAIN GATE dual-lane rebuild", () => {
  const def = MAP_BY_ID["kolkhoz"]!;
  const map = buildMap(def);

  it("keeps the authored MAIN and A routes from the export", () => {
    const lanes = mapLaneDefs(def);
    expect(lanes.map((l) => l.id)).toEqual(["MAIN", "A"]);
    expect(def.path).toEqual(lanes[0]!.path);
    expect(lanes[0]!.path[0]).toEqual([0, 3]);
    expect(lanes[0]!.path.at(-1)).toEqual([16, 0]);
    expect(lanes[1]!.path[0]).toEqual([0, 5]);
    expect(lanes[1]!.path.at(-1)).toEqual([19, 10]);
    expect(map.lanes.map((l) => l.id)).toEqual(["MAIN", "A"]);
  });

  it("stamps both roads and water, and does not treat water as road", () => {
    expect(isRoad(map, 0, 3)).toBe(true);
    expect(isRoad(map, 0, 5)).toBe(true);
    expect(isWater(map, 5, 0)).toBe(true);
    expect(isRoad(map, 5, 0)).toBe(false);
    expect(isBuildable(map, 5, 0)).toBe(false);
    expect(isBuildable(map, 0, 3)).toBe(false);
  });

  it("moves a MAIN spawn along MAIN and an A spawn along A", () => {
    const mainStart = pathPoint(map, 0, 0, 0);
    const aStart = pathPoint(map, 0, 0, 1);
    expect(mainStart[1]).toBeLessThan(aStart[1]);
    expect(laneRoute(map, 0).id).toBe("MAIN");
    expect(laneRoute(map, 1).id).toBe("A");
    const mainEnd = pathPoint(map, laneRoute(map, 0).SEG_LEN.length, 0, 0);
    const aEnd = pathPoint(map, laneRoute(map, 1).SEG_LEN.length, 0, 1);
    expect(mainEnd[0]).toBeLessThan(aEnd[0]);
  });

  it("applies the exported props and empty cover/crates", () => {
    expect(def.props.every((p) => p.type === "tree")).toBe(true);
    expect(def.props).toHaveLength(11);
    expect(def.cover).toEqual([]);
    expect(def.crates).toEqual([]);
    expect(def.checkpoint).toEqual([
      { tx: 2, ty: 2, type: "booth" },
      { tx: 2, ty: 3, type: "gate2" },
      { tx: 2, ty: 4, type: "booth" },
      { tx: 2, ty: 5, type: "gate2" },
      { tx: 2, ty: 6, type: "post" },
    ]);
  });
});

describe("single-lane maps stay on one route", () => {
  it("PINE CUT has only MAIN", () => {
    const woods = buildMap(MAP_BY_ID["woods"]!);
    expect(woods.lanes).toHaveLength(1);
    expect(woods.lanes[0]!.id).toBe("MAIN");
    expect(assignSpawnLane(5, woods.lanes.length)).toBe(0);
  });
});
