import { describe, expect, it } from "bun:test";
import { TILE } from "../data";
import { MAP_BY_ID } from "../map";
import { applyAuthor, applyAuthorStroke, type AuthorCell } from "./author";
import { fromProductionMap } from "./adapters";
import { paintBridgeTiles } from "./bridges";
import { createBlankMap } from "./document";
import { importedToDoc, parseImport, stringifyExport, toExport } from "./export";
import { commit, sessionFrom, undo } from "./history";
import { eraseTiles, paintTiles } from "./paint";
import { DEFAULT_LAYERS, visibleCollisionWalls } from "./render";
import { edgeFromCursor } from "./edges";
import { selectCollisionWallTool, selectEraseWallTool, selectEraserTool } from "./tools";
import { validateMap } from "./validate";
import {
  canonicalCollisionWall,
  collisionWallBlocksMovement,
  collisionWallBlocksSight,
  collisionWallKey,
  eraseCollisionWall,
  isMovementBlockedAcrossEdge,
  isSightBlockedAcrossEdge,
  placeCollisionWall,
  raidRendersCollisionWalls,
} from "./walls";

function cell(tx: number, ty: number, localX: number, localY: number): AuthorCell {
  return { tx, ty, localX, localY };
}

function ctx() {
  return { laneId: "MAIN", zoneId: null, tileSize: TILE };
}

describe("invisible collision walls", () => {
  it("places NORTH EAST SOUTH WEST edges", () => {
    let doc = createBlankMap({ displayName: "W", id: "wall-nesw", width: 12, height: 10 });
    doc = applyAuthor(doc, selectCollisionWallTool(), cell(4, 5, 22, 2), ctx());
    doc = applyAuthor(doc, selectCollisionWallTool(), cell(4, 5, 40, 22), ctx());
    doc = applyAuthor(doc, selectCollisionWallTool(), cell(4, 5, 22, 40), ctx());
    doc = applyAuthor(doc, selectCollisionWallTool(), cell(4, 5, 2, 22), ctx());
    expect(doc.collisionWalls).toEqual([
      { tx: 4, ty: 4, edge: "S" },
      { tx: 3, ty: 5, edge: "E" },
      { tx: 4, ty: 5, edge: "E" },
      { tx: 4, ty: 5, edge: "S" },
    ]);
    expect(edgeFromCursor(22, 2, TILE)).toBe("N");
    expect(edgeFromCursor(40, 22, TILE)).toBe("E");
    expect(edgeFromCursor(22, 40, TILE)).toBe("S");
    expect(edgeFromCursor(2, 22, TILE)).toBe("W");
  });

  it("canonicalizes shared EAST/WEST neighbor edges to one wall", () => {
    expect(canonicalCollisionWall(4, 5, "E", 12, 10)).toEqual({ tx: 4, ty: 5, edge: "E" });
    expect(canonicalCollisionWall(5, 5, "W", 12, 10)).toEqual({ tx: 4, ty: 5, edge: "E" });
    let doc = createBlankMap({ displayName: "W", id: "wall-ew", width: 12, height: 10 });
    doc = placeCollisionWall(doc, 4, 5, "E");
    const dup = placeCollisionWall(doc, 5, 5, "W");
    expect(dup).toBe(doc);
    expect(doc.collisionWalls).toEqual([{ tx: 4, ty: 5, edge: "E" }]);
    expect(collisionWallKey(doc.collisionWalls[0]!)).toBe("4,5,E");
  });

  it("canonicalizes shared NORTH/SOUTH neighbor edges to one wall", () => {
    expect(canonicalCollisionWall(4, 5, "S", 12, 10)).toEqual({ tx: 4, ty: 5, edge: "S" });
    expect(canonicalCollisionWall(4, 6, "N", 12, 10)).toEqual({ tx: 4, ty: 5, edge: "S" });
    let doc = createBlankMap({ displayName: "W", id: "wall-ns", width: 12, height: 10 });
    doc = placeCollisionWall(doc, 4, 5, "S");
    expect(placeCollisionWall(doc, 4, 6, "N")).toBe(doc);
    expect(doc.collisionWalls).toHaveLength(1);
  });

  it("rejects a duplicate identical edge and allows different edges on the same tile", () => {
    let doc = createBlankMap({ displayName: "W", id: "wall-dup", width: 12, height: 10 });
    doc = placeCollisionWall(doc, 4, 5, "E");
    expect(placeCollisionWall(doc, 4, 5, "E")).toBe(doc);
    doc = placeCollisionWall(doc, 4, 5, "S");
    expect(doc.collisionWalls).toHaveLength(2);
  });

  it("allows outer map boundary walls without a neighbor tile", () => {
    let doc = createBlankMap({ displayName: "W", id: "wall-bound", width: 12, height: 10 });
    doc = placeCollisionWall(doc, 0, 3, "W");
    doc = placeCollisionWall(doc, 11, 3, "E");
    doc = placeCollisionWall(doc, 4, 0, "N");
    doc = placeCollisionWall(doc, 4, 9, "S");
    expect(doc.collisionWalls).toEqual([
      { tx: 4, ty: 0, edge: "N" },
      { tx: 0, ty: 3, edge: "W" },
      { tx: 11, ty: 3, edge: "E" },
      { tx: 4, ty: 9, edge: "S" },
    ]);
  });

  it("erase removes the exact physical edge and leaves terrain and high ground", () => {
    let doc = createBlankMap({ displayName: "W", id: "wall-erase", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 5], [5, 5]], "HIGH_GROUND");
    doc = paintTiles(doc, [[4, 6]], "ROAD");
    doc = placeCollisionWall(doc, 4, 5, "E");
    doc = placeCollisionWall(doc, 4, 5, "S");
    const erased = eraseCollisionWall(doc, 5, 5, "W");
    expect(erased.collisionWalls).toEqual([{ tx: 4, ty: 5, edge: "S" }]);
    expect(erased.terrain[5]![4]).toBe("HIGH_GROUND");
    expect(erased.terrain[5]![5]).toBe("HIGH_GROUND");
    expect(erased.terrain[6]![4]).toBe("ROAD");
    const terrainErase = eraseTiles(erased, [[4, 5]]);
    expect(terrainErase.collisionWalls).toEqual(erased.collisionWalls);
    expect(applyAuthor(erased, selectEraserTool(), cell(4, 6, 22, 22), ctx()).collisionWalls).toEqual(
      erased.collisionWalls,
    );
  });

  it("wall data blocks movement and LOS across the shared edge", () => {
    let doc = createBlankMap({ displayName: "W", id: "wall-los", width: 12, height: 10 });
    doc = placeCollisionWall(doc, 4, 5, "E");
    expect(collisionWallBlocksMovement(doc.collisionWalls[0]!)).toBe(true);
    expect(collisionWallBlocksSight(doc.collisionWalls[0]!)).toBe(true);
    expect(isMovementBlockedAcrossEdge(doc, [4, 5], [5, 5])).toBe(true);
    expect(isSightBlockedAcrossEdge(doc, [4, 5], [5, 5])).toBe(true);
    expect(isMovementBlockedAcrossEdge(doc, [5, 5], [4, 5])).toBe(true);
    expect(isMovementBlockedAcrossEdge(doc, [4, 5], [4, 6])).toBe(false);
  });

  it("WALLS layer hides visualization but preserves data", () => {
    let doc = createBlankMap({ displayName: "W", id: "wall-layer", width: 12, height: 10 });
    doc = placeCollisionWall(doc, 4, 5, "E");
    expect(DEFAULT_LAYERS.walls).toBe(true);
    expect(visibleCollisionWalls(doc, DEFAULT_LAYERS)).toHaveLength(1);
    expect(visibleCollisionWalls(doc, { ...DEFAULT_LAYERS, walls: false })).toEqual([]);
    expect(doc.collisionWalls).toHaveLength(1);
  });

  it("normal raids do not render the invisible-wall overlay", () => {
    expect(raidRendersCollisionWalls()).toBe(false);
  });

  it("undo/redo restores a wall without changing other layers", () => {
    let s = sessionFrom(createBlankMap({ displayName: "W", id: "wall-undo", width: 12, height: 10 }));
    s.doc = paintTiles(s.doc, [[4, 5]], "HIGH_GROUND");
    s = commit(s, applyAuthor(s.doc, selectCollisionWallTool(), cell(4, 5, 40, 22), ctx()));
    expect(s.doc.collisionWalls).toHaveLength(1);
    s = commit(s, applyAuthor(s.doc, selectEraseWallTool(), cell(4, 5, 40, 22), ctx()));
    expect(s.doc.collisionWalls).toHaveLength(0);
    s = undo(s);
    expect(s.doc.collisionWalls).toEqual([{ tx: 4, ty: 5, edge: "E" }]);
    expect(s.doc.terrain[5]![4]).toBe("HIGH_GROUND");
  });

  it("export/import round-trips canonical walls and does not auto-author existing maps", () => {
    let doc = createBlankMap({ displayName: "W", id: "wall-io", width: 12, height: 10 });
    doc = placeCollisionWall(doc, 5, 5, "W");
    const exp = toExport(doc);
    expect(exp.collisionWalls).toEqual([{ tx: 4, ty: 5, edge: "E" }]);
    const parsed = parseImport(stringifyExport(doc));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = importedToDoc(parsed.payload, "import-walls");
    expect(back.collisionWalls).toEqual(exp.collisionWalls);
    expect(toExport(back).collisionWalls).toEqual(exp.collisionWalls);
    const woods = fromProductionMap(MAP_BY_ID["woods"]!);
    expect(woods.collisionWalls).toHaveLength(91);
    expect(validateMap(doc).ok).toBe(false);
  });

  it("drag stroke places multiple walls as one document mutation", () => {
    const start = createBlankMap({ displayName: "W", id: "wall-stroke", width: 12, height: 10 });
    const next = applyAuthorStroke(
      start,
      selectCollisionWallTool(),
      [cell(2, 2, 40, 22), cell(2, 3, 40, 22), cell(2, 4, 40, 22)],
      ctx(),
    );
    expect(next.collisionWalls).toHaveLength(3);
  });

  it("round-trips stacked ROAD + bridge + invisible walls together", () => {
    let doc = createBlankMap({ displayName: "W", id: "wall-stack", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 4], [5, 4]], "ROAD");
    doc = paintTiles(doc, [[3, 4]], "HIGH_GROUND");
    doc = placeCollisionWall(doc, 3, 4, "N");
    doc = paintBridgeTiles(doc, [[4, 4], [5, 4]]);
    const exp = toExport(doc);
    expect(exp.terrain[4]![4]).toBe("ROAD");
    expect(exp.collisionWalls).toEqual([{ tx: 3, ty: 3, edge: "S" }]);
    expect(exp.bridges.map((b) => [b.tx, b.ty])).toEqual([[4, 4], [5, 4]]);
    const parsed = parseImport(stringifyExport(doc));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = importedToDoc(parsed.payload, "import-stack");
    expect(back.terrain[4]![4]).toBe("ROAD");
    expect(back.collisionWalls).toEqual(exp.collisionWalls);
    expect(back.bridges).toEqual(exp.bridges);
  });
});
