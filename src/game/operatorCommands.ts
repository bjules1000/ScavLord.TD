/**
 * Thin operator command boundary — UI / future AI / future remote all dispatch
 * into the same canonical Tower runtime. Not a serialized multi-step queue.
 */

import type { GameMap } from "./map";
import { clearOperatorMove, issueOperatorMove, type IssueMoveResult } from "./movement";
import { isAutoTargetMode, type AutoTargetMode, type TargetMode } from "./targeting";
import type { Tower } from "./types";
import { magSizeOf, maybeStartReload, reloadMsOf, reloadTypeOf } from "./weapons";
import { fittedWeaponStats } from "./weaponAttachments";

function rememberAutoPreference(tower: Tower): void {
  if (isAutoTargetMode(tower.targetMode)) {
    tower.autoTargetMode = tower.targetMode;
  }
}

function restoreAutoPreference(tower: Tower): AutoTargetMode {
  const pref = tower.autoTargetMode;
  return isAutoTargetMode(pref) ? pref : "FIRST";
}

export type MoveCommand = { type: "MOVE"; tx: number; ty: number };
export type ReloadCommand = { type: "RELOAD" };
export type HoldAngleCommand = {
  type: "HOLD_ANGLE";
  angle: number;
  point: { x: number; y: number };
};
export type ClearHoldAngleCommand = { type: "CLEAR_HOLD_ANGLE" };
export type ClearMoveCommand = { type: "CLEAR_MOVE" };
/** Cancels an in-progress reload timer without changing ammo. Caller must gate safety. */
export type CancelReloadCommand = { type: "CANCEL_RELOAD" };
export type SetTargetingCommand = {
  type: "SET_TARGETING";
  mode: TargetMode;
  manualTargetId?: number | null;
};

export type OperatorCommand =
  | MoveCommand
  | ReloadCommand
  | HoldAngleCommand
  | ClearHoldAngleCommand
  | ClearMoveCommand
  | CancelReloadCommand
  | SetTargetingCommand;

export type DispatchResult =
  | { ok: true; alreadyThere?: boolean; message?: string }
  | { ok: false; reason: string };

export type OperatorCommandContext = {
  map: GameMap;
  towers: readonly Tower[];
};

/**
 * Apply a command to an operator's canonical runtime state.
 * Does not advance simulation — safe to call while battle time is PAUSED.
 */
export function dispatchOperatorCommand(
  tower: Tower,
  command: OperatorCommand,
  ctx: OperatorCommandContext,
): DispatchResult {
  switch (command.type) {
    case "MOVE": {
      const r: IssueMoveResult = issueOperatorMove(ctx.map, ctx.towers, tower, command.tx, command.ty);
      if (!r.ok) return { ok: false, reason: r.reason };
      return r.alreadyThere ? { ok: true, alreadyThere: true } : { ok: true };
    }
    case "RELOAD": {
      const mag = magSizeOf(tower.weapon);
      if (tower.ammo >= mag && tower.reloadLeft <= 0) {
        return { ok: false, reason: "MAG FULL" };
      }
      if (tower.reloadLeft > 0) {
        return { ok: true, message: "RELOAD ALREADY ACTIVE" };
      }
      const fitted = fittedWeaponStats(tower.weapon, tower.attachments, tower.scavMods);
      const reloadMs = fitted.reloadMs ?? reloadMsOf(tower.weapon);
      const reloadType = reloadTypeOf(tower.weapon);
      // Force start: treat as empty/no-target so MAGAZINE and PER_ROUND both begin.
      const next = maybeStartReload(0, 0, mag, reloadMs, reloadType, false);
      if (next <= 0) return { ok: false, reason: "CANNOT RELOAD" };
      tower.reloadLeft = next;
      return { ok: true, message: "RELOAD STARTED" };
    }
    case "HOLD_ANGLE": {
      // Retain AUTO preference for CLEAR HOLD / later resume.
      rememberAutoPreference(tower);
      tower.targetMode = "HOLD_ANGLE";
      tower.holdAngle = command.angle;
      tower.holdAnglePoint = { x: command.point.x, y: command.point.y };
      // Clear locks that would recenter aim onto an enemy.
      tower.manualTargetId = null;
      tower.engageTargetId = null;
      // Snap aim immediately so visuals match intent before the next tick.
      tower.angle = command.angle;
      return { ok: true };
    }
    case "CLEAR_HOLD_ANGLE": {
      tower.holdAngle = null;
      tower.holdAnglePoint = null;
      tower.targetMode = restoreAutoPreference(tower);
      tower.manualTargetId = null;
      return { ok: true };
    }
    case "CLEAR_MOVE": {
      clearOperatorMove(tower);
      return { ok: true };
    }
    case "CANCEL_RELOAD": {
      if (tower.reloadLeft <= 0) return { ok: false, reason: "NOT RELOADING" };
      tower.reloadLeft = 0;
      return { ok: true };
    }
    case "SET_TARGETING": {
      // Explicit FIRST/LAST/CLOSEST/STRONGEST/MANUAL exits HOLD ANGLE.
      if (command.mode === "HOLD_ANGLE") {
        rememberAutoPreference(tower);
      } else {
        tower.holdAngle = null;
        tower.holdAnglePoint = null;
        if (isAutoTargetMode(command.mode)) {
          tower.autoTargetMode = command.mode;
        }
      }
      tower.targetMode = command.mode;
      if (command.mode !== "MANUAL") tower.manualTargetId = null;
      else if (command.manualTargetId !== undefined) tower.manualTargetId = command.manualTargetId;
      return { ok: true };
    }
  }
}

/**
 * Clear confirmed tactical intents for an operator.
 * Reload cancel is optional and must be pre-validated by the caller.
 */
export function clearOperatorOrders(
  tower: Tower,
  ctx: OperatorCommandContext,
  opts?: { cancelReload?: boolean },
): DispatchResult {
  dispatchOperatorCommand(tower, { type: "CLEAR_MOVE" }, ctx);
  if (tower.targetMode === "HOLD_ANGLE") {
    dispatchOperatorCommand(tower, { type: "CLEAR_HOLD_ANGLE" }, ctx);
  }
  if (opts?.cancelReload) {
    dispatchOperatorCommand(tower, { type: "CANCEL_RELOAD" }, ctx);
  }
  return { ok: true };
}
