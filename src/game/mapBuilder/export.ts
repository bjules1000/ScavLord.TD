import { MAP_BUILDER_SCHEMA_VERSION, isTerrainKind, type EditorMapDoc, type TerrainKind, type TileEdge } from "./schema";
import { validateNewMapInput } from "./document";
import { GATE_IDS, SPECIAL_ZONE_TYPES, TILE_EDGES, BRIDGE_ORIENTATIONS } from "./schema";
import type { PropType } from "../map";
import { PROP_TYPES } from "./schema";
import { emptyLane, exportPort, importPort, peelLaneFromWaypoints } from "./ports";
import { sortBridges } from "./bridges";
import { normalizeCollisionWalls, sortCollisionWalls } from "./walls";

export interface ExportedMap {
  schemaVersion: 1;
  id: string;
  displayName: string;
  width: number;
  height: number;
  status: "locked" | "draft";
  revision: number;
  sourceMapId: string | null;
  palette: EditorMapDoc["palette"];
  threat: 1 | 2 | 3;
  threatLabel: string;
  desc: string;
  hpMult: number;
  lootMult: number;
  waveMods: EditorMapDoc["waveMods"];
  sector: string;
  geo: { x: number; y: number };
  terrain: TerrainKind[][];
  lanes: Array<{
    id: string;
    waypoints: Array<[number, number]>;
    spawn?: { tile: [number, number]; edge: TileEdge } | null;
    endpoint?: { tile: [number, number]; edge: TileEdge } | null;
  }>;
  props: Array<{ type: PropType; tx: number; ty: number }>;
  cover: Array<{ type: EditorMapDoc["cover"][number]["type"]; tx: number; ty: number }>;
  crates: Array<{ tx: number; ty: number }>;
  checkpoints: Array<{ type: EditorMapDoc["checkpoints"][number]["type"]; tx: number; ty: number }>;
  edges: Array<{ type: EditorMapDoc["edges"][number]["type"]; tx: number; ty: number; edge: EditorMapDoc["edges"][number]["edge"] }>;
  gates: Array<{ id: EditorMapDoc["gates"][number]["id"]; laneId: string; tx: number; ty: number; edge: EditorMapDoc["gates"][number]["edge"] }>;
  zones: Array<{ type: EditorMapDoc["zones"][number]["type"]; name: string; cells: Array<[number, number]> }>;
  collisionWalls: Array<{ tx: number; ty: number; edge: TileEdge }>;
  bridges: Array<{ tx: number; ty: number; orientation: "H" | "V" }>;
}

function sortCells(cells: Array<[number, number]>): Array<[number, number]> {
  return [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([x, y]) => [x, y] as [number, number]);
}

/** Stable payload: same locked map → identical JSON. No timestamps or editor history. */
export function toExport(doc: EditorMapDoc): ExportedMap {
  return {
    schemaVersion: MAP_BUILDER_SCHEMA_VERSION,
    id: exportMapId(doc),
    displayName: doc.displayName,
    width: doc.width,
    height: doc.height,
    status: doc.status,
    revision: doc.revision,
    sourceMapId: doc.sourceMapId,
    palette: { ...doc.palette },
    threat: doc.threat,
    threatLabel: doc.threatLabel,
    desc: doc.desc,
    hpMult: doc.hpMult,
    lootMult: doc.lootMult,
    waveMods: doc.waveMods ? { ...doc.waveMods } : null,
    sector: doc.sector,
    geo: { ...doc.geo },
    terrain: doc.terrain.map((row) => row.slice()),
    lanes: [...doc.lanes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((l) => ({
        id: l.id,
        waypoints: l.waypoints.map(([x, y]) => [x, y] as [number, number]),
        spawn: exportPort(l.spawn),
        endpoint: exportPort(l.endpoint),
      })),
    props: [...doc.props]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.type.localeCompare(b.type))
      .map((p) => ({ type: p.type, tx: p.tx, ty: p.ty })),
    cover: [...doc.cover]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.type.localeCompare(b.type))
      .map((c) => ({ type: c.type, tx: c.tx, ty: c.ty })),
    crates: [...doc.crates]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx)
      .map((c) => ({ tx: c.tx, ty: c.ty })),
    checkpoints: [...doc.checkpoints]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.type.localeCompare(b.type))
      .map((c) => ({ type: c.type, tx: c.tx, ty: c.ty })),
    edges: [...doc.edges]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.edge.localeCompare(b.edge) || a.type.localeCompare(b.type))
      .map((e) => ({ type: e.type, tx: e.tx, ty: e.ty, edge: e.edge })),
    gates: [...doc.gates]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((g) => ({ id: g.id, laneId: g.laneId, tx: g.tx, ty: g.ty, edge: g.edge })),
    zones: [...doc.zones]
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
      .map((z) => ({ type: z.type, name: z.name, cells: sortCells(z.cells) })),
    collisionWalls: sortCollisionWalls(doc.collisionWalls).map((w) => ({ tx: w.tx, ty: w.ty, edge: w.edge })),
    bridges: sortBridges(doc.bridges).map((b) => ({ tx: b.tx, ty: b.ty, orientation: b.orientation })),
  };
}

export function stringifyExport(doc: EditorMapDoc): string {
  return `${JSON.stringify(toExport(doc), null, 2)}\n`;
}

export function exportMapId(doc: EditorMapDoc): string {
  if (doc.sourceMapId) return doc.sourceMapId;
  return doc.id.replace(/^(draft|import)-/, "");
}

export function exportFilename(doc: EditorMapDoc): string {
  const id = exportMapId(doc).replace(/[^a-z0-9-]/gi, "-");
  return `${id}.map.json`;
}

export function parseImport(raw: string): { ok: true; payload: ExportedMap } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Import is not valid JSON." };
  }
  if (!data || typeof data !== "object") return { ok: false, error: "Import must be a JSON object." };
  const o = data as Record<string, unknown>;
  if (o["schemaVersion"] !== 1) return { ok: false, error: "Unsupported or missing schemaVersion." };
  if (typeof o["id"] !== "string" || typeof o["displayName"] !== "string") {
    return { ok: false, error: "Import is missing id or displayName." };
  }
  if (typeof o["width"] !== "number" || typeof o["height"] !== "number") {
    return { ok: false, error: "Import is missing width/height." };
  }
  const sizeErr = validateNewMapInput({
    displayName: o["displayName"],
    id: slugLoose(o["id"]),
    width: o["width"],
    height: o["height"],
  });
  if (sizeErr) return { ok: false, error: sizeErr };
  const terrain = o["terrain"];
  if (!Array.isArray(terrain) || terrain.length !== o["height"]) {
    return { ok: false, error: "Terrain grid does not match height." };
  }
  for (const row of terrain) {
    if (!Array.isArray(row) || row.length !== o["width"]) return { ok: false, error: "Terrain row width mismatch." };
    for (const cell of row) {
      if (!isTerrainKind(cell)) return { ok: false, error: "Terrain contains an unknown type." };
    }
  }
  if (!Array.isArray(o["lanes"])) return { ok: false, error: "Import is missing lanes." };
  return { ok: true, payload: o as unknown as ExportedMap };
}

function slugLoose(id: string): string {
  return id.replace(/^draft-/, "") || "import";
}

export function importedToDoc(payload: ExportedMap, draftId: string): EditorMapDoc {
  const width = payload.width;
  const height = payload.height;
  const lanes = payload.lanes.map((l) => {
    const waypoints = (l.waypoints ?? []).map((w) => [Number(w[0]), Number(w[1])] as [number, number]);
    const spawn = importPort(l.spawn, width, height);
    const endpoint = importPort(l.endpoint, width, height);
    if (spawn || endpoint) {
      return {
        id: String(l.id),
        waypoints: waypoints.filter(([x, y]) => x >= 0 && y >= 0 && x < width && y < height),
        spawn,
        endpoint,
      };
    }
    return peelLaneFromWaypoints(String(l.id), waypoints, width, height);
  });
  return {
    schemaVersion: MAP_BUILDER_SCHEMA_VERSION,
    id: draftId,
    displayName: payload.displayName,
    width: payload.width,
    height: payload.height,
    status: payload.status === "locked" ? "locked" : "draft",
    revision: Number(payload.revision) || 1,
    sourceMapId: payload.sourceMapId ?? null,
    palette: payload.palette,
    threat: payload.threat,
    threatLabel: payload.threatLabel,
    desc: payload.desc,
    hpMult: payload.hpMult,
    lootMult: payload.lootMult,
    waveMods: payload.waveMods ?? null,
    sector: payload.sector,
    geo: payload.geo,
    terrain: payload.terrain.map((row) => row.slice() as TerrainKind[]),
    lanes: lanes.length ? lanes : [emptyLane("MAIN")],
    props: payload.props.map((p, i) => ({ id: `prop-${i + 1}`, type: p.type, tx: p.tx, ty: p.ty })),
    cover: payload.cover.map((c, i) => ({ id: `cover-${i + 1}`, type: c.type, tx: c.tx, ty: c.ty })),
    crates: payload.crates.map((c, i) => ({ id: `crate-${i + 1}`, tx: c.tx, ty: c.ty })),
    checkpoints: payload.checkpoints.map((c, i) => ({
      id: `cp-${i + 1}`,
      type: c.type,
      tx: c.tx,
      ty: c.ty,
    })),
    edges: (payload.edges ?? []).map((e, i) => ({
      id: `edge-${i + 1}`,
      type: e.type,
      tx: e.tx,
      ty: e.ty,
      edge: e.edge,
    })),
    gates: (payload.gates ?? []).filter((g) => (GATE_IDS as readonly string[]).includes(g.id)),
    zones: (payload.zones ?? []).map((z, i) => ({
      id: `zone-${i + 1}`,
      type: (SPECIAL_ZONE_TYPES as readonly string[]).includes(z.type) ? z.type : "RESOURCE_SITE",
      name: z.name,
      cells: sortCells(z.cells),
    })),
    collisionWalls: normalizeCollisionWalls(
      (payload.collisionWalls ?? [])
        .filter((w) => w && (TILE_EDGES as readonly string[]).includes(w.edge))
        .map((w) => ({ tx: Number(w.tx), ty: Number(w.ty), edge: w.edge })),
      width,
      height,
    ),
    bridges: sortBridges(
      (() => {
        const seen = new Set<string>();
        const out: EditorMapDoc["bridges"] = [];
        for (const b of payload.bridges ?? []) {
          if (!b || !Number.isInteger(b.tx) || !Number.isInteger(b.ty)) continue;
          const key = `${b.tx},${b.ty}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            tx: Number(b.tx),
            ty: Number(b.ty),
            orientation: ((BRIDGE_ORIENTATIONS as readonly string[]).includes(b.orientation) ? b.orientation : "H") as
              | "H"
              | "V",
          });
        }
        return out;
      })(),
    ),
  };
}

export { PROP_TYPES, TILE_EDGES };
