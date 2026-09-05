/**
 * Bounded per-operator tactical order plans (max 3).
 * Plans dispatch into existing operatorCommands — no duplicate gameplay logic.
 */

import type { GameMap } from "./map";
import { isOperatorMoving } from "./movement";
import {
  dispatchOperatorCommand,
  type OperatorCommand,
  type OperatorCommandContext,
} from "./operatorCommands";
import type { Tower } from "./types";

export const MAX_OPERATOR_ORDERS = 3;

export type MoveOrder = { type: "MOVE"; tx: number; ty: number };
export type ReloadOrder = { type: "RELOAD" };
export type HoldAngleOrder = {
  type: "HOLD_ANGLE";
  angle: number;
  point: { x: number; y: number };
};
/** Future M10: ThrowOrder — keep union extensible. */
export type OperatorOrder = MoveOrder | ReloadOrder | HoldAngleOrder;

export type OperatorPlanState = "PLANNED" | "EXECUTING" | "DONE" | "FAILED";

export type OperatorPlan = {
  orders: OperatorOrder[];
  currentIndex: number;
  state: OperatorPlanState;
  /** Finite action wait for current order. HOLD is terminal (no await). */
  awaiting: null | "MOVE" | "RELOAD";
  failReason?: string;
};

export type OperatorPlanBook = Map<number, OperatorPlan>;

export function createEmptyPlan(): OperatorPlan {
  return { orders: [], currentIndex: 0, state: "PLANNED", awaiting: null };
}

export function clonePlan(plan: OperatorPlan): OperatorPlan {
  return {
    orders: plan.orders.map((o) => ({ ...o })),
    currentIndex: plan.currentIndex,
    state: plan.state,
    awaiting: plan.awaiting,
    ...(plan.failReason ? { failReason: plan.failReason } : {}),
  };
}

export function getPlan(book: OperatorPlanBook, operatorId: number): OperatorPlan | undefined {
  return book.get(operatorId);
}

export function setPlan(book: OperatorPlanBook, operatorId: number, plan: OperatorPlan): void {
  if (plan.orders.length === 0 && plan.state !== "EXECUTING") {
    book.delete(operatorId);
    return;
  }
  book.set(operatorId, plan);
}

export function clearPlan(book: OperatorPlanBook, operatorId: number): void {
  book.delete(operatorId);
}

export function clearAllPlans(book: OperatorPlanBook): void {
  book.clear();
}

export function orderLabel(order: OperatorOrder): string {
  switch (order.type) {
    case "MOVE":
      return `MOVE → ${order.tx},${order.ty}`;
    case "RELOAD":
      return "RELOAD";
    case "HOLD_ANGLE":
      return "HOLD ANGLE";
  }
}

export function orderShort(order: OperatorOrder): string {
  switch (order.type) {
    case "MOVE":
      return "MOVE";
    case "RELOAD":
      return "RLD";
    case "HOLD_ANGLE":
      return "HOLD";
  }
}

export type PlanValidation =
  | { ok: true }
  | { ok: false; reason: string };

/** HOLD ANGLE must be last. Max 3 orders. */
export function validatePlanOrders(orders: readonly OperatorOrder[]): PlanValidation {
  if (orders.length > MAX_OPERATOR_ORDERS) {
    return { ok: false, reason: `MAX ${MAX_OPERATOR_ORDERS} COMMANDS` };
  }
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]!;
    if (o.type === "HOLD_ANGLE" && i !== orders.length - 1) {
      return { ok: false, reason: "HOLD ANGLE MUST BE LAST" };
    }
    if (o.type === "MOVE" && (!Number.isFinite(o.tx) || !Number.isFinite(o.ty))) {
      return { ok: false, reason: "INVALID MOVE TARGET" };
    }
    if (o.type === "HOLD_ANGLE" && !Number.isFinite(o.angle)) {
      return { ok: false, reason: "INVALID HOLD DIRECTION" };
    }
  }
  return { ok: true };
}

export function canAppendOrder(
  orders: readonly OperatorOrder[],
  next: OperatorOrder,
): PlanValidation {
  if (orders.length >= MAX_OPERATOR_ORDERS) {
    return { ok: false, reason: `MAX ${MAX_OPERATOR_ORDERS} COMMANDS` };
  }
  const last = orders[orders.length - 1];
  if (last?.type === "HOLD_ANGLE") {
    return { ok: false, reason: "HOLD ANGLE MUST BE LAST" };
  }
  return validatePlanOrders([...orders, next]);
}

/**
 * Active buffer = CURRENT + UPCOMING (completed slots do not consume the max-3 budget).
 */
export function activeOrders(plan: OperatorPlan): OperatorOrder[] {
  if (plan.state === "EXECUTING") {
    return plan.orders.slice(plan.currentIndex);
  }
  return [...plan.orders];
}

export function activeOrderCount(plan: OperatorPlan): number {
  return activeOrders(plan).length;
}

/** Append against the active command buffer (max 3 current+upcoming). */
export function canAppendToPlan(plan: OperatorPlan, next: OperatorOrder): PlanValidation {
  return canAppendOrder(activeOrders(plan), next);
}

export function appendOrder(plan: OperatorPlan, order: OperatorOrder): PlanValidation & { plan?: OperatorPlan } {
  const check = canAppendToPlan(plan, order);
  if (!check.ok) return check;
  const next = clonePlan(plan);
  next.orders.push(order);
  if (next.state === "DONE" || next.state === "FAILED") {
    next.state = "PLANNED";
    next.currentIndex = 0;
    next.awaiting = null;
    delete next.failReason;
  }
  // EXECUTING: leave currentIndex / awaiting untouched — do not redispatch.
  return { ok: true, plan: next };
}

export function removeOrderAt(
  plan: OperatorPlan,
  index: number,
): PlanValidation & { plan?: OperatorPlan } {
  if (index < 0 || index >= plan.orders.length) return { ok: false, reason: "NO COMMAND" };
  if (plan.state === "EXECUTING") {
    if (index <= plan.currentIndex) {
      return { ok: false, reason: "CANNOT REMOVE CURRENT OR COMPLETED" };
    }
  }
  const next = clonePlan(plan);
  next.orders.splice(index, 1);
  if (next.state === "PLANNED") {
    next.currentIndex = 0;
  }
  if (next.orders.length === 0) {
    next.state = "DONE";
    next.currentIndex = 0;
    next.awaiting = null;
  }
  return { ok: true, plan: next };
}

export function replaceOrderAt(
  plan: OperatorPlan,
  index: number,
  order: OperatorOrder,
): PlanValidation & { plan?: OperatorPlan } {
  if (index < 0 || index >= plan.orders.length) return { ok: false, reason: "NO COMMAND" };
  if (plan.state === "EXECUTING" && index <= plan.currentIndex) {
    return { ok: false, reason: "CANNOT EDIT CURRENT OR COMPLETED" };
  }
  const orders = plan.orders.map((o, i) => (i === index ? order : o));
  const check = validatePlanOrders(orders);
  if (!check.ok) return check;
  // Active buffer still within max when EXECUTING
  if (plan.state === "EXECUTING") {
    const activeLen = orders.length - plan.currentIndex;
    if (activeLen > MAX_OPERATOR_ORDERS) {
      return { ok: false, reason: `MAX ${MAX_OPERATOR_ORDERS} COMMANDS` };
    }
  }
  const next = clonePlan(plan);
  next.orders = orders;
  return { ok: true, plan: next };
}

export function clearFutureOrders(plan: OperatorPlan): OperatorPlan {
  const next = clonePlan(plan);
  if (next.state !== "EXECUTING") {
    next.orders = [];
    next.currentIndex = 0;
    next.state = "DONE";
    next.awaiting = null;
    return next;
  }
  // Keep completed prefix; drop current + upcoming (caller clears runtime future intents)
  next.orders = next.orders.slice(0, next.currentIndex);
  next.awaiting = null;
  next.state = "DONE";
  return next;
}

/**
 * Left-click MOVE semantics (documented rule):
 * - Realtime: always immediate simple MOVE (replace plan with executing [MOVE]).
 * - Paused + no plan / empty: set PLANNED [MOVE].
 * - Paused + single MOVE plan: replace that MOVE target.
 * - Paused + multi-command plan: if first order is MOVE, replace its target; else refuse (open ORDERS).
 * - Paused + EXECUTING: replace with new PLANNED [MOVE] only if not mid-complex — refuse multi executing.
 */
export type LeftClickPlanAction =
  | { kind: "apply"; plan: OperatorPlan; executeNow: boolean }
  | { kind: "refuse"; reason: string };

export function resolveLeftClickMovePlan(
  existing: OperatorPlan | undefined,
  tx: number,
  ty: number,
  paused: boolean,
): LeftClickPlanAction {
  const move: MoveOrder = { type: "MOVE", tx, ty };
  if (!paused) {
    return {
      kind: "apply",
      plan: { orders: [move], currentIndex: 0, state: "EXECUTING", awaiting: null },
      executeNow: true,
    };
  }
  if (!existing || existing.orders.length === 0 || existing.state === "DONE" || existing.state === "FAILED") {
    return {
      kind: "apply",
      plan: { orders: [move], currentIndex: 0, state: "PLANNED", awaiting: null },
      executeNow: false,
    };
  }
  if (existing.state === "EXECUTING") {
    return { kind: "refuse", reason: "ORDERS EXECUTING — OPEN ORDERS TO REVISE" };
  }
  // PLANNED
  if (existing.orders.length === 1 && existing.orders[0]!.type === "MOVE") {
    return {
      kind: "apply",
      plan: { orders: [move], currentIndex: 0, state: "PLANNED", awaiting: null },
      executeNow: false,
    };
  }
  if (existing.orders[0]?.type === "MOVE") {
    const next = clonePlan(existing);
    next.orders[0] = move;
    return { kind: "apply", plan: next, executeNow: false };
  }
  return { kind: "refuse", reason: "COMPLEX PLAN — OPEN ORDERS" };
}

export function orderToCommand(order: OperatorOrder): OperatorCommand {
  switch (order.type) {
    case "MOVE":
      return { type: "MOVE", tx: order.tx, ty: order.ty };
    case "RELOAD":
      return { type: "RELOAD" };
    case "HOLD_ANGLE":
      return { type: "HOLD_ANGLE", angle: order.angle, point: { ...order.point } };
  }
}

/**
 * Dispatch the current order into canonical runtime.
 * HOLD is terminal (marks DONE after dispatch).
 * MOVE alreadyThere advances immediately.
 */
export function dispatchCurrentOrder(
  tower: Tower,
  plan: OperatorPlan,
  ctx: OperatorCommandContext,
): { plan: OperatorPlan; ok: boolean; reason?: string } {
  const next = clonePlan(plan);
  if (next.state === "DONE" || next.state === "FAILED") return { plan: next, ok: true };
  if (next.currentIndex >= next.orders.length) {
    next.state = "DONE";
    next.awaiting = null;
    return { plan: next, ok: true };
  }
  next.state = "EXECUTING";
  const order = next.orders[next.currentIndex]!;
  const result = dispatchOperatorCommand(tower, orderToCommand(order), ctx);
  if (!result.ok) {
    next.state = "FAILED";
    next.awaiting = null;
    next.failReason = result.reason;
    return { plan: next, ok: false, reason: result.reason };
  }
  if (order.type === "HOLD_ANGLE") {
    next.state = "DONE";
    next.awaiting = null;
    next.currentIndex = next.orders.length;
    return { plan: next, ok: true };
  }
  if (order.type === "MOVE") {
    if (result.alreadyThere || !isOperatorMoving(tower)) {
      return advancePlan(tower, next, ctx);
    }
    next.awaiting = "MOVE";
    return { plan: next, ok: true };
  }
  // RELOAD
  if (tower.reloadLeft <= 0) {
    // Mag full / already done — skip ahead
    return advancePlan(tower, next, ctx);
  }
  next.awaiting = "RELOAD";
  return { plan: next, ok: true };
}

export function beginPlanExecution(
  tower: Tower,
  plan: OperatorPlan,
  ctx: OperatorCommandContext,
): { plan: OperatorPlan; ok: boolean; reason?: string } {
  const next = clonePlan(plan);
  if (next.orders.length === 0) {
    next.state = "DONE";
    return { plan: next, ok: true };
  }
  const v = validatePlanOrders(next.orders);
  if (!v.ok) return { plan: next, ok: false, reason: v.reason };
  next.currentIndex = 0;
  next.state = "EXECUTING";
  next.awaiting = null;
  delete next.failReason;
  return dispatchCurrentOrder(tower, next, ctx);
}

export function advancePlan(
  tower: Tower,
  plan: OperatorPlan,
  ctx: OperatorCommandContext,
): { plan: OperatorPlan; ok: boolean; reason?: string } {
  const next = clonePlan(plan);
  next.awaiting = null;
  // Compact completed current order out of the active buffer so max-3 applies to
  // CURRENT + UPCOMING only (not historical completed slots).
  if (next.currentIndex < next.orders.length) {
    next.orders.splice(next.currentIndex, 1);
  }
  if (next.currentIndex >= next.orders.length) {
    next.state = "DONE";
    next.currentIndex = 0;
    return { plan: next, ok: true };
  }
  return dispatchCurrentOrder(tower, next, ctx);
}

/**
 * Planned action origin: where the operator will be when `orderIndex` begins.
 * Walks prior orders — MOVE updates tile center; RELOAD/HOLD leave position unchanged.
 * Authoring / preview only — does not simulate movement.
 * M10 THROW should reuse this for throw-from geometry.
 */
export function getProjectedOperatorPositionBeforeOrder(
  currentPos: { x: number; y: number },
  plan: OperatorPlan,
  orderIndex: number,
  tileSize: number,
): { x: number; y: number } {
  let x = currentPos.x;
  let y = currentPos.y;
  const end = Math.max(0, Math.min(orderIndex, plan.orders.length));
  for (let i = 0; i < end; i++) {
    const o = plan.orders[i]!;
    if (o.type === "MOVE") {
      x = o.tx * tileSize + tileSize / 2;
      y = o.ty * tileSize + tileSize / 2;
    }
  }
  return { x, y };
}

/** Convenience: projected origin for a new append (after all existing orders). */
export function getProjectedOperatorPositionForAppend(
  currentPos: { x: number; y: number },
  plan: OperatorPlan,
  tileSize: number,
): { x: number; y: number } {
  return getProjectedOperatorPositionBeforeOrder(currentPos, plan, plan.orders.length, tileSize);
}

/**
 * Geometry for an aimed action authored after earlier plan orders.
 * HOLD uses `angle`; future grenade/throw commands can share `origin` and `point`.
 */
export function getProjectedActionGeometry(
  currentPos: { x: number; y: number },
  plan: OperatorPlan,
  orderIndex: number,
  tileSize: number,
  point: { x: number; y: number },
): { origin: { x: number; y: number }; point: { x: number; y: number }; angle: number } {
  const origin = getProjectedOperatorPositionBeforeOrder(currentPos, plan, orderIndex, tileSize);
  return {
    origin,
    point: { ...point },
    angle: Math.atan2(point.y - origin.y + 4, point.x - origin.x),
  };
}

/** After stepOperatorMove: if awaiting MOVE and no longer moving, advance. */
export function onMoveStepComplete(
  tower: Tower,
  plan: OperatorPlan,
  ctx: OperatorCommandContext,
  wasMoving: boolean,
): { plan: OperatorPlan; advanced: boolean } {
  if (plan.state !== "EXECUTING" || plan.awaiting !== "MOVE") {
    return { plan, advanced: false };
  }
  if (wasMoving && !isOperatorMoving(tower)) {
    const r = advancePlan(tower, plan, ctx);
    return { plan: r.plan, advanced: true };
  }
  return { plan, advanced: false };
}

/**
 * After tickReload: if awaiting RELOAD and reloadLeft hit 0, advance.
 * Call before maybeStartReload so idle top-up does not confuse completion.
 */
export function onReloadTickComplete(
  tower: Tower,
  plan: OperatorPlan,
  ctx: OperatorCommandContext,
  prevReloadLeft: number,
): { plan: OperatorPlan; advanced: boolean } {
  if (plan.state !== "EXECUTING" || plan.awaiting !== "RELOAD") {
    return { plan, advanced: false };
  }
  if (prevReloadLeft > 0 && tower.reloadLeft <= 0) {
    const r = advancePlan(tower, plan, ctx);
    return { plan: r.plan, advanced: true };
  }
  return { plan, advanced: false };
}

/** Start every PLANNED plan when leaving pause / confirming live. */
export function startAllPlanned(
  book: OperatorPlanBook,
  towers: readonly Tower[],
  map: GameMap,
): void {
  const ctx: OperatorCommandContext = { map, towers };
  for (const t of towers) {
    const plan = book.get(t.id);
    if (!plan || plan.state !== "PLANNED" || plan.orders.length === 0) continue;
    const r = beginPlanExecution(t, plan, ctx);
    setPlan(book, t.id, r.plan);
  }
}

export function planSummary(plan: OperatorPlan | undefined): string {
  if (!plan || plan.orders.length === 0) return "";
  return plan.orders.map(orderShort).join(" > ");
}

export type OrderRowStatus = "done" | "current" | "upcoming" | "planned";

export function orderRowStatus(plan: OperatorPlan, index: number): OrderRowStatus {
  if (plan.state === "PLANNED") return "planned";
  if (plan.state === "DONE" || plan.state === "FAILED") {
    return index < plan.currentIndex ? "done" : plan.state === "FAILED" && index === plan.currentIndex ? "current" : "upcoming";
  }
  // EXECUTING
  if (index < plan.currentIndex) return "done";
  if (index === plan.currentIndex) return "current";
  return "upcoming";
}

/** Move waypoints for battlefield visualization (from plan, not runtime). */
export function planMoveWaypoints(plan: OperatorPlan): MoveOrder[] {
  return plan.orders.filter((o): o is MoveOrder => o.type === "MOVE");
}

export function planHoldOrder(plan: OperatorPlan): HoldAngleOrder | null {
  const last = plan.orders[plan.orders.length - 1];
  return last?.type === "HOLD_ANGLE" ? last : null;
}

export function isSimpleMovePlan(plan: OperatorPlan | undefined): boolean {
  return !!plan && plan.orders.length === 1 && plan.orders[0]!.type === "MOVE";
}

export function hasComplexPlan(plan: OperatorPlan | undefined): boolean {
  return !!plan && plan.orders.length > 1 && (plan.state === "PLANNED" || plan.state === "EXECUTING");
}
