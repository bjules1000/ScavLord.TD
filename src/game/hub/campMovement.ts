import type { CampStationProp } from "./campMap";

/** Held-direction input for walking the camp. Diagonal input is normalized, not faster. */
export interface CampMoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface CampBounds {
  width: number;
  height: number;
}

/** Optional tile-occupancy collision. blocked() takes tile coordinates, not pixels. */
export interface CampCollision {
  tileSize: number;
  blocked: (tx: number, ty: number) => boolean;
}

/**
 * Continuous free-roam movement for the camp hub. Pixel space (0..width, 0..height), no
 * pathfinding/LOS/elevation — a much smaller tool than the raid's stepDirectMove (which
 * requires a full GameMap). Collision is axis-separated tile-slide against `collision.blocked`
 * (each axis is attempted independently, so sliding along a wall works) plus the camp bounds.
 */
export function stepCampMove(
  x: number,
  y: number,
  input: CampMoveInput,
  dt: number,
  speedPx: number,
  bounds: CampBounds,
  collision?: CampCollision,
): { x: number; y: number } {
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
  }
  const step = Math.max(0, speedPx * dt);

  const blockedAt = (px: number, py: number): boolean => {
    if (!collision) return false;
    return collision.blocked(Math.floor(px / collision.tileSize), Math.floor(py / collision.tileSize));
  };

  let nx = Math.max(0, Math.min(bounds.width, x + dx * step));
  if (blockedAt(nx, y)) nx = x;

  let ny = Math.max(0, Math.min(bounds.height, y + dy * step));
  if (blockedAt(nx, ny)) ny = y;

  return { x: nx, y: ny };
}

/**
 * Closest station (a prop with a hubAction) within radiusPx of (x, y), or null if none are
 * close enough. Distance is to the nearest point on the station's tile, not its center, so a
 * station is "in range" as soon as you're near any edge of its tile. Ties (equal distance)
 * resolve to whichever station comes first in the array, for determinism. Decorative props
 * (no hubAction) are never returned.
 */
export function nearestStation(
  x: number,
  y: number,
  props: readonly CampStationProp[],
  tileSize: number,
  radiusPx: number,
): CampStationProp | null {
  let best: CampStationProp | null = null;
  let bestDist = radiusPx;
  for (const prop of props) {
    if (prop.hubAction == null) continue;
    const bx = prop.tx * tileSize;
    const by = prop.ty * tileSize;
    const nearestX = Math.max(bx, Math.min(x, bx + tileSize));
    const nearestY = Math.max(by, Math.min(y, by + tileSize));
    const dist = Math.hypot(x - nearestX, y - nearestY);
    if (dist < bestDist) {
      bestDist = dist;
      best = prop;
    }
  }
  return best;
}
