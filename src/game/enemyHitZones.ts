/**
 * Generic physical enemy hit zones — authored relative to enemy visual bounds.
 * Coordinates are normalized [0,1] within the enemy's bounding box (top-left origin).
 */

import { TILE } from "./data";

export type HitZoneShape = "ellipse" | "rect";

export type EnemyHitZone = {
  id: string;
  displayName: string;
  shape: HitZoneShape;
  /** Normalized left edge of zone within enemy bounds (0–1). */
  x: number;
  /** Normalized top edge of zone within enemy bounds (0–1). */
  y: number;
  width: number;
  height: number;
  damageMult: number;
  enabled: boolean;
  /** Higher wins when projectile intersects multiple zones. */
  priority: number;
};

export type EnemyBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Canonical HEAD / BODY / LEGS starter set. Multipliers are provisional. */
export function defaultHitZones(): EnemyHitZone[] {
  return [
    {
      id: "head",
      displayName: "HEAD",
      shape: "ellipse",
      x: 0.32,
      y: 0.0,
      width: 0.36,
      height: 0.28,
      damageMult: 1.75,
      enabled: true,
      priority: 30,
    },
    {
      id: "body",
      displayName: "BODY",
      shape: "ellipse",
      x: 0.22,
      y: 0.22,
      width: 0.56,
      height: 0.48,
      damageMult: 1.0,
      enabled: true,
      priority: 20,
    },
    {
      id: "legs",
      displayName: "LEGS",
      shape: "rect",
      x: 0.28,
      y: 0.68,
      width: 0.44,
      height: 0.32,
      damageMult: 0.7,
      enabled: true,
      priority: 10,
    },
  ];
}

/** Legacy fallback — single BODY circle matching current ENEMY_HIT_RADIUS feel. */
export function fallbackBodyHitZones(): EnemyHitZone[] {
  return [
    {
      id: "body",
      displayName: "BODY",
      shape: "ellipse",
      x: 0.15,
      y: 0.15,
      width: 0.7,
      height: 0.7,
      damageMult: 1,
      enabled: true,
      priority: 10,
    },
  ];
}

export function cloneHitZones(zones: readonly EnemyHitZone[]): EnemyHitZone[] {
  return zones.map((z) => ({ ...z }));
}

export function resolveEnemyHitZones(
  authored: readonly EnemyHitZone[] | null | undefined,
): EnemyHitZone[] {
  if (!authored || authored.length === 0) return fallbackBodyHitZones();
  return cloneHitZones(authored);
}

/**
 * World-space bounds for an enemy centered at (cx, cy).
 * Height is taller than width to match upright scav silhouettes.
 */
export function enemyWorldBounds(
  cx: number,
  cy: number,
  size: number,
  scale: number = TILE / 32,
): EnemyBounds {
  const legacyR = TILE * 0.4;
  const w = Math.max(legacyR * 2, size * scale * 1.6);
  const h = Math.max(legacyR * 2.4, size * scale * 2.2);
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
}

export function zoneWorldRect(bounds: EnemyBounds, zone: EnemyHitZone): EnemyBounds {
  return {
    left: bounds.left + zone.x * bounds.width,
    top: bounds.top + zone.y * bounds.height,
    width: zone.width * bounds.width,
    height: zone.height * bounds.height,
  };
}

function pointInZone(px: number, py: number, rect: EnemyBounds, shape: HitZoneShape): boolean {
  if (shape === "rect") {
    return (
      px >= rect.left &&
      px <= rect.left + rect.width &&
      py >= rect.top &&
      py <= rect.top + rect.height
    );
  }
  // Ellipse centered in rect
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const rx = Math.max(1e-6, rect.width / 2);
  const ry = Math.max(1e-6, rect.height / 2);
  const nx = (px - cx) / rx;
  const ny = (py - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

export type HitZoneResolveResult = {
  zone: EnemyHitZone;
  damageMult: number;
};

/**
 * Pick the hit zone containing (hitX, hitY). Deterministic: highest priority wins;
 * ties break by stable definition order (earlier wins).
 */
export function resolveHitZoneAtPoint(
  zones: readonly EnemyHitZone[],
  bounds: EnemyBounds,
  hitX: number,
  hitY: number,
): HitZoneResolveResult | null {
  const enabled = zones.filter((z) => z.enabled);
  let best: EnemyHitZone | null = null;
  let bestIndex = -1;
  for (let i = 0; i < enabled.length; i++) {
    const z = enabled[i]!;
    const rect = zoneWorldRect(bounds, z);
    if (!pointInZone(hitX, hitY, rect, z.shape)) continue;
    if (
      !best ||
      z.priority > best.priority ||
      (z.priority === best.priority && i < bestIndex)
    ) {
      best = z;
      bestIndex = i;
    }
  }
  if (!best) return null;
  return { zone: best, damageMult: best.damageMult };
}

/** Coarse circle radius used as broad-phase before zone tests. */
export function enemyBroadphaseRadius(size: number, scale: number = TILE / 32): number {
  const bounds = enemyWorldBounds(0, 0, size, scale);
  return Math.hypot(bounds.width, bounds.height) / 2;
}

/** Entry fraction t of segment (ax,ay)->(bx,by) into an axis-aligned rect, or null if it never enters. */
function segmentRectEntry(
  ax: number, ay: number, bx: number, by: number, rect: EnemyBounds,
): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  let tMin = 0;
  let tMax = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > tMax) return false;
      if (r > tMin) tMin = r;
    } else {
      if (r < tMin) return false;
      if (r < tMax) tMax = r;
    }
    return true;
  };
  if (!clip(-dx, ax - rect.left)) return null;
  if (!clip(dx, rect.left + rect.width - ax)) return null;
  if (!clip(-dy, ay - rect.top)) return null;
  if (!clip(dy, rect.top + rect.height - ay)) return null;
  return tMin <= tMax ? tMin : null;
}

/** Entry fraction t of segment (ax,ay)->(bx,by) into the ellipse inscribed in rect, or null. */
function segmentEllipseEntry(
  ax: number, ay: number, bx: number, by: number, rect: EnemyBounds,
): number | null {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const rx = Math.max(1e-6, rect.width / 2);
  const ry = Math.max(1e-6, rect.height / 2);
  const ox = (ax - cx) / rx;
  const oy = (ay - cy) / ry;
  const dx = (bx - ax) / rx;
  const dy = (by - ay) / ry;
  const a = dx * dx + dy * dy;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - 1;
  if (a < 1e-12) return c <= 0 ? 0 : null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = (-b - sq) / (2 * a);
  const t1 = (-b + sq) / (2 * a);
  if (t1 < 0 || t0 > 1) return null;
  return Math.max(0, t0);
}

function segmentZoneEntry(
  ax: number, ay: number, bx: number, by: number, rect: EnemyBounds, shape: HitZoneShape,
): number | null {
  return shape === "rect"
    ? segmentRectEntry(ax, ay, bx, by, rect)
    : segmentEllipseEntry(ax, ay, bx, by, rect);
}

export type SegmentHitZoneResult = HitZoneResolveResult & { x: number; y: number };

/**
 * Resolve the first enabled zone the swept segment (ax,ay)->(bx,by) enters.
 *
 * Tests the true zone geometry along the whole segment rather than a single
 * sampled point: a fast projectile or a low frame rate cannot skip clean
 * over a zone narrower than one frame of travel, and the result is
 * independent of how long the segment is. Earliest entry wins; exact ties
 * break by priority, then by definition order (matches resolveHitZoneAtPoint).
 */
export function resolveHitZoneAlongSegment(
  zones: readonly EnemyHitZone[],
  bounds: EnemyBounds,
  ax: number, ay: number, bx: number, by: number,
): SegmentHitZoneResult | null {
  const enabled = zones.filter((z) => z.enabled);
  let best: { zone: EnemyHitZone; t: number; index: number } | null = null;
  for (let i = 0; i < enabled.length; i++) {
    const z = enabled[i]!;
    const t = segmentZoneEntry(ax, ay, bx, by, zoneWorldRect(bounds, z), z.shape);
    if (t == null) continue;
    const better =
      !best ||
      t < best.t - 1e-9 ||
      (Math.abs(t - best.t) <= 1e-9 &&
        (z.priority > best.zone.priority || (z.priority === best.zone.priority && i < best.index)));
    if (better) best = { zone: z, t, index: i };
  }
  if (!best) return null;
  return {
    zone: best.zone,
    damageMult: best.zone.damageMult,
    x: ax + (bx - ax) * best.t,
    y: ay + (by - ay) * best.t,
  };
}
