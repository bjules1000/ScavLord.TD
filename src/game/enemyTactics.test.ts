import { describe, expect, it } from "bun:test";
import { freshBehaviorRuntime } from "./enemyBehavior";
import {
  createEnemyTacticalRuntime,
  isCoordinatedEnemyKind,
  nearbyCoverOffset,
  squadAlertTargetId,
  tacticalLanePosition,
  tickEnemyTactics,
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

  it("spreads scavs independently without assigning squad coordination", () => {
    const scavs = Array.from({ length: 7 }, (_, index) => createEnemyTacticalRuntime(index, 1.35, "scav")!);
    expect(scavs.every((runtime) => runtime.squadId === null)).toBe(true);
    expect(new Set(scavs.map((runtime) => runtime.baseOffset)).size).toBe(7);
    expect(isCoordinatedEnemyKind("scav")).toBe(false);
    expect(isCoordinatedEnemyKind("raider")).toBe(true);
    const scav = scavs[0]!;
    tickEnemyTactics(scav, "scav", true, 500, 30);
    expect(scav.mode).toBe("ADVANCE");
    expect(scav.targetOffset).toBe(scav.baseOffset);
  });

  it("changes role behavior on contact without crossing its assigned side", () => {
    const raider = createEnemyTacticalRuntime(1, 1.35)!;
    tickEnemyTactics(raider, "raider", true, 500);
    expect(raider.mode).toBe("FLANK");
    expect(Math.sign(raider.targetOffset)).toBe(Math.sign(raider.baseOffset));

    const sniper = createEnemyTacticalRuntime(2, 1.35)!;
    tickEnemyTactics(sniper, "sniperScav", true, 500);
    expect(sniper.mode).toBe("OVERWATCH");
    expect(Math.sign(sniper.targetOffset)).toBe(Math.sign(sniper.baseOffset));
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
    if (Math.sign(coverOffset!) === Math.sign(runtime.baseOffset)) {
      expect(runtime.mode).toBe("COVER");
      expect(runtime.targetOffset).toBe(coverOffset!);
    } else {
      expect(runtime.mode).toBe("FLANK");
      expect(Math.sign(runtime.targetOffset)).toBe(Math.sign(runtime.baseOffset));
    }
  });

  it("commits to one tactical plan even when contact repeatedly breaks", () => {
    const runtime = createEnemyTacticalRuntime(3, 1.35)!;
    tickEnemyTactics(runtime, "raider", true, 16, 24);
    const plannedMode = runtime.mode;
    const plannedOffset = runtime.targetOffset;
    tickEnemyTactics(runtime, "raider", false, 1500);
    tickEnemyTactics(runtime, "raider", true, 16, -24);
    expect(runtime.mode).toBe(plannedMode);
    expect(runtime.targetOffset).toBe(plannedOffset);
  });

  it("offsets enemies around the route without entering blocked terrain", () => {
    const map = buildMap(MAP_BY_ID["woods-v2"]!);
    const route = laneRoute(map, 0);
    const seg = 23;
    const [baseX, baseY] = pathPoint(map, seg, 0.5, 0);
    const runtime = createEnemyTacticalRuntime(3, 1.35)!;
    tickEnemyTactics(runtime, "raider", false, 1000);
    const [x, y] = tacticalLanePosition(map, route, seg, baseX, baseY, runtime, 1000);
    expect([x, y]).not.toEqual([baseX, baseY]);
    const tx = Math.floor(x / 44);
    const ty = Math.floor(y / 44);
    expect(map.MOUNTAIN[ty]?.[tx]).toBe(false);
    expect(map.WATER[ty]?.[tx]).toBe(false);
  });

  it("locks cover decisions instead of bouncing between nearby scenery", () => {
    const runtime = createEnemyTacticalRuntime(1, 1.35)!;
    tickEnemyTactics(runtime, "raider", true, 16, -30);
    expect(runtime.targetOffset).toBe(-30);
    tickEnemyTactics(runtime, "raider", true, 16, 30);
    expect(runtime.targetOffset).toBe(-30);
    tickEnemyTactics(runtime, "raider", true, 4000, 30);
    expect(runtime.targetOffset).toBe(-30);

  });

  it("keeps uncoordinated scavs on their original independent track", () => {
    const runtime = createEnemyTacticalRuntime(2, 1.35, "scav")!;
    tickEnemyTactics(runtime, "scav", true, 16);
    const targetOffset = runtime.targetOffset;
    tickEnemyTactics(runtime, "scav", false, 1000, -30);
    tickEnemyTactics(runtime, "scav", true, 1000, 30);
    expect(runtime.mode).toBe("ADVANCE");
    expect(runtime.targetOffset).toBe(targetOffset);
    expect(runtime.hasCommittedTactic).toBe(false);
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
    const scav = { ...makeEnemy(4, 5, null), kind: "scav" as const, tacticalRuntime: createEnemyTacticalRuntime(5, 1.35, "scav")! };
    expect(squadAlertTargetId([spotter, mate, outsider], mate)).toBe(99);
    expect(squadAlertTargetId([spotter, mate, outsider], outsider)).toBeNull();
    expect(squadAlertTargetId([spotter, mate, scav], scav)).toBeNull();
  });
});
