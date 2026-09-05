import { describe, expect, it } from "bun:test";
import { buildMap, MAP_BY_ID } from "./map";
import { isOperatorMoving, stepOperatorMove } from "./movement";
import { dispatchOperatorCommand } from "./operatorCommands";
import {
  MAX_OPERATOR_ORDERS,
  activeOrderCount,
  appendOrder,
  beginPlanExecution,
  canAppendOrder,
  canAppendToPlan,
  clearFutureOrders,
  createEmptyPlan,
  getProjectedOperatorPositionBeforeOrder,
  getProjectedActionGeometry,
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
import { TILE } from "./data";
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
    const removed = removeOrderAt(plan, 1);
    expect(removed.ok).toBe(true);
    plan = removed.plan!;
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

describe("live plan extension while EXECUTING", () => {
  const map = buildMap(MAP_BY_ID["woods"]!);

  it("executing MOVE still allows + ADD COMMAND", () => {
    const t = op({ id: 1, tx: 1, ty: 8 });
    let plan = beginPlanExecution(
      t,
      {
        orders: [{ type: "MOVE", tx: 3, ty: 8 }],
        currentIndex: 0,
        state: "PLANNED",
        awaiting: null,
      },
      { map, towers: [t] },
    ).plan;
    expect(plan.state).toBe("EXECUTING");
    expect(plan.awaiting).toBe("MOVE");
    const destTx = t.move?.dest?.tx;
    const pathLen = t.move?.path?.length ?? 0;
    const add = appendOrder(plan, { type: "RELOAD" });
    expect(add.ok).toBe(true);
    plan = add.plan!;
    expect(plan.awaiting).toBe("MOVE");
    expect(plan.currentIndex).toBe(0);
    expect(t.move?.dest?.tx).toBe(destTx);
    expect(t.move?.path?.length ?? 0).toBe(pathLen);
    expect(plan.orders.map((o) => o.type)).toEqual(["MOVE", "RELOAD"]);
  });

  it("adding HOLD does not restart MOVE", () => {
    const t = op({ id: 1, tx: 1, ty: 8 });
    let plan = beginPlanExecution(
      t,
      {
        orders: [{ type: "MOVE", tx: 3, ty: 8 }],
        currentIndex: 0,
        state: "PLANNED",
        awaiting: null,
      },
      { map, towers: [t] },
    ).plan;
    const pathBefore = [...(t.move?.path ?? [])];
    plan = appendOrder(plan, {
      type: "HOLD_ANGLE",
      angle: 0.5,
      point: { x: 100, y: 100 },
    }).plan!;
    expect(plan.awaiting).toBe("MOVE");
    expect(t.move?.path).toEqual(pathBefore);
  });

  it("future command can be removed while MOVE executes", () => {
    const t = op({ id: 1, tx: 1, ty: 8 });
    let plan = beginPlanExecution(
      t,
      {
        orders: [
          { type: "MOVE", tx: 3, ty: 8 },
          { type: "RELOAD" },
          { type: "HOLD_ANGLE", angle: 1, point: { x: 0, y: 0 } },
        ],
        currentIndex: 0,
        state: "PLANNED",
        awaiting: null,
      },
      { map, towers: [t] },
    ).plan;
    const pathLen = t.move?.path?.length ?? 0;
    const rem = removeOrderAt(plan, 1);
    expect(rem.ok).toBe(true);
    plan = rem.plan!;
    expect(plan.orders.map((o) => o.type)).toEqual(["MOVE", "HOLD_ANGLE"]);
    expect(plan.awaiting).toBe("MOVE");
    expect(t.move?.path?.length ?? 0).toBe(pathLen);
  });

  it("current executing command is protected from ORDERS edit/remove", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 3, ty: 8 },
        { type: "RELOAD" },
      ],
      currentIndex: 0,
      state: "EXECUTING",
      awaiting: "MOVE",
    };
    expect(removeOrderAt(plan, 0).ok).toBe(false);
    expect(
      replaceOrderAt(plan, 0, { type: "MOVE", tx: 9, ty: 8 }).ok,
    ).toBe(false);
    expect(removeOrderAt(plan, 1).ok).toBe(true);
  });

  it("CLEAR future commands does not rewind current gameplay", () => {
    const t = op({ id: 1, tx: 1, ty: 8 });
    let plan = beginPlanExecution(
      t,
      {
        orders: [
          { type: "MOVE", tx: 3, ty: 8 },
          { type: "RELOAD" },
        ],
        currentIndex: 0,
        state: "PLANNED",
        awaiting: null,
      },
      { map, towers: [t] },
    ).plan;
    expect(isOperatorMoving(t)).toBe(true);
    const cleared = clearFutureOrders(plan);
    expect(cleared.state).toBe("DONE");
    expect(cleared.orders).toEqual([]);
    expect(isOperatorMoving(t)).toBe(true);
  });

  it("completed commands do not permanently consume the 3-command active buffer", () => {
    const t = op({ id: 1, tx: 1, ty: 8, ammo: 1 });
    let plan = beginPlanExecution(
      t,
      {
        orders: [
          { type: "MOVE", tx: 2, ty: 8 },
          { type: "RELOAD" },
        ],
        currentIndex: 0,
        state: "PLANNED",
        awaiting: null,
      },
      { map, towers: [t] },
    ).plan;
    for (let i = 0; i < 300 && isOperatorMoving(t); i++) {
      const was = isOperatorMoving(t);
      stepOperatorMove(t, 0.05, map, 500);
      const step = onMoveStepComplete(t, plan, { map, towers: [t] }, was);
      plan = step.plan;
      if (step.advanced) break;
    }
    expect(plan.awaiting).toBe("RELOAD");
    // MOVE compacted out — active buffer has room
    expect(activeOrderCount(plan)).toBe(1);
    expect(canAppendToPlan(plan, { type: "HOLD_ANGLE", angle: 0, point: { x: 0, y: 0 } }).ok).toBe(
      true,
    );
    plan = appendOrder(plan, { type: "HOLD_ANGLE", angle: 0.2, point: { x: 1, y: 1 } }).plan!;
    expect(plan.orders.map((o) => o.type)).toEqual(["RELOAD", "HOLD_ANGLE"]);
    expect(plan.awaiting).toBe("RELOAD");
  });

  it("maximum 3 current/upcoming commands remains enforced", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 1, ty: 8 },
        { type: "RELOAD" },
        { type: "HOLD_ANGLE", angle: 0, point: { x: 0, y: 0 } },
      ],
      currentIndex: 0,
      state: "EXECUTING",
      awaiting: "MOVE",
    };
    expect(canAppendToPlan(plan, { type: "MOVE", tx: 2, ty: 8 }).ok).toBe(false);
  });

  it("multiple operators can independently append during execution", () => {
    const a = op({ id: 1, tx: 1, ty: 8 });
    const b = op({ id: 2, tx: 1, ty: 10 });
    let pa = beginPlanExecution(
      a,
      {
        orders: [{ type: "MOVE", tx: 3, ty: 8 }],
        currentIndex: 0,
        state: "PLANNED",
        awaiting: null,
      },
      { map, towers: [a, b] },
    ).plan;
    let pb = beginPlanExecution(
      b,
      {
        orders: [{ type: "MOVE", tx: 3, ty: 10 }],
        currentIndex: 0,
        state: "PLANNED",
        awaiting: null,
      },
      { map, towers: [a, b] },
    ).plan;
    pa = appendOrder(pa, { type: "RELOAD" }).plan!;
    pb = appendOrder(pb, {
      type: "HOLD_ANGLE",
      angle: -0.5,
      point: { x: 0, y: 0 },
    }).plan!;
    expect(pa.orders.map((o) => o.type)).toEqual(["MOVE", "RELOAD"]);
    expect(pb.orders.map((o) => o.type)).toEqual(["MOVE", "HOLD_ANGLE"]);
    expect(pa.awaiting).toBe("MOVE");
    expect(pb.awaiting).toBe("MOVE");
  });
});

describe("projected operator position before order", () => {
  const TILE_SZ = TILE;

  it("HOLD after MOVE uses MOVE destination as origin", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 8, ty: 4 },
        { type: "HOLD_ANGLE", angle: 0, point: { x: 0, y: 0 } },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const origin = getProjectedOperatorPositionBeforeOrder(
      { x: 3.5 * TILE_SZ, y: 8.5 * TILE_SZ },
      plan,
      1,
      TILE_SZ,
    );
    expect(origin.x).toBeCloseTo(8.5 * TILE_SZ);
    expect(origin.y).toBeCloseTo(4.5 * TILE_SZ);
  });

  it("HOLD after MOVE→MOVE uses second destination", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 5, ty: 8 },
        { type: "MOVE", tx: 9, ty: 3 },
        { type: "HOLD_ANGLE", angle: 0, point: { x: 0, y: 0 } },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const origin = getProjectedOperatorPositionBeforeOrder(
      { x: 1 * TILE_SZ, y: 1 * TILE_SZ },
      plan,
      2,
      TILE_SZ,
    );
    expect(origin.x).toBeCloseTo(9.5 * TILE_SZ);
    expect(origin.y).toBeCloseTo(3.5 * TILE_SZ);
  });

  it("HOLD after RELOAD→MOVE uses MOVE destination", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "RELOAD" },
        { type: "MOVE", tx: 4, ty: 6 },
        { type: "HOLD_ANGLE", angle: 0, point: { x: 0, y: 0 } },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const cur = { x: 2.5 * TILE_SZ, y: 8.5 * TILE_SZ };
    const origin = getProjectedOperatorPositionBeforeOrder(cur, plan, 2, TILE_SZ);
    expect(origin.x).toBeCloseTo(4.5 * TILE_SZ);
    expect(origin.y).toBeCloseTo(6.5 * TILE_SZ);
  });

  it("HOLD with no previous MOVE uses current operator position", () => {
    const plan: OperatorPlan = {
      orders: [{ type: "HOLD_ANGLE", angle: 0, point: { x: 0, y: 0 } }],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const cur = { x: 100, y: 200 };
    expect(getProjectedOperatorPositionBeforeOrder(cur, plan, 0, TILE_SZ)).toEqual(cur);
  });

  it("executing MOVE + appended HOLD uses final MOVE destination, not interpolated pos", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 8, ty: 4 },
        { type: "HOLD_ANGLE", angle: 1, point: { x: 0, y: 0 } },
      ],
      currentIndex: 0,
      state: "EXECUTING",
      awaiting: "MOVE",
    };
    // Physical halfway — still project HOLD from A
    const halfway = { x: 5 * TILE_SZ, y: 6 * TILE_SZ };
    const origin = getProjectedOperatorPositionBeforeOrder(halfway, plan, 1, TILE_SZ);
    expect(origin.x).toBeCloseTo(8.5 * TILE_SZ);
    expect(origin.y).toBeCloseTo(4.5 * TILE_SZ);
  });

  it("executing MOVE + appended MOVE + HOLD uses final planned destination", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 5, ty: 8 },
        { type: "MOVE", tx: 9, ty: 2 },
        { type: "HOLD_ANGLE", angle: 0, point: { x: 0, y: 0 } },
      ],
      currentIndex: 0,
      state: "EXECUTING",
      awaiting: "MOVE",
    };
    const origin = getProjectedOperatorPositionBeforeOrder(
      { x: 1 * TILE_SZ, y: 8 * TILE_SZ },
      plan,
      2,
      TILE_SZ,
    );
    expect(origin.x).toBeCloseTo(9.5 * TILE_SZ);
    expect(origin.y).toBeCloseTo(2.5 * TILE_SZ);
  });

  it("editing earlier MOVE updates downstream HOLD preview origin without changing angle", () => {
    const holdAngle = Math.PI; // EAST-ish stored angle preserved
    let plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 5, ty: 8 },
        { type: "HOLD_ANGLE", angle: holdAngle, point: { x: 200, y: 100 } },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const before = getProjectedOperatorPositionBeforeOrder(
      { x: 0, y: 0 },
      plan,
      1,
      TILE_SZ,
    );
    expect(before.x).toBeCloseTo(5.5 * TILE_SZ);
    const replaced = replaceOrderAt(plan, 0, { type: "MOVE", tx: 9, ty: 3 });
    expect(replaced.ok).toBe(true);
    plan = replaced.plan!;
    expect((plan.orders[1] as { angle: number }).angle).toBe(holdAngle);
    const after = getProjectedOperatorPositionBeforeOrder({ x: 0, y: 0 }, plan, 1, TILE_SZ);
    expect(after.x).toBeCloseTo(9.5 * TILE_SZ);
    expect(after.y).toBeCloseTo(3.5 * TILE_SZ);
  });

  it("projected-position helper ignores non-positional commands", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "RELOAD" },
        { type: "HOLD_ANGLE", angle: 0, point: { x: 0, y: 0 } },
        { type: "MOVE", tx: 7, ty: 7 },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const cur = { x: 44, y: 88 };
    // Before MOVE at index 2: RELOAD+HOLD do not move projection
    expect(getProjectedOperatorPositionBeforeOrder(cur, plan, 2, TILE_SZ)).toEqual(cur);
  });

  it("authors HOLD geometry around the preceding MOVE destination", () => {
    const plan: OperatorPlan = {
      orders: [{ type: "MOVE", tx: 8, ty: 4 }],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const destination = { x: 8.5 * TILE_SZ, y: 4.5 * TILE_SZ };
    const target = { x: destination.x + 100, y: destination.y - 4 };
    const geometry = getProjectedActionGeometry(
      { x: 2.5 * TILE_SZ, y: 9.5 * TILE_SZ },
      plan,
      plan.orders.length,
      TILE_SZ,
      target,
    );

    expect(geometry.origin).toEqual(destination);
    expect(geometry.angle).toBeCloseTo(0);
    expect(geometry.point).toEqual(target);
  });

  it("provides destination-relative origin and target for future thrown actions", () => {
    const plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 5, ty: 6 },
        { type: "RELOAD" },
        { type: "MOVE", tx: 10, ty: 3 },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    const target = { x: 420, y: 240 };
    const geometry = getProjectedActionGeometry(
      { x: 20, y: 20 },
      plan,
      plan.orders.length,
      TILE_SZ,
      target,
    );

    expect(geometry.origin).toEqual({ x: 10.5 * TILE_SZ, y: 3.5 * TILE_SZ });
    expect(geometry.point).toEqual(target);
  });
});
