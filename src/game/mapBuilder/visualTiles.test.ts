import { describe, expect, it } from "bun:test";
import { createBlankMap, normalizeEditorDoc } from "./document";
import { importedToDoc, parseImport, stringifyExport } from "./export";
import { applyAuthorStroke } from "./author";
import { fromProductionMap, toProductionMapDef } from "./adapters";
import { clearVisualLayer, eraseVisualTile, paintVisualTile, visualTileAt } from "./visualTiles";
import type { EditorMapDoc } from "./schema";

function withTileset(): EditorMapDoc {
  const doc = createBlankMap({ displayName: "TILES", id: "visual-tiles", width: 12, height: 10 });
  return {
    ...doc,
    tileset: {
      name: "terrain.png",
      imageDataUrl: "data:image/png;base64,AAAA",
      imageWidth: 44,
      imageHeight: 44,
      tileWidth: 22,
      tileHeight: 22,
      columns: 2,
      rows: 2,
    },
  };
}

describe("map builder visual tiles", () => {
  it("starts old and blank maps with four empty visual layers", () => {
    const blank = createBlankMap({
      displayName: "BLANK",
      id: "blank-visual",
      width: 12,
      height: 10,
    });
    expect(blank.visualLayers).toEqual({ GROUND: [], DETAIL: [], OBJECTS: [], FOREGROUND: [] });

    const legacy = normalizeEditorDoc({
      ...blank,
      tileset: undefined,
      visualLayers: undefined,
    } as never);
    expect(legacy.tileset).toBeNull();
    expect(legacy.visualLayers.GROUND).toEqual([]);
  });

  it("paints, replaces, erases, and clears one layer without touching the others", () => {
    let doc = withTileset();
    doc = paintVisualTile(doc, "GROUND", 2, 3, 1);
    doc = paintVisualTile(doc, "GROUND", 2, 3, 2);
    doc = paintVisualTile(doc, "DETAIL", 2, 3, 3);
    expect(visualTileAt(doc, "GROUND", 2, 3)).toBe(2);
    expect(visualTileAt(doc, "DETAIL", 2, 3)).toBe(3);
    doc = eraseVisualTile(doc, "GROUND", 2, 3);
    expect(visualTileAt(doc, "GROUND", 2, 3)).toBeNull();
    expect(clearVisualLayer(doc, "DETAIL").visualLayers.DETAIL).toEqual([]);
  });

  it("drag-paints visual tiles through the normal authoring pipeline", () => {
    const doc = withTileset();
    const next = applyAuthorStroke(
      doc,
      { id: "visual-tile", layerId: "OBJECTS", tile: 2 },
      [
        { tx: 1, ty: 1, localX: 1, localY: 1 },
        { tx: 2, ty: 1, localX: 1, localY: 1 },
      ],
      { laneId: "MAIN", zoneId: null },
    );
    expect(next.visualLayers.OBJECTS).toEqual([
      { tx: 1, ty: 1, tile: 2 },
      { tx: 2, ty: 1, tile: 2 },
    ]);
  });

  it("round-trips the embedded atlas and sparse layers in map JSON", () => {
    let doc = withTileset();
    doc = paintVisualTile(doc, "FOREGROUND", 4, 5, 3);
    const parsed = parseImport(stringifyExport(doc));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const imported = importedToDoc(parsed.payload, "import-visual-tiles");
    expect(imported.tileset).toEqual(doc.tileset);
    expect(imported.visualLayers.FOREGROUND).toEqual([{ tx: 4, ty: 5, tile: 3 }]);
  });

  it("carries the tileset and placements into the production MapDef", () => {
    let doc = withTileset();
    doc = paintVisualTile(doc, "GROUND", 1, 1, 0);
    doc = paintVisualTile(doc, "OBJECTS", 3, 4, 3);
    const def = toProductionMapDef(doc);
    expect(def.tileset).toEqual({
      imageDataUrl: doc.tileset!.imageDataUrl,
      tileWidth: 22,
      tileHeight: 22,
      columns: 2,
      rows: 2,
    });
    expect(def.visualLayers?.GROUND).toEqual([{ tx: 1, ty: 1, tile: 0 }]);
    expect(def.visualLayers?.OBJECTS).toEqual([{ tx: 3, ty: 4, tile: 3 }]);
    expect(def.visualLayers?.DETAIL).toEqual([]);
  });

  it("omits visualLayers from the MapDef when a tileset is set but nothing is painted", () => {
    const def = toProductionMapDef(withTileset());
    expect(def.tileset).not.toBeNull();
    expect(def.visualLayers).toBeUndefined();
  });

  it("round-trips tileset and placements back out of a production MapDef", () => {
    let doc = withTileset();
    doc = paintVisualTile(doc, "FOREGROUND", 5, 2, 1);
    const def = toProductionMapDef(doc);
    const reopened = fromProductionMap(def);
    expect(reopened.tileset).toEqual({
      ...doc.tileset!,
      name: reopened.tileset!.name, // production doesn't carry the editor's filename label
    });
    expect(reopened.visualLayers.FOREGROUND).toEqual([{ tx: 5, ty: 2, tile: 1 }]);
  });

  it("a map with no tileset produces no tileset/visualLayers fields at all", () => {
    const def = toProductionMapDef(createBlankMap({ displayName: "PLAIN", id: "plain", width: 12, height: 10 }));
    expect(def.tileset).toBeUndefined();
    expect(def.visualLayers).toBeUndefined();
  });

  it("drops invalid imported tile indexes and out-of-bounds placements", () => {
    let doc = withTileset();
    doc = {
      ...doc,
      visualLayers: {
        ...doc.visualLayers,
        GROUND: [
          { tx: 1, ty: 1, tile: 1 },
          { tx: 99, ty: 1, tile: 1 },
          { tx: 2, ty: 2, tile: 99 },
        ],
      },
    };
    const parsed = parseImport(stringifyExport(doc));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(importedToDoc(parsed.payload, "import-filtered").visualLayers.GROUND).toEqual([
      { tx: 1, ty: 1, tile: 1 },
    ]);
  });
});
