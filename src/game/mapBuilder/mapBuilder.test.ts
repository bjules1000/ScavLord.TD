import { describe, expect, it } from "bun:test";
import { MAP_BY_ID, MAP_DEFS } from "../map";
import { fromProductionMap, integrationNotes, toProductionMapDef } from "./adapters";
import { createBlankMap, lockDoc, unlockRevision, validateNewMapInput } from "./document";
import { edgeFromCursor } from "./edges";
import { exportFilename, importedToDoc, parseImport, stringifyExport, toExport } from "./export";
import { HISTORY_LIMIT } from "./schema";
import { canRedo, canUndo, commit, redo, sessionFrom, undo } from "./history";
import {
  addLane,
  applyEndpoint,
  applyPathClick,
  applySpawn,
  eraseTiles,
  paintTiles,
  paintZoneCells,
  placeProp,
  removeObject,
} from "./paint";
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
  for (let x = 0; x <= 8; x++) tiles.push([x, 2]);
  doc = paintTiles(doc, tiles, "ROAD");
  doc = applySpawn(doc, "MAIN", [-1, 2]);
  doc = applyEndpoint(doc, "MAIN", [8, 2]);
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
    expect(draft.lanes[0]!.waypoints).toEqual(woods.path);
    expect(draft.props.length).toBe(woods.props.length);
    expect(draft.terrain[1]![4]).toBe("ROAD");
    expect(draft.terrain[0]![0]).toBe("GROUND");
  });

  it("creates a blank ground grid from validated new-map input", () => {
    expect(validateNewMapInput({ displayName: "", id: "ab", width: 20, height: 13 })).toBeTruthy();
    const doc = createBlankMap({ displayName: "BLANK", id: "blank-map", width: 12, height: 10 });
    expect(doc.terrain.length).toBe(10);
    expect(doc.terrain[0]!.length).toBe(12);
    expect(doc.terrain.every((row) => row.every((c) => c === "GROUND"))).toBe(true);
    expect(doc.lanes).toEqual([{ id: "MAIN", waypoints: [] }]);
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
    doc = applySpawn(doc, "A", [-1, 6]);
    doc = applyEndpoint(doc, "A", [4, 6]);
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
    doc = applySpawn(doc, "MAIN", [0, 0]);
    const r = validateMap(doc);
    expect(r.ok).toBe(false);
  });

  it("fails a diagonal-only path", () => {
    let doc = createBlankMap({ displayName: "L", id: "lane-diag", width: 12, height: 10 });
    doc = { ...doc, lanes: [{ id: "MAIN", waypoints: [[0, 0], [1, 1]] }] };
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
    doc = { ...doc, lanes: [...doc.lanes, { id: "MAIN", waypoints: [[0, 5], [4, 5]] }] };
    expect(validateMap(doc).errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  it("fails an out-of-bounds marker", () => {
    let doc = validDraft();
    doc = { ...doc, lanes: [{ id: "MAIN", waypoints: [[-1, 2], [99, 2]] }] };
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
