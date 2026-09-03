/**
 * Physical shooting model: aim direction, dispersion cone, ray tracing,
 * and world intersection for all ranged weapons.
 *
 * Replaces the old abstract accuracy → hit/miss roll with:
 *   aim direction → dispersion cone → sampled ray → physical intersection
 */

import { TILE } from "./data";
import { applyHit, isSettledOut, type KillState } from "./combat";
import {
  traceLineOfSight,
  wallAlongLimit,
  bridgeDeckSeparates,
  type SightPos,
  type WorldPos,
} from "./los";
import type { GameMap } from "./map";
import { mulberry32 } from "./operators/rng";

// ---------------------------------------------------------------------------
// Canonical enemy hit radius
// ---------------------------------------------------------------------------

/** Circle radius used for all ray–enemy intersection tests. */
export const ENEMY_HIT_RADIUS = TILE * 0.4;

// ---------------------------------------------------------------------------
// Aim direction helpers
// ---------------------------------------------------------------------------

/** Normalized 2D direction from origin toward target. */
export function aimDirectionTo(
  ox: number,
  oy: number,
  tx: number,
  ty: number,
): { x: number; y: number } {
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

export function aimAngleTo(
  ox: number,
  oy: number,
  tx: number,
  ty: number,
): number {
  return Math.atan2(ty - oy, tx - ox);
}

// ---------------------------------------------------------------------------
// Accuracy → dispersion mapping
// ---------------------------------------------------------------------------

/**
 * Convert effective accuracy [0.15 … 0.99] to cone half-angle in radians.
 *
 * Mapping is tunable via two parameters:
 *   MAX_CONE  – half-angle at accuracy = 0.15 (worst)
 *   MIN_CONE  – half-angle at accuracy = 0.99 (best)
 *
 * Uses inverse-linear interpolation so mid-range accuracy yields a
 * proportionally noticeable difference.
 */
export const MAX_CONE_RAD = Math.PI / 6;   // 30° half = 60° total at worst accuracy
export const MIN_CONE_RAD = Math.PI / 90;  // 2° half = 4° total at best accuracy
const ACC_MIN = 0.15;
const ACC_MAX = 0.99;

export function accuracyToDispersion(accuracy: number): number {
  const t = Math.max(0, Math.min(1, (accuracy - ACC_MIN) / (ACC_MAX - ACC_MIN)));
  return MAX_CONE_RAD + (MIN_CONE_RAD - MAX_CONE_RAD) * t;
}

/**
 * Canonical shot dispersion for a weapon/operator.
 * Call once at stat resolution time.
 */
export function getShotDispersion(effectiveAccuracy: number): number {
  return accuracyToDispersion(effectiveAccuracy);
}

// ---------------------------------------------------------------------------
// Shot sampling (center-weighted distribution)
// ---------------------------------------------------------------------------

/**
 * Sample an angular deviation within [-halfAngle, +halfAngle].
 * Uses the average of two uniform samples (triangular distribution)
 * for a simple center-weighted feel.
 *
 * @param rng – returns [0,1). Injectable for determinism.
 * @param halfAngle – cone half-angle in radians.
 */
export function sampleShotAngle(rng: () => number, halfAngle: number): number {
  const u1 = rng() * 2 - 1; // [-1, 1]
  const u2 = rng() * 2 - 1;
  const t = (u1 + u2) / 2;  // triangular, [-1, 1], peaks at 0
  return t * halfAngle;
}

/**
 * Sample a full aim angle = base + deviation.
 */
export function sampleShotDirection(
  rng: () => number,
  aimAngle: number,
  halfAngle: number,
): number {
  return aimAngle + sampleShotAngle(rng, halfAngle);
}

// ---------------------------------------------------------------------------
// Injectable combat RNG
// ---------------------------------------------------------------------------

let _combatRng: (() => number) | null = null;

/** Override combat RNG for testing. Pass null to restore Math.random. */
export function setCombatRng(rng: (() => number) | null): void {
  _combatRng = rng;
}

export function combatRng(): number {
  return _combatRng ? _combatRng() : Math.random();
}

/** Create a deterministic combat RNG from a seed. */
export function deterministicCombatRng(seed: number): () => number {
  return mulberry32(seed);
}

// ---------------------------------------------------------------------------
// Ray–circle intersection
// ---------------------------------------------------------------------------

/**
 * Ray from (ox,oy) in direction `angle` up to `maxDist`.
 * Returns distance along ray to the closest point of a circle at (cx,cy,r),
 * or null if no intersection within range.
 *
 * Reuses the same math as shotgun.ts rayHitAlong but returns the entry point.
 */
export function rayCircleIntersect(
  ox: number,
  oy: number,
  angle: number,
  maxDist: number,
  cx: number,
  cy: number,
  radius: number,
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
  // Return the closest approach (entry), clamped to >= 0
  const disc = radius * radius - ((cx - px) * (cx - px) + (cy - py) * (cy - py));
  const entry = along - Math.sqrt(Math.max(0, disc));
  return entry >= 0 ? entry : along;
}

// ---------------------------------------------------------------------------
// Physical ray trace through the world
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
  /** Final endpoint of the ray (miss or last hit). */
  endpoint: WorldPos;
}

/**
 * Trace a physical shot ray through the world and collect intersections.
 *
 * @param origin – pixel position of the shooter
 * @param angle – sampled shot direction
 * @param maxDist – effective weapon range in pixels
 * @param enemies – live enemy list
 * @param hitRadius – enemy hit circle radius
 * @param map – game map for wall/terrain checks
 * @param shooterSurface – surface of the shooter for bridge separation
 * @param pen – penetration value; number of enemies the ray can pass through
 * @param maxPenHits – max enemies hit including first (default 1 = no pen)
 */
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

  // Find wall distance
  const wallDist = wallAlongLimit(map, shooterSurface, endX, endY);
  const effectiveDist = wallDist != null ? Math.min(maxDist, wallDist) : maxDist;

  // Find all enemy intersections within effective distance
  const enemyHits: { id: number; along: number }[] = [];
  for (const e of enemies) {
    if (isSettledOut(e)) continue;
    // Bridge deck separation check
    if (bridgeDeckSeparates(map, shooterSurface, {
      x: e.x, y: e.y, surface: (e.surface as "GROUND" | "HIGH") ?? "GROUND",
    })) continue;
    const along = rayCircleIntersect(
      origin.x, origin.y, angle, effectiveDist,
      e.x, e.y, hitRadius,
    );
    if (along != null) {
      enemyHits.push({ id: e.id, along });
    }
  }
  enemyHits.sort((a, b) => a.along - b.along);

  const hits: RayHit[] = [];
  let hitCount = 0;
  for (const eh of enemyHits) {
    if (hitCount >= maxPenHits) break;
    hits.push({
      type: "enemy",
      enemyId: eh.id,
      along: eh.along,
      x: origin.x + ux * eh.along,
      y: origin.y + uy * eh.along,
    });
    hitCount++;
  }

  // Add wall hit if present and closer than endpoint
  if (wallDist != null && wallDist < maxDist) {
    hits.push({
      type: "wall",
      along: wallDist,
      x: origin.x + ux * wallDist,
      y: origin.y + uy * wallDist,
    });
  }

  hits.sort((a, b) => a.along - b.along);

  // Determine endpoint
  const lastHit = hits[hits.length - 1];
  const endpoint = lastHit
    ? { x: lastHit.x, y: lastHit.y }
    : { x: origin.x + ux * effectiveDist, y: origin.y + uy * effectiveDist };

  return { angle, hits, endpoint };
}

// ---------------------------------------------------------------------------
// Resolve a single physical rifle shot
// ---------------------------------------------------------------------------

export interface PhysicalShotConfig {
  origin: { x: number; y: number };
  shooterSurface: SightPos;
  aimAngle: number;
  accuracy: number;
  range: number;
  damage: number;
  pen: number;
  enemies: Array<KillState & { id: number; x: number; y: number; surface?: string }>;
  armorOf: (e: { id: number; kind?: string }) => number;
  map: GameMap;
  hitRadius?: number;
  maxPenHits?: number;
  rng?: () => number;
}

export interface PhysicalShotResult {
  shotAngle: number;
  dispersion: number;
  hits: Array<{ enemyId: number; along: number; damage: number }>;
  endpoint: WorldPos;
  miss: boolean;
}

/**
 * Resolve a single physical firearm shot.
 * This is the canonical replacement for the old accuracy→hit/miss roll.
 */
export function resolvePhysicalShot(cfg: PhysicalShotConfig): PhysicalShotResult {
  const rng = cfg.rng ?? (() => combatRng());
  const dispersion = getShotDispersion(cfg.accuracy);
  const shotAngle = sampleShotDirection(rng, cfg.aimAngle, dispersion);
  const hitRadius = cfg.hitRadius ?? ENEMY_HIT_RADIUS;
  const maxPenHits = cfg.maxPenHits ?? (cfg.pen > 0 ? 2 : 1);

  const trace = traceShot({
    origin: cfg.origin,
    shooterSurface: cfg.shooterSurface,
    angle: shotAngle,
    maxDist: cfg.range,
    enemies: cfg.enemies,
    hitRadius,
    map: cfg.map,
    pen: cfg.pen,
    maxPenHits,
  });

  const hits: PhysicalShotResult["hits"] = [];
  const enemyHits = trace.hits.filter((h) => h.type === "enemy");

  // Apply damage through wall-truncated hits only
  // First, find where walls stop the ray
  const firstWall = trace.hits.find((h) => h.type === "wall");
  const wallAlong = firstWall?.along ?? Infinity;

  for (let i = 0; i < enemyHits.length; i++) {
    const h = enemyHits[i]!;
    if (h.along > wallAlong) break; // wall stops further penetration
    const enemy = cfg.enemies.find((e) => e.id === h.enemyId);
    if (!enemy || isSettledOut(enemy)) continue;
    const dmgMult = i === 0 ? 1 : 0.5; // penetration damage falloff
    const dmg = cfg.damage * dmgMult;
    const armor = cfg.armorOf(enemy);
    const dealt = applyHit(enemy, dmg, armor, cfg.pen);
    hits.push({ enemyId: h.enemyId!, along: h.along, damage: dealt });
  }

  return {
    shotAngle,
    dispersion,
    hits,
    endpoint: trace.endpoint,
    miss: hits.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Unified shot pattern resolver (rifle = 1 ray, shotgun = N rays)
// ---------------------------------------------------------------------------

export interface ShotPatternConfig {
  origin: { x: number; y: number };
  shooterSurface: SightPos;
  aimAngle: number;
  accuracy: number;
  range: number;
  damage: number;
  pen: number;
  enemies: Array<KillState & { id: number; x: number; y: number; surface?: string }>;
  armorOf: (e: { id: number; kind?: string }) => number;
  map: GameMap;
  /** Number of rays. 1 = rifle, N = shotgun pellets. */
  rayCount: number;
  /** Shotgun pellet spread half-angle. 0 for rifles. */
  pelletSpread?: number;
  hitRadius?: number;
  maxPenHits?: number;
  /** Shotgun secondary hit damage multiplier. */
  secondaryHitMult?: number;
  rng?: () => number;
}

export interface ShotPatternResult {
  shots: PhysicalShotResult[];
  /** All tracer endpoints for rendering. */
  tracers: Array<{ angle: number; endpoint: WorldPos }>;
}

/**
 * Resolve a complete shot pattern.
 * For rifles: single ray with aim dispersion.
 * For shotguns: multiple pellet rays spread around aim direction.
 */
export function resolveShotPattern(cfg: ShotPatternConfig): ShotPatternResult {
  const rng = cfg.rng ?? (() => combatRng());
  const shots: PhysicalShotResult[] = [];
  const tracers: ShotPatternResult["tracers"] = [];

  if (cfg.rayCount <= 1) {
    // Single rifle shot
    const result = resolvePhysicalShot({ ...cfg, rng });
    shots.push(result);
    tracers.push({ angle: result.shotAngle, endpoint: result.endpoint });
  } else {
    // Shotgun: pellets evenly spread, each with aim dispersion overlay
    const pelletSpread = cfg.pelletSpread ?? 0;
    for (let i = 0; i < cfg.rayCount; i++) {
      const t = cfg.rayCount === 1 ? 0 : i / (cfg.rayCount - 1);
      const baseAngle = cfg.aimAngle + (t - 0.5) * 2 * pelletSpread;
      // Add smaller dispersion per pellet for organic feel
      const pelletDispersion = getShotDispersion(cfg.accuracy) * 0.3;
      const deviation = sampleShotAngle(rng, pelletDispersion);
      const pelletAngle = baseAngle + deviation;

      const trace = traceShot({
        origin: cfg.origin,
        shooterSurface: cfg.shooterSurface,
        angle: pelletAngle,
        maxDist: cfg.range,
        enemies: cfg.enemies,
        hitRadius: cfg.hitRadius ?? ENEMY_HIT_RADIUS,
        map: cfg.map,
        pen: cfg.pen,
        maxPenHits: cfg.maxPenHits ?? 2,
      });

      const enemyHits = trace.hits.filter((h) => h.type === "enemy");
      const firstWall = trace.hits.find((h) => h.type === "wall");
      const wallAlong = firstWall?.along ?? Infinity;
      const pelletHits: PhysicalShotResult["hits"] = [];

      for (let j = 0; j < enemyHits.length; j++) {
        const h = enemyHits[j]!;
        if (h.along > wallAlong) break;
        const enemy = cfg.enemies.find((e) => e.id === h.enemyId);
        if (!enemy || isSettledOut(enemy)) continue;
        const mult = j === 0 ? 1 : (cfg.secondaryHitMult ?? 0.5);
        const dmg = cfg.damage * mult;
        const armor = cfg.armorOf(enemy);
        const dealt = applyHit(enemy, dmg, armor, cfg.pen);
        pelletHits.push({ enemyId: h.enemyId!, along: h.along, damage: dealt });
      }

      shots.push({
        shotAngle: pelletAngle,
        dispersion: pelletDispersion,
        hits: pelletHits,
        endpoint: trace.endpoint,
        miss: pelletHits.length === 0,
      });
      tracers.push({ angle: pelletAngle, endpoint: trace.endpoint });
    }
  }

  return { shots, tracers };
}

// ---------------------------------------------------------------------------
// HOLD ANGLE state
// ---------------------------------------------------------------------------

export interface HoldAngleState {
  angle: number;
  /** World point the player clicked. For UI. */
  targetPoint: WorldPos;
}

/**
 * Check if an enemy is inside a firing sector defined by a center angle
 * and half-angle width.
 */
export function isInFiringSector(
  originX: number,
  originY: number,
  centerAngle: number,
  halfAngle: number,
  enemyX: number,
  enemyY: number,
): boolean {
  const angleToEnemy = Math.atan2(enemyY - originY, enemyX - originX);
  let diff = angleToEnemy - centerAngle;
  // Normalize to [-PI, PI]
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff) <= halfAngle;
}
