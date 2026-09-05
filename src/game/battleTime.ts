/**
 * Canonical battle-time control for active raids.
 *
 * SIMULATION CLOCK — scaled by effectiveBattleTimeScale (enemies, operators,
 * projectiles, reloads, waves, M8 timers).
 * UI / WALL CLOCK — unscaled (HUD clicks, hover, selection, DEV tools).
 */

export type BattleTimeMode = "PAUSED" | "SLOW" | "NORMAL" | "FAST";

export const BATTLE_TIME_SCALES: Record<BattleTimeMode, number> = {
  PAUSED: 0,
  SLOW: 0.35,
  NORMAL: 1,
  FAST: 2,
};

/** Max simulation step after scaling (avoids tunneling at FAST). */
export const BATTLE_TIME_MAX_SIM_DT = 0.05;

export type ContextualTimeOverride = {
  source: string;
  /** Cap effective scale to this value (e.g. grenade aim 0.35). Never unpauses. */
  maxScale: number;
} | null;

export type BattleTimeState = {
  mode: BattleTimeMode;
  /** Mode restored when leaving PAUSED via SPACE or resume. */
  resumeMode: BattleTimeMode;
  contextual: ContextualTimeOverride;
  /** Future co-op: false forces 1× and hides controls. Solo default true. */
  controlsEnabled: boolean;
};

export function createBattleTimeState(
  partial?: Partial<BattleTimeState>,
): BattleTimeState {
  return {
    mode: "NORMAL",
    resumeMode: "NORMAL",
    contextual: null,
    controlsEnabled: true,
    ...partial,
  };
}

export function battleTimeScaleForMode(mode: BattleTimeMode): number {
  return BATTLE_TIME_SCALES[mode];
}

/**
 * Resolve effective simulation scale.
 * - controlsEnabled false → always 1×
 * - PAUSED → always 0× (contextual cannot unpause)
 * - otherwise min(modeScale, contextual.maxScale) when contextual set
 */
export function resolveEffectiveBattleTimeScale(state: BattleTimeState): number {
  if (!state.controlsEnabled) return 1;
  if (state.mode === "PAUSED") return 0;
  const base = battleTimeScaleForMode(state.mode);
  if (state.contextual && Number.isFinite(state.contextual.maxScale)) {
    return Math.min(base, Math.max(0, state.contextual.maxScale));
  }
  return base;
}

export function setBattleTimeMode(state: BattleTimeState, mode: BattleTimeMode): BattleTimeState {
  if (!state.controlsEnabled) {
    return { ...state, mode: "NORMAL", resumeMode: "NORMAL" };
  }
  if (mode === "PAUSED") {
    const resume = state.mode === "PAUSED" ? state.resumeMode : state.mode;
    return { ...state, mode: "PAUSED", resumeMode: resume === "PAUSED" ? "NORMAL" : resume };
  }
  return { ...state, mode, resumeMode: mode };
}

/** SPACE: PAUSED ↔ previous active mode. */
export function toggleBattleTimePause(state: BattleTimeState): BattleTimeState {
  if (!state.controlsEnabled) return state;
  if (state.mode === "PAUSED") {
    const resume = state.resumeMode === "PAUSED" ? "NORMAL" : state.resumeMode;
    return { ...state, mode: resume, resumeMode: resume };
  }
  return setBattleTimeMode(state, "PAUSED");
}

export function setContextualTimeOverride(
  state: BattleTimeState,
  contextual: ContextualTimeOverride,
): BattleTimeState {
  return { ...state, contextual };
}

export function clearContextualTimeOverride(state: BattleTimeState): BattleTimeState {
  return { ...state, contextual: null };
}

/** Reset transient raid time state (new raid / leave / extract). */
export function resetBattleTimeState(controlsEnabled = true): BattleTimeState {
  return createBattleTimeState({ controlsEnabled });
}

/**
 * Convert wall-clock frame delta into one or more simulation steps.
 * Scale is applied after the wall cap; large FAST steps are sub-stepped.
 */
export function simulationStepsFromWallDt(
  wallDtSec: number,
  scale: number,
  wallCap = BATTLE_TIME_MAX_SIM_DT,
  simCap = BATTLE_TIME_MAX_SIM_DT,
): number[] {
  const cappedWall = Math.max(0, Math.min(wallCap, wallDtSec));
  const total = cappedWall * Math.max(0, scale);
  if (total <= 0) return [];
  const steps: number[] = [];
  let left = total;
  while (left > 1e-9) {
    const step = Math.min(simCap, left);
    steps.push(step);
    left -= step;
  }
  return steps;
}

export const BATTLE_TIME_MODE_ORDER: BattleTimeMode[] = ["PAUSED", "SLOW", "NORMAL", "FAST"];

export function battleTimeModeLabel(mode: BattleTimeMode): string {
  switch (mode) {
    case "PAUSED":
      return "II";
    case "SLOW":
      return ">~";
    case "NORMAL":
      return ">";
    case "FAST":
      return ">>";
  }
}

export function battleTimeModeTitle(mode: BattleTimeMode): string {
  switch (mode) {
    case "PAUSED":
      return "PAUSE 0×";
    case "SLOW":
      return "SLOW 0.35×";
    case "NORMAL":
      return "NORMAL 1×";
    case "FAST":
      return "FAST 2×";
  }
}
