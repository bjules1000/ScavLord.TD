import { describe, expect, it } from "bun:test";
import { applyAuthor, applyAuthorStroke, type AuthorCell } from "./author";
import { fromProductionMap } from "./adapters";
import { createBlankMap } from "./document";
import { importedToDoc, parseImport, stringifyExport, toExport } from "./export";
import { commit, sessionFrom, undo } from "./history";
import { MAP_BY_ID } from "../map";
import { eraseTiles, paintTiles } from "./paint";
import { DEFAULT_LAYERS, hitObject, visibleBridges } from "./render";
import { TILE } from "../data";
import { selectBridgeTool, selectEraseBridgeTool, selectEraserTool, selectTerrainTool } from "./tools";
import { validateMap } from "./validate";
import {
  bridgeSurfaceIsHigh,
  canEnterBridgeFrom,
  eraseBridgeAt,
  getBaseTerrain,
  hasBridge,
  hasElevatedSurface,
  inferBridgeOrientation,
  isolatedBridgeTiles,
  lanePathIgnoresBridgeOverlay,
  lowOccupantUsesBaseUnderBridge,
  paintBridgeTiles,
  raidRendersBridgeOverlay,
  setBridgeOrientation,
  surfaceLevelAt,
} from "./bridges";

function cell(tx: number, ty: number): AuthorCell {
  return { tx, ty, localX: 22, localY: 22 };
}

function ctx() {
  return { laneId: "MAIN", zoneId: null, tileSize: TILE };
}

describe("suspended bridge overlay", () => {
  it("places a bridge overlay on GROUND, ROAD, and WATER without mutating base terrain", () => {
    let doc = createBlankMap({ displayName: "B", id: "bridge-base", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 4]], "ROAD");
    doc = paintTiles(doc, [[5, 4]], "WATER");
    doc = paintBridgeTiles(doc, [[3, 4], [4, 4], [5, 4]]);
    expect(getBaseTerrain(doc, 3, 4)).toBe("GROUND");
    expect(getBaseTerrain(doc, 4, 4)).toBe("ROAD");
    expect(getBaseTerrain(doc, 5, 4)).toBe("WATER");
    expect(hasBridge(doc, 4, 4)).toBe(true);
    expect(doc.bridges).toHaveLength(3);
  });

  it("terrain edit underneath does not delete the bridge", () => {
    let doc = createBlankMap({ displayName: "B", id: "bridge-under", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 4]], "ROAD");
    doc = paintBridgeTiles(doc, [[4, 4]]);
    doc = paintTiles(doc, [[4, 4]], "WATER");
    expect(hasBridge(doc, 4, 4)).toBe(true);
    expect(doc.terrain[4]![4]).toBe("WATER");
    const erased = eraseTiles(doc, [[4, 4]]);
    expect(hasBridge(erased, 4, 4)).toBe(true);
    expect(erased.terrain[4]![4]).toBe("GROUND");
    expect(applyAuthor(doc, selectEraserTool(), cell(4, 4), ctx()).bridges).toEqual(doc.bridges);
  });

  it("bridge erase does not alter base terrain", () => {
    let doc = createBlankMap({ displayName: "B", id: "bridge-erase", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 4]], "ROAD");
    doc = paintBridgeTiles(doc, [[4, 4]]);
    const erased = eraseBridgeAt(doc, 4, 4);
    expect(erased.bridges).toEqual([]);
    expect(erased.terrain[4]![4]).toBe("ROAD");
    expect(applyAuthor(doc, selectEraseBridgeTool(), cell(4, 4), ctx()).terrain[4]![4]).toBe("ROAD");
  });

  it("bridge surface is HIGH while the ROAD underneath stays the LOW base", () => {
    let doc = createBlankMap({ displayName: "B", id: "bridge-levels", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 4]], "ROAD");
    doc = paintBridgeTiles(doc, [[4, 4]]);
    expect(bridgeSurfaceIsHigh(doc.bridges[0]!)).toBe(true);
    expect(hasElevatedSurface(doc, 4, 4)).toBe(true);
    expect(getBaseTerrain(doc, 4, 4)).toBe("ROAD");
    expect(surfaceLevelAt(doc, 4, 4, "LOW")).toBe("GROUND");
    expect(surfaceLevelAt(doc, 4, 4, "HIGH")).toBe("HIGH");
    expect(lowOccupantUsesBaseUnderBridge(doc, 4, 4)).toBe(true);
    expect(lanePathIgnoresBridgeOverlay()).toBe(true);
    expect(raidRendersBridgeOverlay()).toBe(false);
  });

  it("HIGH_GROUND and HIGH_GROUND → bridge are elevated; LOW cannot enter the overlay", () => {
    let doc = createBlankMap({ displayName: "B", id: "bridge-access", width: 12, height: 10 });
    doc = paintTiles(doc, [[3, 4]], "HIGH_GROUND");
    doc = paintTiles(doc, [[4, 4], [5, 4]], "ROAD");
    doc = paintBridgeTiles(doc, [[4, 4], [5, 4]]);
    expect(hasElevatedSurface(doc, 3, 4)).toBe(true);
    expect(canEnterBridgeFrom(doc, [3, 4], [4, 4])).toBe(true);
    expect(canEnterBridgeFrom(doc, [4, 4], [5, 4])).toBe(true);
    expect(canEnterBridgeFrom(doc, [4, 5], [4, 4])).toBe(false);
    expect(canEnterBridgeFrom(doc, [2, 4], [4, 4])).toBe(false);
  });

  it("infers HORIZONTAL vs VERTICAL from orthogonal neighbors", () => {
    let doc = createBlankMap({ displayName: "B", id: "bridge-orient", width: 12, height: 10 });
    doc = paintBridgeTiles(doc, [[4, 4], [5, 4], [6, 4]]);
    expect(inferBridgeOrientation(doc.bridges, 5, 4)).toBe("H");
    expect(doc.bridges.every((b) => b.orientation === "H")).toBe(true);
    doc = createBlankMap({ displayName: "B", id: "bridge-orient-v", width: 12, height: 10 });
    doc = paintBridgeTiles(doc, [[4, 3], [4, 4], [4, 5]]);
    expect(doc.bridges.every((b) => b.orientation === "V")).toBe(true);
    doc = setBridgeOrientation(doc, 4, 4, "H");
    expect(doc.bridges.find((b) => b.tx === 4 && b.ty === 4)!.orientation).toBe("H");
  });

  it("rejects diagonal-only geometry and warns on isolated / no elevated access", () => {
    let diag = createBlankMap({ displayName: "B", id: "bridge-diag", width: 12, height: 10 });
    diag = { ...diag, bridges: [{ tx: 4, ty: 4, orientation: "H" }, { tx: 5, ty: 5, orientation: "H" }] };
    const diagReport = validateMap(diag);
    expect(diagReport.errors.some((e) => e.code === "BRIDGE" && e.message.includes("diagonally"))).toBe(true);
    let iso = createBlankMap({ displayName: "B", id: "bridge-iso", width: 12, height: 10 });
    iso = paintBridgeTiles(iso, [[4, 4]]);
    expect(isolatedBridgeTiles(iso)).toHaveLength(1);
    const isoReport = validateMap(iso);
    expect(isoReport.warnings.some((w) => w.message.includes("Isolated"))).toBe(true);
    expect(isoReport.warnings.some((w) => w.message.includes("no elevated access"))).toBe(true);
    let ok = createBlankMap({ displayName: "B", id: "bridge-ok", width: 12, height: 10 });
    ok = paintTiles(ok, [[3, 4]], "HIGH_GROUND");
    ok = paintBridgeTiles(ok, [[4, 4], [5, 4], [6, 4]]);
    const okReport = validateMap(ok);
    expect(okReport.errors.some((e) => e.code === "BRIDGE")).toBe(false);
    expect(okReport.warnings.some((w) => w.message.includes("no elevated access"))).toBe(false);
  });

  it("drag paint is deterministic and one stroke is one mutation", () => {
    const start = createBlankMap({ displayName: "B", id: "bridge-drag", width: 12, height: 10 });
    const a = applyAuthorStroke(start, selectBridgeTool(), [cell(4, 4), cell(5, 4), cell(6, 4)], ctx());
    const b = applyAuthorStroke(start, selectBridgeTool(), [cell(4, 4), cell(5, 4), cell(6, 4)], ctx());
    expect(a.bridges).toEqual(b.bridges);
    expect(a.bridges.map((x) => [x.tx, x.ty])).toEqual([
      [4, 4],
      [5, 4],
      [6, 4],
    ]);
    const dup = applyAuthorStroke(a, selectBridgeTool(), [cell(5, 4)], ctx());
    expect(dup.bridges).toHaveLength(3);
  });

  it("undo/redo and BRIDGES layer preserve overlay data", () => {
    let s = sessionFrom(createBlankMap({ displayName: "B", id: "bridge-hist", width: 12, height: 10 }));
    s = commit(s, paintTiles(s.doc, [[4, 4]], "ROAD"));
    s = commit(s, applyAuthorStroke(s.doc, selectBridgeTool(), [cell(4, 4), cell(5, 4)], ctx()));
    expect(s.doc.bridges).toHaveLength(2);
    expect(DEFAULT_LAYERS.bridges).toBe(true);
    expect(visibleBridges(s.doc, DEFAULT_LAYERS)).toHaveLength(2);
    expect(visibleBridges(s.doc, { ...DEFAULT_LAYERS, bridges: false })).toEqual([]);
    s = commit(s, applyAuthor(s.doc, selectEraseBridgeTool(), cell(5, 4), ctx()));
    expect(s.doc.bridges).toHaveLength(1);
    expect(s.doc.terrain[4]![4]).toBe("ROAD");
    s = undo(s);
    expect(s.doc.bridges).toHaveLength(2);
    expect(s.doc.terrain[4]![4]).toBe("ROAD");
  });

  it("export includes overlay independently of base terrain and round-trips ROAD + bridge", () => {
    let doc = createBlankMap({ displayName: "B", id: "bridge-io", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 4], [5, 4]], "ROAD");
    doc = paintBridgeTiles(doc, [[4, 4], [5, 4]]);
    const exp = toExport(doc);
    expect(exp.terrain[4]![4]).toBe("ROAD");
    expect(exp.bridges).toEqual([
      { tx: 4, ty: 4, orientation: "H" },
      { tx: 5, ty: 4, orientation: "H" },
    ]);
    const parsed = parseImport(stringifyExport(doc));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = importedToDoc(parsed.payload, "import-bridge");
    expect(back.terrain[4]![4]).toBe("ROAD");
    expect(back.bridges).toEqual(exp.bridges);
    expect(toExport(back).bridges).toEqual(exp.bridges);
    expect(fromProductionMap(MAP_BY_ID["woods"]!).bridges).toEqual([
      { tx: 13, ty: 5, orientation: "V" },
      { tx: 13, ty: 6, orientation: "V" },
      { tx: 13, ty: 7, orientation: "V" },
    ]);
    expect(hitObject(doc, 4, 4)?.kind).toBe("bridge");
    expect(applyAuthor(doc, selectTerrainTool("GROUND"), cell(4, 4), ctx()).bridges).toEqual(doc.bridges);
  });
});
