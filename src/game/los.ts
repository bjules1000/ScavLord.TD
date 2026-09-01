/**
 * Canonical line of sight. Operates on world pixels, not tile ids.
 *
 * Authored invisible walls block movement only. Sight is blocked by:
 *   MOUNTAIN occupancy
 *   intervening HIGH_GROUND ridge mass (not just leaving/entering the
 *   source or target plateau)
 *   suspended-bridge deck separation
 * Decorative props do not block. Range is not applied here.
 */
import { COLS, ROWS, TILE } from "./data";
import { isMountain, type GameMap } from "./map";
import type { TileEdge } from "./mapBuilder/schema";
import { isSightBlockedAcrossEdge } from "./mapBuilder/walls";
import { elevatedSurfaceAt, entitySurface, hasSuspendedBridge } from "./surfaces";
import type { SurfaceLevel } from "./types";

/** Centralized grid/corner tolerance. World units. */
export const LOS_EPS = 1e-9;

export type LosBlocker = "MOUNTAIN" | "RIDGE" | "BRIDGE_DECK" | "LOS_WALL";

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
  edge: { tx: number; ty: number } | null;
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

export interface TraversedTile {
  tx: number;
  ty: number;
  t: number;
  x: number;
  y: number;
}

function pushUniqueTile(out: TraversedTile[], tile: TraversedTile) {
  const last = out[out.length - 1];
  if (last && last.tx === tile.tx && last.ty === tile.ty) return;
  out.push(tile);
}

/** Supercover cell visit list, including start and end tiles. */
export function traversedTiles(x0: number, y0: number, x1: number, y1: number, tile = TILE): TraversedTile[] {
  const out: TraversedTile[] = [];
  const startTx = Math.floor(x0 / tile);
  const startTy = Math.floor(y0 / tile);
  pushUniqueTile(out, { tx: startTx, ty: startTy, t: 0, x: x0, y: y0 });
  for (const cross of crossedTileEdges(x0, y0, x1, y1, tile)) {
    pushUniqueTile(out, { tx: cross.to[0], ty: cross.to[1], t: cross.t, x: cross.x, y: cross.y });
  }
  const endTx = Math.floor(x1 / tile);
  const endTy = Math.floor(y1 / tile);
  pushUniqueTile(out, { tx: endTx, ty: endTy, t: 1, x: x1, y: y1 });
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

/** HIGH_GROUND terrain mass. Suspended-bridge decks are not ridge bodies. */
export function isRidgeMass(map: GameMap, tx: number, ty: number): boolean {
  return elevatedSurfaceAt(map, tx, ty) === "HIGH_GROUND";
}

function sameRidge(map: GameMap, a: { tx: number; ty: number }, b: { tx: number; ty: number }): boolean {
  if (!isRidgeMass(map, a.tx, a.ty) || !isRidgeMass(map, b.tx, b.ty)) return false;
  if (a.tx === b.tx && a.ty === b.ty) return true;
  const seen = new Set<string>();
  const stack: Array<[number, number]> = [[a.tx, a.ty]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    const key = `${cx},${cy}`;
    if (seen.has(key) || !isRidgeMass(map, cx, cy)) continue;
    if (cx === b.tx && cy === b.ty) return true;
    seen.add(key);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return false;
}

function clearLos(along: number): LosHit {
  return { clear: true, blocker: null, edge: null, point: null, along };
}

function terrainHit(
  blocker: LosBlocker,
  cell: TraversedTile,
  dist: number,
): LosHit {
  return {
    clear: false,
    blocker,
    edge: { tx: cell.tx, ty: cell.ty },
    point: { x: cell.x, y: cell.y },
    along: dist * cell.t,
  };
}

/**
 * Terrain-mass LOS. Movement walls are ignored.
 *
 * Prefix: consecutive source-plateau HIGH_GROUND from the shooter (leaving the cliff).
 * Suffix: consecutive target-plateau HIGH_GROUND into the target (entering the cliff).
 * Any other HIGH_GROUND is an intervening ridge. MOUNTAIN always blocks.
 */
export function firstTerrainObstruction(
  map: GameMap,
  from: SightPos,
  to: SightPos,
): LosHit {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const cells = traversedTiles(from.x, from.y, to.x, to.y);
  if (!cells.length) return clearLos(dist);

  const src = worldToTile(from.x, from.y);
  const dst = worldToTile(to.x, to.y);
  const srcOnRidge = surfaceOf(from) === "HIGH" && isRidgeMass(map, src.tx, src.ty);
  const dstOnRidge = surfaceOf(to) === "HIGH" && isRidgeMass(map, dst.tx, dst.ty);

  const inPrefix: boolean[] = [];
  let prefix = true;
  for (const cell of cells) {
    const isSrc = cell.tx === src.tx && cell.ty === src.ty;
    const stay =
      prefix && (isSrc || (srcOnRidge && sameRidge(map, src, cell)));
    inPrefix.push(stay);
    if (!stay) prefix = false;
  }

  const inSuffix: boolean[] = Array(cells.length).fill(false);
  let suffix = true;
  for (let i = cells.length - 1; i >= 0; i--) {
    const cell = cells[i]!;
    const isDst = cell.tx === dst.tx && cell.ty === dst.ty;
    const stay = suffix && (isDst || (dstOnRidge && sameRidge(map, dst, cell)));
    inSuffix[i] = stay;
    if (!stay) suffix = false;
  }

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    const isSrc = cell.tx === src.tx && cell.ty === src.ty;
    const isDst = cell.tx === dst.tx && cell.ty === dst.ty;
    if (isMountain(map, cell.tx, cell.ty) && !isSrc && !isDst) {
      return terrainHit("MOUNTAIN", cell, dist);
    }
    if (!isRidgeMass(map, cell.tx, cell.ty)) continue;
    if (isSrc || isDst) continue;
    if (inPrefix[i] || inSuffix[i]) continue;
    return terrainHit("RIDGE", cell, dist);
  }

  return clearLos(dist);
}

function firstHardLosWall(map: GameMap, x0: number, y0: number, x1: number, y1: number): LosHit | null {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const crosses = crossedTileEdges(x0, y0, x1, y1);
  for (const cross of crosses) {
    if (!isRaidSightBlockedAcrossEdge(map, cross.from, cross.to)) continue;
    return {
      clear: false,
      blocker: "LOS_WALL",
      edge: { tx: cross.to[0], ty: cross.to[1] },
      point: { x: cross.x, y: cross.y },
      along: dist * cross.t,
    };
  }
  return null;
}

/** Full LOS: bridge deck, then terrain mass, then optional future hard LOS walls. */
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
  const terrain = firstTerrainObstruction(map, from, to);
  if (!terrain.clear) return terrain;
  return firstHardLosWall(map, from.x, from.y, to.x, to.y) ?? clearLos(dist);
}

export function hasLineOfSight(map: GameMap, from: SightPos, to: SightPos): boolean {
  return traceLineOfSight(map, from, to).clear;
}

/** First terrain/LOS obstruction along a world segment. Bridge deck is not a 2D stop. */
export function firstWallAlong(map: GameMap, from: SightPos, toX: number, toY: number): LosHit {
  const dest: SightPos = { x: toX, y: toY, surface: "GROUND" };
  const terrain = firstTerrainObstruction(map, from, dest);
  if (!terrain.clear) return terrain;
  return firstHardLosWall(map, from.x, from.y, toX, toY) ?? clearLos(Math.hypot(toX - from.x, toY - from.y));
}

export function clipWorldSegment(map: GameMap, from: SightPos, toX: number, toY: number): WorldPos {
  const hit = firstWallAlong(map, from, toX, toY);
  if (hit.clear || !hit.point) return { x: toX, y: toY };
  return hit.point;
}

export function wallAlongLimit(map: GameMap, from: SightPos, toX: number, toY: number): number | null {
  const hit = firstWallAlong(map, from, toX, toY);
  if (hit.clear) return null;
  return hit.along;
}
