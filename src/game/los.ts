/**
 * Canonical line of sight. Operates on world pixels, not tile ids.
 * Authored invisible walls block sight; decorative props do not.
 * Bridge-deck separation is a surface rule, not 3D raycasting.
 */
import { COLS, ROWS, TILE } from "./data";
import type { GameMap } from "./map";
import type { CollisionWall, TileEdge } from "./mapBuilder/schema";
import { canonicalCollisionWall, isSightBlockedAcrossEdge } from "./mapBuilder/walls";
import { entitySurface, hasSuspendedBridge } from "./surfaces";
import type { SurfaceLevel } from "./types";

/** Centralized grid/corner tolerance. World units. */
export const LOS_EPS = 1e-9;

export type LosBlocker = "WALL" | "BRIDGE_DECK";

export interface WorldPos {
  x: number;
  y: number;
}

export interface SightPos extends WorldPos {
  surface?: SurfaceLevel;
}

export interface LosHit {
  clear: boolean;
  blocker: LosBlocker | null;
  edge: CollisionWall | null;
  point: WorldPos | null;
  along: number;
}

export interface GridEdgeCross {
  from: [number, number];
  to: [number, number];
  t: number;
  x: number;
  y: number;
  edge: TileEdge;
}

export function worldToTile(x: number, y: number, tile = TILE): { tx: number; ty: number } {
  return { tx: Math.floor(x / tile), ty: Math.floor(y / tile) };
}

export function tileCenterWorld(tx: number, ty: number, tile = TILE): WorldPos {
  return { x: tx * tile + tile / 2, y: ty * tile + tile / 2 };
}

export function raidSightWalls(map: GameMap) {
  return {
    width: COLS,
    height: ROWS,
    collisionWalls: map.def.collisionWalls ?? [],
  };
}

export function isRaidSightBlockedAcrossEdge(
  map: GameMap,
  from: [number, number],
  to: [number, number],
): boolean {
  return isSightBlockedAcrossEdge(raidSightWalls(map), from, to);
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= LOS_EPS;
}

function stepOf(delta: number): -1 | 0 | 1 {
  if (delta > LOS_EPS) return 1;
  if (delta < -LOS_EPS) return -1;
  return 0;
}

function tToNextGrid(origin: number, dest: number, cell: number, step: -1 | 0 | 1, tile: number): number {
  if (step === 0) return Number.POSITIVE_INFINITY;
  const denom = dest - origin;
  if (Math.abs(denom) <= LOS_EPS) return Number.POSITIVE_INFINITY;
  const boundary = step > 0 ? (cell + 1) * tile : cell * tile;
  let t = (boundary - origin) / denom;
  if (t < LOS_EPS) {
    t = (boundary + step * tile - origin) / denom;
  }
  return t < LOS_EPS ? Number.POSITIVE_INFINITY : t;
}

function edgeForStep(stepX: number, stepY: number): TileEdge {
  if (stepX === 1) return "E";
  if (stepX === -1) return "W";
  if (stepY === 1) return "S";
  return "N";
}

/**
 * Supercover DDA: every orthogonal tile edge the segment crosses.
 * At an exact (or near-exact) grid corner both the vertical and horizontal
 * edges are reported so a ray cannot slip between two blocking walls.
 */
export function crossedTileEdges(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tile = TILE,
): GridEdgeCross[] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len <= LOS_EPS) return [];

  let gx = Math.floor(x0 / tile);
  let gy = Math.floor(y0 / tile);
  const gx1 = Math.floor(x1 / tile);
  const gy1 = Math.floor(y1 / tile);
  if (gx === gx1 && gy === gy1) return [];

  const stepX = stepOf(dx);
  const stepY = stepOf(dy);
  const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : tile / Math.abs(dx);
  const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : tile / Math.abs(dy);
  let tMaxX = tToNextGrid(x0, x1, gx, stepX, tile);
  let tMaxY = tToNextGrid(y0, y1, gy, stepY, tile);

  const out: GridEdgeCross[] = [];
  const maxSteps = COLS + ROWS + 8;
  let steps = 0;

  const push = (from: [number, number], to: [number, number], t: number, edge: TileEdge) => {
    const tt = Math.max(0, Math.min(1, t));
    out.push({
      from,
      to,
      t: tt,
      x: x0 + dx * tt,
      y: y0 + dy * tt,
      edge,
    });
  };

  while ((gx !== gx1 || gy !== gy1) && steps++ < maxSteps) {
    const corner = nearlyEqual(tMaxX, tMaxY);
    if (corner) {
      if (tMaxX > 1 + LOS_EPS) break;
      const ox = gx;
      const oy = gy;
      if (stepX !== 0) push([ox, oy], [ox + stepX, oy], tMaxX, edgeForStep(stepX, 0));
      if (stepY !== 0) push([ox, oy], [ox, oy + stepY], tMaxY, edgeForStep(0, stepY));
      gx = ox + stepX;
      gy = oy + stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
      continue;
    }
    if (tMaxX < tMaxY) {
      if (tMaxX > 1 + LOS_EPS) break;
      if (stepX === 0) break;
      const nx = gx + stepX;
      push([gx, gy], [nx, gy], tMaxX, edgeForStep(stepX, 0));
      gx = nx;
      tMaxX += tDeltaX;
    } else {
      if (tMaxY > 1 + LOS_EPS) break;
      if (stepY === 0) break;
      const ny = gy + stepY;
      push([gx, gy], [gx, ny], tMaxY, edgeForStep(0, stepY));
      gy = ny;
      tMaxY += tDeltaY;
    }
  }
  return out;
}

export function surfaceOf(pos: SightPos): SurfaceLevel {
  return entitySurface(pos);
}

/**
 * HIGH on a suspended-bridge footprint vs LOW under that same footprint.
 * Both projected endpoints must sit on bridge tiles and opposite surfaces.
 */
export function bridgeDeckSeparates(map: GameMap, from: SightPos, to: SightPos): boolean {
  const a = worldToTile(from.x, from.y);
  const b = worldToTile(to.x, to.y);
  if (!hasSuspendedBridge(map, a.tx, a.ty) || !hasSuspendedBridge(map, b.tx, b.ty)) return false;
  return surfaceOf(from) !== surfaceOf(to);
}

function wallAlong(map: GameMap, from: [number, number], to: [number, number]): boolean {
  return isRaidSightBlockedAcrossEdge(map, from, to);
}

/**
 * Exact grid-corner: block only when an L of two walls meets at that vertex.
 * Checking both the origin L and the destination L keeps A→D and D→A consistent.
 * A single wall at the vertex does not by itself close the diagonal.
 */
function cornerPairBlocks(map: GameMap, a: GridEdgeCross, b: GridEdgeCross): boolean {
  const originWalls = wallAlong(map, a.from, a.to) && wallAlong(map, b.from, b.to);
  if (originWalls) return true;
  const ox = a.from[0];
  const oy = a.from[1];
  const stepX = Math.sign(a.to[0] - a.from[0] || b.to[0] - b.from[0]);
  const stepY = Math.sign(a.to[1] - a.from[1] || b.to[1] - b.from[1]);
  const dest: [number, number] = [ox + stepX, oy + stepY];
  const destV: [number, number] = [dest[0] - stepX, dest[1]];
  const destH: [number, number] = [dest[0], dest[1] - stepY];
  return wallAlong(map, dest, destV) && wallAlong(map, dest, destH);
}

export function firstSightBlockingCross(map: GameMap, crosses: GridEdgeCross[]): GridEdgeCross | null {
  for (let i = 0; i < crosses.length; i++) {
    const a = crosses[i]!;
    const b = crosses[i + 1];
    if (b && nearlyEqual(a.t, b.t)) {
      if (cornerPairBlocks(map, a, b)) return a;
      i += 1;
      continue;
    }
    if (wallAlong(map, a.from, a.to)) return a;
  }
  return null;
}

function clearLos(along: number): LosHit {
  return { clear: true, blocker: null, edge: null, point: null, along };
}

function wallHit(cross: GridEdgeCross, map: GameMap, dist: number): LosHit {
  const walls = raidSightWalls(map);
  const canonical =
    canonicalCollisionWall(cross.from[0], cross.from[1], cross.edge, walls.width, walls.height) ??
    canonicalCollisionWall(cross.to[0], cross.to[1], cross.edge, walls.width, walls.height);
  return {
    clear: false,
    blocker: "WALL",
    edge: canonical,
    point: { x: cross.x, y: cross.y },
    along: dist * cross.t,
  };
}

function wallTrace(map: GameMap, x0: number, y0: number, x1: number, y1: number): LosHit {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const blocked = firstSightBlockingCross(map, crossedTileEdges(x0, y0, x1, y1));
  if (blocked) return wallHit(blocked, map, dist);
  return clearLos(dist);
}

/** Full LOS result: walls then simple bridge-deck separation. Range is not applied. */
export function traceLineOfSight(map: GameMap, from: SightPos, to: SightPos): LosHit {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (bridgeDeckSeparates(map, from, to)) {
    return {
      clear: false,
      blocker: "BRIDGE_DECK",
      edge: null,
      point: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      along: dist / 2,
    };
  }
  return wallTrace(map, from.x, from.y, to.x, to.y);
}

export function hasLineOfSight(map: GameMap, from: SightPos, to: SightPos): boolean {
  return traceLineOfSight(map, from, to).clear;
}

/** First authored wall along a world segment. Bridge deck is not a 2D stop. */
export function firstWallAlong(map: GameMap, from: WorldPos, toX: number, toY: number): LosHit {
  return wallTrace(map, from.x, from.y, toX, toY);
}

export function clipWorldSegment(map: GameMap, from: WorldPos, toX: number, toY: number): WorldPos {
  const hit = firstWallAlong(map, from, toX, toY);
  if (hit.clear || !hit.point) return { x: toX, y: toY };
  return hit.point;
}

export function wallAlongLimit(map: GameMap, from: WorldPos, toX: number, toY: number): number | null {
  const hit = firstWallAlong(map, from, toX, toY);
  if (hit.clear) return null;
  return hit.along;
}
