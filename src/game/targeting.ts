export type TargetMode = "FIRST" | "LAST" | "CLOSEST" | "STRONGEST" | "MANUAL";

export const TARGET_MODES: readonly TargetMode[] = ["FIRST", "LAST", "CLOSEST", "STRONGEST", "MANUAL"];

export interface AimOrigin {
  x: number;
  y: number;
}

export interface Targetable {
  id: number;
  x: number;
  y: number;
  hp: number;
  /** Route progress: segment index + parametric t. Not physical distance. */
  pathProgress: number;
}

export function pathProgress(seg: number, t: number): number {
  return seg + t;
}

export function inRange<T extends { x: number; y: number }>(
  origin: AimOrigin,
  range: number,
  unit: T,
): boolean {
  return Math.hypot(unit.x - origin.x, unit.y - origin.y) <= range;
}

export function enemiesInRange<T extends { x: number; y: number }>(
  origin: AimOrigin,
  range: number,
  enemies: readonly T[],
): T[] {
  return enemies.filter((e) => inRange(origin, range, e));
}

function compareStrongest(a: Targetable, b: Targetable): number {
  if (b.hp !== a.hp) return b.hp - a.hp;
  if (b.pathProgress !== a.pathProgress) return b.pathProgress - a.pathProgress;
  return a.id - b.id;
}

export function pickAutoTarget<T extends Targetable>(
  mode: Exclude<TargetMode, "MANUAL">,
  origin: AimOrigin,
  range: number,
  enemies: readonly T[],
): T | null {
  const candidates = enemiesInRange(origin, range, enemies);
  if (!candidates.length) return null;
  if (mode === "FIRST") {
    return candidates.reduce((best, e) => (e.pathProgress > best.pathProgress ? e : best));
  }
  if (mode === "LAST") {
    return candidates.reduce((best, e) => (e.pathProgress < best.pathProgress ? e : best));
  }
  if (mode === "CLOSEST") {
    return candidates.reduce((best, e) => {
      const da = Math.hypot(e.x - origin.x, e.y - origin.y);
      const db = Math.hypot(best.x - origin.x, best.y - origin.y);
      if (da !== db) return da < db ? e : best;
      if (e.pathProgress !== best.pathProgress) return e.pathProgress > best.pathProgress ? e : best;
      return e.id < best.id ? e : best;
    });
  }
  return [...candidates].sort(compareStrongest)[0] ?? null;
}

export function pickManualTarget<T extends Targetable>(
  manualId: number | null,
  origin: AimOrigin,
  range: number,
  enemies: readonly T[],
): T | null {
  if (manualId == null) return null;
  const found = enemies.find((e) => e.id === manualId);
  if (!found) return null;
  return inRange(origin, range, found) ? found : null;
}

export function selectTarget<T extends Targetable>(
  mode: TargetMode,
  origin: AimOrigin,
  range: number,
  enemies: readonly T[],
  manualId: number | null = null,
): T | null {
  if (mode === "MANUAL") return pickManualTarget(manualId, origin, range, enemies);
  return pickAutoTarget(mode, origin, range, enemies);
}

export function hitTestEnemy<T extends { id: number; x: number; y: number }>(
  x: number,
  y: number,
  enemies: readonly T[],
  radius: number,
): T | null {
  let best: T | null = null;
  let bestD = radius;
  for (const e of enemies) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
