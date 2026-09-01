/**
 * Production integration contract
 *
 * Authoring loop:
 *   1. Open a production map (or + NEW MAP) → editor DRAFT (never writes MAP_DEFS).
 *   2. Paint / place / VALIDATE → LOCK → EXPORT JSON / COPY MAP DATA.
 *   3. Hand the locked JSON to Cursor.
 *   4. Cursor calls `toProductionMapDef` / applies the export literally.
 *      Do not reinterpret screenshots or prose once a locked export exists.
 *
 * Browser never writes repo files. Export is the handoff boundary.
 *
 * Main MapDef stores `path` (MAIN), optional extra `lanes`, optional `water`,
 * `mountain`, `highGround`, `collisionWalls`, `bridges`, `zones`,
 * plus props/cover/crates/checkpoints.
 * Combat gates and visual edge objects remain editor-native / future-compatible.
 * `integrationNotes()` lists what raid gameplay cannot consume yet.
 */
import { COLS, ROWS } from "../data";
import { mapLaneDefs } from "../lanes";
import { MAP_BY_ID, MAP_DEFS, type CoverType, type MapDef } from "../map";
import { createBlankMap, emptyTerrain } from "./document";
import { onMapCells, pathCells } from "./pathing";
import { peelLaneFromWaypoints, productionPathFromLane } from "./ports";
import { MAP_BUILDER_SCHEMA_VERSION, type EditorMapDoc, type TerrainKind } from "./schema";

export function productionMaps(): MapDef[] {
  return MAP_DEFS;
}

export function fromProductionMap(def: MapDef): EditorMapDoc {
  const doc: EditorMapDoc = {
    ...createBlankMap({
      displayName: def.name,
      id: `draft-${def.id}`,
      width: COLS,
      height: ROWS,
    }),
    sourceMapId: def.id,
    displayName: def.name,
    palette: { ...def.palette },
    threat: def.threat,
    threatLabel: def.threatLabel,
    desc: def.desc,
    hpMult: def.hpMult,
    lootMult: def.lootMult,
    waveMods: def.waveMods ? { ...def.waveMods } : null,
    sector: def.sector,
    geo: { ...def.geo },
    lanes: mapLaneDefs(def).map((l) => peelLaneFromWaypoints(l.id, l.path, COLS, ROWS)),
  };
  const terrain = emptyTerrain(COLS, ROWS);
  for (const [x, y] of def.highGround ?? []) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) terrain[y]![x] = "HIGH_GROUND";
  }
  for (const [x, y] of def.mountain ?? []) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) terrain[y]![x] = "MOUNTAIN";
  }
  for (const lane of mapLaneDefs(def)) {
    for (const [x, y] of onMapCells(pathCells(lane.path), COLS, ROWS)) terrain[y]![x] = "ROAD";
  }
  for (const [x, y] of def.water ?? []) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) terrain[y]![x] = "WATER";
  }
  doc.terrain = terrain;
  doc.props = def.props.map((p, i) => ({
    id: `prop-${i + 1}`,
    type: p.type,
    tx: p.tx,
    ty: p.ty,
  }));
  doc.cover = def.cover.map(([tx, ty, type], i) => ({
    id: `cover-${i + 1}`,
    type,
    tx,
    ty,
  }));
  doc.crates = def.crates.map(([tx, ty], i) => ({ id: `crate-${i + 1}`, tx, ty }));
  doc.checkpoints = def.checkpoint.map((c, i) => ({
    id: `cp-${i + 1}`,
    type: c.type,
    tx: c.tx,
    ty: c.ty,
  }));
  if (def.collisionWalls?.length) {
    doc.collisionWalls = def.collisionWalls.map((w) => ({
      tx: w.tx,
      ty: w.ty,
      edge: w.edge,
      kind: w.kind === "SOLID" ? "SOLID" : "MOVEMENT",
    }));
  }
  if (def.bridges?.length) {
    doc.bridges = def.bridges.map((b) => ({ tx: b.tx, ty: b.ty, orientation: b.orientation }));
  }
  if (def.zones?.length) {
    doc.zones = def.zones.map((z, i) => ({
      id: `zone-${i + 1}`,
      type: z.type,
      name: z.name,
      cells: z.cells.map(([x, y]) => [x, y] as [number, number]),
    }));
  }
  return doc;
}

export function fromProductionMapId(id: string): EditorMapDoc | null {
  const def = MAP_BY_ID[id];
  if (!def) return null;
  return fromProductionMap(def);
}

export interface IntegrationNote {
  code: string;
  message: string;
}

/**
 * What a later Cursor integration must apply from a locked export, and what
 * current main MapDef cannot represent.
 */
export function integrationNotes(doc: EditorMapDoc): IntegrationNote[] {
  const notes: IntegrationNote[] = [];
  if (doc.width !== COLS || doc.height !== ROWS) {
    notes.push({
      code: "SIZE",
      message: `Export is ${doc.width}×${doc.height}; production grid is ${COLS}×${ROWS}.`,
    });
  }
  if (doc.lanes.length > 1) {
    notes.push({
      code: "LANES",
      message: `Export has ${doc.lanes.length} lanes; production MapDef.lanes must keep every route.`,
    });
  }
  const kinds = new Set<TerrainKind>();
  for (const row of doc.terrain) for (const cell of row) kinds.add(cell);
  if (kinds.has("WATER")) {
    notes.push({ code: "WATER", message: "Water tiles exist; production MapDef.water must keep them." });
  }
  if (doc.zones.length) {
    notes.push({ code: "ZONES", message: "Special zones exist; raid gameplay does not consume them yet." });
  }
  if (doc.gates.length) {
    notes.push({
      code: "GATES",
      message: "Lane gates exist; main checkpoint gate/gate2 are visual props only, not combat gates.",
    });
  }
  if (doc.edges.length) {
    notes.push({ code: "EDGES", message: "Authored edge objects exist; main cover is tile-centered." });
  }
  if (doc.collisionWalls.length) {
    const solid = doc.collisionWalls.some((w) => w.kind === "SOLID");
    notes.push({
      code: "WALLS",
      message: solid
        ? "Authored walls exist: MOVEMENT blocks walking only; SOLID blocks walking and LOS."
        : "Invisible movement walls exist; they block walking, not LOS.",
    });
  }
  if (doc.bridges.length) {
    notes.push({
      code: "BRIDGES",
      message: "Suspended bridge overlays exist; raid movement/LOS do not consume them yet.",
    });
  }
  return notes;
}

/** Deterministic MapDef subset that main can store. Extra export fields stay in the JSON. */
export function toProductionMapDef(doc: EditorMapDoc): MapDef {
  const lane = doc.lanes.find((l) => l.id === "MAIN") ?? doc.lanes[0];
  const path = lane ? productionPathFromLane(lane) : [];
  const def: MapDef = {
    id: doc.sourceMapId ?? doc.id.replace(/^(draft|import)-/, ""),
    name: doc.displayName,
    threat: doc.threat,
    threatLabel: doc.threatLabel,
    desc: doc.desc,
    hpMult: doc.hpMult,
    lootMult: doc.lootMult,
    geo: { ...doc.geo },
    sector: doc.sector,
    path,
    props: [...doc.props]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.type.localeCompare(b.type))
      .map((p) => ({ tx: p.tx, ty: p.ty, type: p.type })),
    checkpoint: [...doc.checkpoints]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.type.localeCompare(b.type))
      .map((c) => ({ tx: c.tx, ty: c.ty, type: c.type })),
    cover: [...doc.cover]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.type.localeCompare(b.type))
      .map((c) => [c.tx, c.ty, c.type] as [number, number, CoverType]),
    crates: [...doc.crates]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx)
      .map((c) => [c.tx, c.ty] as [number, number]),
    palette: { ...doc.palette },
  };
  if (doc.waveMods) def.waveMods = { ...doc.waveMods };
  if (doc.lanes.length > 1) {
    const ordered = [
      ...doc.lanes.filter((l) => l.id === "MAIN"),
      ...doc.lanes.filter((l) => l.id !== "MAIN"),
    ];
    def.lanes = ordered.map((l) => ({
      id: l.id,
      path: productionPathFromLane(l),
    }));
  }
  const water = tilesOf(doc, "WATER");
  if (water) def.water = water;
  const mountain = tilesOf(doc, "MOUNTAIN");
  if (mountain) def.mountain = mountain;
  const highGround = tilesOf(doc, "HIGH_GROUND");
  if (highGround) def.highGround = highGround;
  if (doc.collisionWalls.length) {
    def.collisionWalls = [...doc.collisionWalls]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.edge.localeCompare(b.edge))
      .map((w) =>
        w.kind === "SOLID"
          ? { tx: w.tx, ty: w.ty, edge: w.edge, kind: "SOLID" as const }
          : { tx: w.tx, ty: w.ty, edge: w.edge },
      );
  }
  if (doc.bridges.length) {
    def.bridges = [...doc.bridges]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx)
      .map((b) => ({ tx: b.tx, ty: b.ty, orientation: b.orientation }));
  }
  if (doc.zones.length) {
    def.zones = [...doc.zones]
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
      .map((z) => ({
        type: z.type,
        name: z.name,
        cells: [...z.cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([x, y]) => [x, y] as [number, number]),
      }));
  }
  return def;
}

function tilesOf(doc: EditorMapDoc, kind: TerrainKind): Array<[number, number]> | undefined {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      if (doc.terrain[y]![x] === kind) out.push([x, y]);
    }
  }
  return out.length ? out : undefined;
}

export function draftIdForSource(sourceMapId: string): string {
  return `draft-${sourceMapId}`;
}

export { MAP_BUILDER_SCHEMA_VERSION };
