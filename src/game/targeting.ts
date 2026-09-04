export type TargetMode = "FIRST" | "LAST" | "CLOSEST" | "STRONGEST" | "MANUAL" | "HOLD_ANGLE";

/** AUTO preference modes — never control aim while HOLD ANGLE is active. */
export type AutoTargetMode = "FIRST" | "LAST" | "CLOSEST" | "STRONGEST";

export const AUTO_TARGET_MODES: readonly AutoTargetMode[] = ["FIRST", "LAST", "CLOSEST", "STRONGEST"];

export const TARGET_MODES: readonly TargetMode[] = ["FIRST", "LAST", "CLOSEST", "STRONGEST", "MANUAL", "HOLD_ANGLE"];

export function isAutoTargetMode(mode: TargetMode | null | undefined): mode is AutoTargetMode {
  return mode === "FIRST" || mode === "LAST" || mode === "CLOSEST" || mode === "STRONGEST";
}

/**
 * HOLD ANGLE is active when mode is HOLD_ANGLE and an authored angle exists.
 * While active, AUTO modes must not control aim direction.
 */
export function isHoldAimActive(t: {
  targetMode: TargetMode;
  holdAngle?: number | null;
}): boolean {
  return t.targetMode === "HOLD_ANGLE" && t.holdAngle != null && Number.isFinite(t.holdAngle);
}

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
  mode: AutoTargetMode,
  origin: AimOrigin,
  range: number,
  enemies: readonly T[],
  visible: (unit: T) => boolean = () => true,
): T | null {
  const candidates = enemiesInRange(origin, range, enemies).filter(visible);
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
  visible: (unit: T) => boolean = () => true,
): T | null {
  if (mode === "MANUAL") {
    const locked = pickManualTarget(manualId, origin, range, enemies);
    if (!locked || !visible(locked)) return null;
    return locked;
  }
  if (mode === "HOLD_ANGLE") {
    // HOLD_ANGLE doesn't auto-select a specific target.
    // Returns null; the firing loop checks sector eligibility separately.
    return null;
  }
  if (!isAutoTargetMode(mode)) return null;
  return pickAutoTarget(mode, origin, range, enemies, visible);
}

/**
 * Resolve operator facing for this tick.
 * HOLD ANGLE always wins over AUTO/MANUAL recenter while active.
 */
export function resolveOperatorAimAngle(args: {
  holding: boolean;
  holdAngle: number | null | undefined;
  targetMode: TargetMode;
  locked: { x: number; y: number } | null;
  best: { x: number; y: number } | null;
  originX: number;
  originY: number;
  currentAngle: number;
}): number {
  if (args.holding && args.holdAngle != null && Number.isFinite(args.holdAngle)) {
    return args.holdAngle;
  }
  if (args.targetMode === "MANUAL" && args.locked) {
    return Math.atan2(args.locked.y - args.originY - 4, args.locked.x - args.originX);
  }
  if (args.best) {
    return Math.atan2(args.best.y - args.originY - 4, args.best.x - args.originX);
  }
  return args.currentAngle;
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
