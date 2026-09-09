import type { HubHotspot } from "./hotspots";

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

/**
 * Continuous free-roam movement for the camp hub. Image-pixel space (0..width, 0..height),
 * no tile grid — the camp has no pathfinding/LOS/elevation, so this is a much smaller tool
 * than the raid's stepDirectMove (which requires a full GameMap). Collision is just the
 * camp image bounds for now; scenery collision can be added later without changing this shape.
 */
export function stepCampMove(
  x: number,
  y: number,
  input: CampMoveInput,
  dt: number,
  speedPx: number,
  bounds: CampBounds,
): { x: number; y: number } {
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
  }
  const step = Math.max(0, speedPx * dt);
  const nx = Math.max(0, Math.min(bounds.width, x + dx * step));
  const ny = Math.max(0, Math.min(bounds.height, y + dy * step));
  return { x: nx, y: ny };
}

/**
 * Closest enabled, actionable station within radiusPx of (x, y), or null if none are close
 * enough. Distance is to the nearest point on the station's box, not its center, so a large
 * station is "in range" as soon as you're near any edge of it. Ties (equal distance) resolve
 * to whichever station comes first in the array, for determinism.
 */
export function nearestStation(
  x: number,
  y: number,
  stations: readonly HubHotspot[],
  imageWidth: number,
  imageHeight: number,
  radiusPx: number,
): HubHotspot | null {
  let best: HubHotspot | null = null;
  let bestDist = radiusPx;
  for (const station of stations) {
    if (!station.enabled || !station.action) continue;
    const bx = (station.xPercent / 100) * imageWidth;
    const by = (station.yPercent / 100) * imageHeight;
    const bw = (station.widthPercent / 100) * imageWidth;
    const bh = (station.heightPercent / 100) * imageHeight;
    const nearestX = Math.max(bx, Math.min(x, bx + bw));
    const nearestY = Math.max(by, Math.min(y, by + bh));
    const dist = Math.hypot(x - nearestX, y - nearestY);
    if (dist < bestDist) {
      bestDist = dist;
      best = station;
    }
  }
  return best;
}
