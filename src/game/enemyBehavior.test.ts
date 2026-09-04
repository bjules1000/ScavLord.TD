import { describe, expect, it } from "bun:test";
import {
  applyDamageReaction,
  builtinBehaviorForKind,
  canFireNow,
  defaultBehaviorConfig,
  derivedBehaviorSummary,
  freshBehaviorRuntime,
  movementSpeedMult,
} from "./enemyBehavior";

describe("enemyBehavior", () => {
  it("movement speed uses engaged mult while engaged", () => {
    const cfg = defaultBehaviorConfig({ normalSpeedMult: 1, engagedSpeedMult: 0.3 });
    const runtime = freshBehaviorRuntime();
    runtime.state = "ENGAGED";
    runtime.targetTowerId = 1;
    expect(movementSpeedMult(cfg, runtime)).toBeCloseTo(0.3);
  });

  it("canShoot false never fires", () => {
    const cfg = builtinBehaviorForKind("scav");
    expect(cfg.canShoot).toBe(false);
    const runtime = freshBehaviorRuntime();
    runtime.state = "ENGAGED";
    runtime.targetTowerId = 1;
    expect(canFireNow(cfg, runtime, true, false)).toBe(false);
  });

  it("toggling canShoot preserves authored LOS / sight / memory values", () => {
    const base = defaultBehaviorConfig({
      canShoot: true,
      requireLosToShoot: true,
      sightRange: 120,
      targetMemoryMs: 1500,
    });
    const off = { ...base, canShoot: false };
    expect(off.requireLosToShoot).toBe(true);
    expect(off.sightRange).toBe(120);
    expect(off.targetMemoryMs).toBe(1500);
    const on = { ...off, canShoot: true };
    expect(on.sightRange).toBe(120);
    expect(on.requireLosToShoot).toBe(true);
    expect(on.targetMemoryMs).toBe(1500);
  });

  it("ON DAMAGE NONE preserves reaction tuning values", () => {
    const cfg = defaultBehaviorConfig({
      onDamage: "NONE",
      onDamageSpeedMult: 1.5,
      onDamageDurationMs: 1500,
    });
    expect(cfg.onDamageSpeedMult).toBe(1.5);
    expect(cfg.onDamageDurationMs).toBe(1500);
    const runtime = freshBehaviorRuntime();
    applyDamageReaction(cfg, runtime);
    expect(runtime.reaction).toBeNull();
  });

  it("derived summary uses effective TEST values and stays concise", () => {
    const rifle = builtinBehaviorForKind("raider");
    const lines = derivedBehaviorSummary(rifle);
    expect(lines[0]).toContain("Advances");
    expect(lines.some((l) => l.includes("engaged"))).toBe(true);
    expect(lines.join("\n")).not.toContain("canShoot");
    const scav = derivedBehaviorSummary(builtinBehaviorForKind("scav"));
    expect(scav.some((l) => l.includes("Does not shoot"))).toBe(true);
    expect(scav.some((l) => l.includes("On damage"))).toBe(true);
  });

  it("damage reaction SPEED_UP multiplies movement", () => {
    const cfg = defaultBehaviorConfig({
      onDamage: "SPEED_UP",
      onDamageSpeedMult: 1.5,
      onDamageDurationMs: 1000,
      normalSpeedMult: 1,
    });
    const runtime = freshBehaviorRuntime();
    applyDamageReaction(cfg, runtime);
    expect(runtime.reaction).toBe("SPEED_UP");
    expect(runtime.reactionLeftMs).toBe(1000);
    expect(movementSpeedMult(cfg, runtime)).toBeCloseTo(1.5);
  });

  it("damage reaction SLOW_DOWN reduces movement", () => {
    const cfg = defaultBehaviorConfig({
      onDamage: "SLOW_DOWN",
      onDamageSpeedMult: 0.5,
      onDamageDurationMs: 800,
      normalSpeedMult: 1,
    });
    const runtime = freshBehaviorRuntime();
    applyDamageReaction(cfg, runtime);
    expect(runtime.reaction).toBe("SLOW_DOWN");
    expect(movementSpeedMult(cfg, runtime)).toBeCloseTo(0.5);
  });
});
