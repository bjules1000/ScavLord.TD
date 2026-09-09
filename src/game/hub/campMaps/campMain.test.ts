import { describe, expect, it } from "bun:test";
import { CAMP_MAP_DEF } from "./campMain";
import { buildCampMap, campWalkable, stationAt } from "../campMap";
import { fromCampMapDef } from "../../mapBuilder/campAdapters";
import { validateCampMap } from "../../mapBuilder/campValidate";
import type { HubAction } from "../../campActions";

describe("CAMP_MAP_DEF", () => {
  it("has a terrain grid matching its declared width/height", () => {
    expect(CAMP_MAP_DEF.terrain.length).toBe(CAMP_MAP_DEF.height);
    expect(CAMP_MAP_DEF.terrain.every((row) => row.length === CAMP_MAP_DEF.width)).toBe(true);
  });

  it("places every prop in bounds with no two props sharing a tile", () => {
    const seen = new Set<string>();
    for (const p of CAMP_MAP_DEF.props) {
      expect(p.tx).toBeGreaterThanOrEqual(0);
      expect(p.ty).toBeGreaterThanOrEqual(0);
      expect(p.tx).toBeLessThan(CAMP_MAP_DEF.width);
      expect(p.ty).toBeLessThan(CAMP_MAP_DEF.height);
      const key = `${p.tx},${p.ty}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("assigns every required station, and radio too", () => {
    const assigned = new Set<HubAction>(
      CAMP_MAP_DEF.props.map((p) => p.hubAction).filter((a): a is HubAction => !!a),
    );
    for (const action of ["supplies", "gear", "skills", "region", "radio"] as HubAction[]) {
      expect(assigned.has(action)).toBe(true);
    }
  });

  it("passes camp validation once round-tripped through the editor doc shape", () => {
    const doc = fromCampMapDef(CAMP_MAP_DEF);
    const result = validateCampMap(doc);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("keeps decorative props (tent, fire) unassigned", () => {
    const tent = CAMP_MAP_DEF.props.find((p) => p.type === "tent");
    const fire = CAMP_MAP_DEF.props.find((p) => p.type === "fire");
    expect(tent?.hubAction).toBeUndefined();
    expect(fire?.hubAction).toBeUndefined();
  });
});

describe("CAMP_MAP_DEF at runtime", () => {
  it("every station tile is reachable via stationAt", () => {
    const map = buildCampMap(CAMP_MAP_DEF);
    for (const p of CAMP_MAP_DEF.props) {
      if (!p.hubAction) continue;
      expect(stationAt(map, p.tx, p.ty)?.hubAction).toBe(p.hubAction);
    }
  });

  it("prop tiles are occupied (not walkable) and open ground nearby is walkable", () => {
    const map = buildCampMap(CAMP_MAP_DEF);
    const fire = CAMP_MAP_DEF.props.find((p) => p.type === "fire")!;
    expect(campWalkable(map, fire.tx, fire.ty)).toBe(false);
    expect(campWalkable(map, fire.tx + 2, fire.ty + 2)).toBe(true);
  });
});
