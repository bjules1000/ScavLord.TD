/**
 * Invisible collision / LOS walls (cliff blockers).
 *
 * Walls occupy a TILE EDGE, never a filled cell. Shared neighbors are one
 * physical boundary:
 *   EAST of (x, y)  ===  WEST of (x+1, y)  → stored as EAST of (x, y)
 *   SOUTH of (x, y) ===  NORTH of (x, y+1) → stored as SOUTH of (x, y)
 * Outer map edges stay on the border tile (N of row 0, W of col 0, E of last
 * col, S of last row). No neighbor tile is required for those.
 *
 * Future movement / LOS (not wired into gameplay in this milestone):
 *   isMovementBlockedAcrossEdge(map, from, to)
 *   isSightBlockedAcrossEdge(map, from, to)
 * Both return true for these walls. Slopes stay open only where the author
 * left a gap — walls are never inferred from HIGH GROUND.
 *
 * Raid presentation never draws this overlay. Map Builder WALLS layer only.
 */
import type { CollisionWall, EditorMapDoc, TileEdge } from "./schema";

export function oppositeEdge(edge: TileEdge): TileEdge {
  if (edge === "N") return "S";
  if (edge === "S") return "N";
  if (edge === "E") return "W";
  return "E";
}

export function collisionWallKey(wall: CollisionWall): string {
  return `${wall.tx},${wall.ty},${wall.edge}`;
}

export function collisionWallId(wall: CollisionWall): string {
  return `wall:${collisionWallKey(wall)}`;
}

export function parseCollisionWallId(id: string): CollisionWall | null {
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
): CollisionWall | null {
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

export function hasCollisionWall(walls: CollisionWall[], wall: CollisionWall): boolean {
  const key = collisionWallKey(wall);
  return walls.some((w) => collisionWallKey(w) === key);
}

export function sharedCanonicalWall(
  from: [number, number],
  to: [number, number],
  width: number,
  height: number,
): CollisionWall | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  const edge: TileEdge = dx === 1 ? "E" : dx === -1 ? "W" : dy === 1 ? "S" : "N";
  const fromWall = canonicalCollisionWall(from[0], from[1], edge, width, height);
  if (fromWall) return fromWall;
  return canonicalCollisionWall(to[0], to[1], oppositeEdge(edge), width, height);
}

/** Future movement: true when a wall occupies the shared edge between orthogonal neighbors. */
export function isMovementBlockedAcrossEdge(
  map: Pick<EditorMapDoc, "width" | "height" | "collisionWalls">,
  from: [number, number],
  to: [number, number],
): boolean {
  const wall = sharedCanonicalWall(from, to, map.width, map.height);
  if (!wall) return false;
  return hasCollisionWall(map.collisionWalls, wall);
}

/** Future LOS: these walls block sight across the same physical edge. */
export function isSightBlockedAcrossEdge(
  map: Pick<EditorMapDoc, "width" | "height" | "collisionWalls">,
  from: [number, number],
  to: [number, number],
): boolean {
  return isMovementBlockedAcrossEdge(map, from, to);
}

export function collisionWallBlocksMovement(_wall: CollisionWall): boolean {
  return true;
}

export function collisionWallBlocksSight(_wall: CollisionWall): boolean {
  return true;
}

export function sortCollisionWalls(walls: CollisionWall[]): CollisionWall[] {
  return [...walls].sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.edge.localeCompare(b.edge));
}

export function normalizeCollisionWalls(
  walls: CollisionWall[],
  width: number,
  height: number,
): CollisionWall[] {
  const seen = new Set<string>();
  const out: CollisionWall[] = [];
  for (const raw of walls) {
    const wall = canonicalCollisionWall(raw.tx, raw.ty, raw.edge, width, height);
    if (!wall) continue;
    const key = collisionWallKey(wall);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(wall);
  }
  return sortCollisionWalls(out);
}

export function placeCollisionWall(doc: EditorMapDoc, tx: number, ty: number, edge: TileEdge): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const wall = canonicalCollisionWall(tx, ty, edge, doc.width, doc.height);
  if (!wall) return doc;
  if (hasCollisionWall(doc.collisionWalls, wall)) return doc;
  return { ...doc, collisionWalls: sortCollisionWalls([...doc.collisionWalls, wall]) };
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

export function hitCollisionWall(
  doc: Pick<EditorMapDoc, "width" | "height" | "collisionWalls">,
  tx: number,
  ty: number,
  edge: TileEdge,
): CollisionWall | null {
  const wall = canonicalCollisionWall(tx, ty, edge, doc.width, doc.height);
  if (!wall || !hasCollisionWall(doc.collisionWalls, wall)) return null;
  return wall;
}

export function visibleCollisionWalls(
  doc: Pick<EditorMapDoc, "collisionWalls">,
  layers: { walls: boolean },
): CollisionWall[] {
  if (!layers.walls) return [];
  return doc.collisionWalls;
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
