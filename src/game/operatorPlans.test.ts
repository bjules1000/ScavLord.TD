import { describe, expect, it } from "bun:test";
import { buildMap, MAP_BY_ID } from "./map";
import { isOperatorMoving, stepOperatorMove } from "./movement";
import { dispatchOperatorCommand } from "./operatorCommands";
import {
  MAX_OPERATOR_ORDERS,
  appendOrder,
  beginPlanExecution,
  canAppendOrder,
  clearFutureOrders,
  createEmptyPlan,
  onMoveStepComplete,
  onReloadTickComplete,
  orderRowStatus,
  removeOrderAt,
  replaceOrderAt,
  resolveLeftClickMovePlan,
  startAllPlanned,
  validatePlanOrders,
  type OperatorPlan,
  type OperatorPlanBook,
} from "./operatorPlans";
import type { Tower } from "./types";
import { weaponRuntimeFields, tickReload, magSizeOf, reloadMsOf, reloadTypeOf } from "./weapons";

function op(partial: Partial<Tower> & Pick<Tower, "tx" | "ty">): Tower {
  return {
    id: 1,
    surface: "GROUND",
    weapon: "pm",
    attachments: [],
    cd: 0,
    angle: 0,
    flash: 0,
    kills: 0,
    hp: 100,
    maxHp: 100,
    hurt: 0,
    ...weaponRuntimeFields("pm"),
    ...partial,
  };
}

describe("operatorPlans validation", () => {
  it("enforces max 3 commands", () => {
    const orders = [
      { type: "MOVE" as const, tx: 1, ty: 8 },
      { type: "RELOAD" as const },
      { type: "HOLD_ANGLE" as const, angle: 0, point: { x: 1, y: 1 } },
    ];
    expect(validatePlanOrders(orders).ok).toBe(true);
    expect(canAppendOrder(orders, { type: "RELOAD" }).ok).toBe(false);
    expect(MAX_OPERATOR_ORDERS).toBe(3);
  });

  it("requires HOLD ANGLE to be last", () => {
    expect(
      validatePlanOrders([
        { type: "HOLD_ANGLE", angle: 1, point: { x: 0, y: 0 } },
        { type: "MOVE", tx: 2, ty: 8 },
      ]).ok,
    ).toBe(false);
    expect(
      canAppendOrder([{ type: "HOLD_ANGLE", angle: 1, point: { x: 0, y: 0 } }], { type: "RELOAD" }).ok,
    ).toBe(false);
  });

  it("allows MOVE → MOVE → HOLD", () => {
    expect(
      validatePlanOrders([
        { type: "MOVE", tx: 2, ty: 8 },
        { type: "MOVE", tx: 4, ty: 8 },
        { type: "HOLD_ANGLE", angle: 0, point: { x: 1, y: 1 } },
      ]).ok,
    ).toBe(true);
  });
});

describe("operatorPlans left-click semantics", () => {
  it("realtime left-click applies executing MOVE immediately", () => {
    const r = resolveLeftClickMovePlan(undefined, 5, 8, false);
    expect(r.kind).toBe("apply");
    if (r.kind === "apply") {
      expect(r.executeNow).toBe(true);
      expect(r.plan.orders).toEqual([{ type: "MOVE", tx: 5, ty: 8 }]);
      expect(r.plan.state).toBe("EXECUTING");
    }
  });

  it("paused left-click creates planned MOVE", () => {
    const r = resolveLeftClickMovePlan(undefined, 5, 8, true);
    expect(r.kind).toBe("apply");
    if (r.kind === "apply") {
      expect(r.executeNow).toBe(false);
      expect(r.plan.state).toBe("PLANNED");
    }
  });

  it("paused left-click replaces simple MOVE only", () => {
    const existing: OperatorPlan = {
      orders: [{ type: "MOVE", tx: 3, ty: 8 }],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const r = resolveLeftClickMovePlan(existing, 6, 8, true);
    expect(r.kind).toBe("apply");
    if (r.kind === "apply") {
      expect(r.plan.orders[0]).toEqual({ type: "MOVE", tx: 6, ty: 8 });
    }
  });

  it("paused left-click on multi-plan replaces first MOVE when present", () => {
    const existing: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 3, ty: 8 },
        { type: "RELOAD" },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const r = resolveLeftClickMovePlan(existing, 7, 8, true);
    expect(r.kind).toBe("apply");
    if (r.kind === "apply") {
      expect(r.plan.orders[0]).toEqual({ type: "MOVE", tx: 7, ty: 8 });
      expect(r.plan.orders[1]?.type).toBe("RELOAD");
    }
  });

  it("paused left-click refuses multi-plan that does not start with MOVE", () => {
    const existing: OperatorPlan = {
      orders: [{ type: "RELOAD" }, { type: "HOLD_ANGLE", angle: 0, point: { x: 1, y: 1 } }],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const r = resolveLeftClickMovePlan(existing, 7, 8, true);
    expect(r.kind).toBe("refuse");
  });
});

describe("operatorPlans authoring helpers", () => {
  it("append / remove / replace / clear future", () => {
    let plan = createEmptyPlan();
    const a = appendOrder(plan, { type: "MOVE", tx: 2, ty: 8 });
    expect(a.ok).toBe(true);
    plan = a.plan!;
    const b = appendOrder(plan, { type: "RELOAD" });
    plan = b.plan!;
    const c = appendOrder(plan, { type: "HOLD_ANGLE", angle: 1, point: { x: 0, y: 0 } });
    plan = c.plan!;
    expect(plan.orders.length).toBe(3);
    plan = removeOrderAt(plan, 1);
    expect(plan.orders.map((o) => o.type)).toEqual(["MOVE", "HOLD_ANGLE"]);
    const ed = replaceOrderAt(plan, 0, { type: "MOVE", tx: 9, ty: 8 });
    expect(ed.ok).toBe(true);
    plan = ed.plan!;
    expect((plan.orders[0] as { tx: number }).tx).toBe(9);
  });

  it("clearFutureOrders during EXECUTING keeps completed prefix only", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 2, ty: 8 },
        { type: "RELOAD" },
        { type: "HOLD_ANGLE", angle: 0, point: { x: 1, y: 1 } },
      ],
      currentIndex: 1,
      state: "EXECUTING",
      awaiting: "RELOAD",
    };
    const cleared = clearFutureOrders(plan);
    expect(cleared.orders.length).toBe(1);
    expect(cleared.orders[0]?.type).toBe("MOVE");
    expect(cleared.awaiting).toBeNull();
  });
});

describe("operatorPlans execution", () => {
  const map = buildMap(MAP_BY_ID["woods"]!);

  it("paused plan does not move until beginPlanExecution", () => {
    const t = op({ tx: 1, ty: 8 });
    const plan: OperatorPlan = {
      orders: [{ type: "MOVE", tx: 3, ty: 8 }],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    expect(isOperatorMoving(t)).toBe(false);
    const r = beginPlanExecution(t, plan, { map, towers: [t] });
    expect(r.ok).toBe(true);
    expect(r.plan.state).toBe("EXECUTING");
    expect(r.plan.awaiting).toBe("MOVE");
    expect(isOperatorMoving(t)).toBe(true);
  });

  it("MOVE completion advances to RELOAD", () => {
    const t = op({ id: 1, tx: 1, ty: 8, ammo: 1 });
    let plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 2, ty: 8 },
        { type: "RELOAD" },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const started = beginPlanExecution(t, plan, { map, towers: [t] });
    plan = started.plan;
    expect(plan.awaiting).toBe("MOVE");
    // Simulate arrival
    for (let i = 0; i < 200 && isOperatorMoving(t); i++) {
      const was = isOperatorMoving(t);
      stepOperatorMove(t, 0.05, map, 400);
      const step = onMoveStepComplete(t, plan, { map, towers: [t] }, was);
      plan = step.plan;
      if (step.advanced) break;
    }
    expect(plan.awaiting).toBe("RELOAD");
    expect(t.reloadLeft).toBeGreaterThan(0);
  });

  it("RELOAD completion advances to HOLD terminal", () => {
    const t = op({ id: 1, tx: 2, ty: 8, ammo: 1 });
    let plan: OperatorPlan = {
      orders: [
        { type: "RELOAD" },
        { type: "HOLD_ANGLE", angle: 0.75, point: { x: 100, y: 100 } },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    plan = beginPlanExecution(t, plan, { map, towers: [t] }).plan;
    expect(plan.awaiting).toBe("RELOAD");
    const prev = t.reloadLeft;
    const mag = magSizeOf(t.weapon);
    const reloadMs = reloadMsOf(t.weapon);
    const reloadType = reloadTypeOf(t.weapon);
    // Drain reload
    let left = t.reloadLeft;
    while (left > 0) {
      const r = tickReload(t.ammo, left, 1000, mag, reloadMs, reloadType, false);
      t.ammo = r.ammo;
      t.reloadLeft = r.reloadLeft;
      left = r.reloadLeft;
    }
    const adv = onReloadTickComplete(t, plan, { map, towers: [t] }, prev);
    plan = adv.plan;
    expect(plan.state).toBe("DONE");
    expect(t.targetMode).toBe("HOLD_ANGLE");
    expect(t.holdAngle).toBeCloseTo(0.75);
  });

  it("MOVE → MOVE → HOLD works", () => {
    const t = op({ id: 1, tx: 1, ty: 8 });
    let plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 2, ty: 8 },
        { type: "MOVE", tx: 3, ty: 8 },
        { type: "HOLD_ANGLE", angle: -1, point: { x: 0, y: 50 } },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    plan = beginPlanExecution(t, plan, { map, towers: [t] }).plan;
    for (let hop = 0; hop < 2; hop++) {
      expect(plan.awaiting).toBe("MOVE");
      for (let i = 0; i < 300 && isOperatorMoving(t); i++) {
        const was = isOperatorMoving(t);
        stepOperatorMove(t, 0.05, map, 500);
        const step = onMoveStepComplete(t, plan, { map, towers: [t] }, was);
        plan = step.plan;
        if (step.advanced) break;
      }
    }
    expect(plan.state).toBe("DONE");
    expect(t.targetMode).toBe("HOLD_ANGLE");
  });

  it("two operators execute independently", () => {
    const a = op({ id: 1, tx: 1, ty: 8 });
    const b = op({ id: 2, tx: 1, ty: 10 });
    const book: OperatorPlanBook = new Map();
    book.set(1, {
      orders: [{ type: "MOVE", tx: 3, ty: 8 }],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    });
    book.set(2, {
      orders: [{ type: "HOLD_ANGLE", angle: 1, point: { x: 10, y: 10 } }],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    });
    startAllPlanned(book, [a, b], map);
    expect(book.get(1)?.awaiting).toBe("MOVE");
    expect(book.get(2)?.state).toBe("DONE");
    expect(b.targetMode).toBe("HOLD_ANGLE");
    expect(a.targetMode).not.toBe("HOLD_ANGLE");
  });

  it("order row status marks done/current/upcoming", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 1, ty: 8 },
        { type: "RELOAD" },
        { type: "HOLD_ANGLE", angle: 0, point: { x: 1, y: 1 } },
      ],
      currentIndex: 1,
      state: "EXECUTING",
      awaiting: "RELOAD",
    };
    expect(orderRowStatus(plan, 0)).toBe("done");
    expect(orderRowStatus(plan, 1)).toBe("current");
    expect(orderRowStatus(plan, 2)).toBe("upcoming");
  });

  it("seed MOVE from right-click tile is just a MOVE order", () => {
    const seeded = appendOrder(createEmptyPlan(), { type: "MOVE", tx: 4, ty: 9 });
    expect(seeded.ok).toBe(true);
    expect(seeded.plan!.orders[0]).toEqual({ type: "MOVE", tx: 4, ty: 9 });
  });
});

describe("operatorPlans dispatch still uses command boundary", () => {
  const map = buildMap(MAP_BY_ID["woods"]!);
  it("HOLD via plan matches dispatchOperatorCommand", () => {
    const t = op({ tx: 2, ty: 8 });
    dispatchOperatorCommand(
      t,
      { type: "HOLD_ANGLE", angle: 2, point: { x: 1, y: 2 } },
      { map, towers: [t] },
    );
    expect(t.holdAngle).toBeCloseTo(2);
  });
});
