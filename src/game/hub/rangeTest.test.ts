import { describe, expect, it } from "bun:test";
import {
  DUMMY_HEAL_STEP_MS,
  DUMMY_MAX_HP,
  DUMMY_ZERO_PAUSE_MS,
  hubWeaponStats,
  nextDummyHp,
  tickHubProjectile,
} from "./rangeTest";
import { spawnRifleShot } from "../shooting";

describe("hubWeaponStats", () => {
  it("folds the PMC level bonus into damage and accuracy, matching towerStats' formula", () => {
    const base = hubWeaponStats("pm", [], 1);
    const leveled = hubWeaponStats("pm", [], 6);
    expect(leveled.damage).toBeCloseTo(base.damage * (1 + 5 * 0.05));
    expect(leveled.accuracy).toBeCloseTo(base.accuracy + 5 * 0.02, 5);
  });

  it("clamps accuracy into the valid range even at absurd levels", () => {
    const stats = hubWeaponStats("pm", [], 500);
    expect(stats.accuracy).toBeLessThanOrEqual(1);
    expect(stats.accuracy).toBeGreaterThan(0);
  });

  it("carries pen from attachments, defaulting to 0 with none equipped", () => {
    const stats = hubWeaponStats("pm", [], 1);
    expect(stats.pen).toBe(0);
  });

  it("carries mag size and reload fields for a MAGAZINE weapon", () => {
    const stats = hubWeaponStats("pm", [], 1);
    expect(stats.magSize).toBe(7);
    expect(stats.reloadType).toBe("MAGAZINE");
    expect(stats.reloadMs).toBeGreaterThan(0);
  });

  it("carries mag size and reload fields for a PER_ROUND weapon", () => {
    const stats = hubWeaponStats("toz", [], 1);
    expect(stats.magSize).toBe(2);
    expect(stats.reloadType).toBe("PER_ROUND");
    expect(stats.reloadMs).toBeGreaterThan(0);
  });
});

describe("tickHubProjectile", () => {
  const origin = { x: 0, y: 0 };

  it("reports a hit when the shot travels straight through the dummy", () => {
    const proj = spawnRifleShot({
      nextId: () => 1,
      shooterId: -1,
      origin,
      aimAngle: 0, // straight along +x, toward the dummy
      accuracy: 0.99, // near-zero dispersion so the sampled angle stays ~0
      range: 1000,
      damage: 25,
      pen: 0,
      color: "#fff",
      surface: "GROUND",
      speed: 1000,
      rng: () => 0.5, // sampleShotAngle(0.5) => 0 deviation
    });
    const targets = [{ id: "dummy-1", pos: { x: 100, y: 0 } }];
    let result: ReturnType<typeof tickHubProjectile> = null;
    for (let i = 0; i < 20 && !result; i++) {
      result = tickHubProjectile(proj, 1 / 30, targets);
    }
    expect(result).not.toBeNull();
    expect(result!.targetId).toBe("dummy-1");
    expect(result!.damage).toBe(25);
    expect(proj.dead).toBe(true);
  });

  it("hits whichever of several dummies is nearest along the path", () => {
    const proj = spawnRifleShot({
      nextId: () => 1,
      shooterId: -1,
      origin,
      aimAngle: 0,
      accuracy: 0.99,
      range: 1000,
      damage: 25,
      pen: 0,
      color: "#fff",
      surface: "GROUND",
      speed: 1000,
      rng: () => 0.5,
    });
    const targets = [
      { id: "far", pos: { x: 300, y: 0 } },
      { id: "near", pos: { x: 100, y: 0 } },
    ];
    let result: ReturnType<typeof tickHubProjectile> = null;
    for (let i = 0; i < 20 && !result; i++) {
      result = tickHubProjectile(proj, 1 / 30, targets);
    }
    expect(result).not.toBeNull();
    expect(result!.targetId).toBe("near");
  });

  it("never hits when aimed far away from the dummy", () => {
    const proj = spawnRifleShot({
      nextId: () => 1,
      shooterId: -1,
      origin,
      aimAngle: Math.PI, // straight along -x, away from the dummy
      accuracy: 0.99,
      range: 1000,
      damage: 25,
      pen: 0,
      color: "#fff",
      surface: "GROUND",
      speed: 1000,
      rng: () => 0.5,
    });
    const targets = [{ id: "dummy-1", pos: { x: 100, y: 0 } }];
    let hit = false;
    for (let i = 0; i < 60; i++) {
      const result = tickHubProjectile(proj, 1 / 30, targets);
      if (result) hit = true;
      if (proj.dead) break;
    }
    expect(hit).toBe(false);
  });

  it("dies once its range is exhausted without ever reaching a far dummy", () => {
    const proj = spawnRifleShot({
      nextId: () => 1,
      shooterId: -1,
      origin,
      aimAngle: 0,
      accuracy: 0.99,
      range: 50, // shorter than the distance to the dummy
      damage: 25,
      pen: 0,
      color: "#fff",
      surface: "GROUND",
      speed: 1000,
      rng: () => 0.5,
    });
    const targets = [{ id: "dummy-1", pos: { x: 500, y: 0 } }];
    let hit = false;
    for (let i = 0; i < 30 && !proj.dead; i++) {
      const result = tickHubProjectile(proj, 1 / 30, targets);
      if (result) hit = true;
    }
    expect(hit).toBe(false);
    expect(proj.dead).toBe(true);
  });
});

describe("nextDummyHp", () => {
  it("holds at 0 during the pause window", () => {
    expect(nextDummyHp(DUMMY_MAX_HP, 0)).toBe(0);
    expect(nextDummyHp(DUMMY_MAX_HP, DUMMY_ZERO_PAUSE_MS - 1)).toBe(0);
  });

  it("steps up through 25/50/75/100% after the pause", () => {
    expect(nextDummyHp(DUMMY_MAX_HP, DUMMY_ZERO_PAUSE_MS)).toBe(25);
    expect(nextDummyHp(DUMMY_MAX_HP, DUMMY_ZERO_PAUSE_MS + DUMMY_HEAL_STEP_MS)).toBe(50);
    expect(nextDummyHp(DUMMY_MAX_HP, DUMMY_ZERO_PAUSE_MS + DUMMY_HEAL_STEP_MS * 2)).toBe(75);
    expect(nextDummyHp(DUMMY_MAX_HP, DUMMY_ZERO_PAUSE_MS + DUMMY_HEAL_STEP_MS * 3)).toBe(100);
  });

  it("never exceeds maxHp however long it's been", () => {
    expect(nextDummyHp(DUMMY_MAX_HP, DUMMY_ZERO_PAUSE_MS + DUMMY_HEAL_STEP_MS * 50)).toBe(DUMMY_MAX_HP);
  });
});
