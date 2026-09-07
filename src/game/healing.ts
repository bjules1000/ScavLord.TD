/**
 * Canonical heal-over-time channel for meds.
 *
 * Healing is no longer instant: it restores HP in discrete chunks over time,
 * proportional to the amount actually needed (topping off 10 HP is much
 * faster than healing from near-death), not a flat cast time per item.
 *
 * Chunking (not a smooth per-frame drain, not a single instant grant) keeps
 * the HP bar readable and matches how the crate/reload channels already
 * feel elsewhere in this game. tickHealing accumulates elapsed time and only
 * commits a chunk once a full tick interval has passed, looping internally
 * so a single large dt (a slow frame, or a paused-then-resumed game) still
 * yields the exact same total heal as many small dts covering the same
 * elapsed time — this must never become frame-rate dependent.
 */

import type { ItemDef } from "./gear";

export const DEFAULT_HEAL_TICK_MS = 400;
/** Fallback rate for a med with no authored healRate. */
export const DEFAULT_HEAL_RATE = 6;

export interface HealingState {
  medId: string;
  medName: string;
  /** HP still to be applied before the channel completes. */
  remainingHeal: number;
  /** HP this channel will restore in total, once complete — for progress display. */
  totalHeal: number;
  /** HP per second. */
  rate: number;
  /** Accumulated ms toward the next chunk. */
  tickAccumMs: number;
}

/**
 * Start a heal channel. The amount is clamped to what's actually needed —
 * a SURGEON KIT used on someone missing 10 HP only channels 10 HP worth of
 * time, not its full authored capacity. Returns null when there is nothing
 * to heal (already full, or the med carries no heal value).
 */
export function startHealing(
  med: Pick<ItemDef, "id" | "name" | "heal" | "healRate">,
  maxHp: number,
  currentHp: number,
): HealingState | null {
  const needed = maxHp - currentHp;
  if (needed <= 0) return null;
  const totalHeal = Math.min(med.heal ?? 0, needed);
  if (totalHeal <= 0) return null;
  return {
    medId: med.id,
    medName: med.name,
    remainingHeal: totalHeal,
    totalHeal,
    rate: Math.max(0, med.healRate ?? DEFAULT_HEAL_RATE),
    tickAccumMs: 0,
  };
}

export interface HealingTickResult {
  /** Updated state, or null once the channel has fully healed. */
  state: HealingState | null;
  /** HP to add to the operator this call. */
  healedThisTick: number;
}

/** Advance a healing channel by dtMs. See module doc for the chunking/frame-rate contract. */
export function tickHealing(
  state: HealingState,
  dtMs: number,
  tickIntervalMs: number = DEFAULT_HEAL_TICK_MS,
): HealingTickResult {
  let tickAccumMs = state.tickAccumMs + Math.max(0, dtMs);
  let remainingHeal = state.remainingHeal;
  let healedThisTick = 0;
  const chunk = (state.rate * tickIntervalMs) / 1000;
  while (tickAccumMs >= tickIntervalMs && remainingHeal > 0) {
    const applied = Math.min(chunk, remainingHeal);
    healedThisTick += applied;
    remainingHeal -= applied;
    tickAccumMs -= tickIntervalMs;
  }
  if (remainingHeal <= 1e-9) {
    return { state: null, healedThisTick };
  }
  return { state: { ...state, remainingHeal, tickAccumMs }, healedThisTick };
}

/** 0..1 progress of the current heal, for a progress bar. */
export function healingProgress(state: HealingState): number {
  if (state.totalHeal <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - state.remainingHeal / state.totalHeal));
}

/** Seconds remaining until the heal completes, for UI display. */
export function healingSecondsRemaining(state: HealingState): number {
  if (state.rate <= 0) return Infinity;
  return state.remainingHeal / state.rate;
}
