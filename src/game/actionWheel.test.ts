import { describe, expect, it } from "bun:test";
import {
  listOperatorWheelActions,
  listTileWheelActions,
  operatorActivityLabel,
  raidInteractionHint,
  resolveOrdersSeedFromRightClick,
  tileAllowsAnyBarricadeEdge,
} from "./actionWheel";
import { createEmptyPlan, type OperatorPlan } from "./operatorPlans";

describe("actionWheel operator set", () => {
  it("lists MOVE ORDERS FRAG HOLD RELOAD CANCEL", () => {
    expect(listOperatorWheelActions().map((a) => a.id)).toEqual([
      "MOVE",
      "ORDERS",
      "THROW_FRAG",
      "HOLD_ANGLE",
      "RELOAD",
      "CANCEL",
    ]);
  });

  it("does not include tile-build actions", () => {
    const ids = listOperatorWheelActions().map((a) => a.id);
    expect(ids).not.toContain("BARRICADE");
    expect(ids).not.toContain("WIRE");
    expect(ids).not.toContain("HIRE");
  });
});

describe("actionWheel tile set", () => {
  it("exposes WIRE/BARRICADE/HIRE only when valid", () => {
    expect(listTileWheelActions({ barricade: false, wire: true, hire: false }).map((a) => a.id)).toEqual([
      "WIRE",
      "CANCEL",
    ]);
    expect(listTileWheelActions({ barricade: true, wire: false, hire: true }).map((a) => a.id)).toEqual([
      "BARRICADE",
      "HIRE",
      "CANCEL",
    ]);
  });

  it("returns empty when no placement is legal", () => {
    expect(listTileWheelActions({ barricade: false, wire: false, hire: false })).toEqual([]);
  });

  it("does not include operator commands", () => {
    const ids = listTileWheelActions({ barricade: true, wire: true, hire: true }).map((a) => a.id);
    expect(ids).not.toContain("MOVE");
    expect(ids).not.toContain("ORDERS");
    expect(ids).not.toContain("HOLD_ANGLE");
    expect(ids).not.toContain("RELOAD");
  });

  it("tileAllowsAnyBarricadeEdge uses canonical edge probes", () => {
    expect(tileAllowsAnyBarricadeEdge(() => false)).toBe(false);
    expect(tileAllowsAnyBarricadeEdge((e) => e === "N")).toBe(true);
  });
});

describe("ORDERS seed from right-click", () => {
  it("seeds MOVE when plan empty", () => {
    const r = resolveOrdersSeedFromRightClick(undefined, { tx: 5, ty: 2 });
    expect(r.seeded).toBe(true);
    expect(r.plan.orders).toEqual([{ type: "MOVE", tx: 5, ty: 2 }]);
  });

  it("revises single MOVE plan", () => {
    const existing: OperatorPlan = {
      orders: [{ type: "MOVE", tx: 1, ty: 1 }],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const r = resolveOrdersSeedFromRightClick(existing, { tx: 9, ty: 3 });
    expect(r.seeded).toBe(true);
    expect(r.plan.orders[0]).toEqual({ type: "MOVE", tx: 9, ty: 3 });
  });

  it("does not silently destroy multi-command plans", () => {
    const existing: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 1, ty: 1 },
        { type: "RELOAD" },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const r = resolveOrdersSeedFromRightClick(existing, { tx: 9, ty: 3 });
    expect(r.preserved).toBe(true);
    expect(r.seeded).toBe(false);
    expect(r.plan.orders).toEqual(existing.orders);
  });

  it("preserves EXECUTING plans", () => {
    const existing: OperatorPlan = {
      orders: [{ type: "MOVE", tx: 1, ty: 1 }, { type: "RELOAD" }],
      currentIndex: 0,
      state: "EXECUTING",
      awaiting: "MOVE",
    };
    const r = resolveOrdersSeedFromRightClick(existing, { tx: 4, ty: 4 });
    expect(r.preserved).toBe(true);
    expect(r.plan.state).toBe("EXECUTING");
  });

  it("re-seeds DONE plans", () => {
    const existing: OperatorPlan = {
      ...createEmptyPlan(),
      orders: [{ type: "HOLD_ANGLE", angle: 1, point: { x: 0, y: 0 } }],
      state: "DONE",
    };
    const r = resolveOrdersSeedFromRightClick(existing, { tx: 2, ty: 2 });
    expect(r.seeded).toBe(true);
    expect(r.plan.orders[0]?.type).toBe("MOVE");
  });
});

describe("raid UI helpers", () => {
  it("operatorActivityLabel prioritizes move/reload/hold", () => {
    expect(operatorActivityLabel({ moving: true, reloadLeft: 100, holding: true, engaging: true })).toBe(
      "MOVING",
    );
    expect(operatorActivityLabel({ moving: false, reloadLeft: 1, holding: true, engaging: true })).toBe(
      "RELOADING",
    );
    expect(operatorActivityLabel({ moving: false, reloadLeft: 0, holding: true, engaging: true })).toBe(
      "HOLDING",
    );
    expect(operatorActivityLabel({ moving: false, reloadLeft: 0, holding: false, engaging: false })).toBe(
      "IDLE",
    );
  });

  it("raidInteractionHint covers pause and place modes", () => {
    expect(raidInteractionHint({ paused: true, ordersAuthoring: false, placeMode: null })).toContain(
      "TACTICAL PAUSE",
    );
    expect(raidInteractionHint({ paused: false, ordersAuthoring: false, placeMode: null })).toContain(
      "R-CLICK ACTIONS",
    );
    expect(raidInteractionHint({ paused: false, ordersAuthoring: false, placeMode: "wire" })).toContain(
      "WIRE",
    );
  });
});
