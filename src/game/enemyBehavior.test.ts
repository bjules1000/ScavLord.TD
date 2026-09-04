import { describe, expect, it } from "bun:test";
import {
  applyDamageReaction,
  builtinBehaviorForKind,
  canFireNow,
  defaultBehaviorConfig,
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
