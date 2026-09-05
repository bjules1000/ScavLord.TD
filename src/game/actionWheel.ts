/**
 * Contextual battlefield action-wheel definitions + pure helpers.
 * UI shell is ContextualActionWheel.tsx; gameplay dispatch stays in TarkovTD / canonical modules.
 */

import type { BarricadeEdge } from "./defenses";
import type { OperatorPlan } from "./operatorPlans";

export type OperatorWheelActionId = "MOVE" | "ORDERS" | "THROW_FRAG" | "HOLD_ANGLE" | "RELOAD" | "CANCEL";
export type TileWheelActionId = "BARRICADE" | "WIRE" | "HIRE" | "CANCEL";
export type WheelActionId = OperatorWheelActionId | TileWheelActionId;

export type WheelActionDef = {
  id: WheelActionId;
  label: string;
};

/** Operator-selected right-click actions (fixed M9 set; M10 can append THROW later). */
export const OPERATOR_WHEEL_ACTIONS: readonly WheelActionDef[] = [
  { id: "MOVE", label: "MOVE" },
  { id: "ORDERS", label: "ORDERS" },
  { id: "THROW_FRAG", label: "FRAG" },
  { id: "HOLD_ANGLE", label: "HOLD" },
  { id: "RELOAD", label: "RELOAD" },
  { id: "CANCEL", label: "CANCEL" },
] as const;

export type TileWheelValidity = {
  barricade: boolean;
  wire: boolean;
  hire: boolean;
};

export function listOperatorWheelActions(): WheelActionDef[] {
  return [...OPERATOR_WHEEL_ACTIONS];
}

/**
 * Tile / no-operator wheel — only legally placeable actions (+ CANCEL).
 * Callers pass canonical validator results; this does not re-implement placement rules.
 */
export function listTileWheelActions(v: TileWheelValidity): WheelActionDef[] {
  const actions: WheelActionDef[] = [];
  if (v.barricade) actions.push({ id: "BARRICADE", label: "BARRICADE" });
  if (v.wire) actions.push({ id: "WIRE", label: "WIRE" });
  if (v.hire) actions.push({ id: "HIRE", label: "HIRE" });
  if (actions.length === 0) return [];
  actions.push({ id: "CANCEL", label: "CANCEL" });
  return actions;
}

export type ActionWheelKind = "operator" | "tile";

export type ActionWheelState = {
  kind: ActionWheelKind;
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
  tx: number;
  ty: number;
  edge: BarricadeEdge;
  operatorId: number | null;
  actions: WheelActionDef[];
};

/**
 * ORDERS from right-click tile:
 * - empty / DONE → seed MOVE to dest
 * - single MOVE (not executing) → revise that MOVE
 * - multi-command or EXECUTING → keep plan (no silent destroy)
 */
export function resolveOrdersSeedFromRightClick(
  existing: OperatorPlan | undefined,
  dest: { tx: number; ty: number },
): { plan: OperatorPlan; seeded: boolean; preserved: boolean } {
  const move = { type: "MOVE" as const, tx: dest.tx, ty: dest.ty };
  if (!existing || existing.orders.length === 0 || existing.state === "DONE") {
    return {
      plan: {
        orders: [move],
        currentIndex: 0,
        state: "PLANNED",
        awaiting: null,
      },
      seeded: true,
      preserved: false,
    };
  }
  if (existing.state === "EXECUTING") {
    return { plan: existing, seeded: false, preserved: true };
  }
  const onlySimpleMove =
    existing.orders.length === 1 && existing.orders[0]?.type === "MOVE";
  if (onlySimpleMove) {
    return {
      plan: {
        orders: [move],
        currentIndex: 0,
        state: "PLANNED",
        awaiting: null,
      },
      seeded: true,
      preserved: false,
    };
  }
  return { plan: existing, seeded: false, preserved: true };
}

export function operatorActivityLabel(opts: {
  moving: boolean;
  reloadLeft: number;
  holding: boolean;
  engaging: boolean;
}): "MOVING" | "RELOADING" | "HOLDING" | "ENGAGING" | "IDLE" {
  if (opts.moving) return "MOVING";
  if (opts.reloadLeft > 0) return "RELOADING";
  if (opts.holding) return "HOLDING";
  if (opts.engaging) return "ENGAGING";
  return "IDLE";
}

export function raidInteractionHint(opts: {
  paused: boolean;
  ordersAuthoring: boolean;
  authorKind?: "move" | "hold" | "pick";
  placeMode: null | "operator" | "barricade" | "wire";
}): string {
  if (opts.placeMode === "barricade") return "BARRICADE — click edge · ESC cancel";
  if (opts.placeMode === "wire") return "WIRE — click road · ESC cancel";
  if (opts.placeMode === "operator") return "HIRE — click deploy tile · ESC cancel";
  if (opts.ordersAuthoring) {
    if (opts.authorKind === "move") return "ORDERS — click destination · ESC cancel";
    if (opts.authorKind === "hold") return "ORDERS — click hold direction · ESC cancel";
    return "ORDERS — pick command";
  }
  if (opts.paused) return "TACTICAL PAUSE · L-CLICK MOVE · R-CLICK ACTIONS · SPACE RESUME";
  return "L-CLICK MOVE · R-CLICK ACTIONS · SPACE PAUSE";
}

export function tileAllowsAnyBarricadeEdge(
  canPlace: (edge: BarricadeEdge) => boolean,
): boolean {
  return canPlace("N") || canPlace("E") || canPlace("S") || canPlace("W");
}
