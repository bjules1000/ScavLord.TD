import { describe, expect, it } from "bun:test";
import { buildCampMap, campWalkable, stationAt, type CampMapDef } from "./campMap";
import { DEFAULT_EDITOR_PALETTE } from "../mapBuilder/document";

function def(overrides: Partial<CampMapDef> = {}): CampMapDef {
  return {
    id: "main-camp",
    displayName: "Main Camp",
    width: 4,
    height: 4,
    palette: DEFAULT_EDITOR_PALETTE,
    terrain: [
      ["GROUND", "GROUND", "WATER", "GROUND"],
      ["GROUND", "GROUND", "GROUND", "GROUND"],
      ["GROUND", "GROUND", "GROUND", "GROUND"],
      ["GROUND", "GROUND", "GROUND", "GROUND"],
    ],
    props: [{ id: "prop-1", type: "crate", tx: 1, ty: 1, hubAction: "supplies" }],
    ...overrides,
  };
}

describe("campWalkable", () => {
  it("is walkable on plain ground with no prop", () => {
    expect(campWalkable(buildCampMap(def()), 0, 0)).toBe(true);
  });

  it("is not walkable on water", () => {
    expect(campWalkable(buildCampMap(def()), 2, 0)).toBe(false);
  });

  it("is not walkable on a tile occupied by a prop", () => {
    expect(campWalkable(buildCampMap(def()), 1, 1)).toBe(false);
  });

  it("is not walkable out of bounds", () => {
    const map = buildCampMap(def());
    expect(campWalkable(map, -1, 0)).toBe(false);
    expect(campWalkable(map, 0, -1)).toBe(false);
    expect(campWalkable(map, 4, 0)).toBe(false);
    expect(campWalkable(map, 0, 4)).toBe(false);
  });
});

describe("stationAt", () => {
  it("finds the prop assigned to a hub action at its tile", () => {
    const map = buildCampMap(def());
    expect(stationAt(map, 1, 1)?.hubAction).toBe("supplies");
  });

  it("returns undefined for a decorative prop with no hubAction", () => {
    const map = buildCampMap(
      def({ props: [{ id: "prop-1", type: "tent", tx: 1, ty: 1 }] }),
    );
    expect(stationAt(map, 1, 1)).toBeUndefined();
  });

  it("returns undefined for an empty tile", () => {
    const map = buildCampMap(def());
    expect(stationAt(map, 0, 0)).toBeUndefined();
  });
});
