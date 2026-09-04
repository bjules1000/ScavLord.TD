import { describe, expect, it } from "bun:test";
import {
  createBattleTimeState,
  resolveEffectiveBattleTimeScale,
  setBattleTimeMode,
  simulationStepsFromWallDt,
} from "./battleTime";
import { TILE } from "./data";
import { hasLineOfSight } from "./los";
import { buildMap, MAP_BY_ID } from "./map";
import { dispatchOperatorCommand } from "./operatorCommands";
import {
  beginPlanExecution,
  onMoveStepComplete,
  onReloadTickComplete,
  type OperatorPlan,
} from "./operatorPlans";
import { isOperatorMoving, stepOperatorMove } from "./movement";
import {
  inRange,
  isHoldAimActive,
  resolveOperatorAimAngle,
  selectTarget,
} from "./targeting";
import type { Tower } from "./types";
import {
  magSizeOf,
  reloadMsOf,
  reloadTypeOf,
  tickReload,
  weaponRuntimeFields,
} from "./weapons";
import { isInFiringSector, spawnRifleShot } from "./shooting";

function openTestMap(over: Parameters<typeof buildMap>[0] extends infer T ? Partial<T> : never = {}) {
  return buildMap({
    id: "hold-aim-test",
    name: "hold-aim-test",
    threat: 1,
    threatLabel: "TEST",
    desc: "",
    hpMult: 1,
    lootMult: 1,
    geo: { x: 0, y: 0 },
    sector: "T",
    path: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    props: [],
    checkpoint: [],
    cover: [],
    crates: [],
    palette: MAP_BY_ID["woods"]!.palette,
    ...over,
  });
}

function at(tx: number, ty: number) {
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

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

/** Mirrors combat-tick HOLD fire eligibility (sector ∩ range ∩ LOS). */
function holdCanFireAt(
  origin: { x: number; y: number },
  holdAngle: number,
  halfCone: number,
  range: number,
  enemy: { x: number; y: number; surface?: string },
  map: ReturnType<typeof buildMap>,
): boolean {
  if (!inRange(origin, range, enemy)) return false;
  const shooter = { x: origin.x, y: origin.y, surface: "GROUND" as const };
  if (
    !hasLineOfSight(map, shooter, {
      x: enemy.x,
      y: enemy.y,
      surface: (enemy.surface as "GROUND" | "HIGH") ?? "GROUND",
    })
  ) {
    return false;
  }
  return isInFiringSector(origin.x, origin.y - 4, holdAngle, halfCone, enemy.x, enemy.y);
}

describe("HOLD ANGLE aim lock", () => {
  const map = buildMap(MAP_BY_ID["woods"]!);

  it("HOLD ANGLE fixes aim direction", () => {
    const t = op({ tx: 2, ty: 8 });
    dispatchOperatorCommand(
      t,
      { type: "HOLD_ANGLE", angle: Math.PI / 2, point: { x: 50, y: 100 } },
      { map, towers: [t] },
    );
    expect(isHoldAimActive(t)).toBe(true);
    expect(t.angle).toBeCloseTo(Math.PI / 2);
    expect(t.holdAngle).toBeCloseTo(Math.PI / 2);
  });

  for (const mode of ["FIRST", "LAST", "CLOSEST", "STRONGEST"] as const) {
    it(`${mode} cannot recenter while HOLD active`, () => {
      const t = op({ tx: 2, ty: 8, targetMode: mode, autoTargetMode: mode });
      const hold = Math.PI; // west
      dispatchOperatorCommand(
        t,
        { type: "HOLD_ANGLE", angle: hold, point: { x: 0, y: 64 } },
        { map, towers: [t] },
      );
      const best = selectTarget(mode, { x: 32, y: 64 }, 500, [
        { id: 9, x: 32, y: 0, hp: 50, pathProgress: 5 },
      ]);
      expect(best).not.toBeNull();
      const aim = resolveOperatorAimAngle({
        holding: isHoldAimActive(t),
        holdAngle: t.holdAngle,
        targetMode: t.targetMode,
        locked: null,
        best,
        originX: 32,
        originY: 64,
        currentAngle: t.angle,
      });
      expect(aim).toBeCloseTo(hold);
    });
  }

  it("eligible enemy inside HOLD cone can still trigger firing", () => {
    const origin = { x: 0, y: 0 };
    const hold = 0;
    expect(holdCanFireAt(origin, hold, Math.PI / 6, 200, { x: 100, y: 5 }, map)).toBe(true);
  });

  it("enemy outside HOLD cone does not cause recenter/firing", () => {
    const hold = 0;
    const best = { id: 1, x: 0, y: 100, hp: 10, pathProgress: 1 };
    const aim = resolveOperatorAimAngle({
      holding: true,
      holdAngle: hold,
      targetMode: "HOLD_ANGLE",
      locked: null,
      best,
      originX: 0,
      originY: 0,
      currentAngle: hold,
    });
    expect(aim).toBe(0);
    expect(holdCanFireAt({ x: 0, y: 0 }, hold, Math.PI / 12, 500, { x: 0, y: 100 }, map)).toBe(
      false,
    );
  });

  it("HOLD respects range", () => {
    const open = openTestMap();
    const origin = at(1, 2);
    const far = at(8, 2);
    expect(inRange(origin, 50, far)).toBe(false);
    expect(holdCanFireAt(origin, 0, Math.PI / 4, 50, far, open)).toBe(false);
    expect(inRange(origin, 500, far)).toBe(true);
    expect(holdCanFireAt(origin, 0, Math.PI / 4, 500, far, open)).toBe(true);
  });

  it("HOLD respects LOS", () => {
    const blocked = openTestMap({ mountain: [[3, 2]] });
    const origin = at(1, 2);
    const target = at(6, 2);
    expect(
      hasLineOfSight(
        blocked,
        { ...origin, surface: "GROUND" },
        { ...target, surface: "GROUND" },
      ),
    ).toBe(false);
    expect(holdCanFireAt(origin, 0, Math.PI / 3, 500, target, blocked)).toBe(false);
  });

  it("selectTarget(HOLD_ANGLE) never returns an AUTO pick", () => {
    const enemies = [
      { id: 1, x: 100, y: 0, hp: 99, pathProgress: 9 },
      { id: 2, x: 10, y: 0, hp: 1, pathProgress: 1 },
    ];
    expect(selectTarget("HOLD_ANGLE", { x: 0, y: 0 }, 500, enemies)).toBeNull();
  });

  it("physical projectile direction follows held angle, not enemy center", () => {
    const hold = Math.PI / 4;
    const proj = spawnRifleShot({
      nextId: () => 1,
      shooterId: 1,
      origin: { x: 0, y: 0 },
      aimAngle: hold,
      accuracy: 0.99,
      range: 400,
      damage: 10,
      pen: 0,
      color: "#fff",
      surface: "GROUND",
      rng: () => 0.5,
    });
    expect(Math.abs(proj.angle - hold)).toBeLessThan(0.15);
  });

  it("HOLD activation clears manual lock and remembers AUTO preference", () => {
    const t = op({ tx: 2, ty: 8, targetMode: "STRONGEST", autoTargetMode: "FIRST" });
    t.manualTargetId = 42;
    t.engageTargetId = 42;
    dispatchOperatorCommand(t, { type: "SET_TARGETING", mode: "STRONGEST" }, { map, towers: [t] });
    dispatchOperatorCommand(
      t,
      { type: "HOLD_ANGLE", angle: 1, point: { x: 1, y: 1 } },
      { map, towers: [t] },
    );
    expect(t.manualTargetId).toBeNull();
    expect(t.engageTargetId).toBeNull();
    expect(t.autoTargetMode).toBe("STRONGEST");
    expect(t.targetMode).toBe("HOLD_ANGLE");
  });

  it("CLEAR HOLD restores stored AUTO targeting preference", () => {
    const t = op({ tx: 2, ty: 8 });
    dispatchOperatorCommand(t, { type: "SET_TARGETING", mode: "CLOSEST" }, { map, towers: [t] });
    dispatchOperatorCommand(
      t,
      { type: "HOLD_ANGLE", angle: 0.2, point: { x: 1, y: 1 } },
      { map, towers: [t] },
    );
    dispatchOperatorCommand(t, { type: "CLEAR_HOLD_ANGLE" }, { map, towers: [t] });
    expect(t.targetMode).toBe("CLOSEST");
    expect(t.holdAngle).toBeNull();
    expect(isHoldAimActive(t)).toBe(false);
  });

  it("MANUAL selection exits HOLD and does not leave stale hold angle", () => {
    const t = op({ tx: 2, ty: 8 });
    dispatchOperatorCommand(
      t,
      { type: "HOLD_ANGLE", angle: 0.9, point: { x: 1, y: 1 } },
      { map, towers: [t] },
    );
    dispatchOperatorCommand(
      t,
      { type: "SET_TARGETING", mode: "MANUAL", manualTargetId: 3 },
      { map, towers: [t] },
    );
    expect(isHoldAimActive(t)).toBe(false);
    expect(t.holdAngle).toBeNull();
    expect(t.targetMode).toBe("MANUAL");
  });

  for (const mode of ["FIRST", "LAST", "CLOSEST", "STRONGEST"] as const) {
    it(`selecting ${mode} while HOLD active clears HOLD and resumes ${mode}`, () => {
      const t = op({ tx: 2, ty: 8 });
      dispatchOperatorCommand(
        t,
        { type: "HOLD_ANGLE", angle: 0.5, point: { x: 1, y: 1 } },
        { map, towers: [t] },
      );
      dispatchOperatorCommand(t, { type: "SET_TARGETING", mode }, { map, towers: [t] });
      expect(isHoldAimActive(t)).toBe(false);
      expect(t.holdAngle).toBeNull();
      expect(t.targetMode).toBe(mode);
      expect(t.autoTargetMode).toBe(mode);
    });
  }

  it("PAUSE does not advance fire while HOLD planned/active", () => {
    const paused = setBattleTimeMode(createBattleTimeState(), "PAUSED");
    expect(resolveEffectiveBattleTimeScale(paused)).toBe(0);
    expect(simulationStepsFromWallDt(0.016, 0)).toEqual([]);
    const t = op({ tx: 2, ty: 8 });
    dispatchOperatorCommand(
      t,
      { type: "HOLD_ANGLE", angle: 0.4, point: { x: 10, y: 10 } },
      { map, towers: [t] },
    );
    expect(isHoldAimActive(t)).toBe(true);
    expect(t.cd).toBe(0);
    expect(t.ammo).toBeGreaterThan(0);
  });

  it("resume restores non-zero scale so HOLD firing can resume", () => {
    let bt = setBattleTimeMode(createBattleTimeState(), "PAUSED");
    bt = setBattleTimeMode(bt, bt.resumeMode);
    expect(resolveEffectiveBattleTimeScale(bt)).toBeGreaterThan(0);
    expect(simulationStepsFromWallDt(0.05, resolveEffectiveBattleTimeScale(bt)).length).toBeGreaterThan(
      0,
    );
  });

  it("HOLD survives OperatorPlan becoming DONE", () => {
    const t = op({ id: 1, tx: 1, ty: 8 });
    let plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 2, ty: 8 },
        { type: "HOLD_ANGLE", angle: -0.8, point: { x: 0, y: 50 } },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    plan = beginPlanExecution(t, plan, { map, towers: [t] }).plan;
    for (let i = 0; i < 400 && isOperatorMoving(t); i++) {
      const was = isOperatorMoving(t);
      stepOperatorMove(t, 0.05, map, 500);
      const step = onMoveStepComplete(t, plan, { map, towers: [t] }, was);
      plan = step.plan;
      if (step.advanced) break;
    }
    expect(plan.state).toBe("DONE");
    expect(isHoldAimActive(t)).toBe(true);
    expect(t.holdAngle).toBeCloseTo(-0.8);
    const best = selectTarget("FIRST", { x: 40, y: 64 }, 400, [
      { id: 3, x: 200, y: 64, hp: 10, pathProgress: 8 },
    ]);
    const aim = resolveOperatorAimAngle({
      holding: isHoldAimActive(t),
      holdAngle: t.holdAngle,
      targetMode: t.targetMode,
      locked: null,
      best,
      originX: 40,
      originY: 64,
      currentAngle: t.angle,
    });
    expect(aim).toBeCloseTo(-0.8);
  });

  it("MOVE → RELOAD → HOLD ends with persistent HOLD", () => {
    const t = op({ id: 1, tx: 1, ty: 8, ammo: 1 });
    let plan: OperatorPlan = {
      orders: [
        { type: "MOVE", tx: 2, ty: 8 },
        { type: "RELOAD" },
        { type: "HOLD_ANGLE", angle: 1.1, point: { x: 80, y: 80 } },
      ],
      currentIndex: 0,
      state: "PLANNED",
      awaiting: null,
    };
    plan = beginPlanExecution(t, plan, { map, towers: [t] }).plan;
    for (let i = 0; i < 400 && plan.awaiting === "MOVE"; i++) {
      const was = isOperatorMoving(t);
      stepOperatorMove(t, 0.05, map, 500);
      plan = onMoveStepComplete(t, plan, { map, towers: [t] }, was).plan;
    }
    expect(plan.awaiting).toBe("RELOAD");
    const prev = t.reloadLeft;
    const mag = magSizeOf(t.weapon);
    const reloadMs = reloadMsOf(t.weapon);
    const reloadType = reloadTypeOf(t.weapon);
    let left = t.reloadLeft;
    while (left > 0) {
      const r = tickReload(t.ammo, left, 2000, mag, reloadMs, reloadType, false);
      t.ammo = r.ammo;
      t.reloadLeft = r.reloadLeft;
      left = r.reloadLeft;
    }
    plan = onReloadTickComplete(t, plan, { map, towers: [t] }, prev).plan;
    expect(plan.state).toBe("DONE");
    expect(isHoldAimActive(t)).toBe(true);
    expect(t.holdAngle).toBeCloseTo(1.1);
  });

  it("Ash and Wolf retain independent HOLD angles", () => {
    const ash = op({ id: 1, tx: 2, ty: 8 });
    const wolf = op({ id: 2, tx: 4, ty: 8 });
    dispatchOperatorCommand(
      ash,
      { type: "HOLD_ANGLE", angle: 0, point: { x: 100, y: 64 } },
      { map, towers: [ash, wolf] },
    );
    dispatchOperatorCommand(
      wolf,
      { type: "HOLD_ANGLE", angle: -Math.PI / 2, point: { x: 64, y: 0 } },
      { map, towers: [ash, wolf] },
    );
    expect(ash.holdAngle).toBeCloseTo(0);
    expect(wolf.holdAngle).toBeCloseTo(-Math.PI / 2);
    expect(ash.targetMode).toBe("HOLD_ANGLE");
    expect(wolf.targetMode).toBe("HOLD_ANGLE");
  });
});
