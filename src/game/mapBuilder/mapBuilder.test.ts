import { describe, expect, it } from "bun:test";
import { MAP_BY_ID, MAP_DEFS } from "../map";
import { fromProductionMap, integrationNotes, toProductionMapDef } from "./adapters";
import { createBlankMap, lockDoc, unlockRevision, validateNewMapInput } from "./document";
import { edgeFromCursor } from "./edges";
import { exportFilename, importedToDoc, parseImport, stringifyExport, toExport } from "./export";
import { HISTORY_LIMIT } from "./schema";
import {
  applyAuthor,
  applyAuthorStroke,
  eraseGameplayAt,
  erasePathAt,
  erasePropAt,
  eraseSpawn,
  eraseEndpoint,
  eraseZoneAt,
  pathStepValid,
} from "./author";
import { canRedo, canUndo, commit, commitStroke, redo, sessionFrom, undo } from "./history";
import { clientToTile, DEFAULT_LAYERS, pathStrokeStyle, visiblePathOverlays } from "./render";
import {
  isInspectMode,
  isPathMode,
  isPropEraseMode,
  isPropPlaceMode,
  isTerrainEraserMode,
  isTerrainPaintMode,
  selectEraserTool,
  selectGameplayEraser,
  selectInspectTool,
  selectPathTool,
  selectPropEraser,
  selectPropTool,
  selectTerrainTool,
  TERRAIN_PAINT_KINDS,
} from "./tools";
import {
  addLane,
  applyEndpoint,
  applyPathClick,
  applySpawn,
  clearLanePath,
  eraseTiles,
  paintTiles,
  paintZoneCells,
  placeProp,
  removeObject,
  setLaneWaypoints,
} from "./paint";
import { pathCells } from "./pathing";
import {
  EDITOR_GUTTER,
  canvasPixelSize,
  isLegalPort,
  legalPortEdges,
  markerOutsidePlayableGrid,
  overlayPathCells,
  peelLaneFromWaypoints,
  portEdgeFromCursor,
  portOutsideCell,
} from "./ports";
import { MAP_BUILDER_STORAGE_KEY as SCHEMA_KEY } from "./schema";
import {
  emptyStore,
  gameplaySaveKey,
  MAP_BUILDER_STORAGE_KEY,
  readStore,
  storageKeysOverlap,
  upsertDoc,
  writeStore,
} from "./persist";
import { canLock, validateMap } from "./validate";
import { TILE } from "../data";

function validDraft() {
  let doc = createBlankMap({ displayName: "TEST MAP", id: "test-map", width: 20, height: 13 });
  const tiles: Array<[number, number]> = [];
  for (let x = 0; x <= 19; x++) tiles.push([x, 2]);
  doc = paintTiles(doc, tiles, "ROAD");
  doc = setLaneWaypoints(doc, "MAIN", tiles);
  doc = applySpawn(doc, "MAIN", { tx: 0, ty: 2, edge: "W" });
  doc = applyEndpoint(doc, "MAIN", { tx: 19, ty: 2, edge: "E" });
  return doc;
}

describe("map builder drafts", () => {
  it("converts an existing production map into an editor draft", () => {
    const woods = MAP_BY_ID["woods"]!;
    const draft = fromProductionMap(woods);
    expect(draft.sourceMapId).toBe("woods");
    expect(draft.displayName).toBe(woods.name);
    expect(draft.status).toBe("draft");
    expect(draft.lanes[0]!.id).toBe("MAIN");
    expect(draft.lanes[0]!.spawn).toEqual({ tx: 0, ty: 1, edge: "W" });
    expect(draft.lanes[0]!.endpoint).toEqual({ tx: 19, ty: 5, edge: "E" });
    expect(draft.lanes[0]!.waypoints.every(([x, y]) => x >= 0 && y >= 0 && x < 20 && y < 13)).toBe(true);
    expect(draft.lanes[0]!.waypoints[0]).toEqual([0, 1]);
    expect(draft.lanes[0]!.waypoints.at(-1)).toEqual([19, 5]);
    expect(draft.lanes[0]!.waypoints).not.toEqual(woods.path);
    expect(draft.props.length).toBe(woods.props.length);
    expect(draft.terrain[1]![4]).toBe("ROAD");
    expect(draft.terrain[0]![0]).toBe("GROUND");
  });

  it("loads GRAIN GATE with both authored lanes and water", () => {
    const grain = fromProductionMap(MAP_BY_ID["kolkhoz"]!);
    expect(grain.lanes.map((l) => l.id)).toEqual(["MAIN", "A"]);
    const main = grain.lanes.find((l) => l.id === "MAIN")!;
    const a = grain.lanes.find((l) => l.id === "A")!;
    expect(main.waypoints).toEqual(MAP_BY_ID["kolkhoz"]!.path);
    expect(main.spawn).toEqual({ tx: 0, ty: 3, edge: "W" });
    expect(main.endpoint).toEqual({ tx: 16, ty: 0, edge: "N" });
    expect(a.waypoints.at(-1)).toEqual([19, 10]);
    expect(a.spawn).toEqual({ tx: 0, ty: 5, edge: "W" });
    expect(a.endpoint).toEqual({ tx: 19, ty: 10, edge: "E" });
    expect(grain.terrain[0]![5]).toBe("WATER");
    expect(grain.terrain[3]![0]).toBe("ROAD");
    expect(grain.terrain[5]![0]).toBe("ROAD");
    const produced = toProductionMapDef(grain);
    expect(produced.lanes?.map((l) => l.id).sort()).toEqual(["A", "MAIN"]);
    expect(produced.water?.length).toBe(MAP_BY_ID["kolkhoz"]!.water?.length);
  });

  it("creates a blank ground grid from validated new-map input", () => {
    expect(validateNewMapInput({ displayName: "", id: "ab", width: 20, height: 13 })).toBeTruthy();
    const doc = createBlankMap({ displayName: "BLANK", id: "blank-map", width: 12, height: 10 });
    expect(doc.terrain.length).toBe(10);
    expect(doc.terrain[0]!.length).toBe(12);
    expect(doc.terrain.every((row) => row.every((c) => c === "GROUND"))).toBe(true);
    expect(doc.lanes).toEqual([{ id: "MAIN", waypoints: [], spawn: null, endpoint: null }]);
  });
});

describe("map builder paint", () => {
  it("paints only the intended tile", () => {
    const doc = createBlankMap({ displayName: "P", id: "paint-one", width: 12, height: 10 });
    const next = paintTiles(doc, [[3, 4]], "WATER");
    expect(next.terrain[4]![3]).toBe("WATER");
    expect(next.terrain[4]![2]).toBe("GROUND");
    expect(next.terrain[3]![3]).toBe("GROUND");
  });

  it("drag paint produces a deterministic result", () => {
    const doc = createBlankMap({ displayName: "P", id: "paint-drag", width: 12, height: 10 });
    const tiles: Array<[number, number]> = [
      [1, 1],
      [2, 1],
      [3, 1],
      [3, 2],
    ];
    const a = paintTiles(doc, tiles, "ROAD");
    const b = paintTiles(doc, [...tiles].reverse(), "ROAD");
    expect(a.terrain).toEqual(b.terrain);
    expect(tiles.every(([x, y]) => a.terrain[y]![x] === "ROAD")).toBe(true);
  });

  it("erase restores ground on those tiles", () => {
    let doc = createBlankMap({ displayName: "P", id: "paint-erase", width: 12, height: 10 });
    doc = paintTiles(doc, [[2, 2], [3, 2]], "MOUNTAIN");
    doc = eraseTiles(doc, [[2, 2]]);
    expect(doc.terrain[2]![2]).toBe("GROUND");
    expect(doc.terrain[2]![3]).toBe("MOUNTAIN");
  });
});

describe("map builder history", () => {
  it("undo restores the previous document", () => {
    const start = createBlankMap({ displayName: "H", id: "hist-undo", width: 12, height: 10 });
    let s = sessionFrom(start);
    s = commit(s, paintTiles(s.doc, [[1, 1]], "WATER"));
    expect(s.doc.terrain[1]![1]).toBe("WATER");
    s = undo(s);
    expect(s.doc.terrain[1]![1]).toBe("GROUND");
  });

  it("redo reapplies the undone state", () => {
    let s = sessionFrom(createBlankMap({ displayName: "H", id: "hist-redo", width: 12, height: 10 }));
    s = commit(s, paintTiles(s.doc, [[1, 1]], "WATER"));
    s = undo(s);
    s = redo(s);
    expect(s.doc.terrain[1]![1]).toBe("WATER");
    expect(canUndo(s)).toBe(true);
    expect(canRedo(s)).toBe(false);
  });

  it("bounds history to HISTORY_LIMIT", () => {
    let s = sessionFrom(createBlankMap({ displayName: "H", id: "hist-bound", width: 20, height: 13 }));
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      const kind = s.doc.terrain[0]![0] === "WATER" ? "ROAD" : "WATER";
      s = commit(s, paintTiles(s.doc, [[0, 0]], kind));
    }
    expect(s.past.length).toBe(HISTORY_LIMIT);
  });
});

describe("map builder terrain serialize", () => {
  it("serializes water correctly", () => {
    let doc = createBlankMap({ displayName: "T", id: "ser-water", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 5], [5, 5]], "WATER");
    expect(toExport(doc).terrain[5]![4]).toBe("WATER");
    expect(toExport(doc).terrain[5]![5]).toBe("WATER");
  });

  it("serializes blocked mountain terrain", () => {
    let doc = createBlankMap({ displayName: "T", id: "ser-mtn", width: 12, height: 10 });
    doc = paintTiles(doc, [[1, 1]], "MOUNTAIN");
    expect(toExport(doc).terrain[1]![1]).toBe("MOUNTAIN");
  });

  it("serializes high ground", () => {
    let doc = createBlankMap({ displayName: "T", id: "ser-hg", width: 12, height: 10 });
    doc = paintTiles(doc, [[6, 3]], "HIGH_GROUND");
    expect(toExport(doc).terrain[3]![6]).toBe("HIGH_GROUND");
  });
});

describe("map builder lanes", () => {
  it("keeps lane IDs independent", () => {
    let doc = validDraft();
    doc = addLane(doc, "A");
    doc = applySpawn(doc, "A", { tx: 0, ty: 6, edge: "W" });
    doc = applyEndpoint(doc, "A", { tx: 19, ty: 6, edge: "E" });
    const main = doc.lanes.find((l) => l.id === "MAIN")!;
    const a = doc.lanes.find((l) => l.id === "A")!;
    expect(main.waypoints).not.toEqual(a.waypoints);
    expect(main.id).toBe("MAIN");
    expect(a.id).toBe("A");
  });

  it("requires spawn and endpoint", () => {
    const doc = createBlankMap({ displayName: "L", id: "lane-se", width: 12, height: 10 });
    const r = validateMap(doc);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes("spawn") && e.message.includes("endpoint"))).toBe(true);
  });

  it("fails a disconnected / incomplete path", () => {
    let doc = createBlankMap({ displayName: "L", id: "lane-disc", width: 12, height: 10 });
    doc = applySpawn(doc, "MAIN", { tx: 0, ty: 0, edge: "W" });
    const r = validateMap(doc);
    expect(r.ok).toBe(false);
  });

  it("fails a diagonal-only path", () => {
    let doc = createBlankMap({ displayName: "L", id: "lane-diag", width: 12, height: 10 });
    doc = { ...doc, lanes: [{ id: "MAIN", waypoints: [[0, 0], [1, 1]], spawn: null, endpoint: null }] };
    const r = validateMap(doc);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "DIAGONAL")).toBe(true);
  });

  it("passes a valid orthogonal path", () => {
    const r = validateMap(validDraft());
    expect(r.ok).toBe(true);
  });

  it("fails duplicate lane IDs", () => {
    let doc = validDraft();
    doc = { ...doc, lanes: [...doc.lanes, { id: "MAIN", waypoints: [[0, 5], [4, 5]], spawn: null, endpoint: null }] };
    expect(validateMap(doc).errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  it("fails an out-of-bounds marker", () => {
    let doc = validDraft();
    doc = { ...doc, lanes: [{ id: "MAIN", waypoints: [[-1, 2], [99, 2]], spawn: null, endpoint: null }] };
    expect(validateMap(doc).errors.some((e) => e.code === "BOUNDS")).toBe(true);
  });
});

describe("map builder zones and edges", () => {
  it("serializes a special zone", () => {
    let doc = validDraft();
    doc = paintZoneCells(doc, [[16, 10], [17, 10], [16, 11]], null);
    const exp = toExport(doc);
    expect(exp.zones[0]!.type).toBe("RESOURCE_SITE");
    expect(exp.zones[0]!.cells).toEqual([
      [16, 10],
      [17, 10],
      [16, 11],
    ]);
  });

  it("returns N/E/S/W from cursor position deterministically", () => {
    expect(edgeFromCursor(22, 2, TILE)).toBe("N");
    expect(edgeFromCursor(40, 22, TILE)).toBe("E");
    expect(edgeFromCursor(22, 40, TILE)).toBe("S");
    expect(edgeFromCursor(2, 22, TILE)).toBe("W");
    expect(edgeFromCursor(22, 22, TILE)).toBe("E");
  });
});

describe("map builder lock and export", () => {
  it("blocks lock when the draft is invalid", () => {
    const doc = createBlankMap({ displayName: "K", id: "lock-bad", width: 12, height: 10 });
    expect(canLock(doc)).toBe(false);
  });

  it("locks a valid draft", () => {
    const doc = validDraft();
    expect(canLock(doc)).toBe(true);
    expect(lockDoc(doc).status).toBe("locked");
  });

  it("keeps a locked draft read-only", () => {
    const locked = lockDoc(validDraft());
    const painted = paintTiles(locked, [[0, 0]], "WATER");
    const placed = placeProp(locked, 1, 0, "tree");
    expect(painted).toBe(locked);
    expect(placed).toBe(locked);
    expect(painted.terrain[0]![0]).toBe("GROUND");
  });

  it("unlock / revision restores editability", () => {
    const locked = lockDoc(validDraft());
    const rev = unlockRevision(locked);
    expect(rev.status).toBe("draft");
    expect(rev.revision).toBe(locked.revision + 1);
    const painted = paintTiles(rev, [[0, 0]], "WATER");
    expect(painted.terrain[0]![0]).toBe("WATER");
  });

  it("export is deterministic", () => {
    let doc = validDraft();
    doc = placeProp(doc, 4, 6, "tree");
    doc = placeProp(doc, 2, 6, "rock");
    const a = stringifyExport(doc);
    const b = stringifyExport(doc);
    expect(a).toBe(b);
    expect(a).toContain('"schemaVersion": 1');
    expect(exportFilename(doc)).toBe("test-map.map.json");
  });

  it("exported JSON round-trips through import", () => {
    let doc = validDraft();
    doc = paintTiles(doc, [[7, 7]], "HIGH_GROUND");
    doc = paintZoneCells(doc, [[8, 8]], null);
    doc = placeProp(doc, 3, 5, "hut");
    const raw = stringifyExport(lockDoc(doc));
    const parsed = parseImport(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = importedToDoc(parsed.payload, "import-test-map");
    expect(toExport(back)).toEqual(parsed.payload);
  });

  it("rejects invalid import without using it", () => {
    expect(parseImport("{").ok).toBe(false);
    expect(parseImport(JSON.stringify({ schemaVersion: 2, id: "x" })).ok).toBe(false);
    const current = stringifyExport(validDraft());
    const bad = parseImport('{"schemaVersion":1}');
    expect(bad.ok).toBe(false);
    expect(stringifyExport(validDraft())).toBe(current);
  });
});

describe("map builder persistence isolation", () => {
  it("uses a namespace that does not overlap gameplay save", () => {
    expect(MAP_BUILDER_STORAGE_KEY).toBe("scavlord.dev.mapBuilder.v1");
    expect(SCHEMA_KEY).toBe(MAP_BUILDER_STORAGE_KEY);
    expect(gameplaySaveKey()).toBe("kolkhoz-meta-v5");
    expect(storageKeysOverlap()).toBe(false);
  });

  it("round-trips drafts through the namespaced store", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    const doc = validDraft();
    writeStore(storage, upsertDoc(emptyStore(), doc));
    expect(mem.has("kolkhoz-meta-v5")).toBe(false);
    expect(mem.has(MAP_BUILDER_STORAGE_KEY)).toBe(true);
    const loaded = readStore(storage);
    expect(loaded.docs[doc.id]!.displayName).toBe("TEST MAP");
  });
});

describe("map builder production isolation", () => {
  it("does not mutate production map definitions when editing a draft", () => {
    const before = JSON.stringify(MAP_DEFS);
    const woodsPath = [...MAP_BY_ID["woods"]!.path];
    let draft = fromProductionMap(MAP_BY_ID["woods"]!);
    draft = paintTiles(draft, [[0, 0]], "WATER");
    draft = placeProp(draft, 5, 5, "office");
    draft = applyPathClick(draft, "MAIN", [0, 12]);
    const produced = toProductionMapDef(draft);
    expect(JSON.stringify(MAP_DEFS)).toBe(before);
    expect(MAP_BY_ID["woods"]!.path).toEqual(woodsPath);
    expect(produced.id).toBe("woods");
    expect(MAP_DEFS[0]!.props.some((p) => p.type === "office" && p.tx === 5 && p.ty === 5)).toBe(false);
    expect(integrationNotes(draft).some((n) => n.code === "WATER")).toBe(true);
  });

  it("can remove a placed prop from a draft only", () => {
    let doc = validDraft();
    doc = placeProp(doc, 4, 4, "tree");
    const id = doc.props[0]!.id;
    doc = removeObject(doc, id);
    expect(doc.props.length).toBe(0);
  });
});

describe("map builder terrain paint interaction", () => {
  it("selecting each terrain kind activates terrain paint mode", () => {
    for (const kind of TERRAIN_PAINT_KINDS) {
      const tool = selectTerrainTool(kind);
      expect(isTerrainPaintMode(tool)).toBe(true);
      expect(isInspectMode(tool)).toBe(false);
      expect(tool.terrain).toBe(kind);
    }
  });

  it("SELECT leaves paint mode", () => {
    expect(isInspectMode(selectInspectTool())).toBe(true);
    expect(isTerrainPaintMode(selectInspectTool())).toBe(false);
  });

  it("paints exactly the requested tile and leaves neighbors unchanged", () => {
    const doc = createBlankMap({ displayName: "P", id: "paint-exact", width: 12, height: 10 });
    const next = paintTiles(doc, [[5, 6]], "WATER");
    expect(next.terrain[6]![5]).toBe("WATER");
    expect(next.terrain[6]![4]).toBe("GROUND");
    expect(next.terrain[6]![6]).toBe("GROUND");
    expect(next.terrain[5]![5]).toBe("GROUND");
    expect(next.terrain[7]![5]).toBe("GROUND");
  });

  it("terrain eraser resets ROAD WATER MOUNTAIN and HIGH_GROUND to GROUND", () => {
    let doc = createBlankMap({ displayName: "P", id: "erase-kinds", width: 12, height: 10 });
    doc = paintTiles(doc, [[1, 1]], "ROAD");
    doc = paintTiles(doc, [[2, 1]], "WATER");
    doc = paintTiles(doc, [[3, 1]], "MOUNTAIN");
    doc = paintTiles(doc, [[4, 1]], "HIGH_GROUND");
    expect(isTerrainEraserMode(selectEraserTool())).toBe(true);
    const erased = eraseTiles(doc, [
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
    ]);
    expect(erased.terrain[1]![1]).toBe("GROUND");
    expect(erased.terrain[1]![2]).toBe("GROUND");
    expect(erased.terrain[1]![3]).toBe("GROUND");
    expect(erased.terrain[1]![4]).toBe("GROUND");
  });

  it("terrain eraser does not delete a prop or lane on the same tile", () => {
    let doc = validDraft();
    doc = placeProp(doc, 4, 4, "tree");
    const waypoints = doc.lanes[0]!.waypoints;
    const erased = eraseTiles(doc, [[4, 4], [0, 2]]);
    expect(erased.props.some((p) => p.tx === 4 && p.ty === 4 && p.type === "tree")).toBe(true);
    expect(erased.lanes[0]!.waypoints).toEqual(waypoints);
    expect(erased.terrain[2]![0]).toBe("GROUND");
  });

  it("painting a production-map draft does not mutate MAP_DEFS", () => {
    const before = JSON.stringify(MAP_DEFS);
    const grain = fromProductionMap(MAP_BY_ID["kolkhoz"]!);
    expect(grain.status).toBe("draft");
    const painted = paintTiles(grain, [[0, 0]], "WATER");
    expect(painted.terrain[0]![0]).toBe("WATER");
    expect(JSON.stringify(MAP_DEFS)).toBe(before);
  });

  it("locked draft rejects editing and unlocked draft accepts it", () => {
    const locked = lockDoc(validDraft());
    expect(paintTiles(locked, [[0, 0]], "WATER")).toBe(locked);
    const open = unlockRevision(locked);
    expect(paintTiles(open, [[0, 0]], "WATER").terrain[0]![0]).toBe("WATER");
  });

  it("undo and redo restore terrain after GROUND → WATER → ERASER", () => {
    let s = sessionFrom(createBlankMap({ displayName: "H", id: "hist-paint", width: 12, height: 10 }));
    s = commit(s, paintTiles(s.doc, [[2, 2]], "ROAD"));
    s = commit(s, eraseTiles(s.doc, [[2, 2]]));
    expect(s.doc.terrain[2]![2]).toBe("GROUND");
    s = undo(s);
    expect(s.doc.terrain[2]![2]).toBe("ROAD");
    s = undo(s);
    expect(s.doc.terrain[2]![2]).toBe("GROUND");
    s = redo(s);
    expect(s.doc.terrain[2]![2]).toBe("ROAD");
  });

  it("duplicate paint onto the same terrain does not create history", () => {
    let s = sessionFrom(createBlankMap({ displayName: "H", id: "hist-dup", width: 12, height: 10 }));
    const painted = paintTiles(s.doc, [[1, 1]], "WATER");
    s = commit(s, painted);
    expect(s.past.length).toBe(1);
    s = commit(s, paintTiles(s.doc, [[1, 1]], "WATER"));
    expect(s.past.length).toBe(1);
  });

  it("commits a click stroke after live preview without dropping the mutation", () => {
    const start = createBlankMap({ displayName: "P", id: "stroke-commit", width: 12, height: 10 });
    const session = sessionFrom(start);
    const preview = paintTiles(session.doc, [[3, 3]], "WATER");
    const liveDoc = preview;
    expect(preview === liveDoc).toBe(true);
    const droppedIfComparedToPreview = preview === liveDoc;
    expect(droppedIfComparedToPreview).toBe(true);
    const committed = commitStroke(session, preview);
    expect(committed.doc.terrain[3]![3]).toBe("WATER");
    expect(committed.past.length).toBe(1);
  });

  it("converts client coordinates at every supported zoom", () => {
    const width = 20;
    const height = 13;
    for (const zoom of [0.5, 0.75, 1, 1.25, 1.5]) {
      const displayW = width * TILE * zoom;
      const displayH = height * TILE * zoom;
      const rect = { left: 40, top: 80, width: displayW, height: displayH };
      const first = clientToTile(rect.left + TILE * zoom * 0.25, rect.top + TILE * zoom * 0.25, rect, width, height);
      expect(first?.tx).toBe(0);
      expect(first?.ty).toBe(0);
      const last = clientToTile(
        rect.left + (width - 0.25) * TILE * zoom,
        rect.top + (height - 0.25) * TILE * zoom,
        rect,
        width,
        height,
      );
      expect(last?.tx).toBe(width - 1);
      expect(last?.ty).toBe(height - 1);
      const scrolledRect = { left: 40 - 200, top: 80, width: displayW, height: displayH };
      const scrolled = clientToTile(
        scrolledRect.left + 14.5 * TILE * zoom,
        scrolledRect.top + 8.5 * TILE * zoom,
        scrolledRect,
        width,
        height,
      );
      expect(scrolled?.tx).toBe(14);
      expect(scrolled?.ty).toBe(8);
    }
  });
});

function cell(tx: number, ty: number) {
  return { tx, ty, localX: 22, localY: 22 };
}

function ctx(laneId = "MAIN") {
  return { laneId, zoneId: null as string | null, tileSize: TILE };
}

describe("map builder props and gameplay", () => {
  it("selecting TREE enters prop placement mode", () => {
    const tool = selectPropTool("tree");
    expect(isPropPlaceMode(tool)).toBe(true);
    expect(isInspectMode(tool)).toBe(false);
    expect(isPathMode(selectPathTool())).toBe(true);
  });

  it("clicking places a tree and preview does not commit until applyAuthor", () => {
    const start = createBlankMap({ displayName: "P", id: "prop-place", width: 12, height: 10 });
    expect(start.props.length).toBe(0);
    const preview = placeProp(start, 3, 3, "tree");
    expect(start.props.length).toBe(0);
    expect(preview.props[0]!.type).toBe("tree");
    const committed = applyAuthor(start, selectPropTool("tree"), cell(3, 3), ctx());
    expect(committed.props.some((p) => p.tx === 3 && p.ty === 3 && p.type === "tree")).toBe(true);
  });

  it("duplicate hover/place on the same tile does not add a second prop", () => {
    let doc = createBlankMap({ displayName: "P", id: "prop-dup", width: 12, height: 10 });
    doc = placeProp(doc, 2, 2, "tree");
    const again = placeProp(doc, 2, 2, "tree");
    expect(again).toBe(doc);
    expect(again.props.length).toBe(1);
  });

  it("prop erase removes only the prop", () => {
    let doc = validDraft();
    doc = placeProp(doc, 4, 4, "tree");
    const terrain = doc.terrain[4]![4];
    const waypoints = doc.lanes[0]!.waypoints;
    const erased = erasePropAt(doc, 4, 4);
    expect(erased.props.length).toBe(0);
    expect(erased.terrain[4]![4]).toBe(terrain);
    expect(erased.lanes[0]!.waypoints).toEqual(waypoints);
    expect(isPropEraseMode(selectPropEraser())).toBe(true);
  });

  it("prop undo/redo and preview-vs-session commit work", () => {
    const start = createBlankMap({ displayName: "P", id: "prop-hist", width: 12, height: 10 });
    let s = sessionFrom(start);
    const preview = applyAuthor(s.doc, selectPropTool("tree"), cell(1, 1), ctx());
    expect(preview === preview).toBe(true);
    s = commitStroke(s, preview);
    expect(s.doc.props.length).toBe(1);
    s = undo(s);
    expect(s.doc.props.length).toBe(0);
    s = redo(s);
    expect(s.doc.props[0]!.type).toBe("tree");
  });

  it("PATH edits only the active lane", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-lane", width: 12, height: 10 });
    doc = paintTiles(doc, [[0, 1], [1, 1], [0, 5]], "ROAD");
    doc = addLane(doc, "A");
    doc = applyAuthor(doc, selectPathTool(), cell(0, 1), ctx("MAIN"));
    doc = applyAuthor(doc, selectPathTool(), cell(1, 1), ctx("MAIN"));
    doc = applyAuthor(doc, selectPathTool(), cell(0, 5), ctx("A"));
    expect(doc.lanes.find((l) => l.id === "MAIN")!.waypoints).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(doc.lanes.find((l) => l.id === "A")!.waypoints).toEqual([[0, 5]]);
  });

  it("extends orthogonally, rejects diagonal and zero-length steps", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-orth", width: 12, height: 10 });
    doc = paintTiles(doc, [[0, 0], [1, 0], [2, 0]], "ROAD");
    doc = applyPathClick(doc, "MAIN", [0, 0]);
    doc = applyPathClick(doc, "MAIN", [2, 0]);
    const diagonal = applyPathClick(doc, "MAIN", [3, 1]);
    expect(diagonal).toBe(doc);
    const same = applyPathClick(doc, "MAIN", [2, 0]);
    expect(same).toBe(doc);
    expect(doc.lanes[0]!.waypoints).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });

  it("path erase removes active-lane data only and leaves ROAD", () => {
    let doc = validDraft();
    const other = addLane(doc, "A");
    let both = paintTiles(other, [[0, 8], [1, 8], [2, 8], [3, 8]], "ROAD");
    both = applyPathClick(both, "A", [0, 8]);
    both = applyPathClick(both, "A", [3, 8]);
    const road = both.terrain[2]![0];
    const erased = erasePathAt(both, "MAIN", 0, 2);
    expect(erased.lanes.find((l) => l.id === "A")!.waypoints).toEqual([
      [0, 8],
      [1, 8],
      [2, 8],
      [3, 8],
    ]);
    expect(erased.terrain[2]![0]).toBe(road);
    expect(erased.lanes.find((l) => l.id === "MAIN")!.waypoints.some((w) => w[0] === 0 && w[1] === 2)).toBe(false);
  });

  it("path stroke undo/redo and preview-vs-session commit work", () => {
    let start = createBlankMap({ displayName: "L", id: "path-hist", width: 12, height: 10 });
    start = paintTiles(start, [[0, 2], [1, 2], [2, 2]], "ROAD");
    let s = sessionFrom(start);
    const preview = applyAuthorStroke(s.doc, selectPathTool(), [cell(0, 2), cell(1, 2), cell(2, 2)], ctx());
    s = commitStroke(s, preview);
    expect(s.doc.lanes[0]!.waypoints).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    s = undo(s);
    expect(s.doc.lanes[0]!.waypoints).toEqual([]);
    s = redo(s);
    expect(s.doc.lanes[0]!.waypoints.length).toBe(3);
  });

  it("spawn and endpoint create, move, erase, and validate", () => {
    let doc = createBlankMap({ displayName: "L", id: "spawn-end", width: 12, height: 10 });
    doc = applySpawn(doc, "MAIN", { tx: 0, ty: 2, edge: "W" });
    expect(doc.lanes[0]!.spawn).toEqual({ tx: 0, ty: 2, edge: "W" });
    expect(doc.lanes[0]!.waypoints).toEqual([]);
    doc = applySpawn(doc, "MAIN", { tx: 0, ty: 5, edge: "W" });
    expect(doc.lanes[0]!.spawn).toEqual({ tx: 0, ty: 5, edge: "W" });
    expect(doc.lanes[0]!.waypoints).toEqual([]);
    expect(applySpawn(doc, "MAIN", { tx: 1, ty: 2, edge: "W" })).toBe(doc);
    doc = applyEndpoint(doc, "MAIN", { tx: 11, ty: 2, edge: "E" });
    expect(doc.lanes[0]!.endpoint).toEqual({ tx: 11, ty: 2, edge: "E" });
    doc = applyEndpoint(doc, "MAIN", { tx: 11, ty: 4, edge: "E" });
    expect(doc.lanes[0]!.endpoint).toEqual({ tx: 11, ty: 4, edge: "E" });
    const missingEnd = eraseEndpoint(doc, "MAIN");
    expect(validateMap(missingEnd).errors.some((e) => e.message.includes("endpoint") || e.message.includes("spawn"))).toBe(
      true,
    );
    const missingSpawn = eraseSpawn(doc, "MAIN");
    expect(missingSpawn.lanes[0]!.endpoint).toEqual({ tx: 11, ty: 4, edge: "E" });
    expect(missingSpawn.lanes[0]!.waypoints).toEqual([]);
    const cleared = eraseGameplayAt(doc, "MAIN", -1, 5);
    expect(cleared.lanes[0]!.spawn).toBeNull();
    expect(cleared.lanes[0]!.endpoint).toEqual({ tx: 11, ty: 4, edge: "E" });
    expect(cleared.lanes[0]!.waypoints).toEqual([]);
  });

  it("spawn move undo restores previous location", () => {
    let s = sessionFrom(createBlankMap({ displayName: "L", id: "spawn-undo", width: 12, height: 10 }));
    s = commit(s, applySpawn(s.doc, "MAIN", { tx: 0, ty: 1, edge: "W" }));
    s = commit(s, applySpawn(s.doc, "MAIN", { tx: 0, ty: 3, edge: "W" }));
    expect(s.doc.lanes[0]!.spawn).toEqual({ tx: 0, ty: 3, edge: "W" });
    s = undo(s);
    expect(s.doc.lanes[0]!.spawn).toEqual({ tx: 0, ty: 1, edge: "W" });
  });

  it("special zone author, erase, preserve terrain, undo", () => {
    let s = sessionFrom(createBlankMap({ displayName: "Z", id: "zone-edit", width: 12, height: 10 }));
    s = commit(s, paintZoneCells(s.doc, [[8, 8], [9, 8]], null));
    expect(s.doc.zones[0]!.cells.length).toBe(2);
    const terrain = s.doc.terrain[8]![8];
    s = commit(s, eraseZoneAt(s.doc, 8, 8));
    expect(s.doc.zones[0]!.cells).toEqual([[9, 8]]);
    expect(s.doc.terrain[8]![8]).toBe(terrain);
    s = undo(s);
    expect(s.doc.zones[0]!.cells.length).toBe(2);
  });

  it("cardinal gate places, moves, and erases without touching other layers", () => {
    let doc = createBlankMap({ displayName: "G", id: "gate-edit", width: 12, height: 10 });
    doc = applyAuthor(doc, { id: "gate", gateId: "NORTH" }, cell(5, 1), ctx());
    expect(doc.gates).toEqual([{ id: "NORTH", laneId: "MAIN", tx: 5, ty: 1, edge: "E" }]);
    doc = applyAuthor(doc, { id: "gate", gateId: "NORTH" }, { tx: 6, ty: 1, localX: 2, localY: 22 }, ctx());
    expect(doc.gates.length).toBe(1);
    expect(doc.gates[0]!.tx).toBe(6);
    doc = applyAuthor(doc, { id: "gate", gateId: "EAST" }, cell(10, 4), ctx());
    const afterNorthGone = eraseGameplayAt(doc, "MAIN", 6, 1);
    expect(afterNorthGone.gates.map((g) => g.id)).toEqual(["EAST"]);
    expect(afterNorthGone.props.length).toBe(0);
    expect(afterNorthGone.terrain[1]![6]).toBe("GROUND");
  });

  it("edge props determine N/E/S/W, coexist, reject duplicates, and erase one edge", () => {
    expect(edgeFromCursor(22, 2, TILE)).toBe("N");
    let doc = createBlankMap({ displayName: "E", id: "edge-edit", width: 12, height: 10 });
    doc = applyAuthor(doc, { id: "edge", type: "fence" }, { tx: 4, ty: 4, localX: 22, localY: 2 }, ctx());
    doc = applyAuthor(doc, { id: "edge", type: "wall" }, { tx: 4, ty: 4, localX: 40, localY: 22 }, ctx());
    expect(doc.edges.length).toBe(2);
    const dup = applyAuthor(doc, { id: "edge", type: "fence" }, { tx: 4, ty: 4, localX: 22, localY: 2 }, ctx());
    expect(dup.edges.length).toBe(2);
    const erased = erasePropAt(doc, 4, 4, "N");
    expect(erased.edges.length).toBe(1);
    expect(erased.edges[0]!.edge).toBe("E");
    expect(selectGameplayEraser().id).toBe("erase-gameplay");
  });

  it("production maps stay immutable, locked rejects, draft accepts, export includes edits", () => {
    const before = JSON.stringify(MAP_DEFS);
    let draft = fromProductionMap(MAP_BY_ID["kolkhoz"]!);
    draft = applyAuthor(draft, selectPropTool("tree"), cell(0, 4), ctx());
    draft = applyAuthor(draft, { id: "gate", gateId: "WEST" }, cell(1, 2), ctx());
    expect(JSON.stringify(MAP_DEFS)).toBe(before);
    const locked = lockDoc(draft);
    expect(applyAuthor(locked, selectPropTool("rock"), cell(0, 5), ctx())).toBe(locked);
    const open = unlockRevision(locked);
    const painted = applyAuthor(open, selectPropTool("rock"), cell(0, 5), ctx());
    expect(painted.props.some((p) => p.type === "rock")).toBe(true);
    const exp = toExport(painted);
    expect(exp.props.some((p) => p.type === "tree")).toBe(true);
    expect(exp.gates.some((g) => g.id === "WEST")).toBe(true);
    expect(stringifyExport(painted).length).toBeGreaterThan(10);
  });
});

describe("map builder path authoring", () => {
  function roadRow(doc: ReturnType<typeof createBlankMap>, y: number, x0: number, x1: number) {
    const tiles: Array<[number, number]> = [];
    for (let x = x0; x <= x1; x++) tiles.push([x, y]);
    return paintTiles(doc, tiles, "ROAD");
  }

  function roadCol(doc: ReturnType<typeof createBlankMap>, x: number, y0: number, y1: number) {
    const tiles: Array<[number, number]> = [];
    for (let y = y0; y <= y1; y++) tiles.push([x, y]);
    return paintTiles(doc, tiles, "ROAD");
  }

  it("PATHS is an independent layer toggle", () => {
    expect(DEFAULT_LAYERS.paths).toBe(true);
    expect(DEFAULT_LAYERS.roads).toBe(true);
    const off = { ...DEFAULT_LAYERS, paths: false };
    expect(off.paths).toBe(false);
    expect(off.roads).toBe(true);
    const roadsOff = { ...DEFAULT_LAYERS, roads: false };
    expect(roadsOff.paths).toBe(true);
    expect(roadsOff.roads).toBe(false);
  });

  it("existing imported path renders through the PATHS layer", () => {
    const woods = fromProductionMap(MAP_BY_ID["woods"]!);
    const vis = visiblePathOverlays(woods, DEFAULT_LAYERS, "MAIN");
    expect(vis).toHaveLength(1);
    expect(vis[0]!.id).toBe("MAIN");
    expect(vis[0]!.cells.length).toBeGreaterThan(10);
    expect(vis[0]!.cells[0]).toEqual([-1, 1]);
    expect(vis[0]!.cells.at(-1)).toEqual([20, 5]);
    expect(woods.lanes[0]!.waypoints.every(([x, y]) => x >= 0 && y >= 0 && x < 20 && y < 13)).toBe(true);
    expect(woods.lanes[0]!.waypoints).not.toEqual(MAP_BY_ID["woods"]!.path);
  });

  it("active lane path uses active/yellow style", () => {
    expect(pathStrokeStyle(true).color).toBe("#f0b400");
    const woods = fromProductionMap(MAP_BY_ID["woods"]!);
    expect(visiblePathOverlays(woods, DEFAULT_LAYERS, "MAIN")[0]!.style.color).toBe("#f0b400");
  });

  it("inactive lane path uses white/off-white style", () => {
    expect(pathStrokeStyle(false).color).toBe("#e8e4d4");
    let doc = validDraft();
    doc = addLane(doc, "A");
    doc = roadRow(doc, 6, 0, 4);
    doc = applyPathClick(doc, "A", [0, 6]);
    doc = applyPathClick(doc, "A", [4, 6]);
    const vis = visiblePathOverlays(doc, DEFAULT_LAYERS, "MAIN");
    expect(vis.find((v) => v.id === "A")!.style.color).toBe("#e8e4d4");
    expect(vis.find((v) => v.id === "MAIN")!.style.color).toBe("#f0b400");
  });

  it("switching active lane switches highlight", () => {
    let doc = validDraft();
    doc = addLane(doc, "A");
    doc = roadRow(doc, 6, 0, 4);
    doc = applyPathClick(doc, "A", [0, 6]);
    doc = applyPathClick(doc, "A", [4, 6]);
    const mainActive = visiblePathOverlays(doc, DEFAULT_LAYERS, "MAIN");
    const aActive = visiblePathOverlays(doc, DEFAULT_LAYERS, "A");
    expect(mainActive.find((v) => v.id === "MAIN")!.active).toBe(true);
    expect(mainActive.find((v) => v.id === "A")!.active).toBe(false);
    expect(aActive.find((v) => v.id === "A")!.active).toBe(true);
    expect(aActive.find((v) => v.id === "MAIN")!.active).toBe(false);
    expect(aActive.find((v) => v.id === "A")!.style.color).toBe("#f0b400");
    expect(aActive.find((v) => v.id === "MAIN")!.style.color).toBe("#e8e4d4");
  });

  it("first PATH click creates the first path cell", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-first", width: 12, height: 10 });
    doc = paintTiles(doc, [[3, 3]], "ROAD");
    expect(pathStepValid(doc, "MAIN", [3, 3])).toBe(true);
    doc = applyPathClick(doc, "MAIN", [3, 3]);
    expect(doc.lanes[0]!.waypoints).toEqual([[3, 3]]);
    const vis = visiblePathOverlays(doc, DEFAULT_LAYERS, "MAIN");
    expect(vis[0]!.cells).toEqual([[3, 3]]);
  });

  it("adjacent horizontal extension works", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-h", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 4], [5, 4]], "ROAD");
    doc = applyPathClick(doc, "MAIN", [4, 4]);
    doc = applyPathClick(doc, "MAIN", [5, 4]);
    expect(doc.lanes[0]!.waypoints).toEqual([
      [4, 4],
      [5, 4],
    ]);
  });

  it("adjacent vertical extension works", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-v", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 4], [4, 5]], "ROAD");
    doc = applyPathClick(doc, "MAIN", [4, 4]);
    doc = applyPathClick(doc, "MAIN", [4, 5]);
    expect(doc.lanes[0]!.waypoints).toEqual([
      [4, 4],
      [4, 5],
    ]);
  });

  it("diagonal extension is rejected", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-diag", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 4], [5, 5]], "ROAD");
    doc = applyPathClick(doc, "MAIN", [4, 4]);
    expect(pathStepValid(doc, "MAIN", [5, 5])).toBe(false);
    expect(applyPathClick(doc, "MAIN", [5, 5])).toBe(doc);
  });

  it("repeated same cell is rejected", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-same", width: 12, height: 10 });
    doc = paintTiles(doc, [[2, 2]], "ROAD");
    doc = applyPathClick(doc, "MAIN", [2, 2]);
    expect(pathStepValid(doc, "MAIN", [2, 2])).toBe(false);
    expect(applyPathClick(doc, "MAIN", [2, 2])).toBe(doc);
  });

  it("straight same-row distant click fills intermediate cells", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-row", width: 12, height: 10 });
    doc = roadRow(doc, 6, 4, 9);
    doc = applyPathClick(doc, "MAIN", [4, 6]);
    doc = applyPathClick(doc, "MAIN", [9, 6]);
    expect(doc.lanes[0]!.waypoints).toEqual([
      [4, 6],
      [5, 6],
      [6, 6],
      [7, 6],
      [8, 6],
      [9, 6],
    ]);
  });

  it("straight same-column distant click fills intermediate cells", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-col", width: 12, height: 10 });
    doc = roadCol(doc, 3, 1, 5);
    doc = applyPathClick(doc, "MAIN", [3, 1]);
    doc = applyPathClick(doc, "MAIN", [3, 5]);
    expect(doc.lanes[0]!.waypoints).toEqual([
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
      [3, 5],
    ]);
  });

  it("diagonal distant click is rejected", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-far-diag", width: 12, height: 10 });
    doc = paintTiles(doc, [[4, 6], [9, 2]], "ROAD");
    doc = applyPathClick(doc, "MAIN", [4, 6]);
    expect(pathStepValid(doc, "MAIN", [9, 2])).toBe(false);
    expect(applyPathClick(doc, "MAIN", [9, 2])).toBe(doc);
    expect(doc.lanes[0]!.waypoints).toEqual([[4, 6]]);
  });

  it("drag path appends cells in deterministic order", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-drag", width: 12, height: 10 });
    doc = paintTiles(doc, [[1, 1], [2, 1], [3, 1], [3, 2]], "ROAD");
    const next = applyAuthorStroke(
      doc,
      selectPathTool(),
      [cell(1, 1), cell(2, 1), cell(3, 1), cell(3, 2)],
      ctx(),
    );
    expect(next.lanes[0]!.waypoints).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [3, 2],
    ]);
  });

  it("stroke does not add duplicate cells", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-dup", width: 12, height: 10 });
    doc = paintTiles(doc, [[1, 1], [2, 1]], "ROAD");
    const next = applyAuthorStroke(
      doc,
      selectPathTool(),
      [cell(1, 1), cell(1, 1), cell(2, 1), cell(2, 1)],
      ctx(),
    );
    expect(next.lanes[0]!.waypoints).toEqual([
      [1, 1],
      [2, 1],
    ]);
  });

  it("PATH modifies the active lane only", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-only-a", width: 12, height: 10 });
    doc = addLane(doc, "A");
    doc = paintTiles(doc, [[0, 1], [1, 1]], "ROAD");
    const mainBefore = doc.lanes.find((l) => l.id === "MAIN")!.waypoints;
    doc = applyAuthor(doc, selectPathTool(), cell(0, 1), ctx("A"));
    doc = applyAuthor(doc, selectPathTool(), cell(1, 1), ctx("A"));
    expect(doc.lanes.find((l) => l.id === "MAIN")!.waypoints).toEqual(mainBefore);
    expect(doc.lanes.find((l) => l.id === "A")!.waypoints).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it("another lane remains untouched while PATH paints", () => {
    let doc = validDraft();
    const main = doc.lanes.find((l) => l.id === "MAIN")!.waypoints;
    doc = addLane(doc, "B");
    doc = roadRow(doc, 8, 0, 3);
    doc = applyPathClick(doc, "B", [0, 8]);
    doc = applyPathClick(doc, "B", [3, 8]);
    expect(doc.lanes.find((l) => l.id === "MAIN")!.waypoints).toEqual(main);
  });

  it("path over WATER is rejected", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-water", width: 12, height: 10 });
    doc = paintTiles(doc, [[2, 2]], "ROAD");
    doc = paintTiles(doc, [[3, 2]], "WATER");
    doc = applyPathClick(doc, "MAIN", [2, 2]);
    expect(pathStepValid(doc, "MAIN", [3, 2])).toBe(false);
    expect(applyPathClick(doc, "MAIN", [3, 2])).toBe(doc);
  });

  it("path over BLOCKED/MOUNTAIN is rejected", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-mtn", width: 12, height: 10 });
    doc = paintTiles(doc, [[2, 2]], "ROAD");
    doc = paintTiles(doc, [[2, 3]], "MOUNTAIN");
    doc = applyPathClick(doc, "MAIN", [2, 2]);
    expect(pathStepValid(doc, "MAIN", [2, 3])).toBe(false);
    expect(applyPathClick(doc, "MAIN", [2, 3])).toBe(doc);
  });

  it("path over valid ROAD is accepted", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-road", width: 12, height: 10 });
    doc = paintTiles(doc, [[2, 2], [3, 2]], "ROAD");
    doc = applyPathClick(doc, "MAIN", [2, 2]);
    const next = applyPathClick(doc, "MAIN", [3, 2]);
    expect(next.lanes[0]!.waypoints).toEqual([
      [2, 2],
      [3, 2],
    ]);
  });

  it("erase modifies the active lane path only", () => {
    let doc = validDraft();
    doc = addLane(doc, "A");
    doc = roadRow(doc, 2, 0, 8);
    doc = applyPathClick(doc, "A", [0, 2]);
    doc = applyPathClick(doc, "A", [4, 2]);
    const aBefore = doc.lanes.find((l) => l.id === "A")!.waypoints;
    const erased = erasePathAt(doc, "MAIN", 4, 2);
    expect(erased.lanes.find((l) => l.id === "A")!.waypoints).toEqual(aBefore);
    expect(erased.lanes.find((l) => l.id === "MAIN")!.waypoints).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    expect(erased.lanes.find((l) => l.id === "MAIN")!.spawn).toEqual({ tx: 0, ty: 2, edge: "W" });
  });

  it("underlying ROAD remains after path erase", () => {
    let doc = validDraft();
    const erased = erasePathAt(doc, "MAIN", 8, 2);
    expect(erased.terrain[2]![8]).toBe("ROAD");
    expect(erased.terrain[2]![0]).toBe("ROAD");
  });

  it("other lane sharing the same tile remains after erase", () => {
    let doc = validDraft();
    doc = addLane(doc, "A");
    doc = applyPathClick(doc, "A", [0, 2]);
    doc = applyPathClick(doc, "A", [3, 2]);
    const aBefore = doc.lanes.find((l) => l.id === "A")!.waypoints;
    const erased = erasePathAt(doc, "MAIN", 2, 2);
    expect(erased.lanes.find((l) => l.id === "A")!.waypoints).toEqual(aBefore);
    expect(pathCells(erased.lanes.find((l) => l.id === "A")!.waypoints).some((c) => c[0] === 2 && c[1] === 2)).toBe(
      true,
    );
  });

  it("undo/redo path stroke works as one history entry", () => {
    let start = createBlankMap({ displayName: "L", id: "path-stroke-hist", width: 12, height: 10 });
    start = roadRow(start, 2, 0, 5);
    let s = sessionFrom(start);
    const preview = applyAuthorStroke(
      s.doc,
      selectPathTool(),
      [cell(0, 2), cell(1, 2), cell(2, 2), cell(3, 2), cell(4, 2), cell(5, 2)],
      ctx(),
    );
    s = commitStroke(s, preview);
    expect(s.past.length).toBe(1);
    expect(s.doc.lanes[0]!.waypoints).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
    ]);
    s = undo(s);
    expect(s.doc.lanes[0]!.waypoints).toEqual([]);
    s = redo(s);
    expect(s.doc.lanes[0]!.waypoints.length).toBe(6);
  });

  it("exported ordered route matches the authored route exactly", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-export", width: 12, height: 10 });
    doc = roadRow(doc, 4, 1, 6);
    doc = applyPathClick(doc, "MAIN", [1, 4]);
    doc = applyPathClick(doc, "MAIN", [6, 4]);
    const authored = doc.lanes[0]!.waypoints;
    expect(toExport(doc).lanes.find((l) => l.id === "MAIN")!.waypoints).toEqual(authored);
    expect(toProductionMapDef(doc).path).toEqual(authored);
  });

  it("validation accepts a clean orthogonal route", () => {
    expect(validateMap(validDraft()).ok).toBe(true);
  });

  it("validation rejects a disconnected route", () => {
    let doc = createBlankMap({ displayName: "L", id: "path-disc-val", width: 12, height: 10 });
    doc = { ...doc, lanes: [{ id: "MAIN", waypoints: [[0, 0], [1, 1], [3, 1]], spawn: null, endpoint: null }] };
    const r = validateMap(doc);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes("disconnected") || e.code === "DIAGONAL")).toBe(true);
  });

  it("spawn/path connectivity validation works", () => {
    let doc = validDraft();
    const path = doc.lanes[0]!.waypoints.slice();
    doc = applySpawn(doc, "MAIN", { tx: 0, ty: 8, edge: "W" });
    const r = validateMap(doc);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "SPAWN")).toBe(true);
    expect(doc.lanes[0]!.waypoints).toEqual(path);
  });

  it("endpoint/path connectivity validation works", () => {
    let doc = validDraft();
    doc = applyEndpoint(doc, "MAIN", { tx: 19, ty: 8, edge: "E" });
    const r = validateMap(doc);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "ENDPOINT")).toBe(true);
    expect(doc.lanes[0]!.waypoints[0]).toEqual([0, 2]);
  });

  it("PATHS OFF hides visualization but preserves data", () => {
    const woods = fromProductionMap(MAP_BY_ID["woods"]!);
    const hidden = visiblePathOverlays(woods, { ...DEFAULT_LAYERS, paths: false }, "MAIN");
    expect(hidden).toEqual([]);
    expect(woods.lanes[0]!.waypoints.every(([x, y]) => x >= 0 && y >= 0 && x < 20 && y < 13)).toBe(true);
    expect(visiblePathOverlays(woods, { ...DEFAULT_LAYERS, roads: false }, "MAIN")[0]!.cells.length).toBeGreaterThan(10);
  });

  it("moving spawn or endpoint preserves the existing path", () => {
    let doc = validDraft();
    const path = doc.lanes[0]!.waypoints.slice();
    doc = applySpawn(doc, "MAIN", { tx: 0, ty: 5, edge: "W" });
    expect(doc.lanes[0]!.waypoints).toEqual(path);
    doc = applyEndpoint(doc, "MAIN", { tx: 19, ty: 5, edge: "E" });
    expect(doc.lanes[0]!.waypoints).toEqual(path);
    expect(doc.lanes[0]!.spawn).toEqual({ tx: 0, ty: 5, edge: "W" });
    expect(doc.lanes[0]!.endpoint).toEqual({ tx: 19, ty: 5, edge: "E" });
  });

  it("CLEAR PATH drops the route and keeps spawn", () => {
    const cleared = clearLanePath(validDraft(), "MAIN");
    expect(cleared.lanes[0]!.waypoints).toEqual([]);
    expect(cleared.lanes[0]!.spawn).toEqual({ tx: 0, ty: 2, edge: "W" });
    expect(cleared.lanes[0]!.endpoint).toEqual({ tx: 19, ty: 2, edge: "E" });
    expect(cleared.terrain[2]![4]).toBe("ROAD");
  });
});

describe("map builder boundary ports", () => {
  it("WEST spawn requires x=0 and EAST spawn requires x=width-1", () => {
    const doc = createBlankMap({ displayName: "P", id: "port-we", width: 20, height: 13 });
    expect(isLegalPort({ tx: 0, ty: 6, edge: "W" }, 20, 13)).toBe(true);
    expect(isLegalPort({ tx: 1, ty: 6, edge: "W" }, 20, 13)).toBe(false);
    expect(applySpawn(doc, "MAIN", { tx: 0, ty: 6, edge: "W" }).lanes[0]!.spawn).toEqual({ tx: 0, ty: 6, edge: "W" });
    expect(applySpawn(doc, "MAIN", { tx: 1, ty: 6, edge: "W" }).lanes[0]!.spawn).toBeNull();
    expect(isLegalPort({ tx: 19, ty: 6, edge: "E" }, 20, 13)).toBe(true);
    expect(isLegalPort({ tx: 18, ty: 6, edge: "E" }, 20, 13)).toBe(false);
    expect(applySpawn(doc, "MAIN", { tx: 19, ty: 6, edge: "E" }).lanes[0]!.spawn).toEqual({ tx: 19, ty: 6, edge: "E" });
  });

  it("NORTH requires y=0 and SOUTH requires y=height-1", () => {
    const doc = createBlankMap({ displayName: "P", id: "port-ns", width: 20, height: 13 });
    expect(isLegalPort({ tx: 8, ty: 0, edge: "N" }, 20, 13)).toBe(true);
    expect(isLegalPort({ tx: 8, ty: 1, edge: "N" }, 20, 13)).toBe(false);
    expect(applyEndpoint(doc, "MAIN", { tx: 8, ty: 0, edge: "N" }).lanes[0]!.endpoint).toEqual({ tx: 8, ty: 0, edge: "N" });
    expect(isLegalPort({ tx: 8, ty: 12, edge: "S" }, 20, 13)).toBe(true);
    expect(isLegalPort({ tx: 8, ty: 11, edge: "S" }, 20, 13)).toBe(false);
    expect(applyEndpoint(doc, "MAIN", { tx: 8, ty: 12, edge: "S" }).lanes[0]!.endpoint).toEqual({ tx: 8, ty: 12, edge: "S" });
  });

  it("interior spawn and endpoint placement is rejected", () => {
    const doc = createBlankMap({ displayName: "P", id: "port-in", width: 20, height: 13 });
    expect(legalPortEdges(4, 6, 20, 13)).toEqual([]);
    expect(applySpawn(doc, "MAIN", { tx: 4, ty: 6, edge: "W" })).toBe(doc);
    expect(applyEndpoint(doc, "MAIN", { tx: 4, ty: 6, edge: "E" })).toBe(doc);
  });

  it("corner tile can select either valid boundary edge", () => {
    expect(legalPortEdges(0, 0, 20, 13)).toEqual(["N", "W"]);
    expect(portEdgeFromCursor(0, 0, 2, 22, 20, 13)).toBe("W");
    expect(portEdgeFromCursor(0, 0, 22, 2, 20, 13)).toBe("N");
    expect(legalPortEdges(19, 12, 20, 13)).toEqual(["E", "S"]);
    expect(portEdgeFromCursor(19, 12, 40, 22, 20, 13)).toBe("E");
    expect(portEdgeFromCursor(19, 12, 22, 40, 20, 13)).toBe("S");
  });

  it("spawn and endpoint markers render outside logical grid bounds", () => {
    const spawn = { tx: 0, ty: 6, edge: "W" as const };
    const end = { tx: 19, ty: 2, edge: "E" as const };
    expect(markerOutsidePlayableGrid(spawn, 20, 13)).toBe(true);
    expect(markerOutsidePlayableGrid(end, 20, 13)).toBe(true);
    expect(portOutsideCell(spawn)[0]).toBe(-1);
    expect(portOutsideCell(end)[0]).toBe(20);
    const north = { tx: 14, ty: 0, edge: "N" as const };
    const south = { tx: 4, ty: 12, edge: "S" as const };
    expect(markerOutsidePlayableGrid(north, 20, 13)).toBe(true);
    expect(markerOutsidePlayableGrid(south, 20, 13)).toBe(true);
  });

  it("playable dimensions remain unchanged and gutter is not editable terrain", () => {
    const doc = createBlankMap({ displayName: "P", id: "port-gutter", width: 20, height: 13 });
    expect(doc.width).toBe(20);
    expect(doc.height).toBe(13);
    const size = canvasPixelSize(doc.width, doc.height);
    expect(size.w).toBe((20 + 2) * TILE);
    expect(size.h).toBe((13 + 2) * TILE);
    expect(size.w - doc.width * TILE).toBe(EDITOR_GUTTER * 2);
    const painted = paintTiles(doc, [[-1, 2], [20, 2], [4, -1], [4, 13]], "ROAD");
    expect(painted).toBe(doc);
    expect(painted.terrain[2]![0]).toBe("GROUND");
    const rect = { left: 0, top: 0, width: size.w, height: size.h };
    const gutterHit = clientToTile(TILE * 0.5, TILE + TILE * 0.5, rect, 20, 13, TILE, EDITOR_GUTTER);
    expect(gutterHit?.tx).toBe(-1);
    expect(gutterHit?.ty).toBe(0);
    const playable = clientToTile(TILE + TILE * 0.5, TILE + TILE * 0.5, rect, 20, 13, TILE, EDITOR_GUTTER);
    expect(playable?.tx).toBe(0);
    expect(playable?.ty).toBe(0);
  });

  it("path data contains only in-bounds tiles and overlay connects outside ports", () => {
    const doc = validDraft();
    expect(doc.lanes[0]!.waypoints.every(([x, y]) => x >= 0 && y >= 0 && x < doc.width && y < doc.height)).toBe(true);
    const overlay = overlayPathCells(doc.lanes[0]!);
    expect(overlay[0]).toEqual([-1, 2]);
    expect(overlay.at(-1)).toEqual([20, 2]);
    const vis = visiblePathOverlays(doc, DEFAULT_LAYERS, "MAIN")[0]!;
    expect(vis.cells[0]).toEqual([-1, 2]);
    expect(vis.cells.at(-1)).toEqual([20, 2]);
    expect(vis.cells).toContainEqual([0, 2]);
    expect(vis.cells).toContainEqual([19, 2]);
  });

  it("gameplay erase removes spawn only and undo restores it", () => {
    const start = validDraft();
    const path = start.lanes[0]!.waypoints.slice();
    let s = sessionFrom(start);
    s = commit(s, eraseGameplayAt(s.doc, "MAIN", -1, 2));
    expect(s.doc.lanes[0]!.spawn).toBeNull();
    expect(s.doc.lanes[0]!.endpoint).toEqual({ tx: 19, ty: 2, edge: "E" });
    expect(s.doc.lanes[0]!.waypoints).toEqual(path);
    expect(s.doc.terrain[2]![0]).toBe("ROAD");
    s = undo(s);
    expect(s.doc.lanes[0]!.spawn).toEqual({ tx: 0, ty: 2, edge: "W" });
    expect(s.doc.lanes[0]!.waypoints).toEqual(path);
  });

  it("validation accepts a connected boundary port and rejects a disconnected one", () => {
    expect(validateMap(validDraft()).ok).toBe(true);
    const moved = applySpawn(validDraft(), "MAIN", { tx: 0, ty: 10, edge: "W" });
    const r = validateMap(moved);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "SPAWN" && e.message.includes("not connected"))).toBe(true);
  });

  it("deterministic export includes tile+edge and import round-trips the port", () => {
    const doc = validDraft();
    const exp = toExport(doc);
    expect(exp.width).toBe(20);
    expect(exp.height).toBe(13);
    expect(exp.lanes[0]!.spawn).toEqual({ tile: [0, 2], edge: "W" });
    expect(exp.lanes[0]!.endpoint).toEqual({ tile: [19, 2], edge: "E" });
    expect(exp.lanes[0]!.waypoints.every(([x, y]) => x >= 0 && y >= 0 && x < 20 && y < 13)).toBe(true);
    const parsed = parseImport(stringifyExport(doc));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = importedToDoc(parsed.payload, "import-ports");
    expect(back.lanes[0]!.spawn).toEqual({ tx: 0, ty: 2, edge: "W" });
    expect(back.lanes[0]!.endpoint).toEqual({ tx: 19, ty: 2, edge: "E" });
    expect(back.lanes[0]!.waypoints).toEqual(doc.lanes[0]!.waypoints);
    expect(toExport(back).lanes[0]!.spawn).toEqual(exp.lanes[0]!.spawn);
  });

  it("existing-map adapter produces a deterministic boundary direction", () => {
    const woods = peelLaneFromWaypoints("MAIN", MAP_BY_ID["woods"]!.path, 20, 13);
    expect(woods.spawn).toEqual({ tx: 0, ty: 1, edge: "W" });
    expect(woods.endpoint).toEqual({ tx: 19, ty: 5, edge: "E" });
    const grain = fromProductionMap(MAP_BY_ID["kolkhoz"]!);
    expect(grain.lanes.find((l) => l.id === "MAIN")!.spawn).toEqual({ tx: 0, ty: 3, edge: "W" });
    expect(grain.lanes.find((l) => l.id === "MAIN")!.endpoint).toEqual({ tx: 16, ty: 0, edge: "N" });
    expect(grain.lanes.find((l) => l.id === "A")!.spawn).toEqual({ tx: 0, ty: 5, edge: "W" });
    expect(grain.lanes.find((l) => l.id === "A")!.endpoint).toEqual({ tx: 19, ty: 10, edge: "E" });
    const produced = toProductionMapDef(grain);
    expect(produced.path[0]).toEqual([-1, 3]);
    expect(produced.path.at(-1)).toEqual([16, -1]);
  });
});

