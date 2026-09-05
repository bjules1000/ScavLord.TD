import { describe, expect, it } from "bun:test";
import { buildMap, MAP_BY_ID } from "./map";
import { isOperatorMoving, operatorWorldPos } from "./movement";
import { dispatchOperatorCommand } from "./operatorCommands";
import type { Tower } from "./types";
import { weaponRuntimeFields } from "./weapons";

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

describe("operatorCommands", () => {
  const map = buildMap(MAP_BY_ID["woods"]!);

  it("MOVE sets destination without requiring simulation", () => {
    const t = op({ tx: 1, ty: 8 });
    const r = dispatchOperatorCommand(t, { type: "MOVE", tx: 3, ty: 8 }, { map, towers: [t] });
    expect(r.ok).toBe(true);
    expect(isOperatorMoving(t) || t.move?.dest != null).toBe(true);
  });

  it("revising MOVE replaces destination while still paused (no displacement)", () => {
    const t = op({ id: 1, tx: 1, ty: 8 });
    const before = { ...operatorWorldPos(t) };
    dispatchOperatorCommand(t, { type: "MOVE", tx: 4, ty: 8 }, { map, towers: [t] });
    const mid = t.move?.dest ? { ...t.move.dest } : null;
    dispatchOperatorCommand(t, { type: "MOVE", tx: 5, ty: 8 }, { map, towers: [t] });
    expect(t.move?.dest?.tx).not.toBe(mid?.tx ?? -1);
    expect(operatorWorldPos(t).x).toBeCloseTo(before.x);
    expect(operatorWorldPos(t).y).toBeCloseTo(before.y);
  });

  it("two operators can hold different planned moves", () => {
    const a = op({ id: 1, tx: 1, ty: 8 });
    const b = op({ id: 2, tx: 1, ty: 10 });
    dispatchOperatorCommand(a, { type: "MOVE", tx: 4, ty: 8 }, { map, towers: [a, b] });
    dispatchOperatorCommand(b, { type: "MOVE", tx: 3, ty: 10 }, { map, towers: [a, b] });
    expect(a.move?.dest).toBeTruthy();
    expect(b.move?.dest).toBeTruthy();
    expect(a.move!.dest!.tx).not.toBe(b.move!.dest!.tx);
  });

  it("HOLD_ANGLE sets aim without firing", () => {
    const t = op({ tx: 2, ty: 8 });
    const r = dispatchOperatorCommand(
      t,
      { type: "HOLD_ANGLE", angle: 0.5, point: { x: 100, y: 100 } },
      { map, towers: [t] },
    );
    expect(r.ok).toBe(true);
    expect(t.targetMode).toBe("HOLD_ANGLE");
    expect(t.holdAngle).toBeCloseTo(0.5);
    expect(t.cd).toBe(0);
  });

  it("RELOAD starts reloadLeft without changing ammo until sim advances", () => {
    const t = op({ tx: 2, ty: 8, ammo: 3 });
    const ammo = t.ammo;
    const r = dispatchOperatorCommand(t, { type: "RELOAD" }, { map, towers: [t] });
    expect(r.ok).toBe(true);
    expect(t.reloadLeft).toBeGreaterThan(0);
    expect(t.ammo).toBe(ammo);
  });

  it("CLEAR_MOVE removes destination", () => {
    const t = op({ tx: 2, ty: 8 });
    dispatchOperatorCommand(t, { type: "MOVE", tx: 5, ty: 8 }, { map, towers: [t] });
    expect(t.move?.dest).toBeTruthy();
    dispatchOperatorCommand(t, { type: "CLEAR_MOVE" }, { map, towers: [t] });
    expect(t.move).toBeFalsy();
  });

  it("CLEAR_HOLD restores stored AUTO preference", () => {
    const t = op({ tx: 2, ty: 8 });
    dispatchOperatorCommand(t, { type: "SET_TARGETING", mode: "STRONGEST" }, { map, towers: [t] });
    dispatchOperatorCommand(
      t,
      { type: "HOLD_ANGLE", angle: 1.2, point: { x: 100, y: 100 } },
      { map, towers: [t] },
    );
    expect(t.autoTargetMode).toBe("STRONGEST");
    dispatchOperatorCommand(t, { type: "CLEAR_HOLD_ANGLE" }, { map, towers: [t] });
    expect(t.targetMode).toBe("STRONGEST");
    expect(t.holdAngle).toBeNull();
  });

  it("SET_TARGETING MANUAL exits HOLD", () => {
    const t = op({ tx: 2, ty: 8 });
    dispatchOperatorCommand(
      t,
      { type: "HOLD_ANGLE", angle: 0.3, point: { x: 10, y: 10 } },
      { map, towers: [t] },
    );
    dispatchOperatorCommand(
      t,
      { type: "SET_TARGETING", mode: "MANUAL", manualTargetId: 7 },
      { map, towers: [t] },
    );
    expect(t.targetMode).toBe("MANUAL");
    expect(t.holdAngle).toBeNull();
    expect(t.manualTargetId).toBe(7);
  });

  it("CANCEL_RELOAD clears timer without changing ammo", () => {
    const t = op({ tx: 2, ty: 8, ammo: 2 });
    dispatchOperatorCommand(t, { type: "RELOAD" }, { map, towers: [t] });
    const ammo = t.ammo;
    expect(t.reloadLeft).toBeGreaterThan(0);
    dispatchOperatorCommand(t, { type: "CANCEL_RELOAD" }, { map, towers: [t] });
    expect(t.reloadLeft).toBe(0);
    expect(t.ammo).toBe(ammo);
  });

  it("SET_TARGETING updates mode", () => {
    const t = op({ tx: 2, ty: 8 });
    dispatchOperatorCommand(t, { type: "SET_TARGETING", mode: "MANUAL" }, { map, towers: [t] });
    expect(t.targetMode).toBe("MANUAL");
  });
});
