import { describe, expect, it } from "bun:test";
import { leakIfAlive } from "./combat";
import { TILE } from "./data";
import {
  lanePortHasPointerTarget,
  raidRendersLanePortMarker,
  shouldDrawLanePortMarkers,
  showLanePortMarkers,
} from "./lanePortsView";
import { MAP_BY_ID, buildMap, isBuildable, laneRoute, pathPoint, worldInPlayableBoard } from "./map";
import { fromProductionMap } from "./mapBuilder/adapters";
import { DEFAULT_LAYERS, visibleLanePortMarkers } from "./mapBuilder/render";
import { hitLanePort } from "./mapBuilder/ports";

describe("lane port presentation", () => {
  it("hides raw SPAWN and ENDPOINT markers in a normal raid", () => {
    expect(showLanePortMarkers("raid")).toBe(false);
    expect(raidRendersLanePortMarker("spawn")).toBe(false);
    expect(raidRendersLanePortMarker("endpoint")).toBe(false);
    expect(shouldDrawLanePortMarkers("raid")).toBe(false);
  });

  it("keeps SPAWN and ENDPOINT markers visible in Map Builder", () => {
    expect(showLanePortMarkers("builder")).toBe(true);
    expect(DEFAULT_LAYERS.markers).toBe(true);
    const grain = fromProductionMap(MAP_BY_ID["kolkhoz"]!);
    const vis = visibleLanePortMarkers(grain, DEFAULT_LAYERS);
    expect(vis.some((m) => m.kind === "spawn")).toBe(true);
    expect(vis.some((m) => m.kind === "endpoint")).toBe(true);
    expect(vis.filter((m) => m.kind === "spawn")).toHaveLength(2);
    expect(vis.filter((m) => m.kind === "endpoint")).toHaveLength(2);
  });

  it("allows debug surfaces to show markers without a new overlay system", () => {
    expect(showLanePortMarkers("debug")).toBe(true);
    expect(shouldDrawLanePortMarkers("raid", true)).toBe(true);
    expect(shouldDrawLanePortMarkers("raid", false)).toBe(false);
  });

  it("does not change spawn or endpoint world coordinates when raid markers are hidden", () => {
    expect(showLanePortMarkers("raid")).toBe(false);
    const def = MAP_BY_ID["kolkhoz"]!;
    const map = buildMap(def);
    const main = laneRoute(map, 0);
    const a = laneRoute(map, 1);
    expect(pathPoint(map, 0, 0, 0)).toEqual(main.PIX[0]!);
    expect(pathPoint(map, 0, 0, 1)).toEqual(a.PIX[0]!);
    expect(main.PIX[0]).toEqual([(-1 + 0.5) * TILE, (3 + 0.5) * TILE]);
    expect(main.PIX.at(-1)).toEqual([(16 + 0.5) * TILE, (-1 + 0.5) * TILE]);
    expect(a.PIX[0]).toEqual([(-1 + 0.5) * TILE, (5 + 0.5) * TILE]);
    expect(a.PIX.at(-1)).toEqual([(20 + 0.5) * TILE, (10 + 0.5) * TILE]);
    expect(worldInPlayableBoard(main.PIX[0]![0], main.PIX[0]![1])).toBe(false);
    expect(worldInPlayableBoard(...main.PIX.at(-1)!)).toBe(false);
  });

  it("does not change GRAIN GATE lane paths", () => {
    const def = MAP_BY_ID["kolkhoz"]!;
    expect(def.path[0]).toEqual([-1, 3]);
    expect(def.path.at(-1)).toEqual([16, -1]);
    expect(def.lanes?.[0]?.id).toBe("MAIN");
    expect(def.lanes?.[0]?.path[0]).toEqual([-1, 3]);
    expect(def.lanes?.[1]?.id).toBe("A");
    expect(def.lanes?.[1]?.path[0]).toEqual([-1, 5]);
    expect(def.lanes?.[1]?.path.at(-1)).toEqual([20, 10]);
  });

  it("spawns and leaks from path geometry, not from raid marker drawing", () => {
    expect(shouldDrawLanePortMarkers("raid")).toBe(false);
    const map = buildMap(MAP_BY_ID["kolkhoz"]!);
    const start = pathPoint(map, 0, 0, 0);
    expect(start).toEqual(map.lanes[0]!.PIX[0]!);
    const e = { hp: 80, leaked: false, counted: false };
    expect(leakIfAlive(e)).toBe(true);
    expect(e.leaked).toBe(true);
    expect(e.hp).toBe(0);
  });

  it("leaves no raid pointer target on hidden spawn/endpoint cells", () => {
    expect(lanePortHasPointerTarget("raid")).toBe(false);
    const map = buildMap(MAP_BY_ID["kolkhoz"]!);
    expect(isBuildable(map, -1, 3)).toBe(false);
    expect(isBuildable(map, 16, -1)).toBe(false);
    expect(isBuildable(map, 20, 10)).toBe(false);
  });

  it("Map Builder still hits spawn and endpoint markers", () => {
    expect(lanePortHasPointerTarget("builder")).toBe(true);
    const grain = fromProductionMap(MAP_BY_ID["kolkhoz"]!);
    expect(hitLanePort(grain, -1, 3)).toEqual({ kind: "spawn", laneId: "MAIN" });
    expect(hitLanePort(grain, 16, -1)).toEqual({ kind: "endpoint", laneId: "MAIN" });
    expect(hitLanePort(grain, -1, 5)).toEqual({ kind: "spawn", laneId: "A" });
    expect(hitLanePort(grain, 20, 10)).toEqual({ kind: "endpoint", laneId: "A" });
  });
});
