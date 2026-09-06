import { describe, expect, it } from "bun:test";
import { MAP_BY_ID, buildMap } from "./map";
import { authoredSentryEnemies, sentryMovementMultiplier } from "./mapSentries";
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
    expect(v2.path).toEqual(original.path);
    expect(v2.sentries?.length).toBeGreaterThan(0);
  });

  it("spawns map sentries at authored tiles and keeps them stationary", () => {
    const map = buildMap(MAP_BY_ID["woods-v2"]!);
    let id = 10;
    const sentries = authoredSentryEnemies(map, () => id++);
    expect(sentries).toHaveLength(map.def.sentries!.length);
    expect(sentries.every((enemy) => enemy.sentry && sentryMovementMultiplier(enemy) === 0)).toBe(true);
    expect(sentries[0]!.x).toBe(map.def.sentries![0]!.tx * 44 + 22);
  });

  it("Map Builder places, exports, and imports sentries", () => {
    const doc = fromProductionMap(MAP_BY_ID["woods-v2"]!);
    const placed = applyAuthor(
      { ...doc, sentries: [], status: "draft" },
      { id: "sentry", kind: "sniperScav" },
      { tx: 25, ty: 15, localX: 22, localY: 22 },
      { laneId: "MAIN", zoneId: null },
    );
    expect(placed.sentries).toEqual([{ id: "sentry-1", kind: "sniperScav", tx: 25, ty: 15, facing: Math.PI }]);
    const exported = toExport(placed);
    const imported = importedToDoc(exported, "import-sentries");
    expect(imported.width).toBe(30);
    expect(imported.height).toBe(20);
    expect(imported.sentries[0]).toMatchObject({ kind: "sniperScav", tx: 25, ty: 15 });
  });
});
