/**
 * Surface-aware operator movement.
 *
 * Nodes are (tx, ty, surface). LOW and HIGH on the same cell are distinct
 * (ROAD under a bridge vs the deck). LOW↔HIGH is allowed only on authored
 * HIGH_GROUND slope gaps — never by climbing a suspended bridge.
 *
 * Invisible walls use the existing canonical edge helper. Barricades, wire,
 * enemies, and other operators are not path blockers in this pass.
 */
import { getEquippedWeight } from "./armor";
import { COLS, ROWS, TILE } from "./data";
import { isMountain, isRoad, isWater, type GameMap } from "./map";
import { isMovementBlockedAcrossEdge } from "./mapBuilder/walls";
import {
  baseTerrainAt,
  elevatedSurfaceAt,
  entitySurface,
  inMapBounds,
  tileHasFurniture,
} from "./surfaces";
import type { MoveNode, SurfaceLevel, Tower } from "./types";

/** Tiles per second. Converted to pixels via TILE. */
export const OPERATOR_MOVE_SPEED_TILES = 2;

/** Cardinal steps in N, E, S, W order for deterministic BFS. */
export const CARDINAL_STEPS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

export function occupancyKey(tx: number, ty: number, surface: SurfaceLevel): string {
  return `${tx},${ty},${surface}`;
}

export function nodeKey(node: MoveNode): string {
  return occupancyKey(node.tx, node.ty, node.surface);
}

export function tileCenter(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

export function operatorWorldPos(t: Pick<Tower, "tx" | "ty" | "move">): { x: number; y: number } {
  if (t.move) return { x: t.move.x, y: t.move.y };
  return tileCenter(t.tx, t.ty);
}

export function isOperatorMoving(t: Pick<Tower, "move">): boolean {
  return !!t.move && t.move.path.length > 0;
}

export function operatorCanFire(t: Pick<Tower, "move">): boolean {
  return !isOperatorMoving(t);
}

export function operatorMoveSpeedPx(kit: { armor?: string | null } = {}): number {
  getEquippedWeight(kit);
  return OPERATOR_MOVE_SPEED_TILES * TILE;
}

export function raidWalls(map: GameMap) {
  return {
    width: COLS,
    height: ROWS,
    collisionWalls: map.def.collisionWalls ?? [],
  };
}

export function isRaidMovementBlockedAcrossEdge(map: GameMap, from: [number, number], to: [number, number]): boolean {
  return isMovementBlockedAcrossEdge(raidWalls(map), from, to);
}

/**
 * LOW walk: GROUND and ROAD. WATER / MOUNTAIN / furniture are illegal.
 * HIGH_GROUND is elevation, not an overpass, so it does not also expose LOW.
 * A suspended bridge leaves the base cell independently walkable.
 */
export function canWalkLow(map: GameMap, tx: number, ty: number): boolean {
  if (!inMapBounds(tx, ty)) return false;
  if (isMountain(map, tx, ty) || isWater(map, tx, ty)) return false;
  if (elevatedSurfaceAt(map, tx, ty) === "HIGH_GROUND") return false;
  if (tileHasFurniture(map, tx, ty)) return false;
  const base = baseTerrainAt(map, tx, ty);
  return base === "GROUND" || base === "ROAD";
}

/** HIGH walk: HIGH_GROUND terrain or a suspended-bridge deck. */
export function canWalkHigh(map: GameMap, tx: number, ty: number): boolean {
  if (!inMapBounds(tx, ty)) return false;
  if (isMountain(map, tx, ty)) return false;
  if (!elevatedSurfaceAt(map, tx, ty)) return false;
  if (tileHasFurniture(map, tx, ty)) return false;
  return true;
}

export function canWalkSurface(map: GameMap, tx: number, ty: number, surface: SurfaceLevel): boolean {
  return surface === "HIGH" ? canWalkHigh(map, tx, ty) : canWalkLow(map, tx, ty);
}

export function walkableNodesAt(map: GameMap, tx: number, ty: number): MoveNode[] {
  const nodes: MoveNode[] = [];
  if (canWalkLow(map, tx, ty)) nodes.push({ tx, ty, surface: "GROUND" });
  if (canWalkHigh(map, tx, ty)) nodes.push({ tx, ty, surface: "HIGH" });
  return nodes;
}

/**
 * Authored slope: HIGH_GROUND (not a bridge) orthogonally adjacent to walkable
 * LOW, with no invisible wall on that edge. Wall gaps are the slope schema;
 * bridges are never elevators.
 */
export function isAuthoredSlope(map: GameMap, a: MoveNode, b: MoveNode): boolean {
  if (a.surface === b.surface) return false;
  if (Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) !== 1) return false;
  const high = a.surface === "HIGH" ? a : b;
  const low = a.surface === "GROUND" ? a : b;
  if (high.surface !== "HIGH" || low.surface !== "GROUND") return false;
  if (elevatedSurfaceAt(map, high.tx, high.ty) !== "HIGH_GROUND") return false;
  if (!canWalkHigh(map, high.tx, high.ty)) return false;
  if (!canWalkLow(map, low.tx, low.ty)) return false;
  if (isRaidMovementBlockedAcrossEdge(map, [a.tx, a.ty], [b.tx, b.ty])) return false;
  return true;
}

export function canTraverse(map: GameMap, from: MoveNode, to: MoveNode): boolean {
  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  if (!canWalkSurface(map, from.tx, from.ty, from.surface)) return false;
  if (!canWalkSurface(map, to.tx, to.ty, to.surface)) return false;
  if (isRaidMovementBlockedAcrossEdge(map, [from.tx, from.ty], [to.tx, to.ty])) return false;
  if (from.surface === to.surface) return true;
  return isAuthoredSlope(map, from, to);
}

export function neighborsOf(map: GameMap, node: MoveNode): MoveNode[] {
  const out: MoveNode[] = [];
  for (const { dx, dy } of CARDINAL_STEPS) {
    const tx = node.tx + dx;
    const ty = node.ty + dy;
    const same: MoveNode = { tx, ty, surface: node.surface };
    if (canTraverse(map, node, same)) out.push(same);
    const other: MoveNode = { tx, ty, surface: node.surface === "HIGH" ? "GROUND" : "HIGH" };
    if (canTraverse(map, node, other)) out.push(other);
  }
  return out;
}

/** BFS. First visit wins; neighbors expand N, E, S, W, same-surface before slope. */
export function findOperatorPath(map: GameMap, start: MoveNode, goal: MoveNode): MoveNode[] | null {
  if (!canWalkSurface(map, start.tx, start.ty, start.surface)) return null;
  if (!canWalkSurface(map, goal.tx, goal.ty, goal.surface)) return null;
  const startK = nodeKey(start);
  const goalK = nodeKey(goal);
  if (startK === goalK) return [start];

  const visited = new Set<string>([startK]);
  const parent = new Map<string, string>();
  const nodes = new Map<string, MoveNode>([[startK, start]]);
  const queue: string[] = [startK];

  while (queue.length) {
    const curK = queue.shift()!;
    const cur = nodes.get(curK)!;
    for (const next of neighborsOf(map, cur)) {
      const nk = nodeKey(next);
      if (visited.has(nk)) continue;
      visited.add(nk);
      parent.set(nk, curK);
      nodes.set(nk, next);
      if (nk === goalK) return reconstruct(nodes, parent, startK, goalK);
      queue.push(nk);
    }
  }
  return null;
}

function reconstruct(
  nodes: Map<string, MoveNode>,
  parent: Map<string, string>,
  startK: string,
  goalK: string,
): MoveNode[] {
  const path: MoveNode[] = [];
  let k: string | undefined = goalK;
  while (k) {
    path.push(nodes.get(k)!);
    if (k === startK) break;
    k = parent.get(k);
  }
  path.reverse();
  return path;
}

/**
 * Clicked-tile surface. Prefer the operator's current surface when the cell
 * is stacked. HIGH_GROUND-only cells target HIGH (path may use a slope).
 * Never pick a bridge HIGH dest for a LOW click when LOW is unwalkable.
 */
export function resolveMoveDestination(
  map: GameMap,
  from: MoveNode,
  tx: number,
  ty: number,
): MoveNode | null {
  const low = canWalkLow(map, tx, ty);
  const high = canWalkHigh(map, tx, ty);
  if (from.surface === "HIGH") {
    if (high) return { tx, ty, surface: "HIGH" };
    if (low) return { tx, ty, surface: "GROUND" };
    return null;
  }
  if (low) return { tx, ty, surface: "GROUND" };
  if (high && elevatedSurfaceAt(map, tx, ty) === "HIGH_GROUND") return { tx, ty, surface: "HIGH" };
  return null;
}

export function logicalNode(t: Pick<Tower, "tx" | "ty" | "surface">): MoveNode {
  return { tx: t.tx, ty: t.ty, surface: entitySurface(t) };
}

export function reservedDestination(t: Pick<Tower, "tx" | "ty" | "surface" | "move">): MoveNode {
  if (t.move?.pendingDest) return t.move.pendingDest;
  if (t.move && t.move.path.length) return t.move.dest;
  return logicalNode(t);
}

export function destinationTaken(
  towers: ReadonlyArray<Pick<Tower, "id" | "tx" | "ty" | "surface" | "move">>,
  dest: MoveNode,
  exceptId: number,
): boolean {
  const key = nodeKey(dest);
  return towers.some((t) => t.id !== exceptId && nodeKey(reservedDestination(t)) === key);
}

export function clearOperatorMove(t: Tower): void {
  t.move = null;
}

function beginMove(t: Tower, path: MoveNode[], dest: MoveNode): void {
  const pos = operatorWorldPos(t);
  t.move = {
    x: pos.x,
    y: pos.y,
    path: path.slice(1),
    dest,
    pendingDest: null,
  };
}

export type IssueMoveResult =
  | { ok: true; alreadyThere?: boolean }
  | { ok: false; reason: string };

export function issueOperatorMove(
  map: GameMap,
  towers: readonly Tower[],
  t: Tower,
  tx: number,
  ty: number,
): IssueMoveResult {
  const from = isOperatorMoving(t) ? segmentAnchor(t) : logicalNode(t);
  const dest = resolveMoveDestination(map, logicalNode(t), tx, ty);
  if (!dest) return { ok: false, reason: "NO ROUTE" };
  if (destinationTaken(towers, dest, t.id)) return { ok: false, reason: "OCCUPIED" };
  if (nodeKey(logicalNode(t)) === nodeKey(dest) && !isOperatorMoving(t)) {
    return { ok: true, alreadyThere: true };
  }

  if (isOperatorMoving(t) && t.move) {
    const path = findOperatorPath(map, from, dest);
    if (!path) return { ok: false, reason: "NO ROUTE" };
    t.move.pendingDest = dest;
    t.move.dest = dest;
    return { ok: true };
  }

  const path = findOperatorPath(map, from, dest);
  if (!path) return { ok: false, reason: "NO ROUTE" };
  if (path.length < 2) return { ok: true, alreadyThere: true };
  beginMove(t, path, dest);
  return { ok: true };
}

/** Finish the current segment, then repath. Anchor is the node being walked toward, else the logical tile. */
function segmentAnchor(t: Tower): MoveNode {
  const next = t.move?.path[0];
  if (next) return next;
  return logicalNode(t);
}

export function arriveAtNode(t: Tower, node: MoveNode): void {
  t.tx = node.tx;
  t.ty = node.ty;
  t.surface = node.surface;
}

export function stepOperatorMove(t: Tower, dt: number, map: GameMap, speedPx = operatorMoveSpeedPx(t)): void {
  if (!t.move || t.move.path.length === 0) {
    t.move = null;
    return;
  }
  let remaining = Math.max(0, speedPx * dt);
  while (remaining > 0 && t.move && t.move.path.length) {
    const next = t.move.path[0]!;
    const dest = tileCenter(next.tx, next.ty);
    const dx = dest.x - t.move.x;
    const dy = dest.y - t.move.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= remaining + 1e-6 || dist < 0.5) {
      t.move.x = dest.x;
      t.move.y = dest.y;
      remaining = Math.max(0, remaining - dist);
      arriveAtNode(t, next);
      t.move.path.shift();
      if (t.move.pendingDest) {
        const pending = t.move.pendingDest;
        t.move.pendingDest = null;
        const path = findOperatorPath(map, logicalNode(t), pending);
        if (!path || path.length < 2) {
          t.move.dest = logicalNode(t);
          t.move.path = [];
        } else {
          t.move.dest = pending;
          t.move.path = path.slice(1);
        }
      }
      if (!t.move.path.length) {
        t.move = null;
        return;
      }
    } else {
      t.move.x += (dx / dist) * remaining;
      t.move.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }
}
