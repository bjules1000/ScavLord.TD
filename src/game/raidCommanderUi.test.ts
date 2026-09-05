import { describe, expect, it } from "bun:test";
import {
  BACKPACK_PLACEMENT,
  detailsExpandedByDefault,
  ordersAccessibleWhenDetailsCollapsed,
  RAID_COMMANDER_SIDEBAR_ORDER,
  RAID_CONTROL_ACTIONS,
  REMOVED_BOTTOM_TOOLBAR_ACTIONS,
  targetingAccessibleWhenDetailsCollapsed,
} from "./raidCommanderUi";
import {
  listOperatorWheelActions,
  listTileWheelActions,
  resolveOrdersSeedFromRightClick,
} from "./actionWheel";

describe("raid commander layout contract", () => {
  it("RAID CONTROL exposes START and EXTRACT", () => {
    expect(RAID_CONTROL_ACTIONS).toContain("START");
    expect(RAID_CONTROL_ACTIONS).toContain("EXTRACT");
  });

  it("old bottom toolbar actions are retired from persistent chrome", () => {
    expect(REMOVED_BOTTOM_TOOLBAR_ACTIONS).toEqual([
      "HIRE OPERATOR",
      "BARRICADE",
      "BARBED WIRE",
      "START WAVE",
      "EXTRACT",
    ]);
  });

  it("sidebar prioritizes control → summary → targeting → orders", () => {
    const idx = (id: (typeof RAID_COMMANDER_SIDEBAR_ORDER)[number]) =>
      RAID_COMMANDER_SIDEBAR_ORDER.indexOf(id);
    expect(idx("RAID_CONTROL")).toBeLessThan(idx("OPERATOR_SUMMARY"));
    expect(idx("OPERATOR_SUMMARY")).toBeLessThan(idx("TARGETING"));
    expect(idx("TARGETING")).toBeLessThan(idx("ORDERS"));
  });

  it("DETAILS collapsed by default; targeting + orders remain accessible", () => {
    expect(detailsExpandedByDefault()).toBe(false);
    expect(targetingAccessibleWhenDetailsCollapsed()).toBe(true);
    expect(ordersAccessibleWhenDetailsCollapsed()).toBe(true);
  });

  it("backpack renders below battlefield", () => {
    expect(BACKPACK_PLACEMENT).toBe("BELOW_BATTLEFIELD");
  });
});

describe("raid commander action access", () => {
  it("operator wheel has command actions without tile builds", () => {
    const ids = listOperatorWheelActions().map((a) => a.id);
    expect(ids).toContain("MOVE");
    expect(ids).toContain("ORDERS");
    expect(ids).toContain("HOLD_ANGLE");
    expect(ids).toContain("RELOAD");
    expect(ids).not.toContain("BARRICADE");
  });

  it("tile wheel uses validity gates", () => {
    expect(listTileWheelActions({ barricade: true, wire: false, hire: false }).map((a) => a.id)).toEqual([
      "BARRICADE",
      "CANCEL",
    ]);
    expect(listTileWheelActions({ barricade: false, wire: false, hire: false })).toEqual([]);
  });

  it("ORDERS seed preserves multi-plans", () => {
    const r = resolveOrdersSeedFromRightClick(
      {
        orders: [
          { type: "MOVE", tx: 1, ty: 1 },
          { type: "RELOAD" },
          { type: "HOLD_ANGLE", angle: 0, point: { x: 0, y: 0 } },
        ],
        currentIndex: 0,
        state: "PLANNED",
        awaiting: null,
      },
      { tx: 9, ty: 9 },
    );
    expect(r.preserved).toBe(true);
    expect(r.plan.orders).toHaveLength(3);
  });
});
