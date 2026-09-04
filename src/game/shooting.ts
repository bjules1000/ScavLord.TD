/**
 * Physical shooting model: aim direction, dispersion cone, traveling
 * projectiles, and runtime collision for all ranged weapons.
 *
 * Damage is applied ONLY on physical projectile impact, never at trigger time.
 */

import { TILE } from "./data";
import { applyHit, isSettledOut, type KillState } from "./combat";
import {
  wallAlongLimit,
  bridgeDeckSeparates,
  type SightPos,
  type WorldPos,
} from "./los";
import type { GameMap } from "./map";
import { mulberry32 } from "./operators/rng";

// ---------------------------------------------------------------------------
// Canonical constants
// ---------------------------------------------------------------------------

/** Circle radius used for all ray–enemy intersection tests. */
export const ENEMY_HIT_RADIUS = TILE * 0.4;

/**
 * Canonical gameplay bullet speed in pixels per second.
 * Fast enough to feel responsive, slow enough to be readable.
 */
export const DEFAULT_BULLET_SPEED = 18 * TILE; // ~18 tiles/sec

// ---------------------------------------------------------------------------
// Aim direction helpers
// ---------------------------------------------------------------------------

export function aimDirectionTo(
  ox: number, oy: number, tx: number, ty: number,
): { x: number; y: number } {
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

export function aimAngleTo(
  ox: number, oy: number, tx: number, ty: number,
): number {
  return Math.atan2(ty - oy, tx - ox);
}

// ---------------------------------------------------------------------------
// Accuracy → dispersion mapping
// ---------------------------------------------------------------------------

export const MAX_CONE_RAD = Math.PI / 6;   // 30° half at worst accuracy
export const MIN_CONE_RAD = Math.PI / 90;  // 2° half at best accuracy
const ACC_MIN = 0.15;
const ACC_MAX = 0.99;

export function accuracyToDispersion(accuracy: number): number {
  const t = Math.max(0, Math.min(1, (accuracy - ACC_MIN) / (ACC_MAX - ACC_MIN)));
  return MAX_CONE_RAD + (MIN_CONE_RAD - MAX_CONE_RAD) * t;
}

export function getShotDispersion(effectiveAccuracy: number): number {
  return accuracyToDispersion(effectiveAccuracy);
}

// ---------------------------------------------------------------------------
// Shot sampling — UNIFORM distribution across full cone
// ---------------------------------------------------------------------------

/**
 * Sample an angular deviation within [-halfAngle, +halfAngle].
 * Uniform distribution: every direction in the cone is equally likely.
 */
export function sampleShotAngle(rng: () => number, halfAngle: number): number {
  return (rng() * 2 - 1) * halfAngle;
}

export function sampleShotDirection(
  rng: () => number, aimAngle: number, halfAngle: number,
): number {
  return aimAngle + sampleShotAngle(rng, halfAngle);
}

// ---------------------------------------------------------------------------
// Injectable combat RNG
// ---------------------------------------------------------------------------

let _combatRng: (() => number) | null = null;

export function setCombatRng(rng: (() => number) | null): void {
  _combatRng = rng;
}

export function combatRng(): number {
  return _combatRng ? _combatRng() : Math.random();
}

export function deterministicCombatRng(seed: number): () => number {
  return mulberry32(seed);
}

// ---------------------------------------------------------------------------
// Ray–circle intersection (used by projectile tick collision)
// ---------------------------------------------------------------------------

/**
 * Segment-circle intersection test.
 * Returns distance along segment from (ox,oy) to first intersection with
 * circle at (cx,cy,r), or null if no intersection within maxDist.
 */
export function rayCircleIntersect(
  ox: number, oy: number,
  angle: number, maxDist: number,
  cx: number, cy: number, radius: number,
): number | null {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = cx - ox;
  const vy = cy - oy;
  const along = vx * ux + vy * uy;
  if (along < 0 || along > maxDist) return null;
  const px = ox + ux * along;
  const py = oy + uy * along;
  if (Math.hypot(cx - px, cy - py) > radius) return null;
  const disc = radius * radius - ((cx - px) * (cx - px) + (cy - py) * (cy - py));
  const entry = along - Math.sqrt(Math.max(0, disc));
  return entry >= 0 ? entry : along;
}

/**
 * Segment-circle intersection for a segment from (ax,ay) to (bx,by).
 * Returns parametric t in [0,1] of first intersection, or null.
 */
export function segmentCircleHit(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number, radius: number,
): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const ux = dx / len;
  const uy = dy / len;
  const vx = cx - ax;
  const vy = cy - ay;
  const along = vx * ux + vy * uy;
  if (along < -radius || along > len + radius) return null;
  const clampedAlong = Math.max(0, Math.min(len, along));
  const px = ax + ux * clampedAlong;
  const py = ay + uy * clampedAlong;
  if (Math.hypot(cx - px, cy - py) > radius) return null;
  const disc = radius * radius - ((cx - (ax + ux * along)) * (cx - (ax + ux * along)) + (cy - (ay + uy * along)) * (cy - (ay + uy * along)));
  const entry = along - Math.sqrt(Math.max(0, disc));
  const t = Math.max(0, entry) / len;
  return t >= 0 && t <= 1 ? t : (along >= 0 && along <= len ? Math.max(0, along / len) : null);
}

// ---------------------------------------------------------------------------
// Projectile runtime type
// ---------------------------------------------------------------------------

export interface Projectile {
  id: number;
  /** Shooter tower id for kill attribution. */
  shooterId: number;
  /** Position. */
  x: number;
  y: number;
  /** Previous position (for segment collision). */
  px: number;
  py: number;
  /** Fixed direction unit vector. */
  dx: number;
  dy: number;
  /** Fixed angle. */
  angle: number;
  /** Speed in px/sec. */
  speed: number;
  /** Remaining travel distance in px. */
  remaining: number;
  /** Damage to apply on hit. */
  damage: number;
  /** Penetration value for armor. */
  pen: number;
  /** Splash radius (0 = none). */
  splash: number;
  /** Remaining penetrations through enemies (0 = stop on first). */
  remainingPen: number;
  /** IDs of enemies already hit by this projectile. */
  hitIds: number[];
  /** Weapon accent color. */
  color: string;
  /** Shooter surface for bridge separation. */
  surface: string;
  /** Damage multiplier for secondary pen hits. */
  penDamageMult: number;
  /** Whether this is a shotgun pellet. */
  pellet?: boolean | undefined;
  /** Mark for removal. */
  dead?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Spawn projectile at trigger time (NO damage applied)
// ---------------------------------------------------------------------------

export interface SpawnProjectileArgs {
  id: number;
  shooterId: number;
  origin: { x: number; y: number };
  angle: number;
  speed?: number | undefined;
  range: number;
  damage: number;
  pen: number;
  splash?: number | undefined;
  maxPenHits?: number | undefined;
  color: string;
  surface: string;
  penDamageMult?: number | undefined;
  pellet?: boolean | undefined;
}

export function spawnProjectile(args: SpawnProjectileArgs): Projectile {
  const dx = Math.cos(args.angle);
  const dy = Math.sin(args.angle);
  return {
    id: args.id,
    shooterId: args.shooterId,
    x: args.origin.x,
    y: args.origin.y,
    px: args.origin.x,
    py: args.origin.y,
    dx,
    dy,
    angle: args.angle,
    speed: args.speed ?? DEFAULT_BULLET_SPEED,
    remaining: args.range,
    damage: args.damage,
    pen: args.pen,
    splash: args.splash ?? 0,
    remainingPen: (args.maxPenHits ?? (args.pen > 0 ? 2 : 1)) - 1,
    hitIds: [],
    color: args.color,
    surface: args.surface,
    penDamageMult: args.penDamageMult ?? 0.5,
    pellet: args.pellet,
  };
}

// ---------------------------------------------------------------------------
// Projectile tick: advance + collision
// ---------------------------------------------------------------------------

export interface ProjectileTickEnemy {
  id: number;
  x: number;
  y: number;
  hp: number;
  surface?: string;
  leaked?: boolean;
  counted?: boolean;
  kind?: string;
}

export interface ProjectileHitEvent {
  projectileId: number;
  shooterId: number;
  enemyId: number;
  x: number;
  y: number;
  damage: number;
  pen: number;
  killed: boolean;
  /** Resolved physical hit zone id when zones are authored. */
  hitZoneId?: string | null;
  hitZoneMult?: number;
}

export interface ProjectileTickResult {
  hits: ProjectileHitEvent[];
  /** Splash detonation events. */
  splashes: Array<{ x: number; y: number; radius: number; damage: number; pen: number; shooterId: number }>;
  /** Miss endpoints for VFX. */
  misses: Array<{ x: number; y: number }>;
}

export type ProjectileHitZoneQuery = (
  enemy: ProjectileTickEnemy,
  hitX: number,
  hitY: number,
) => { damageMult: number; zoneId: string | null } | null;

/**
 * Advance a single projectile by dt seconds.
 * Tests segment (old pos → new pos) against enemies and walls.
 * Mutates the projectile in place. Sets `dead = true` when finished.
 * Returns hit events for the caller to process (kill credit, FX, etc.).
 *
 * Hit-zone rule: broadphase circle first; then if `hitZoneOf` is provided,
 * the impact point must land in an enabled zone. Missing zones → no damage.
 * Overlap: highest zone priority wins (see enemyHitZones.resolveHitZoneAtPoint).
 */
export function tickProjectile(
  p: Projectile,
  dt: number,
  enemies: readonly ProjectileTickEnemy[],
  armorOf: (e: ProjectileTickEnemy) => number,
  map: GameMap,
  hitRadius: number = ENEMY_HIT_RADIUS,
  hitZoneOf?: ProjectileHitZoneQuery,
  radiusOf?: (e: ProjectileTickEnemy) => number,
): ProjectileTickResult {
  if (p.dead) return { hits: [], splashes: [], misses: [] };

  const step = p.speed * dt;
  const travel = Math.min(step, p.remaining);
  if (travel <= 0) {
    p.dead = true;
    return { hits: [], splashes: [], misses: [{ x: p.x, y: p.y }] };
  }

  // Store previous position
  p.px = p.x;
  p.py = p.y;

  // Compute new position
  const nx = p.x + p.dx * travel;
  const ny = p.y + p.dy * travel;

  // Check wall collision along this segment
  const shooterSurface: SightPos = { x: p.px, y: p.py, surface: p.surface as "GROUND" | "HIGH" };
  const wallDist = wallAlongLimit(map, shooterSurface, nx, ny);
  let effectiveTravel = travel;
  let hitWall = false;
  if (wallDist != null) {
    const segLen = Math.hypot(nx - p.px, ny - p.py);
    if (wallDist < segLen + 1) {
      effectiveTravel = Math.min(travel, wallDist * (travel / Math.max(1e-9, segLen)));
      hitWall = true;
    }
  }

  const ex = p.px + p.dx * effectiveTravel;
  const ey = p.py + p.dy * effectiveTravel;

  const hits: ProjectileHitEvent[] = [];
  const splashes: ProjectileTickResult["splashes"] = [];

  // Collect all enemy intersections along this segment
  const candidates: { enemy: ProjectileTickEnemy; t: number }[] = [];
  for (const e of enemies) {
    if (isSettledOut(e as KillState)) continue;
    if (p.hitIds.includes(e.id)) continue;
    if (bridgeDeckSeparates(map, shooterSurface, {
      x: e.x, y: e.y, surface: (e.surface as "GROUND" | "HIGH") ?? "GROUND",
    })) continue;
    const r = radiusOf ? radiusOf(e) : hitRadius;
    const t = segmentCircleHit(p.px, p.py, ex, ey, e.x, e.y, r);
    if (t != null) candidates.push({ enemy: e, t });
  }
  candidates.sort((a, b) => a.t - b.t);

  for (const c of candidates) {
    if (p.dead) break;
    const e = c.enemy;
    if (isSettledOut(e as KillState)) continue;

    const hitX = p.px + (ex - p.px) * c.t;
    const hitY = p.py + (ey - p.py) * c.t;

    let zoneMult = 1;
    let zoneId: string | null = null;
    if (hitZoneOf) {
      const zone = hitZoneOf(e, hitX, hitY);
      if (!zone) {
        // Broadphase hit but missed all enabled zones — skip this enemy.
        continue;
      }
      zoneMult = zone.damageMult;
      zoneId = zone.zoneId;
    }

    if (p.splash > 0) {
      splashes.push({
        x: hitX,
        y: hitY,
        radius: p.splash,
        damage: p.damage * zoneMult,
        pen: p.pen,
        shooterId: p.shooterId,
      });
      p.dead = true;
      p.x = hitX;
      p.y = hitY;
      break;
    }

    const dmgMult = (p.hitIds.length === 0 ? 1 : p.penDamageMult) * zoneMult;
    const dealt = applyHit(e as KillState, p.damage * dmgMult, armorOf(e), p.pen);
    p.hitIds.push(e.id);

    const killed = (e as KillState).hp <= 0;
    hits.push({
      projectileId: p.id,
      shooterId: p.shooterId,
      enemyId: e.id,
      x: hitX,
      y: hitY,
      damage: dealt,
      pen: p.pen,
      killed,
      hitZoneId: zoneId,
      hitZoneMult: zoneMult,
    });

    if (p.remainingPen <= 0) {
      p.dead = true;
      p.x = hitX;
      p.y = hitY;
      break;
    }
    p.remainingPen--;
  }

  if (!p.dead) {
    if (hitWall) {
      p.x = p.px + p.dx * effectiveTravel;
      p.y = p.py + p.dy * effectiveTravel;
      p.dead = true;
    } else {
      p.x = nx;
      p.y = ny;
      p.remaining -= travel;
      if (p.remaining <= 0) {
        p.dead = true;
      }
    }
  }

  const misses: ProjectileTickResult["misses"] = [];
  if (p.dead && hits.length === 0 && splashes.length === 0) {
    misses.push({ x: p.x, y: p.y });
  }

  return { hits, splashes, misses };
}

// ---------------------------------------------------------------------------
// Spawn helpers for firing loop
// ---------------------------------------------------------------------------

/**
 * Create projectile(s) for a rifle shot.
 * Samples direction from uniform cone. Does NOT apply damage.
 */
export function spawnRifleShot(args: {
  nextId: () => number;
  shooterId: number;
  origin: { x: number; y: number };
  aimAngle: number;
  accuracy: number;
  range: number;
  damage: number;
  pen: number;
  splash?: number | undefined;
  maxPenHits?: number | undefined;
  color: string;
  surface: string;
  speed?: number | undefined;
  rng?: (() => number) | undefined;
}): Projectile {
  const rng = args.rng ?? (() => combatRng());
  const dispersion = getShotDispersion(args.accuracy);
  const shotAngle = sampleShotDirection(rng, args.aimAngle, dispersion);
  return spawnProjectile({
    id: args.nextId(),
    shooterId: args.shooterId,
    origin: args.origin,
    angle: shotAngle,
    speed: args.speed,
    range: args.range,
    damage: args.damage,
    pen: args.pen,
    splash: args.splash,
    maxPenHits: args.maxPenHits,
    color: args.color,
    surface: args.surface,
  });
}

/**
 * Create projectiles for a shotgun blast.
 * Each pellet is its own traveling projectile.
 */
export function spawnShotgunBlast(args: {
  nextId: () => number;
  shooterId: number;
  origin: { x: number; y: number };
  aimAngle: number;
  accuracy: number;
  range: number;
  damage: number;
  pen: number;
  pelletCount: number;
  pelletSpread: number;
  maxPenHits?: number | undefined;
  secondaryHitMult?: number | undefined;
  color: string;
  surface: string;
  speed?: number | undefined;
  rng?: (() => number) | undefined;
}): Projectile[] {
  const rng = args.rng ?? (() => combatRng());
  const pellets: Projectile[] = [];
  const aimDispersion = getShotDispersion(args.accuracy) * 0.3;
  for (let i = 0; i < args.pelletCount; i++) {
    const t = args.pelletCount === 1 ? 0 : i / (args.pelletCount - 1);
    const baseAngle = args.aimAngle + (t - 0.5) * 2 * args.pelletSpread;
    const deviation = sampleShotAngle(rng, aimDispersion);
    const pelletAngle = baseAngle + deviation;
    pellets.push(spawnProjectile({
      id: args.nextId(),
      shooterId: args.shooterId,
      origin: args.origin,
      angle: pelletAngle,
      speed: args.speed ?? DEFAULT_BULLET_SPEED * 0.85,
      range: args.range,
      damage: args.damage,
      pen: args.pen,
      maxPenHits: args.maxPenHits ?? 2,
      color: args.color,
      surface: args.surface,
      penDamageMult: args.secondaryHitMult ?? 0.5,
      pellet: true,
    }));
  }
  return pellets;
}

// ---------------------------------------------------------------------------
// Legacy resolvers (kept for tests that use them)
// ---------------------------------------------------------------------------

export interface RayHit {
  type: "enemy" | "wall";
  enemyId?: number;
  along: number;
  x: number;
  y: number;
}

export interface ShotResult {
  angle: number;
  hits: RayHit[];
  endpoint: WorldPos;
}

export function traceShot<T extends KillState & { id: number; x: number; y: number; surface?: string }>(args: {
  origin: { x: number; y: number };
  shooterSurface: SightPos;
  angle: number;
  maxDist: number;
  enemies: readonly T[];
  hitRadius: number;
  map: GameMap;
  pen: number;
  maxPenHits?: number;
}): ShotResult {
  const { origin, shooterSurface, angle, maxDist, enemies, hitRadius, map, pen } = args;
  const maxPenHits = args.maxPenHits ?? (pen > 0 ? 2 : 1);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const endX = origin.x + ux * maxDist;
  const endY = origin.y + uy * maxDist;

  const wallDist = wallAlongLimit(map, shooterSurface, endX, endY);
  const effectiveDist = wallDist != null ? Math.min(maxDist, wallDist) : maxDist;

  const enemyHits: { id: number; along: number }[] = [];
  for (const e of enemies) {
    if (isSettledOut(e)) continue;
    if (bridgeDeckSeparates(map, shooterSurface, {
      x: e.x, y: e.y, surface: (e.surface as "GROUND" | "HIGH") ?? "GROUND",
    })) continue;
    const along = rayCircleIntersect(origin.x, origin.y, angle, effectiveDist, e.x, e.y, hitRadius);
    if (along != null) enemyHits.push({ id: e.id, along });
  }
  enemyHits.sort((a, b) => a.along - b.along);

  const hits: RayHit[] = [];
  let hitCount = 0;
  for (const eh of enemyHits) {
    if (hitCount >= maxPenHits) break;
    hits.push({ type: "enemy", enemyId: eh.id, along: eh.along, x: origin.x + ux * eh.along, y: origin.y + uy * eh.along });
    hitCount++;
  }
  if (wallDist != null && wallDist < maxDist) {
    hits.push({ type: "wall", along: wallDist, x: origin.x + ux * wallDist, y: origin.y + uy * wallDist });
  }
  hits.sort((a, b) => a.along - b.along);
  const lastHit = hits[hits.length - 1];
  const endpoint = lastHit ? { x: lastHit.x, y: lastHit.y } : { x: origin.x + ux * effectiveDist, y: origin.y + uy * effectiveDist };
  return { angle, hits, endpoint };
}

// ---------------------------------------------------------------------------
// HOLD ANGLE
// ---------------------------------------------------------------------------

export interface HoldAngleState {
  angle: number;
  targetPoint: WorldPos;
}

export function isInFiringSector(
  originX: number, originY: number,
  centerAngle: number, halfAngle: number,
  enemyX: number, enemyY: number,
): boolean {
  const angleToEnemy = Math.atan2(enemyY - originY, enemyX - originX);
  let diff = angleToEnemy - centerAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff) <= halfAngle;
}
