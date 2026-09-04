/**
 * Compact contextual ORDERS editor for M9 bounded plans.
 * Sidebar (default) or optional overlay chrome.
 */

import type { OperatorOrder, OperatorPlan } from "./operatorPlans";
import {
  MAX_OPERATOR_ORDERS,
  canAppendOrder,
  orderLabel,
  orderRowStatus,
  orderShort,
} from "./operatorPlans";

export type OrdersEditorMode =
  | { kind: "idle" }
  | { kind: "pick_add" }
  | { kind: "author_move"; editIndex: number | null }
  | { kind: "author_hold"; editIndex: number | null };

export type OrdersPanelProps = {
  operatorName: string;
  plan: OperatorPlan;
  editorMode: OrdersEditorMode;
  /** sidebar = permanent raid chrome; overlay = legacy floating (unused). */
  variant?: "sidebar" | "overlay";
  onAddPick: (type: "MOVE" | "RELOAD" | "HOLD_ANGLE") => void;
  onRequestAddMenu: () => void;
  onCancelAddMenu: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onClearAll: () => void;
  onDone: () => void;
  onClose?: () => void;
};

export function OrdersPanel({
  operatorName,
  plan,
  editorMode,
  variant = "sidebar",
  onAddPick,
  onRequestAddMenu,
  onCancelAddMenu,
  onEdit,
  onRemove,
  onClearAll,
  onDone,
  onClose,
}: OrdersPanelProps) {
  const atCap = plan.orders.length >= MAX_OPERATOR_ORDERS;
  const holdLast = plan.orders[plan.orders.length - 1]?.type === "HOLD_ANGLE";
  const canAdd = !atCap && !holdLast && plan.state !== "EXECUTING";
  const showAddMenu = editorMode.kind === "pick_add";
  const shell =
    variant === "overlay"
      ? "pointer-events-auto absolute z-30 min-w-[14rem] max-w-[18rem] border-2 border-border bg-background/95 p-2 shadow-lg backdrop-blur-[2px]"
      : "w-full";

  return (
    <div className={shell}>
      <div className="flex items-start justify-between gap-2 border-b border-border pb-1">
        <div className="font-display text-[10px] text-primary">
          ORDERS
          {plan.state === "EXECUTING" ? (
            <span className="ml-1 font-mono text-[9px] text-accent">EXECUTING</span>
          ) : plan.state === "PLANNED" && plan.orders.length > 0 ? (
            <span className="ml-1 font-mono text-[9px] text-muted-foreground">PLANNED</span>
          ) : plan.state === "DONE" && plan.orders.length > 0 ? (
            <span className="ml-1 font-mono text-[9px] text-muted-foreground">DONE</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <span className="max-w-[6rem] truncate font-mono text-[8px] text-muted-foreground">
            {operatorName}
          </span>
          {onClose && variant === "overlay" ? (
            <button type="button" className="pixel-btn px-1 py-0 text-[9px]" onClick={onClose}>
              ×
            </button>
          ) : null}
        </div>
      </div>

      <ol className="mt-2 space-y-1 font-mono text-[10px]">
        {plan.orders.length === 0 && <li className="text-muted-foreground">NO PLAN</li>}
        {plan.orders.map((order, i) => {
          const status = orderRowStatus(plan, i);
          const mark =
            status === "done" ? "✓" : status === "current" ? ">" : status === "upcoming" ? "·" : "";
          return (
            <li
              key={`${i}-${order.type}`}
              className={`flex items-center gap-1 ${
                status === "current"
                  ? "text-primary"
                  : status === "done"
                    ? "text-muted-foreground"
                    : "text-foreground"
              }`}
            >
              <span className="w-3 shrink-0 text-muted-foreground">{mark}</span>
              <span className="w-5 shrink-0 text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate">{formatOrderRow(order)}</span>
              {plan.state !== "EXECUTING" && order.type !== "RELOAD" && (
                <button
                  type="button"
                  className="pixel-btn px-1 py-0 text-[8px]"
                  onClick={() => onEdit(i)}
                  title="EDIT"
                >
                  EDIT
                </button>
              )}
              {plan.state !== "EXECUTING" && (
                <button
                  type="button"
                  className="pixel-btn px-1 py-0 text-[8px]"
                  onClick={() => onRemove(i)}
                  title="REMOVE"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {showAddMenu ? (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-border pt-2">
          {(["MOVE", "RELOAD", "HOLD_ANGLE"] as const).map((type) => {
            const probe =
              type === "MOVE"
                ? canAppendOrder(plan.orders, { type: "MOVE", tx: 0, ty: 0 })
                : type === "RELOAD"
                  ? canAppendOrder(plan.orders, { type: "RELOAD" })
                  : canAppendOrder(plan.orders, {
                      type: "HOLD_ANGLE",
                      angle: 0,
                      point: { x: 0, y: 0 },
                    });
            return (
              <button
                key={type}
                type="button"
                disabled={!probe.ok}
                className="pixel-btn px-1.5 py-0.5 text-[9px] disabled:opacity-40"
                onClick={() => onAddPick(type)}
              >
                {type === "HOLD_ANGLE" ? "HOLD ANGLE" : type}
              </button>
            );
          })}
          <button type="button" className="pixel-btn px-1.5 py-0.5 text-[9px]" onClick={onCancelAddMenu}>
            CANCEL
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-border pt-2">
          <button
            type="button"
            disabled={!canAdd}
            title={
              atCap
                ? `MAX ${MAX_OPERATOR_ORDERS} COMMANDS`
                : holdLast
                  ? "HOLD ANGLE MUST BE LAST"
                  : plan.state === "EXECUTING"
                    ? "PLAN EXECUTING"
                    : "ADD COMMAND"
            }
            className="pixel-btn px-1.5 py-0.5 text-[9px] disabled:opacity-40"
            onClick={onRequestAddMenu}
          >
            + ADD COMMAND
          </button>
        </div>
      )}

      {(editorMode.kind === "author_move" || editorMode.kind === "author_hold") && (
        <p className="mt-2 font-mono text-[9px] text-primary">
          {editorMode.kind === "author_move"
            ? "CLICK DESTINATION · ESC CANCEL"
            : "CLICK HOLD DIRECTION · ESC CANCEL"}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className="pixel-btn pixel-btn-primary px-2 py-0.5 text-[9px]" onClick={onDone}>
          DONE
        </button>
        <button type="button" className="pixel-btn px-2 py-0.5 text-[9px]" onClick={onClearAll}>
          CLEAR ALL
        </button>
      </div>

      {plan.orders.length > 0 && (
        <p className="mt-1 font-mono text-[8px] text-muted-foreground">
          {plan.orders.map(orderShort).join(" > ")}
        </p>
      )}
    </div>
  );
}

function formatOrderRow(order: OperatorOrder): string {
  if (order.type === "MOVE") return `MOVE → ${order.tx},${order.ty}`;
  if (order.type === "HOLD_ANGLE") {
    const deg = Math.round(((order.angle * 180) / Math.PI + 360) % 360);
    return `HOLD → ${deg}°`;
  }
  return orderLabel(order);
}
