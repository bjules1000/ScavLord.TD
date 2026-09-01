import { describe, expect, it } from "bun:test";
import { TILE } from "../data";
import { hasLineOfSight, tileCenterWorld, traceLineOfSight, worldToTile } from "../los";
import { MAP_BY_ID, buildMap, type MapDef } from "../map";
import { enemyLaneSurface } from "../surfaces";
import type { SurfaceLevel } from "../types";
import { applyAuthor, type AuthorCell } from "./author";
import { addLane, paintTiles, setLaneWaypoints } from "./paint";
import { paintBridgeTiles } from "./bridges";
import { createBlankMap } from "./document";
import { stringifyExport, toExport } from "./export";
import {
  LOS_PROBE_SAMPLE_TILES,
  applyLosProbeClick,
  displaySurface,
  emptyLosProbeState,
  evaluateCustomProbe,
  evaluatePathSweep,
  formatOriginLine,
  formatPathLosSummary,
  formatProbeBlocker,
  gameMapFromEditorDoc,
  probeHitMatchesGameplay,
  probeSurfacesAt,
  resolveProbePoint,
  sampleActiveLane,
  sampleLanePath,
  sampleWorldPolyline,
} from "./losProbe";
import {
  isAuthoringTool,
  isLosProbeMode,
  isTerrainPaintMode,
  selectLosProbeTool,
  selectTerrainTool,
} from "./tools";

const pal = MAP_BY_ID["woods"]!.palette;

function testMap(over: Partial<MapDef> = {}) {
  return buildMap({
    id: "los-probe-test",
    name: "LOS PROBE TEST",
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

function cell(tx: number, ty: number, localX = TILE / 2, localY = TILE / 2): AuthorCell {
  return { tx, ty, localX, localY };
}

function ctx() {
  return { laneId: "MAIN", zoneId: null, tileSize: TILE };
}

function clickAt(tx: number, ty: number) {
  const c = tileCenterWorld(tx, ty);
  return { tx, ty, x: c.x, y: c.y };
}

describe("LOS probe path sampling", () => {
  it("straight two-node path produces deterministic intermediate samples", () => {
    const a = sampleLanePath([
      [0, 0],
      [4, 0],
    ]);
    const b = sampleLanePath([
      [0, 0],
      [4, 0],
    ]);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(2);
    expect(a[0]).toEqual({ x: 0.5 * TILE, y: 0.5 * TILE, along: 0 });
    expect(a.at(-1)).toEqual({ x: 4.5 * TILE, y: 0.5 * TILE, along: 4 * TILE });
    expect(a.some((s) => s.along > 0 && s.along < 4 * TILE)).toBe(true);
  });

  it("multi-segment path samples continuously", () => {
    const samples = sampleLanePath([
      [0, 0],
      [2, 0],
      [2, 2],
    ]);
    expect(samples[0]!.along).toBe(0);
    expect(samples.at(-1)!.along).toBeCloseTo(4 * TILE, 6);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.along).toBeGreaterThan(samples[i - 1]!.along);
    }
  });

  it("does not duplicate samples at segment joins", () => {
    const samples = sampleLanePath([
      [0, 0],
      [2, 0],
      [2, 2],
    ]);
    const keys = samples.map((s) => `${s.x.toFixed(6)},${s.y.toFixed(6)}`);
    expect(new Set(keys).size).toBe(keys.length);
    const joinX = 2.5 * TILE;
    const joinY = 0.5 * TILE;
    expect(samples.filter((s) => Math.hypot(s.x - joinX, s.y - joinY) < 1e-6)).toHaveLength(1);
  });

  it("sample spacing respects configured density", () => {
    const waypoints: Array<[number, number]> = [
      [0, 0],
      [8, 0],
    ];
    const dense = sampleLanePath(waypoints, TILE, 0.25);
    const coarse = sampleLanePath(waypoints, TILE, 0.5);
    expect(dense.length).toBeGreaterThan(coarse.length);
    const spacing = LOS_PROBE_SAMPLE_TILES * TILE;
    for (let i = 1; i < dense.length; i++) {
      const gap = dense[i]!.along - dense[i - 1]!.along;
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThanOrEqual(spacing + 1e-6);
    }
    const world = sampleWorldPolyline(
      [
        [0, 0],
        [100, 0],
      ],
      10,
    );
    for (let i = 1; i < world.length; i++) {
      expect(world[i]!.along - world[i - 1]!.along).toBeLessThanOrEqual(10 + 1e-6);
    }
  });

  it("active lane determines sampled path", () => {
    let doc = createBlankMap({ displayName: "L", id: "probe-lanes", width: 20, height: 13 });
    doc = setLaneWaypoints(doc, "MAIN", [
      [0, 2],
      [4, 2],
    ]);
    doc = addLane(doc, "A");
    doc = setLaneWaypoints(doc, "A", [
      [0, 8],
      [4, 8],
    ]);
    const map = gameMapFromEditorDoc(doc);
    const main = sampleActiveLane(map, "MAIN");
    const alt = sampleActiveLane(map, "A");
    expect(main.length).toBeGreaterThan(1);
    expect(alt.length).toBeGreaterThan(1);
    expect(main[0]!.y).not.toBe(alt[0]!.y);
    expect(main.every((s) => Math.abs(s.y - 2.5 * TILE) < 1e-6)).toBe(true);
    expect(alt.every((s) => Math.abs(s.y - 8.5 * TILE) < 1e-6)).toBe(true);
  });

  it("empty or missing lane is handled safely", () => {
    expect(sampleLanePath([])).toEqual([]);
    expect(sampleWorldPolyline([])).toEqual([]);
    const doc = createBlankMap({ displayName: "L", id: "probe-empty", width: 20, height: 13 });
    const map = gameMapFromEditorDoc(doc);
    expect(sampleActiveLane(map, "MAIN")).toEqual([]);
    expect(sampleActiveLane(map, "MISSING")).toEqual([]);
    const sweep = evaluatePathSweep(map, at(1, 1), []);
    expect(sweep.results).toEqual([]);
    expect(sweep.visible).toBe(0);
    expect(sweep.blocked).toBe(0);
  });
});

describe("LOS probe visibility", () => {
  it("path target with clear LOS is marked visible", () => {
    const map = testMap();
    const origin = resolveProbePoint(map, 3, 3);
    const samples = sampleLanePath([
      [4, 3],
      [6, 3],
    ]);
    const sweep = evaluatePathSweep(map, origin, samples);
    expect(sweep.visible).toBe(sweep.results.length);
    expect(sweep.blocked).toBe(0);
    expect(sweep.results.every((r) => r.hit.clear)).toBe(true);
  });

  it("mountain-blocked target is marked blocked", () => {
    const map = testMap({ mountain: [[5, 3]] });
    const origin = resolveProbePoint(map, 3, 3);
    const samples = sampleLanePath([
      [4, 3],
      [7, 3],
    ]);
    const sweep = evaluatePathSweep(map, origin, samples);
    const blocked = sweep.results.filter((r) => !r.hit.clear);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.some((r) => r.hit.blocker === "MOUNTAIN")).toBe(true);
  });

  it("ridge-mass-blocked target is marked blocked", () => {
    const map = testMap({
      highGround: [
        [4, 4],
        [5, 4],
      ],
    });
    const origin = resolveProbePoint(map, 3, 4);
    const samples = sampleLanePath([
      [6, 4],
      [8, 4],
    ]);
    const sweep = evaluatePathSweep(map, origin, samples);
    expect(sweep.blocked).toBeGreaterThan(0);
    expect(sweep.results.some((r) => r.hit.blocker === "RIDGE")).toBe(true);
  });

  it("HIGH plateau → visible LOW pass target is marked visible", () => {
    const map = testMap({
      highGround: [
        [4, 4],
        [5, 4],
      ],
      collisionWalls: [{ tx: 5, ty: 4, edge: "E" }],
    });
    const origin = resolveProbePoint(map, 5, 4);
    expect(origin.surface).toBe("HIGH");
    const samples = sampleLanePath([
      [7, 4],
      [8, 4],
    ]);
    const sweep = evaluatePathSweep(map, origin, samples);
    expect(sweep.visible).toBe(sweep.results.length);
    expect(hasLineOfSight(map, origin, at(7, 4))).toBe(true);
  });

  it("LOW pass → exposed HIGH target is clear in custom mode", () => {
    const map = testMap({
      highGround: [
        [4, 4],
        [5, 4],
      ],
    });
    const origin = resolveProbePoint(map, 7, 4);
    expect(origin.surface).toBe("GROUND");
    const target = resolveProbePoint(map, 5, 4);
    expect(target.surface).toBe("HIGH");
    const hit = evaluateCustomProbe(map, origin, target);
    expect(hit.clear).toBe(true);
    expect(hasLineOfSight(map, origin, target)).toBe(true);
  });

  it("unrelated HIGH_GROUND ridge blocks", () => {
    const map = testMap({
      highGround: [
        [4, 4],
        [5, 4],
      ],
    });
    const origin = resolveProbePoint(map, 3, 4);
    const target = resolveProbePoint(map, 7, 4);
    const hit = evaluateCustomProbe(map, origin, target);
    expect(hit.clear).toBe(false);
    expect(hit.blocker).toBe("RIDGE");
  });

  it("bridge HIGH vs LOW-under-deck is blocked", () => {
    const map = testMap({
      path: [
        [5, 3],
        [6, 3],
        [7, 3],
      ],
      bridges: [{ tx: 6, ty: 3, orientation: "H" }],
    });
    const origin = resolveProbePoint(map, 6, 3);
    expect(origin.surface).toBe("HIGH");
    expect(probeSurfacesAt(map, 6, 3)).toEqual(["HIGH", "GROUND"]);
    const low = resolveProbePoint(map, 6, 3, "GROUND");
    expect(low.surface).toBe("GROUND");
    const hit = evaluateCustomProbe(map, origin, low);
    expect(hit.clear).toBe(false);
    expect(hit.blocker).toBe("BRIDGE_DECK");
  });

  it("low path target under a bridge remains LOW", () => {
    const map = testMap({
      path: [
        [5, 3],
        [6, 3],
        [7, 3],
      ],
      bridges: [{ tx: 6, ty: 3, orientation: "H" }],
    });
    const samples = sampleLanePath([
      [5, 3],
      [7, 3],
    ]);
    const under = samples.find((s) => {
      const t = worldToTile(s.x, s.y);
      return t.tx === 6 && t.ty === 3;
    });
    expect(under).toBeTruthy();
    const origin = resolveProbePoint(map, 4, 3);
    const sweep = evaluatePathSweep(map, origin, samples);
    const result = sweep.results.find((r) => {
      const t = worldToTile(r.x, r.y);
      return t.tx === 6 && t.ty === 3;
    });
    expect(result?.surface).toBe("GROUND");
    expect(enemyLaneSurface()).toBe("GROUND");
  });

  it("movement-only wall does not incorrectly block probe LOS", () => {
    const map = testMap({ collisionWalls: [{ tx: 3, ty: 3, edge: "E" }] });
    const origin = resolveProbePoint(map, 3, 3);
    const samples = sampleLanePath([
      [4, 3],
      [5, 3],
    ]);
    const sweep = evaluatePathSweep(map, origin, samples);
    expect(sweep.blocked).toBe(0);
    expect(hasLineOfSight(map, origin, at(4, 3))).toBe(true);
  });

  it("diagnostic result matches canonical hasLineOfSight", () => {
    const map = testMap({
      mountain: [[5, 2]],
      highGround: [[8, 4], [9, 4]],
    });
    const origin = resolveProbePoint(map, 3, 2);
    const samples = sampleLanePath([
      [4, 2],
      [7, 2],
    ]);
    const sweep = evaluatePathSweep(map, origin, samples);
    for (const r of sweep.results) {
      expect(probeHitMatchesGameplay(map, origin, { x: r.x, y: r.y, surface: r.surface }, r.hit)).toBe(true);
      expect(r.hit.clear).toBe(hasLineOfSight(map, origin, { x: r.x, y: r.y, surface: r.surface }));
    }
  });
});

describe("LOS probe diagnostic metadata", () => {
  it("clear result reports CLEAR", () => {
    const map = testMap();
    const hit = evaluateCustomProbe(map, at(2, 2), at(4, 2));
    expect(hit.clear).toBe(true);
    expect(formatProbeBlocker(hit)).toBe("CLEAR LOS");
  });

  it("mountain block reports mountain reason and tile", () => {
    const map = testMap({ mountain: [[5, 2]] });
    const hit = evaluateCustomProbe(map, at(3, 2), at(7, 2));
    expect(hit.clear).toBe(false);
    expect(hit.blocker).toBe("MOUNTAIN");
    expect(hit.edge).toEqual({ tx: 5, ty: 2 });
    expect(hit.point).toBeTruthy();
    expect(formatProbeBlocker(hit)).toBe("BLOCKED · MOUNTAIN · (5,2)");
  });

  it("ridge block reports HIGH_GROUND mass reason", () => {
    const map = testMap({
      highGround: [
        [4, 4],
        [5, 4],
      ],
    });
    const hit = evaluateCustomProbe(map, at(3, 4), at(7, 4));
    expect(hit.blocker).toBe("RIDGE");
    expect(formatProbeBlocker(hit)).toContain("HIGH_GROUND MASS");
    expect(hit.edge).toBeTruthy();
    expect(hit.point).toBeTruthy();
  });

  it("bridge deck reports bridge reason", () => {
    const map = testMap({
      bridges: [{ tx: 6, ty: 3, orientation: "H" }],
    });
    const hit = evaluateCustomProbe(map, at(6, 3, "HIGH"), at(6, 3, "GROUND"));
    expect(hit.blocker).toBe("BRIDGE_DECK");
    expect(formatProbeBlocker(hit)).toBe("BLOCKED · BRIDGE DECK");
    expect(hit.point).toBeTruthy();
  });

  it("richer diagnostic result preserves gameplay boolean semantics", () => {
    const map = testMap({ mountain: [[4, 4]] });
    const clear = evaluateCustomProbe(map, at(1, 1), at(2, 1));
    const blocked = evaluateCustomProbe(map, at(3, 4), at(5, 4));
    expect(clear.clear).toBe(hasLineOfSight(map, at(1, 1), at(2, 1)));
    expect(blocked.clear).toBe(hasLineOfSight(map, at(3, 4), at(5, 4)));
    expect(traceLineOfSight(map, at(3, 4), at(5, 4)).clear).toBe(blocked.clear);
  });
});

describe("LOS probe tool state", () => {
  it("activating LOS PROBE prevents terrain painting", () => {
    const tool = selectLosProbeTool();
    expect(isLosProbeMode(tool)).toBe(true);
    expect(isAuthoringTool(tool)).toBe(false);
    expect(isTerrainPaintMode(tool)).toBe(false);
    const start = createBlankMap({ displayName: "P", id: "probe-paint", width: 12, height: 10 });
    const next = applyAuthor(start, tool, cell(4, 4), ctx());
    expect(next).toBe(start);
    expect(next.terrain[4]![4]).toBe("GROUND");
  });

  it("leaving LOS PROBE restores normal tool behavior", () => {
    const probe = selectLosProbeTool();
    const terrain = selectTerrainTool("ROAD");
    expect(isAuthoringTool(probe)).toBe(false);
    expect(isAuthoringTool(terrain)).toBe(true);
    expect(isTerrainPaintMode(terrain)).toBe(true);
    const start = createBlankMap({ displayName: "P", id: "probe-restore", width: 12, height: 10 });
    const painted = applyAuthor(start, terrain, cell(4, 4), ctx());
    expect(painted.terrain[4]![4]).toBe("ROAD");
  });

  it("probe state is not included in exported map JSON", () => {
    const doc = createBlankMap({ displayName: "P", id: "probe-export", width: 12, height: 10 });
    const exp = toExport(doc);
    expect(exp).not.toHaveProperty("losProbe");
    expect(exp).not.toHaveProperty("probeOrigin");
    expect(exp).not.toHaveProperty("probe");
    const text = stringifyExport(doc);
    expect(text.includes("los-probe")).toBe(false);
    expect(text.includes("probeOrigin")).toBe(false);
    expect(text.includes("LOS PROBE")).toBe(false);
    expect(Object.keys(exp).sort()).toEqual(
      [
        "schemaVersion",
        "id",
        "displayName",
        "width",
        "height",
        "status",
        "revision",
        "sourceMapId",
        "palette",
        "threat",
        "threatLabel",
        "desc",
        "hpMult",
        "lootMult",
        "waveMods",
        "sector",
        "geo",
        "terrain",
        "lanes",
        "props",
        "cover",
        "crates",
        "checkpoints",
        "edges",
        "gates",
        "zones",
        "collisionWalls",
        "bridges",
      ].sort(),
    );
  });

  it("changing origin recomputes targets", () => {
    const map = testMap({
      path: [
        [0, 3],
        [8, 3],
      ],
      mountain: [[4, 3]],
    });
    const samples = sampleLanePath([
      [0, 3],
      [8, 3],
    ]);
    const west = evaluatePathSweep(map, resolveProbePoint(map, 1, 5), samples);
    const east = evaluatePathSweep(map, resolveProbePoint(map, 7, 5), samples);
    expect(west.results.map((r) => r.hit.clear)).not.toEqual(east.results.map((r) => r.hit.clear));
    expect(west.visible).not.toBe(east.visible);
  });

  it("changing active lane recomputes targets", () => {
    let doc = createBlankMap({ displayName: "L", id: "probe-re-lane", width: 20, height: 13 });
    doc = setLaneWaypoints(doc, "MAIN", [
      [0, 2],
      [6, 2],
    ]);
    doc = addLane(doc, "A");
    doc = setLaneWaypoints(doc, "A", [
      [0, 10],
      [6, 10],
    ]);
    const map = gameMapFromEditorDoc(doc);
    const origin = resolveProbePoint(map, 3, 5);
    const main = evaluatePathSweep(map, origin, sampleActiveLane(map, "MAIN"));
    const alt = evaluatePathSweep(map, origin, sampleActiveLane(map, "A"));
    expect(main.results[0]!.y).not.toBe(alt.results[0]!.y);
    expect(main.results.length).toBeGreaterThan(0);
    expect(alt.results.length).toBeGreaterThan(0);
  });

  it("map edit affecting LOS invalidates probe results", () => {
    let doc = createBlankMap({ displayName: "P", id: "probe-invalidate", width: 20, height: 13 });
    doc = setLaneWaypoints(doc, "MAIN", [
      [0, 4],
      [8, 4],
    ]);
    const open = gameMapFromEditorDoc(doc);
    const origin = resolveProbePoint(open, 4, 2);
    const samples = sampleActiveLane(open, "MAIN");
    const before = evaluatePathSweep(open, origin, samples);
    doc = paintTiles(doc, [[4, 4]], "MOUNTAIN");
    const blocked = gameMapFromEditorDoc(doc);
    const after = evaluatePathSweep(blocked, origin, sampleActiveLane(blocked, "MAIN"));
    expect(after.blocked).toBeGreaterThan(before.blocked);
  });

  it("custom target uses canonical surface resolution", () => {
    let doc = createBlankMap({ displayName: "P", id: "probe-custom-surf", width: 20, height: 13 });
    doc = paintTiles(doc, [[6, 4]], "HIGH_GROUND");
    doc = paintTiles(doc, [[8, 4]], "ROAD");
    doc = setLaneWaypoints(doc, "MAIN", [
      [7, 4],
      [9, 4],
    ]);
    doc = paintBridgeTiles(doc, [[8, 4]]);
    const map = gameMapFromEditorDoc(doc);
    expect(resolveProbePoint(map, 6, 4).surface).toBe("HIGH");
    expect(displaySurface(resolveProbePoint(map, 6, 4).surface)).toBe("HIGH");
    expect(resolveProbePoint(map, 8, 4).surface).toBe("HIGH");
    expect(resolveProbePoint(map, 8, 4, "GROUND").surface).toBe("GROUND");
    expect(formatOriginLine(map, resolveProbePoint(map, 6, 4))).toContain("HIGH_GROUND");
    expect(formatOriginLine(map, resolveProbePoint(map, 8, 4))).toContain("SUSPENDED_BRIDGE");

    let state = emptyLosProbeState();
    state = { ...state, mode: "CUSTOM" };
    state = applyLosProbeClick(state, map, clickAt(6, 4), []);
    expect(state.origin?.surface).toBe("HIGH");
    state = applyLosProbeClick(state, map, clickAt(8, 4), []);
    expect(state.customTarget?.surface).toBe("HIGH");
    state = applyLosProbeClick(state, map, clickAt(8, 4), []);
    expect(state.customTarget?.surface).toBe("GROUND");
  });

  it("path LOS summary is diagnostic counts only", () => {
    expect(formatPathLosSummary(83, 124)).toBe("PATH LOS: 83 / 124 VISIBLE");
  });
});
