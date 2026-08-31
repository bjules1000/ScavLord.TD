import { TILE } from "../data";
import { inBounds } from "./document";
import { isOrthogonalPair } from "./pathing";
import type { BoundaryPort, EditorLane, EditorMapDoc, TileEdge } from "./schema";

export const EDGE_LABEL: Record<TileEdge, string> = {
  N: "NORTH",
  E: "EAST",
  S: "SOUTH",
  W: "WEST",
};

export const EDITOR_GUTTER = TILE;

export function emptyLane(id: string): EditorLane {
  return { id, waypoints: [], spawn: null, endpoint: null };
}

export function legalPortEdges(tx: number, ty: number, width: number, height: number): TileEdge[] {
  const edges: TileEdge[] = [];
  if (ty === 0) edges.push("N");
  if (tx === width - 1) edges.push("E");
  if (ty === height - 1) edges.push("S");
  if (tx === 0) edges.push("W");
  return edges;
}

export function isLegalPort(port: BoundaryPort, width: number, height: number): boolean {
  if (port.tx < 0 || port.ty < 0 || port.tx >= width || port.ty >= height) return false;
  return legalPortEdges(port.tx, port.ty, width, height).includes(port.edge);
}

/** Nearest legal outside edge for a border tile. Interior tiles return null. */
export function portEdgeFromCursor(
  tx: number,
  ty: number,
  localX: number,
  localY: number,
  width: number,
  height: number,
  tile = TILE,
): TileEdge | null {
  const legal = legalPortEdges(tx, ty, width, height);
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0]!;
  const score: Record<TileEdge, number> = {
    N: localY,
    S: tile - 1 - localY,
    W: localX,
    E: tile - 1 - localX,
  };
  let best = legal[0]!;
  for (const edge of legal) {
    if (score[edge] < score[best]) best = edge;
  }
  return best;
}

export function portOutsideCell(port: BoundaryPort): [number, number] {
  if (port.edge === "W") return [port.tx - 1, port.ty];
  if (port.edge === "E") return [port.tx + 1, port.ty];
  if (port.edge === "N") return [port.tx, port.ty - 1];
  return [port.tx, port.ty + 1];
}

/** Marker center in playable-grid pixel space. Negative / past-max means outside the grid. */
export function portMarkerCenter(port: BoundaryPort, tile = TILE): [number, number] {
  const [x, y] = portOutsideCell(port);
  return [x * tile + tile / 2, y * tile + tile / 2];
}

export function portEquals(a: BoundaryPort | null, b: BoundaryPort | null): boolean {
  if (!a || !b) return a === b;
  return a.tx === b.tx && a.ty === b.ty && a.edge === b.edge;
}

export function canvasPixelSize(width: number, height: number, tile = TILE, gutter = EDITOR_GUTTER) {
  return { w: width * tile + gutter * 2, h: height * tile + gutter * 2 };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function isOffMap(x: number, y: number, width: number, height: number): boolean {
  return x < 0 || y < 0 || x >= width || y >= height;
}

function portFromOutsideCell(x: number, y: number, width: number, height: number): BoundaryPort | null {
  if (x < 0) return { tx: 0, ty: clamp(y, 0, height - 1), edge: "W" };
  if (x >= width) return { tx: width - 1, ty: clamp(y, 0, height - 1), edge: "E" };
  if (y < 0) return { tx: clamp(x, 0, width - 1), ty: 0, edge: "N" };
  if (y >= height) return { tx: clamp(x, 0, width - 1), ty: height - 1, edge: "S" };
  return null;
}

/**
 * Infer a boundary port from a path end that sits on the outer border.
 * Uses travel direction when the tile is a corner (two legal edges).
 */
export function inferPortFromPathEnd(
  tile: [number, number],
  toward: [number, number] | null,
  width: number,
  height: number,
  role: "start" | "end",
): BoundaryPort | null {
  const legal = legalPortEdges(tile[0], tile[1], width, height);
  if (!legal.length) return null;
  let preferred: TileEdge | null = null;
  if (toward) {
    const dx = toward[0] - tile[0];
    const dy = toward[1] - tile[1];
    if (role === "start") {
      if (dx > 0) preferred = "W";
      else if (dx < 0) preferred = "E";
      else if (dy > 0) preferred = "N";
      else if (dy < 0) preferred = "S";
    } else {
      const sx = tile[0] - toward[0];
      const sy = tile[1] - toward[1];
      if (sx > 0) preferred = "E";
      else if (sx < 0) preferred = "W";
      else if (sy > 0) preferred = "S";
      else if (sy < 0) preferred = "N";
    }
  }
  if (preferred && legal.includes(preferred)) {
    return { tx: tile[0], ty: tile[1], edge: preferred };
  }
  if (legal.length === 1) return { tx: tile[0], ty: tile[1], edge: legal[0]! };
  const order: TileEdge[] = ["W", "E", "N", "S"];
  const edge = order.find((e) => legal.includes(e))!;
  return { tx: tile[0], ty: tile[1], edge };
}

/** Split production/off-map waypoints into in-map path + boundary ports. */
export function peelLaneFromWaypoints(
  id: string,
  path: Array<[number, number]>,
  width: number,
  height: number,
): EditorLane {
  const pts = path.map(([x, y]) => [x, y] as [number, number]);
  let spawn: BoundaryPort | null = null;
  let endpoint: BoundaryPort | null = null;
  if (pts.length && isOffMap(pts[0]![0], pts[0]![1], width, height)) {
    spawn = portFromOutsideCell(pts[0]![0], pts[0]![1], width, height);
    pts.shift();
  }
  if (pts.length && isOffMap(pts[pts.length - 1]![0], pts[pts.length - 1]![1], width, height)) {
    endpoint = portFromOutsideCell(pts[pts.length - 1]![0], pts[pts.length - 1]![1], width, height);
    pts.pop();
  }
  const waypoints = pts.filter(([x, y]) => !isOffMap(x, y, width, height));
  if (!spawn && waypoints.length) {
    spawn = inferPortFromPathEnd(waypoints[0]!, waypoints[1] ?? null, width, height, "start");
  }
  if (!endpoint && waypoints.length) {
    endpoint = inferPortFromPathEnd(
      waypoints[waypoints.length - 1]!,
      waypoints[waypoints.length - 2] ?? null,
      width,
      height,
      "end",
    );
  }
  if (spawn && waypoints.length) {
    const first = waypoints[0]!;
    const tile: [number, number] = [spawn.tx, spawn.ty];
    if ((first[0] !== tile[0] || first[1] !== tile[1]) && isOrthogonalPair(tile, first)) {
      waypoints.unshift(tile);
    }
  }
  if (endpoint && waypoints.length) {
    const last = waypoints[waypoints.length - 1]!;
    const tile: [number, number] = [endpoint.tx, endpoint.ty];
    if ((last[0] !== tile[0] || last[1] !== tile[1]) && isOrthogonalPair(last, tile)) {
      waypoints.push(tile);
    }
  }
  return { id, waypoints, spawn, endpoint };
}

export function productionPathFromLane(lane: EditorLane): Array<[number, number]> {
  const inner = lane.waypoints.map(([x, y]) => [x, y] as [number, number]);
  const out: Array<[number, number]> = [];
  if (lane.spawn) {
    const c = portOutsideCell(lane.spawn);
    const first = inner[0];
    if (!first || first[0] !== c[0] || first[1] !== c[1]) out.push(c);
  }
  out.push(...inner);
  if (lane.endpoint) {
    const c = portOutsideCell(lane.endpoint);
    const last = out[out.length - 1];
    if (!last || last[0] !== c[0] || last[1] !== c[1]) out.push(c);
  }
  return out;
}

export function overlayPathCells(lane: EditorLane): Array<[number, number]> {
  const inner = lane.waypoints.length ? lane.waypoints : [];
  const out: Array<[number, number]> = [];
  if (lane.spawn) out.push(portOutsideCell(lane.spawn));
  for (const c of inner) {
    const prev = out[out.length - 1];
    if (prev && prev[0] === c[0] && prev[1] === c[1]) continue;
    out.push(c);
  }
  if (lane.endpoint) {
    const c = portOutsideCell(lane.endpoint);
    const last = out[out.length - 1];
    if (!last || last[0] !== c[0] || last[1] !== c[1]) out.push(c);
  }
  return out;
}

export function portConnectedToPath(port: BoundaryPort, waypoints: Array<[number, number]>, end: "start" | "end"): boolean {
  if (!waypoints.length) return false;
  const target = end === "start" ? waypoints[0]! : waypoints[waypoints.length - 1]!;
  return port.tx === target[0] && port.ty === target[1];
}

export function markerOutsidePlayableGrid(
  port: BoundaryPort,
  width: number,
  height: number,
  tile = TILE,
): boolean {
  const [x, y] = portMarkerCenter(port, tile);
  return x < 0 || y < 0 || x > width * tile || y > height * tile;
}

export function hitLanePort(
  doc: EditorMapDoc,
  tx: number,
  ty: number,
  laneId?: string,
): { kind: "spawn" | "endpoint"; laneId: string } | null {
  const lanes = laneId ? doc.lanes.filter((l) => l.id === laneId) : doc.lanes;
  for (const lane of lanes) {
    if (lane.spawn) {
      const c = portOutsideCell(lane.spawn);
      if (c[0] === tx && c[1] === ty) return { kind: "spawn", laneId: lane.id };
    }
    if (lane.endpoint) {
      const c = portOutsideCell(lane.endpoint);
      if (c[0] === tx && c[1] === ty) return { kind: "endpoint", laneId: lane.id };
    }
  }
  return null;
}

export function exportPort(port: BoundaryPort | null): { tile: [number, number]; edge: TileEdge } | null {
  if (!port) return null;
  return { tile: [port.tx, port.ty], edge: port.edge };
}

export function importPort(
  raw: { tile?: [number, number]; edge?: TileEdge; tx?: number; ty?: number } | null | undefined,
  width: number,
  height: number,
): BoundaryPort | null {
  if (!raw) return null;
  const tx = raw.tile ? Number(raw.tile[0]) : Number(raw.tx);
  const ty = raw.tile ? Number(raw.tile[1]) : Number(raw.ty);
  const edge = raw.edge;
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || !edge) return null;
  const port: BoundaryPort = { tx, ty, edge };
  return isLegalPort(port, width, height) ? port : null;
}

export function inPlayableTile(doc: Pick<EditorMapDoc, "width" | "height">, tx: number, ty: number): boolean {
  return inBounds(doc, tx, ty);
}
