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
