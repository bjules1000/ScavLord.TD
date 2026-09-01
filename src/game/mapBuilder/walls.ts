/**
 * Authored tile-edge barriers.
 *
 * Walls occupy a TILE EDGE, never a filled cell. Shared neighbors are one
 * physical boundary:
 *   EAST of (x, y)  ===  WEST of (x+1, y)  → stored as EAST of (x, y)
 *   SOUTH of (x, y) ===  NORTH of (x, y+1) → stored as SOUTH of (x, y)
 * Outer map edges stay on the border tile (N of row 0, W of col 0, E of last
 * col, S of last row). No neighbor tile is required for those.
 *
 * Two kinds share that identity:
 *   MOVEMENT — cliff / drop-off. Blocks walking. Does not block sight.
 *   SOLID    — building / hard wall. Blocks walking and sight.
 *
 * Slopes stay open only where the author left a gap — walls are never
 * inferred from HIGH GROUND.
 *
 * Raid presentation never draws this overlay. Map Builder WALLS layer only.
 */
import {
  DEFAULT_COLLISION_WALL_KIND,
  isCollisionWallKind,
  type CollisionWall,
  type CollisionWallKind,
  type EditorMapDoc,
  type TileEdge,
} from "./schema";

export const MOVEMENT_WALL_COLOR = "#3ef0e0";
export const SOLID_WALL_COLOR = "#e84ad0";

export type AuthoredWallMap = {
  width: number;
  height: number;
  collisionWalls: Array<{ tx: number; ty: number; edge: TileEdge; kind?: CollisionWallKind | null }>;
};

export type { CollisionWall, CollisionWallKind };

export function collisionWallKind(wall: { kind?: CollisionWallKind | null }): CollisionWallKind {
  return wall.kind === "SOLID" ? "SOLID" : DEFAULT_COLLISION_WALL_KIND;
}

export function withCollisionWallKind(
  wall: { tx: number; ty: number; edge: TileEdge; kind?: CollisionWallKind | null },
  kind?: CollisionWallKind | null,
): CollisionWall {
  const resolved = isCollisionWallKind(kind) ? kind : collisionWallKind(wall);
  return { tx: wall.tx, ty: wall.ty, edge: wall.edge, kind: resolved };
}

export function oppositeEdge(edge: TileEdge): TileEdge {
  if (edge === "N") return "S";
  if (edge === "S") return "N";
  if (edge === "E") return "W";
  return "E";
}

export function collisionWallKey(wall: { tx: number; ty: number; edge: TileEdge }): string {
  return `${wall.tx},${wall.ty},${wall.edge}`;
}

export function collisionWallId(wall: { tx: number; ty: number; edge: TileEdge }): string {
  return `wall:${collisionWallKey(wall)}`;
}

export function collisionWallColor(wall: { kind?: CollisionWallKind | null }): string {
  return collisionWallKind(wall) === "SOLID" ? SOLID_WALL_COLOR : MOVEMENT_WALL_COLOR;
}

export function parseCollisionWallId(id: string): { tx: number; ty: number; edge: TileEdge } | null {
  if (!id.startsWith("wall:")) return null;
  const parts = id.slice(5).split(",");
  const tx = Number(parts[0]);
  const ty = Number(parts[1]);
  const edge = parts[2];
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return null;
  if (edge !== "N" && edge !== "E" && edge !== "S" && edge !== "W") return null;
  return { tx, ty, edge };
}

/**
 * Deterministic identity for a physical edge. Interior W/N faces fold onto
 * the neighboring E/S face so duplicates cannot exist.
 */
export function canonicalCollisionWall(
  tx: number,
  ty: number,
  edge: TileEdge,
  width: number,
  height: number,
): { tx: number; ty: number; edge: TileEdge } | null {
  if (tx < 0 || ty < 0 || tx >= width || ty >= height) return null;
  if (edge === "W") {
    if (tx === 0) return { tx: 0, ty, edge: "W" };
    return { tx: tx - 1, ty, edge: "E" };
  }
  if (edge === "N") {
    if (ty === 0) return { tx, ty: 0, edge: "N" };
    return { tx, ty: ty - 1, edge: "S" };
  }
  if (edge === "E") return { tx, ty, edge: "E" };
  return { tx, ty, edge: "S" };
}

export function findCollisionWall(
  walls: Array<{ tx: number; ty: number; edge: TileEdge; kind?: CollisionWallKind | null }>,
  wall: { tx: number; ty: number; edge: TileEdge },
): CollisionWall | null {
  const key = collisionWallKey(wall);
  const hit = walls.find((w) => collisionWallKey(w) === key);
  return hit ? withCollisionWallKind(hit) : null;
}

export function hasCollisionWall(
  walls: Array<{ tx: number; ty: number; edge: TileEdge }>,
  wall: { tx: number; ty: number; edge: TileEdge },
): boolean {
  return findCollisionWall(walls, wall) !== null;
}

export function sharedCanonicalWall(
  from: [number, number],
  to: [number, number],
  width: number,
  height: number,
): { tx: number; ty: number; edge: TileEdge } | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  const edge: TileEdge = dx === 1 ? "E" : dx === -1 ? "W" : dy === 1 ? "S" : "N";
  const fromWall = canonicalCollisionWall(from[0], from[1], edge, width, height);
  if (fromWall) return fromWall;
  return canonicalCollisionWall(to[0], to[1], oppositeEdge(edge), width, height);
}

function wallAcross(map: AuthoredWallMap, from: [number, number], to: [number, number]): CollisionWall | null {
  const wall = sharedCanonicalWall(from, to, map.width, map.height);
  if (!wall) return null;
  return findCollisionWall(map.collisionWalls, wall);
}

/** True when any authored wall occupies the shared edge between orthogonal neighbors. */
export function isMovementBlockedAcrossEdge(map: AuthoredWallMap, from: [number, number], to: [number, number]): boolean {
  return wallAcross(map, from, to) !== null;
}

/** True only for SOLID walls. MOVEMENT (cliff) walls do not block sight. */
export function isSightBlockedAcrossEdge(map: AuthoredWallMap, from: [number, number], to: [number, number]): boolean {
  const wall = wallAcross(map, from, to);
  return wall ? collisionWallBlocksSight(wall) : false;
}

export function collisionWallBlocksMovement(_wall: CollisionWall): boolean {
  return true;
}

export function collisionWallBlocksSight(wall: CollisionWall): boolean {
  return collisionWallKind(wall) === "SOLID";
}

export function sortCollisionWalls(walls: CollisionWall[]): CollisionWall[] {
  return [...walls].sort(
    (a, b) => a.ty - b.ty || a.tx - b.tx || a.edge.localeCompare(b.edge) || collisionWallKind(a).localeCompare(collisionWallKind(b)),
  );
}

export function normalizeCollisionWalls(
  walls: Array<{ tx: number; ty: number; edge: TileEdge; kind?: CollisionWallKind | null }>,
  width: number,
  height: number,
): CollisionWall[] {
  const seen = new Set<string>();
  const out: CollisionWall[] = [];
  for (const raw of walls) {
    const edge = canonicalCollisionWall(raw.tx, raw.ty, raw.edge, width, height);
    if (!edge) continue;
    const key = collisionWallKey(edge);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(withCollisionWallKind(edge, isCollisionWallKind(raw.kind) ? raw.kind : collisionWallKind(raw)));
  }
  return sortCollisionWalls(out);
}

export function placeCollisionWall(
  doc: EditorMapDoc,
  tx: number,
  ty: number,
  edge: TileEdge,
  kind: CollisionWallKind = DEFAULT_COLLISION_WALL_KIND,
): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const canonical = canonicalCollisionWall(tx, ty, edge, doc.width, doc.height);
  if (!canonical) return doc;
  const next = withCollisionWallKind(canonical, kind);
  const existing = findCollisionWall(doc.collisionWalls, canonical);
  if (existing) {
    if (collisionWallKind(existing) === kind) return doc;
    const key = collisionWallKey(canonical);
    return {
      ...doc,
      collisionWalls: sortCollisionWalls(
        doc.collisionWalls.map((w) => (collisionWallKey(w) === key ? next : withCollisionWallKind(w))),
      ),
    };
  }
  return { ...doc, collisionWalls: sortCollisionWalls([...doc.collisionWalls.map((w) => withCollisionWallKind(w)), next]) };
}

export function eraseCollisionWall(doc: EditorMapDoc, tx: number, ty: number, edge: TileEdge): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const wall = canonicalCollisionWall(tx, ty, edge, doc.width, doc.height);
  if (!wall || !hasCollisionWall(doc.collisionWalls, wall)) return doc;
  const key = collisionWallKey(wall);
  return { ...doc, collisionWalls: doc.collisionWalls.filter((w) => collisionWallKey(w) !== key) };
}

export function eraseCollisionWallById(doc: EditorMapDoc, id: string): EditorMapDoc {
  const wall = parseCollisionWallId(id);
  if (!wall) return doc;
  return eraseCollisionWall(doc, wall.tx, wall.ty, wall.edge);
}

export function hitCollisionWall(doc: AuthoredWallMap, tx: number, ty: number, edge: TileEdge): CollisionWall | null {
  const wall = canonicalCollisionWall(tx, ty, edge, doc.width, doc.height);
  if (!wall) return null;
  return findCollisionWall(doc.collisionWalls, wall);
}

export function visibleCollisionWalls(
  doc: Pick<EditorMapDoc, "collisionWalls">,
  layers: { walls: boolean },
): CollisionWall[] {
  if (!layers.walls) return [];
  return doc.collisionWalls.map((w) => withCollisionWallKind(w));
}

/** Dev overlay only. Production raids never paint these lines. */
export function raidRendersCollisionWalls(): boolean {
  return false;
}

export function wallEdgeNearCursor(localX: number, localY: number, tile: number, margin = 10): TileEdge | null {
  if (localY <= margin) return "N";
  if (localY >= tile - margin) return "S";
  if (localX <= margin) return "W";
  if (localX >= tile - margin) return "E";
  return null;
}
