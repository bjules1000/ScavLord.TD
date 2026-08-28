import { applyHit, isSettledOut, type KillState } from "./combat";
import { TILE } from "./data";
import type { WeaponDef } from "./gear";

/** Disc radius for a pellet trace vs an enemy point. */
export const PELLET_HIT_RADIUS = TILE * 0.4;

export const DEFAULT_MAX_PELLET_HITS = 2;
export const DEFAULT_SECONDARY_HIT_MULT = 0.5;

export interface PelletBody extends KillState {
  id: number;
  x: number;
  y: number;
}

export interface PelletStrike {
  enemyId: number;
  along: number;
  damage: number;
  rank: "primary" | "secondary";
}

export function isShotgunWeapon(weapon: WeaponDef): boolean {
  return weapon.cls === "shotgun";
}

export function shotgunPelletCount(weapon: WeaponDef): number {
  return Math.max(1, weapon.pellets ?? 1);
}

export function shotgunMaxHits(weapon: WeaponDef): number {
  return weapon.maxPelletHits ?? DEFAULT_MAX_PELLET_HITS;
}

export function shotgunSecondaryMult(weapon: WeaponDef): number {
  return weapon.secondaryHitMult ?? DEFAULT_SECONDARY_HIT_MULT;
}

/** Even cone around aim. Spread is half-angle in radians. */
export function pelletAngles(aim: number, count: number, spread: number): number[] {
  if (count <= 1) return [aim];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    out.push(aim + (t - 0.5) * 2 * spread);
  }
  return out;
}

/** Distance along a ray if the body circle intersects the segment, else null. */
export function rayHitAlong(
  ox: number,
  oy: number,
  angle: number,
  range: number,
  radius: number,
  ex: number,
  ey: number,
): number | null {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = ex - ox;
  const vy = ey - oy;
  const along = vx * ux + vy * uy;
  if (along < 0 || along > range) return null;
  const px = ox + ux * along;
  const py = oy + uy * along;
  if (Math.hypot(ex - px, ey - py) > radius) return null;
  return along;
}

export function pelletIntersections(
  ox: number,
  oy: number,
  angle: number,
  range: number,
  radius: number,
  enemies: readonly PelletBody[],
): { id: number; along: number }[] {
  const hits: { id: number; along: number }[] = [];
  for (const e of enemies) {
    if (isSettledOut(e)) continue;
    const along = rayHitAlong(ox, oy, angle, range, radius, e.x, e.y);
    if (along == null) continue;
    hits.push({ id: e.id, along });
  }
  hits.sort((a, b) => (a.along !== b.along ? a.along - b.along : a.id - b.id));
  return hits;
}

export function strikesForPellet(
  intersections: readonly { id: number; along: number }[],
  primaryDamage: number,
  secondaryMult: number,
  maxHits: number,
): PelletStrike[] {
  const cap = Math.max(1, maxHits);
  const out: PelletStrike[] = [];
  for (let i = 0; i < intersections.length && i < cap; i++) {
    const hit = intersections[i]!;
    out.push({
      enemyId: hit.id,
      along: hit.along,
      damage: i === 0 ? primaryDamage : primaryDamage * secondaryMult,
      rank: i === 0 ? "primary" : "secondary",
    });
  }
  return out;
}

/** Resolve one shotgun blast. Damage is applied through applyHit. */
export function resolveShotgunBlast<T extends PelletBody>(args: {
  origin: { x: number; y: number };
  aim: number;
  range: number;
  hitRadius: number;
  pelletCount: number;
  spread: number;
  primaryDamage: number;
  secondaryMult: number;
  maxHits: number;
  enemies: T[];
  armorOf: (e: T) => number;
  pen: number;
}): { strikes: PelletStrike[]; angles: number[] } {
  const angles = pelletAngles(args.aim, args.pelletCount, args.spread);
  const strikes: PelletStrike[] = [];
  for (const angle of angles) {
    const intersections = pelletIntersections(
      args.origin.x,
      args.origin.y,
      angle,
      args.range,
      args.hitRadius,
      args.enemies,
    );
    const pelletStrikes = strikesForPellet(
      intersections,
      args.primaryDamage,
      args.secondaryMult,
      args.maxHits,
    );
    for (const s of pelletStrikes) {
      const enemy = args.enemies.find((e) => e.id === s.enemyId);
      if (!enemy || isSettledOut(enemy)) continue;
      applyHit(enemy, s.damage, args.armorOf(enemy), args.pen);
      strikes.push(s);
    }
  }
  return { strikes, angles };
}
