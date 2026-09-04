import { describe, expect, it } from "bun:test";
import {
  BATTLE_TIME_SCALES,
  clearContextualTimeOverride,
  createBattleTimeState,
  resetBattleTimeState,
  resolveEffectiveBattleTimeScale,
  setBattleTimeMode,
  setContextualTimeOverride,
  simulationStepsFromWallDt,
  toggleBattleTimePause,
} from "./battleTime";

describe("battleTime", () => {
  it("resolves PAUSED / SLOW / NORMAL / FAST scales", () => {
    expect(resolveEffectiveBattleTimeScale(createBattleTimeState({ mode: "PAUSED" }))).toBe(0);
    expect(resolveEffectiveBattleTimeScale(createBattleTimeState({ mode: "SLOW" }))).toBe(0.35);
    expect(resolveEffectiveBattleTimeScale(createBattleTimeState({ mode: "NORMAL" }))).toBe(1);
    expect(resolveEffectiveBattleTimeScale(createBattleTimeState({ mode: "FAST" }))).toBe(2);
    expect(BATTLE_TIME_SCALES.PAUSED).toBe(0);
    expect(BATTLE_TIME_SCALES.SLOW).toBe(0.35);
  });

  it("contextual slowdown caps NORMAL and FAST but cannot unpause", () => {
    const cap = { source: "grenade_aim", maxScale: 0.35 };
    expect(
      resolveEffectiveBattleTimeScale(
        setContextualTimeOverride(createBattleTimeState({ mode: "NORMAL" }), cap),
      ),
    ).toBe(0.35);
    expect(
      resolveEffectiveBattleTimeScale(
        setContextualTimeOverride(createBattleTimeState({ mode: "FAST" }), cap),
      ),
    ).toBe(0.35);
    expect(
      resolveEffectiveBattleTimeScale(
        setContextualTimeOverride(createBattleTimeState({ mode: "SLOW" }), cap),
      ),
    ).toBe(0.35);
    expect(
      resolveEffectiveBattleTimeScale(
        setContextualTimeOverride(createBattleTimeState({ mode: "PAUSED" }), cap),
      ),
    ).toBe(0);
  });

  it("clearing contextual override restores user-selected mode scale", () => {
    let s = setBattleTimeMode(createBattleTimeState(), "FAST");
    s = setContextualTimeOverride(s, { source: "grenade_aim", maxScale: 0.35 });
    expect(resolveEffectiveBattleTimeScale(s)).toBe(0.35);
    s = clearContextualTimeOverride(s);
    expect(s.mode).toBe("FAST");
    expect(resolveEffectiveBattleTimeScale(s)).toBe(2);
  });

  it("disabled controls force 1×", () => {
    const s = createBattleTimeState({ mode: "FAST", controlsEnabled: false });
    expect(resolveEffectiveBattleTimeScale(s)).toBe(1);
  });

  it("new raid / reset defaults to NORMAL", () => {
    const s = resetBattleTimeState();
    expect(s.mode).toBe("NORMAL");
    expect(s.contextual).toBeNull();
    expect(resolveEffectiveBattleTimeScale(s)).toBe(1);
  });

  it("SPACE toggles PAUSED ↔ previous active mode", () => {
    let s = setBattleTimeMode(createBattleTimeState(), "SLOW");
    s = toggleBattleTimePause(s);
    expect(s.mode).toBe("PAUSED");
    expect(s.resumeMode).toBe("SLOW");
    s = toggleBattleTimePause(s);
    expect(s.mode).toBe("SLOW");
  });

  it("simulation steps subdivide large FAST dt", () => {
    const steps = simulationStepsFromWallDt(0.05, 2);
    expect(steps.reduce((a, b) => a + b, 0)).toBeCloseTo(0.1);
    expect(steps.every((d) => d <= 0.05 + 1e-9)).toBe(true);
    expect(simulationStepsFromWallDt(0.05, 0)).toEqual([]);
  });
});
