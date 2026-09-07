import { describe, expect, it } from "bun:test";
import {
  DEFAULT_HEAL_RATE,
  DEFAULT_HEAL_TICK_MS,
  healingProgress,
  healingSecondsRemaining,
  startHealing,
  tickHealing,
  type HealingState,
} from "./healing";

const med = { id: "m_test", name: "TEST KIT", heal: 100, healRate: 10 };

describe("startHealing", () => {
  it("clamps the heal to what's actually needed, not the med's full capacity", () => {
    const state = startHealing(med, 110, 100); // missing 10, med carries 100
    expect(state).not.toBeNull();
    expect(state!.totalHeal).toBe(10);
    expect(state!.remainingHeal).toBe(10);
  });

  it("returns null when already at full HP", () => {
    expect(startHealing(med, 110, 110)).toBeNull();
    expect(startHealing(med, 110, 120)).toBeNull();
  });

  it("returns null when the item carries no heal value", () => {
    expect(startHealing({ id: "x", name: "X", heal: 0 }, 110, 50)).toBeNull();
    expect(startHealing({ id: "x", name: "X" }, 110, 50)).toBeNull();
  });

  it("falls back to DEFAULT_HEAL_RATE when the med has no authored rate", () => {
    const state = startHealing({ id: "x", name: "X", heal: 50 }, 110, 50);
    expect(state!.rate).toBe(DEFAULT_HEAL_RATE);
  });
});

describe("tickHealing — chunking", () => {
  it("applies nothing before a full tick interval has elapsed", () => {
    const state = startHealing(med, 110, 10)!; // needs 100, rate 10/s
    const r = tickHealing(state, DEFAULT_HEAL_TICK_MS / 2);
    expect(r.healedThisTick).toBe(0);
    expect(r.state).not.toBeNull();
    expect(r.state!.remainingHeal).toBe(100);
  });

  it("applies one chunk once a full tick interval elapses", () => {
    const state = startHealing(med, 110, 10)!;
    const r = tickHealing(state, DEFAULT_HEAL_TICK_MS);
    const expectedChunk = (med.healRate * DEFAULT_HEAL_TICK_MS) / 1000; // 4 HP
    expect(r.healedThisTick).toBeCloseTo(expectedChunk);
    expect(r.state!.remainingHeal).toBeCloseTo(100 - expectedChunk);
  });

  it("never overheals — the final chunk clamps to what's left", () => {
    const state = startHealing({ id: "x", name: "X", heal: 5, healRate: 10 }, 110, 105)!; // needs 5
    const r = tickHealing(state, DEFAULT_HEAL_TICK_MS * 3); // would be 12 HP of chunks at this rate
    expect(r.healedThisTick).toBe(5);
    expect(r.state).toBeNull(); // channel completes, no state left to cancel
  });

  it("a single large dt yields the same total as many small dts covering the same elapsed time", () => {
    const bigDtState = startHealing(med, 110, 10)!;
    const bigDtResult = tickHealing(bigDtState, 2000);

    let smallState: HealingState | null = startHealing(med, 110, 10)!;
    let smallTotal = 0;
    for (let i = 0; i < 20; i++) {
      const r = tickHealing(smallState!, 100);
      smallTotal += r.healedThisTick;
      smallState = r.state;
      if (!smallState) break;
    }

    expect(bigDtResult.healedThisTick).toBeCloseTo(smallTotal, 5);
  });

  it("completing the channel over many ticks restores exactly totalHeal, no more no less", () => {
    let state: HealingState | null = startHealing(med, 110, 10)!; // needs 100
    let total = 0;
    let guard = 0;
    while (state && guard++ < 10000) {
      const r = tickHealing(state, 50);
      total += r.healedThisTick;
      state = r.state;
    }
    expect(state).toBeNull();
    expect(total).toBeCloseTo(100);
  });
});

describe("cancellation semantics", () => {
  it("partial HP already applied by completed ticks is never rolled back by discarding the state", () => {
    // Cancelling a heal is just the caller no longer calling tickHealing —
    // whatever healedThisTick was already summed into the operator's HP stays.
    const state = startHealing(med, 110, 10)!;
    const r = tickHealing(state, DEFAULT_HEAL_TICK_MS * 2);
    const appliedSoFar = r.healedThisTick;
    expect(appliedSoFar).toBeGreaterThan(0);
    // "Cancel" — the caller simply drops r.state instead of continuing. Nothing
    // in this module can or should undo appliedSoFar.
    const cancelled = null;
    expect(cancelled).toBeNull();
    expect(appliedSoFar).toBeCloseTo((med.healRate * DEFAULT_HEAL_TICK_MS * 2) / 1000);
  });
});

describe("progress + time-remaining helpers", () => {
  it("healingProgress goes from 0 to 1 as remainingHeal depletes", () => {
    const state = startHealing(med, 110, 10)!; // totalHeal 100
    expect(healingProgress(state)).toBeCloseTo(0);
    const half: HealingState = { ...state, remainingHeal: 50 };
    expect(healingProgress(half)).toBeCloseTo(0.5);
    const done: HealingState = { ...state, remainingHeal: 0 };
    expect(healingProgress(done)).toBeCloseTo(1);
  });

  it("healingSecondsRemaining matches remainingHeal / rate", () => {
    const state = startHealing(med, 110, 10)!; // 100 HP at 10/s
    expect(healingSecondsRemaining(state)).toBeCloseTo(10);
  });
});
