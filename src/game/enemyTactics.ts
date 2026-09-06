import { TILE } from "./data";
import type { GameLane, GameMap } from "./map";
import { canWalkLow, isRaidMovementBlockedAcrossEdge } from "./movement";
import type { Enemy, EnemyKind } from "./types";

export type EnemyTacticalMode = "ADVANCE" | "COVER" | "FLANK" | "OVERWATCH" | "RUSH" | "EVADE";

export type EnemyTacticalRuntime = {
  squadId: number;
  slot: number;
  mode: EnemyTacticalMode;
  baseOffset: number;
  offset: number;
  targetOffset: number;
  laneHalfWidth: number;
  evadeLeftMs: number;
};

const FORMATION = [-0.72, -0.24, 0.24, 0.72] as const;

export function createEnemyTacticalRuntime(spawnIndex: number, laneHalfWidthTiles: number): EnemyTacticalRuntime | undefined {
  if (laneHalfWidthTiles <= 0) return undefined;
  const slot = Math.abs(spawnIndex) % FORMATION.length;
  const laneHalfWidth = laneHalfWidthTiles * TILE;
  const baseOffset = FORMATION[slot]! * laneHalfWidth;
  return {
    squadId: Math.floor(Math.abs(spawnIndex) / FORMATION.length),
    slot,
    mode: "ADVANCE",
    baseOffset,
    offset: baseOffset,
    targetOffset: baseOffset,
    laneHalfWidth,
    evadeLeftMs: 0,
  };
}

function roleMode(kind: EnemyKind): EnemyTacticalMode {
  if (kind === "sniperScav") return "OVERWATCH";
  if (kind === "scav") return "RUSH";
  return "FLANK";
}

function roleOffset(runtime: EnemyTacticalRuntime, kind: EnemyKind): number {
  const side = (runtime.squadId + runtime.slot) % 2 === 0 ? -1 : 1;
  if (kind === "sniperScav") return side * runtime.laneHalfWidth;
  if (kind === "scav") return runtime.baseOffset * 0.25;
  if (kind === "boss") return side * runtime.laneHalfWidth * 0.55;
  return side * runtime.laneHalfWidth * 0.85;
}

export function tickEnemyTactics(
  runtime: EnemyTacticalRuntime,
  kind: EnemyKind,
  engaged: boolean,
  dtMs: number,
  coverOffset: number | null = null,
): void {
  runtime.evadeLeftMs = Math.max(0, runtime.evadeLeftMs - dtMs);
  if (runtime.evadeLeftMs <= 0) {
    if (!engaged) {
      runtime.mode = "ADVANCE";
      runtime.targetOffset = runtime.baseOffset;
    } else if (coverOffset != null && kind !== "scav" && kind !== "boss") {
      runtime.mode = "COVER";
      runtime.targetOffset = Math.max(-runtime.laneHalfWidth, Math.min(runtime.laneHalfWidth, coverOffset));
    } else {
      runtime.mode = roleMode(kind);
      runtime.targetOffset = roleOffset(runtime, kind);
    }
  }
  const maxStep = TILE * 1.15 * (dtMs / 1000);
  const delta = runtime.targetOffset - runtime.offset;
  runtime.offset += Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
}

export function triggerEnemyTacticalReaction(runtime?: EnemyTacticalRuntime): void {
  if (!runtime) return;
  const side = runtime.offset >= 0 ? -1 : 1;
  runtime.mode = "EVADE";
  runtime.targetOffset = side * runtime.laneHalfWidth * 0.9;
  runtime.evadeLeftMs = 900;
}

export function tacticalForwardMultiplier(runtime: EnemyTacticalRuntime | undefined, kind: EnemyKind, base: number): number {
  if (!runtime) return base;
  const floor = kind === "sniperScav" ? 0.18 : kind === "scav" ? 0.9 : kind === "boss" ? 0.55 : 0.42;
  return Math.max(base, floor);
}

function segmentNormal(route: GameLane, seg: number): { nx: number; ny: number } {
  const a = route.PIX[Math.max(0, Math.min(seg, route.PIX.length - 2))]!;
  const b = route.PIX[Math.max(1, Math.min(seg + 1, route.PIX.length - 1))]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

function candidateOpen(map: GameMap, fromX: number, fromY: number, x: number, y: number): boolean {
  const distance = Math.hypot(x - fromX, y - fromY);
  const steps = Math.max(1, Math.ceil(distance / (TILE / 4)));
  let previous: [number, number] | null = null;
  for (let step = 0; step <= steps; step++) {
    const amount = step / steps;
    const tx = Math.floor((fromX + (x - fromX) * amount) / TILE);
    const ty = Math.floor((fromY + (y - fromY) * amount) / TILE);
    if (!canWalkLow(map, tx, ty)) return false;
    if (previous && (previous[0] !== tx || previous[1] !== ty) && isRaidMovementBlockedAcrossEdge(map, previous, [tx, ty])) {
      return false;
    }
    previous = [tx, ty];
  }
  return true;
}

export function tacticalLanePosition(
  map: GameMap,
  route: GameLane,
  seg: number,
  baseX: number,
  baseY: number,
  runtime?: EnemyTacticalRuntime,
): [number, number] {
  if (!runtime) return [baseX, baseY];
  const { nx, ny } = segmentNormal(route, seg);
  for (const factor of [1, 0.75, 0.5, 0.25, 0] as const) {
    const x = baseX + nx * runtime.offset * factor;
    const y = baseY + ny * runtime.offset * factor;
    if (candidateOpen(map, baseX, baseY, x, y)) return [x, y];
  }
  return [baseX, baseY];
}

/** Nearby authored scenery gives combatants a meaningful lane side to move toward. */
export function nearbyCoverOffset(
  map: GameMap,
  route: GameLane,
  seg: number,
  baseX: number,
  baseY: number,
  laneHalfWidth: number,
): number | null {
  const { nx, ny } = segmentNormal(route, seg);
  let best: { distance: number; offset: number } | null = null;
  for (const item of [...map.PROPS, ...map.COVER]) {
    const x = item.tx * TILE + TILE / 2;
    const y = item.ty * TILE + TILE / 2;
    const dx = x - baseX;
    const dy = y - baseY;
    const distance = Math.hypot(dx, dy);
    if (distance > TILE * 3.25) continue;
    const lateral = dx * nx + dy * ny;
    if (Math.abs(lateral) < TILE * 0.45) continue;
    const offset = Math.sign(lateral) * Math.min(laneHalfWidth, Math.max(TILE * 0.35, Math.abs(lateral) - TILE * 0.7));
    if (!best || distance < best.distance) best = { distance, offset };
  }
  return best?.offset ?? null;
}

export function squadAlertTargetId(enemies: readonly Enemy[], enemy: Enemy): number | null {
  const squadId = enemy.tacticalRuntime?.squadId;
  if (squadId == null) return null;
  for (const mate of enemies) {
    if (mate.id === enemy.id || mate.tacticalRuntime?.squadId !== squadId) continue;
    const targetId = mate.behaviorRuntime?.targetTowerId;
    if (targetId != null) return targetId;
  }
  return null;
}
