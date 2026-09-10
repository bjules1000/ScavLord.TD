/**
 * Hub shooting-range logic. Reuses the real raid formulas and projectile machinery
 * (accuracy → dispersion, weapon fitting, damage-after-armor, Projectile creation) so
 * a shot here is numerically identical to the same shot in a raid — same accuracy,
 * range, and damage. The one thing NOT reused is tickProjectile's wall collision
 * (it needs a raid GameMap the hub doesn't have); tickHubProjectile below is the same
 * advance-and-collide shape minus walls, since the range has none.
 */

import { TILE } from "../data";
import { applyAttachmentMods, type WeaponDef } from "../gear";
import { weaponDef } from "../weapons";
import { fittedWeaponStats } from "../weaponAttachments";
import { clampAccuracy } from "../surfaces";
import { damageAfterArmor } from "../combat";
import {
  DEFAULT_BULLET_SPEED,
  segmentCircleHit,
  spawnRifleShot,
  spawnShotgunBlast,
  type Projectile,
} from "../shooting";
import { isShotgunWeapon, shotgunMaxHits, shotgunPelletCount, shotgunSecondaryMult } from "../shotgun";

export interface HubWeaponStats {
  weapon: WeaponDef;
  damage: number;
  range: number;
  cooldown: number;
  accuracy: number;
  pen: number;
  spread: number | undefined;
  magSize: number;
  reloadMs: number;
  reloadType: WeaponDef["reloadType"];
}

/**
 * The hub-relevant subset of TarkovTD.tsx's towerStats(): same weapon fitting and PMC
 * level bonus, deliberately without the map/high-ground/operator/debuff modifiers that
 * don't apply outside a raid.
 */
export function hubWeaponStats(
  weaponId: string,
  attachments: readonly string[],
  level: number,
): HubWeaponStats {
  const w = weaponDef(weaponId);
  const fitted = fittedWeaponStats(weaponId, attachments, null);
  const pen = applyAttachmentMods(w, attachments).pen;
  const lvl = Math.max(1, level);
  const damage = fitted.damage * (1 + (lvl - 1) * 0.05);
  const accuracy = clampAccuracy(fitted.accuracy + (lvl - 1) * 0.02);
  return {
    weapon: w,
    damage,
    range: fitted.range,
    cooldown: fitted.cooldown,
    accuracy,
    pen,
    spread: fitted.spread,
    magSize: fitted.magSize,
    reloadMs: fitted.reloadMs,
    reloadType: w.reloadType,
  };
}

function bulletSpeedFor(w: WeaponDef): number {
  if (w.cls === "sniper") return DEFAULT_BULLET_SPEED * 1.4;
  if (w.cls === "launcher") return DEFAULT_BULLET_SPEED * 0.55;
  return DEFAULT_BULLET_SPEED;
}

/** Fires one shot — a single projectile, or a pellet fan for shotguns — exactly like
 * the raid trigger site (TarkovTD.tsx) branches, reusing spawnRifleShot/spawnShotgunBlast. */
export function fireHubShot(
  origin: { x: number; y: number },
  aimAngle: number,
  stats: HubWeaponStats,
  nextId: () => number,
  rng: () => number = Math.random,
): Projectile[] {
  const w = stats.weapon;
  const speed = bulletSpeedFor(w);
  if (isShotgunWeapon(w)) {
    return spawnShotgunBlast({
      nextId,
      shooterId: -1,
      origin,
      aimAngle,
      accuracy: stats.accuracy,
      range: stats.range,
      damage: stats.damage,
      pen: stats.pen,
      pelletCount: shotgunPelletCount(w),
      pelletSpread: stats.spread ?? w.spread ?? 0,
      maxPenHits: shotgunMaxHits(w),
      secondaryHitMult: shotgunSecondaryMult(w),
      color: w.accent,
      surface: "GROUND",
      speed,
      rng,
    });
  }
  return [
    spawnRifleShot({
      nextId,
      shooterId: -1,
      origin,
      aimAngle,
      accuracy: stats.accuracy,
      range: stats.range,
      damage: stats.damage,
      pen: stats.pen,
      splash: w.splash,
      maxPenHits: stats.pen > 0 ? 2 : 1,
      color: w.accent,
      surface: "GROUND",
      speed,
      rng,
    }),
  ];
}

/** Hit-circle radius for the dummy — same size raid uses for enemies (ENEMY_HIT_RADIUS). */
export const DUMMY_HIT_RADIUS = TILE * 0.4;

/**
 * Advances one projectile by dt seconds and tests it against the dummy's fixed
 * position. Same shape as shooting.ts's tickProjectile, minus wall collision and
 * multi-enemy handling (the range has neither). Mutates `p` in place.
 */
export function tickHubProjectile(
  p: Projectile,
  dt: number,
  dummyPos: { x: number; y: number },
  dummyRadius: number = DUMMY_HIT_RADIUS,
): { damage: number; pen: number } | null {
  if (p.dead) return null;
  const step = p.speed * dt;
  const travel = Math.min(step, p.remaining);
  if (travel <= 0) {
    p.dead = true;
    return null;
  }
  p.px = p.x;
  p.py = p.y;
  const nx = p.x + p.dx * travel;
  const ny = p.y + p.dy * travel;
  const hitT = segmentCircleHit(p.px, p.py, nx, ny, dummyPos.x, dummyPos.y, dummyRadius);
  p.remaining -= travel;
  if (hitT != null) {
    p.x = p.px + (nx - p.px) * hitT;
    p.y = p.py + (ny - p.py) * hitT;
    p.dead = true;
    return { damage: p.damage, pen: p.pen };
  }
  p.x = nx;
  p.y = ny;
  if (p.remaining <= 0) p.dead = true;
  return null;
}

/** Same formula raid hits use — dummy has no armor for now. */
export function applyDummyDamage(hp: number, damage: number, pen: number, armor = 0): number {
  return Math.max(0, hp - damageAfterArmor(damage, armor, pen));
}

export const DUMMY_MAX_HP = 100;
/** How long the dummy holds at 0 before it starts healing back up. */
export const DUMMY_ZERO_PAUSE_MS = 1000;
/** How long each 25% healing step takes once healing starts. */
export const DUMMY_HEAL_STEP_MS = 600;

/**
 * Given the dummy has been sitting at 0 hp for `msSinceZero`, what hp should it show
 * right now? Holds at 0 for DUMMY_ZERO_PAUSE_MS, then steps up through 25/50/75/100%
 * of maxHp every DUMMY_HEAL_STEP_MS. Caller is responsible for only invoking this
 * while hp is actually 0, and for switching back to normal damage-application once
 * this returns maxHp (fully healed).
 */
export function nextDummyHp(maxHp: number, msSinceZero: number): number {
  const healMs = msSinceZero - DUMMY_ZERO_PAUSE_MS;
  if (healMs < 0) return 0;
  const step = Math.min(4, 1 + Math.floor(healMs / DUMMY_HEAL_STEP_MS));
  return Math.round(maxHp * (step / 4));
}
