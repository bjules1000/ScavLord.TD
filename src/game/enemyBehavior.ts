/**
 * Data-driven enemy behavior config — small composable knobs, not a behavior tree.
 */

export type EnemyObjective = "ADVANCE" | "LOOT_ESCAPE";

export type EnemyDamageReaction = "NONE" | "SPEED_UP" | "SLOW_DOWN" | "REVERSE_BRIEFLY" | "REROUTE";

export type EnemyBehaviorConfig = {
  objective: EnemyObjective;
  canShoot: boolean;
  requireLosToShoot: boolean;
  fireWhileMoving: boolean;
  /** Tiles (art units, scaled at runtime like fireRange). */
  sightRange: number;
  normalSpeedMult: number;
  engagedSpeedMult: number;
  lostTargetSpeedMult: number;
  /** Remain ENGAGED after LOS loss for this many ms. */
  targetMemoryMs: number;
  onDamage: EnemyDamageReaction;
  onDamageSpeedMult: number;
  onDamageDurationMs: number;
  /** 0–1; only used when path reroutes are supported. */
  rerouteChance: number;
};

export type EnemyBehaviorStateKind = "ADVANCING" | "ENGAGED" | "REACTION";

export type EnemyBehaviorRuntime = {
  state: EnemyBehaviorStateKind;
  targetTowerId: number | null;
  /** ms remaining of target memory after LOS loss. */
  memoryLeftMs: number;
  /** Active on-damage reaction. */
  reaction: EnemyDamageReaction | null;
  reactionLeftMs: number;
  reactionSpeedMult: number;
};

export function defaultBehaviorConfig(partial?: Partial<EnemyBehaviorConfig>): EnemyBehaviorConfig {
  return {
    objective: "ADVANCE",
    canShoot: true,
    requireLosToShoot: true,
    fireWhileMoving: true,
    sightRange: 90,
    normalSpeedMult: 1,
    engagedSpeedMult: 1,
    lostTargetSpeedMult: 1,
    targetMemoryMs: 1000,
    onDamage: "NONE",
    onDamageSpeedMult: 1.4,
    onDamageDurationMs: 1500,
    rerouteChance: 0,
    ...partial,
  };
}

/** Profiles matching current feel, then tunable in Wave Lab. */
export function builtinBehaviorForKind(kind: string): EnemyBehaviorConfig {
  switch (kind) {
    case "scav":
      return defaultBehaviorConfig({
        canShoot: false,
        fireWhileMoving: true,
        sightRange: 0,
        normalSpeedMult: 1.05,
        engagedSpeedMult: 1.05,
        lostTargetSpeedMult: 1.05,
        onDamage: "SPEED_UP",
        onDamageSpeedMult: 1.5,
        onDamageDurationMs: 1500,
      });
    case "sniperScav":
      return defaultBehaviorConfig({
        canShoot: true,
        fireWhileMoving: true,
        sightRange: 70,
        normalSpeedMult: 1,
        engagedSpeedMult: 1,
        lostTargetSpeedMult: 1,
      });
    case "raider":
      return defaultBehaviorConfig({
        canShoot: true,
        fireWhileMoving: true,
        sightRange: 120,
        normalSpeedMult: 1,
        engagedSpeedMult: 0.3,
        lostTargetSpeedMult: 1,
        targetMemoryMs: 1000,
      });
    case "pmc":
      return defaultBehaviorConfig({
        canShoot: true,
        fireWhileMoving: true,
        sightRange: 100,
        normalSpeedMult: 1,
        engagedSpeedMult: 0.85,
        lostTargetSpeedMult: 1,
      });
    case "boss":
      return defaultBehaviorConfig({
        canShoot: true,
        fireWhileMoving: true,
        sightRange: 110,
        normalSpeedMult: 1,
        engagedSpeedMult: 0.9,
        lostTargetSpeedMult: 1,
      });
    default:
      return defaultBehaviorConfig();
  }
}

export function cloneBehavior(cfg: EnemyBehaviorConfig): EnemyBehaviorConfig {
  return { ...cfg };
}

export function freshBehaviorRuntime(): EnemyBehaviorRuntime {
  return {
    state: "ADVANCING",
    targetTowerId: null,
    memoryLeftMs: 0,
    reaction: null,
    reactionLeftMs: 0,
    reactionSpeedMult: 1,
  };
}

export function movementSpeedMult(
  cfg: EnemyBehaviorConfig,
  runtime: EnemyBehaviorRuntime,
): number {
  let base = cfg.normalSpeedMult;
  if (runtime.state === "ENGAGED" || (runtime.targetTowerId != null && runtime.memoryLeftMs > 0)) {
    base = cfg.engagedSpeedMult;
  } else if (runtime.memoryLeftMs > 0) {
    // Holding engagement briefly after LOS loss.
    base = cfg.engagedSpeedMult;
  } else if (runtime.state === "ADVANCING") {
    base = cfg.normalSpeedMult;
  }
  // After memory expires with no target, resume lost-target / normal advance.
  if (runtime.state === "ADVANCING" && runtime.targetTowerId == null && runtime.memoryLeftMs <= 0) {
    base = cfg.normalSpeedMult;
  }
  if (runtime.reaction && runtime.reactionLeftMs > 0) {
    base *= runtime.reactionSpeedMult;
  }
  return Math.max(0, base);
}

export function canFireNow(
  cfg: EnemyBehaviorConfig,
  runtime: EnemyBehaviorRuntime,
  hasLos: boolean,
  isMoving: boolean,
): boolean {
  if (!cfg.canShoot) return false;
  if (cfg.requireLosToShoot && !hasLos) return false;
  if (!cfg.fireWhileMoving && isMoving && runtime.state === "ENGAGED") {
    // Stationary-while-firing: only fire when engaged speed is near-stop.
    if (cfg.engagedSpeedMult > 0.05) return false;
  }
  if (!cfg.fireWhileMoving && isMoving) return false;
  return runtime.state === "ENGAGED" || (hasLos && runtime.targetTowerId != null);
}

/** Apply on-damage reaction into runtime (mutates). Reverse/reroute are authoring stubs. */
export function applyDamageReaction(cfg: EnemyBehaviorConfig, runtime: EnemyBehaviorRuntime): void {
  if (cfg.onDamage === "NONE" || cfg.onDamage === "REVERSE_BRIEFLY" || cfg.onDamage === "REROUTE") {
    return;
  }
  runtime.reaction = cfg.onDamage;
  runtime.reactionLeftMs = cfg.onDamageDurationMs;
  if (cfg.onDamage === "SLOW_DOWN") {
    runtime.reactionSpeedMult =
      cfg.onDamageSpeedMult < 1 ? cfg.onDamageSpeedMult : 0.6;
  } else {
    runtime.reactionSpeedMult = cfg.onDamageSpeedMult;
  }
  runtime.state = "REACTION";
}

export function tickBehaviorRuntime(runtime: EnemyBehaviorRuntime, dtMs: number): void {
  if (runtime.reactionLeftMs > 0) {
    runtime.reactionLeftMs = Math.max(0, runtime.reactionLeftMs - dtMs);
    if (runtime.reactionLeftMs <= 0) {
      runtime.reaction = null;
      runtime.reactionSpeedMult = 1;
      if (runtime.state === "REACTION") {
        runtime.state = runtime.targetTowerId != null ? "ENGAGED" : "ADVANCING";
      }
    }
  }
  if (runtime.memoryLeftMs > 0 && runtime.targetTowerId == null) {
    runtime.memoryLeftMs = Math.max(0, runtime.memoryLeftMs - dtMs);
  }
}

export function derivedBehaviorSummary(cfg: EnemyBehaviorConfig): string[] {
  const lines: string[] = [];
  if (cfg.objective === "LOOT_ESCAPE") {
    lines.push("Objective: loot/escape (ADVANCE path used until loot AI exists).");
  } else {
    lines.push("Advances along the raid path.");
  }
  if (!cfg.canShoot) {
    lines.push("Does not shoot.");
  } else {
    const losBit = cfg.requireLosToShoot ? " with clear LOS" : "";
    lines.push(`Acquires operators within sight range ${cfg.sightRange}${losBit}.`);
    const engPct = Math.round(cfg.engagedSpeedMult * 100);
    const fireBit = cfg.fireWhileMoving ? " and fires while moving" : " and prefers stationary fire";
    if (cfg.engagedSpeedMult < 0.95) {
      lines.push(`While engaged: moves at ${engPct}% speed${fireBit}.`);
    } else if (cfg.engagedSpeedMult > 1.05) {
      lines.push(`While engaged: rushes at ${engPct}% speed${fireBit}.`);
    } else {
      lines.push(`While engaged: keeps ~${engPct}% advance speed${fireBit}.`);
    }
    const memSec = (cfg.targetMemoryMs / 1000).toFixed(1);
    lines.push(`Remembers a lost target for ${memSec}s.`);
    lines.push(
      `Then resumes ${(cfg.lostTargetSpeedMult * 100).toFixed(0)}% movement.`,
    );
  }
  if (cfg.onDamage === "SPEED_UP") {
    lines.push(
      `On damage: +${Math.round((cfg.onDamageSpeedMult - 1) * 100)}% speed for ${(cfg.onDamageDurationMs / 1000).toFixed(1)}s.`,
    );
  } else if (cfg.onDamage === "SLOW_DOWN") {
    lines.push(
      `On damage: slows for ${(cfg.onDamageDurationMs / 1000).toFixed(1)}s.`,
    );
  } else if (cfg.onDamage === "REROUTE" || cfg.onDamage === "REVERSE_BRIEFLY") {
    lines.push(`On damage: ${cfg.onDamage} (not yet supported by pathing — no-op).`);
  }
  return lines;
}
