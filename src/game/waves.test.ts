import { describe, expect, it } from "bun:test";
import { ENEMIES, buildWave, waveScale } from "./data";
import { MAP_BY_ID } from "./map";
import { assignSpawnLane } from "./lanes";
import {
  WAVE_START_DELAY_MS,
  compositionShares,
  scheduleWave,
  spawnDurationMs,
  spawnedEnemyHp,
  totalEnemyCount,
} from "./waves";

describe("wave spawn schedule", () => {
  it("starts after the canonical delay and round-robins lanes", () => {
    const events = scheduleWave(
      [
        { kind: "scav", count: 2, gap: 100 },
        { kind: "raider", count: 2, gap: 50 },
      ],
      2,
    );
    expect(events[0]).toEqual({ at: WAVE_START_DELAY_MS, kind: "scav", lane: 0 });
    expect(events[1]!.lane).toBe(assignSpawnLane(1, 2));
    expect(events.map((e) => e.kind)).toEqual(["scav", "scav", "raider", "raider"]);
  });

  it("spawn duration is last spawn timestamp", () => {
    const groups = [{ kind: "scav" as const, count: 3, gap: 100 }];
    expect(spawnDurationMs(groups)).toBe(WAVE_START_DELAY_MS + 200);
    expect(spawnDurationMs([])).toBe(0);
  });

  it("composition shares match counts", () => {
    const shares = compositionShares([
      { kind: "scav", count: 6, gap: 1 },
      { kind: "raider", count: 4, gap: 1 },
    ]);
    expect(totalEnemyCount([{ kind: "scav", count: 6, gap: 1 }, { kind: "raider", count: 4, gap: 1 }])).toBe(10);
    expect(shares.find((s) => s.kind === "scav")?.share).toBeCloseTo(0.6);
  });

  it("spawned HP snapshots base hp × waveScale × map hpMult", () => {
    const scav = ENEMIES.scav;
    const woods = MAP_BY_ID["woods"]!;
    expect(spawnedEnemyHp(scav.hp, 5, woods.hpMult)).toBe(Math.round(scav.hp * waveScale(5).hp * woods.hpMult));
  });

  it("canonical waves exist for each map via buildWave + waveMods", () => {
    const woods = buildWave(1, MAP_BY_ID["woods"]!.waveMods);
    const factory = buildWave(1, MAP_BY_ID["factory"]!.waveMods);
    expect(woods.groups.length).toBeGreaterThan(0);
    expect(totalEnemyCount(woods.groups)).toBeLessThan(totalEnemyCount(factory.groups));
  });
});
