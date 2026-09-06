import { TILE } from "./data";
import { freshBehaviorRuntime } from "./enemyBehavior";
import { effectiveEnemy } from "./dev/waveLabCore";
import type { GameMap } from "./map";
import type { Enemy } from "./types";
import { operatorPlacementSurface } from "./surfaces";
import { spawnedEnemyHp } from "./waves";

export function authoredSentryEnemies(
  map: GameMap,
  nextId: () => number,
  enemyHpMod = 1,
): Enemy[] {
  return (map.def.sentries ?? []).map((sentry) => {
    const def = effectiveEnemy(sentry.kind);
    const hp = spawnedEnemyHp(def.hp, 1, map.def.hpMult, enemyHpMod);
    return {
      id: nextId(), kind: sentry.kind, hp, maxHp: hp,
      lane: 0, seg: 0, t: 0,
      x: sentry.tx * TILE + TILE / 2, y: sentry.ty * TILE + TILE / 2,
      sentry: true, surface: operatorPlacementSurface(map, sentry.tx, sentry.ty) ?? "GROUND",
      contactingWireId: null, slow: 0, hitFlash: 0,
      step: 0, fireCd: 750, aim: sentry.facing ?? Math.PI, muzzle: 0,
      leaked: false, counted: false, lastHitZoneId: null, behaviorRuntime: freshBehaviorRuntime(),
    };
  });
}

export function sentryMovementMultiplier(enemy: Pick<Enemy, "sentry">): 0 | 1 {
  return enemy.sentry ? 0 : 1;
}

/** Lane enemies derive their world position from route progress; authored sentries never do. */
export function syncEnemyToLanePosition(
  enemy: Pick<Enemy, "sentry" | "x" | "y">,
  x: number,
  y: number,
): void {
  if (enemy.sentry) return;
  enemy.x = x;
  enemy.y = y;
}
