/**
 * Tactical pause command authoring / planning presentation helpers.
 * Does not advance simulation — presentation + UI mode only.
 */

import type { Tower } from "./types";
import { isOperatorMoving } from "./movement";

export type CommandAuthoringMode = "MOVE" | "HOLD_ANGLE";

export type CommandAuthoringState = {
  mode: CommandAuthoringMode;
  operatorId: number;
} | null;

/** Visual weight for movement / hold plan overlays. */
export type PlanEmphasis = "selected" | "squad" | "subtle" | "hidden";

export function movementPlanEmphasis(opts: {
  paused: boolean;
  selected: boolean;
  hasMoveIntent: boolean;
}): PlanEmphasis {
  if (!opts.hasMoveIntent) return "hidden";
  if (opts.paused) return opts.selected ? "selected" : "squad";
  return opts.selected ? "subtle" : "hidden";
}

export function holdPlanEmphasis(opts: {
  paused: boolean;
  selected: boolean;
  holding: boolean;
}): PlanEmphasis {
  if (!opts.holding) return "hidden";
  if (opts.paused) return opts.selected ? "selected" : "squad";
  // Active combat: selected operator keeps normal cone elsewhere; unselected hold rays hide.
  return opts.selected ? "subtle" : "hidden";
}

export function reloadPlanLabelVisible(paused: boolean, reloadLeft: number): boolean {
  return paused && reloadLeft > 0;
}

export type PlanBadge = "MOVE" | "HOLD" | "RLD" | "MOVING" | null;

/** Compact status for operator card / map glance during planning. */
export function operatorPlanBadge(tower: Tower, paused: boolean): PlanBadge {
  if (paused && tower.reloadLeft > 0) return "RLD";
  if (tower.move?.dest) {
    if (paused) return "MOVE";
    if (isOperatorMoving(tower)) return "MOVING";
  }
  if (paused && tower.targetMode === "HOLD_ANGLE" && tower.holdAngle != null) return "HOLD";
  return null;
}

export function hasMoveIntent(tower: Tower): boolean {
  return !!(tower.move?.dest || (tower.move?.path && tower.move.path.length > 0));
}

export function isHoldingAngle(tower: Tower): boolean {
  return tower.targetMode === "HOLD_ANGLE" && tower.holdAngle != null;
}

/** Tracks reloads authored during the current PAUSED planning session. */
export type PauseReloadSession = {
  sessionId: number;
  /** Operator ids whose reload was started while paused in this session. */
  authoredReloadIds: Set<number>;
};

export function createPauseReloadSession(): PauseReloadSession {
  return { sessionId: 0, authoredReloadIds: new Set() };
}

/** Call when entering PAUSED from a non-paused mode. */
export function beginPauseReloadSession(prev: PauseReloadSession): PauseReloadSession {
  return { sessionId: prev.sessionId + 1, authoredReloadIds: new Set() };
}

export function noteReloadAuthoredInPause(
  session: PauseReloadSession,
  operatorId: number,
  wasAlreadyReloading: boolean,
): void {
  if (!wasAlreadyReloading) session.authoredReloadIds.add(operatorId);
}

/**
 * Safe to cancel reload only if it was authored during this pause and sim has not run
 * (still paused). Never rewinds ammo.
 */
export function canCancelPausedReload(
  session: PauseReloadSession,
  operatorId: number,
  reloadLeft: number,
  paused: boolean,
): boolean {
  return paused && reloadLeft > 0 && session.authoredReloadIds.has(operatorId);
}

export function cancelAuthoring(state: CommandAuthoringState): CommandAuthoringState {
  return null;
}

export function authoringForOperator(
  state: CommandAuthoringState,
  operatorId: number,
): CommandAuthoringMode | null {
  if (!state || state.operatorId !== operatorId) return null;
  return state.mode;
}
