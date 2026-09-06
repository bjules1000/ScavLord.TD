import { describe, expect, it } from "bun:test";
import { freshBehaviorRuntime } from "./enemyBehavior";
import {
  createEnemyTacticalRuntime,
  nearbyCoverOffset,
  squadAlertTargetId,
  tacticalForwardMultiplier,
  tacticalLanePosition,
  tickEnemyTactics,
  triggerEnemyTacticalReaction,
} from "./enemyTactics";
import { MAP_BY_ID, buildMap, laneRoute, pathPoint } from "./map";
import type { Enemy } from "./types";

describe("wide tactical lane AI", () => {
  it("groups wave enemies into four-person squads with distinct formation slots", () => {
    const squad = [0, 1, 2, 3].map((index) => createEnemyTacticalRuntime(index, 1.35)!);
    expect(squad.map((runtime) => runtime.squadId)).toEqual([0, 0, 0, 0]);
    expect(new Set(squad.map((runtime) => runtime.baseOffset)).size).toBe(4);
    expect(createEnemyTacticalRuntime(4, 1.35)!.squadId).toBe(1);
    expect(createEnemyTacticalRuntime(0, 0)).toBeUndefined();
  });

  it("changes role behavior on contact while preserving forward pressure", () => {
    const raider = createEnemyTacticalRuntime(1, 1.35)!;
    tickEnemyTactics(raider, "raider", true, 500);
    expect(raider.mode).toBe("FLANK");
    expect(tacticalForwardMultiplier(raider, "raider", 0.1)).toBe(0.42);

    const sniper = createEnemyTacticalRuntime(2, 1.35)!;
    tickEnemyTactics(sniper, "sniperScav", true, 500);
    expect(sniper.mode).toBe("OVERWATCH");
    expect(tacticalForwardMultiplier(sniper, "sniperScav", 0)).toBe(0.18);
  });

  it("moves a contacted rifleman toward nearby authored scenery", () => {
    const map = buildMap(MAP_BY_ID["woods-v2"]!);
    const route = laneRoute(map, 0);
    const seg = 7;
    const [x, y] = pathPoint(map, seg, 0.5, 0);
    const runtime = createEnemyTacticalRuntime(1, 1.35)!;
    const coverOffset = nearbyCoverOffset(map, route, seg, x, y, runtime.laneHalfWidth);
    expect(coverOffset).not.toBeNull();
    tickEnemyTactics(runtime, "raider", true, 500, coverOffset);
    expect(runtime.mode).toBe("COVER");
    expect(runtime.targetOffset).toBe(coverOffset!);
  });

  it("evades across the lane when hit, then resumes its tactical role", () => {
    const runtime = createEnemyTacticalRuntime(3, 1.35)!;
    const before = runtime.targetOffset;
    triggerEnemyTacticalReaction(runtime);
    expect(runtime.mode).toBe("EVADE");
    expect(Math.sign(runtime.targetOffset)).toBe(-Math.sign(before));
    tickEnemyTactics(runtime, "raider", true, 400);
    expect(runtime.mode).toBe("EVADE");
    tickEnemyTactics(runtime, "raider", true, 600);
    expect(runtime.mode).toBe("FLANK");
  });

  it("offsets enemies around the route without entering blocked terrain", () => {
    const map = buildMap(MAP_BY_ID["woods-v2"]!);
    const route = laneRoute(map, 0);
    const seg = 23;
    const [baseX, baseY] = pathPoint(map, seg, 0.5, 0);
    const runtime = createEnemyTacticalRuntime(3, 1.35)!;
    const [x, y] = tacticalLanePosition(map, route, seg, baseX, baseY, runtime);
    expect([x, y]).not.toEqual([baseX, baseY]);
    const tx = Math.floor(x / 44);
    const ty = Math.floor(y / 44);
    expect(map.MOUNTAIN[ty]?.[tx]).toBe(false);
    expect(map.WATER[ty]?.[tx]).toBe(false);
  });

  it("shares a spotted operator with squad mates", () => {
    const makeEnemy = (id: number, squadIndex: number, targetTowerId: number | null): Enemy => ({
      id, kind: "raider", hp: 10, maxHp: 10, lane: 0, seg: 0, t: 0, x: 0, y: 0,
      surface: "GROUND", contactingWireId: null, slow: 0, hitFlash: 0, step: 0, fireCd: 0,
      aim: 0, muzzle: 0, behaviorRuntime: { ...freshBehaviorRuntime(), targetTowerId },
      tacticalRuntime: createEnemyTacticalRuntime(squadIndex, 1.35)!,
    });
    const spotter = makeEnemy(1, 0, 99);
    const mate = makeEnemy(2, 1, null);
    const outsider = makeEnemy(3, 4, null);
    expect(squadAlertTargetId([spotter, mate, outsider], mate)).toBe(99);
    expect(squadAlertTargetId([spotter, mate, outsider], outsider)).toBeNull();
  });
});
