import { describe, expect, it } from "bun:test";
import { TILE } from "./data";
import { MAP_BY_ID, buildMap } from "./map";
import { authoredSentryEnemies, raidStartingSentryEnemies, sentryMovementMultiplier, syncEnemyToLanePosition } from "./mapSentries";
import { authoredDeploymentTiles, selectDeploymentTiles } from "./mapDeployment";
import { applyAuthor } from "./mapBuilder/author";
import { fromProductionMap } from "./mapBuilder/adapters";
import { importedToDoc, toExport } from "./mapBuilder/export";

describe("Pine Cut V2 conquest prototype", () => {
  it("is an enlarged copy beside Pine Cut with authored sentries", () => {
    const original = MAP_BY_ID.woods!;
    const v2 = MAP_BY_ID["woods-v2"]!;
    const map = buildMap(v2);
    expect(v2.name).toBe("PINE CUT V2");
    expect(v2.geo.y).toBe(original.geo.y);
    expect(Math.abs(v2.geo.x - original.geo.x)).toBeLessThanOrEqual(10);
    expect(map.width).toBe(30);
    expect(map.height).toBe(20);
    expect(map.BLOCKED).toHaveLength(20);
    expect(map.BLOCKED[0]).toHaveLength(30);
    expect(v2.path).not.toEqual(original.path);
    expect(v2.road).toHaveLength(54);
    expect(v2.highGround).toHaveLength(128);
    expect(v2.mountain).toHaveLength(131);
    expect(v2.props).toHaveLength(52);
    expect(v2.crates).toHaveLength(4);
    expect(v2.collisionWalls).toHaveLength(172);
    expect(v2.sentries).toHaveLength(28);
    expect(v2.activateSentries).toBe(false);
    expect(v2.sentries).toContainEqual(expect.objectContaining({ kind: "sniperScav", tx: 28, ty: 13 }));
    expect(v2.sentries).toContainEqual(expect.objectContaining({ kind: "boss", tx: 14, ty: 17 }));
  });

  it("uses the authored special zone as the squad insertion area", () => {
    const map = buildMap(MAP_BY_ID["woods-v2"]!);
    expect(authoredDeploymentTiles(map)).toEqual([
      { tx: 25, ty: 0 }, { tx: 26, ty: 0 }, { tx: 27, ty: 0 },
      { tx: 27, ty: 1 }, { tx: 28, ty: 1 }, { tx: 29, ty: 1 },
    ]);
    expect(selectDeploymentTiles(map, 4, () => true, () => ({ tx: 1, ty: 1 }))).toEqual([
      { tx: 25, ty: 0 }, { tx: 26, ty: 0 }, { tx: 27, ty: 0 }, { tx: 27, ty: 1 },
    ]);
  });

  it("spawns map sentries at authored tiles and keeps them stationary", () => {
    const map = buildMap(MAP_BY_ID["woods-v2"]!);
    let id = 10;
    const sentries = authoredSentryEnemies(map, () => id++);
    expect(sentries).toHaveLength(map.def.sentries!.length);
    expect(sentries.every((enemy) => enemy.sentry && sentryMovementMultiplier(enemy) === 0)).toBe(true);
    expect(sentries[0]!.x).toBe(map.def.sentries![0]!.tx * TILE + TILE / 2);
    const authoredPositions = sentries.map(({ x, y }) => `${x},${y}`);
    for (const sentry of sentries) syncEnemyToLanePosition(sentry, map.PIX[0]![0], map.PIX[0]![1]);
    expect(sentries.map(({ x, y }) => `${x},${y}`)).toEqual(authoredPositions);
    expect(new Set(authoredPositions).size).toBe(28);
  });

  it("keeps sentries authored but disables the mandatory clear phase in waves-only mode", () => {
    const map = buildMap(MAP_BY_ID["woods-v2"]!);
    expect(map.def.sentries).toHaveLength(28);
    expect(raidStartingSentryEnemies(map, () => 1)).toEqual([]);
  });

  it("Map Builder places, exports, and imports sentries", () => {
    const doc = fromProductionMap(MAP_BY_ID["woods-v2"]!);
    const placed = applyAuthor(
      { ...doc, sentries: [], status: "draft" },
      { id: "sentry", kind: "sniperScav" },
      { tx: 25, ty: 19, localX: 22, localY: 22 },
      { laneId: "MAIN", zoneId: null },
    );
    expect(placed.sentries).toEqual([{ id: "sentry-1", kind: "sniperScav", tx: 25, ty: 19, facing: Math.PI }]);
    const exported = toExport(placed);
    const imported = importedToDoc(exported, "import-sentries");
    expect(imported.width).toBe(30);
    expect(imported.height).toBe(20);
    expect(imported.sentries[0]).toMatchObject({ kind: "sniperScav", tx: 25, ty: 19 });
  });
});
