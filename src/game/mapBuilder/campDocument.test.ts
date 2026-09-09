import { describe, expect, it } from "bun:test";
import { createBlankCampMap, isCampDoc, isRaidDoc } from "./campDocument";
import { createBlankMap } from "./document";

describe("createBlankCampMap", () => {
  it("creates a camp doc with mapType set and no raid gameplay arrays populated", () => {
    const doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
    expect(doc.mapType).toBe("camp");
    expect(doc.lanes).toEqual([]);
    expect(doc.gates).toEqual([]);
    expect(doc.sentries).toEqual([]);
    expect(doc.checkpoints).toEqual([]);
    expect(doc.cover).toEqual([]);
    expect(doc.crates).toEqual([]);
    expect(doc.extraction).toEqual([]);
    expect(doc.zones).toEqual([]);
    expect(doc.props).toEqual([]);
  });

  it("sizes the terrain grid to the requested (or default) width/height", () => {
    const doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp", width: 12, height: 9 });
    expect(doc.width).toBe(12);
    expect(doc.height).toBe(9);
    expect(doc.terrain.length).toBe(9);
    expect(doc.terrain.every((row) => row.length === 12)).toBe(true);
    expect(doc.terrain.every((row) => row.every((cell) => cell === "GROUND"))).toBe(true);
  });

  it("throws on invalid new-map input, same as createBlankMap", () => {
    expect(() => createBlankCampMap({ displayName: "", id: "main-camp" })).toThrow();
  });
});

describe("isCampDoc / isRaidDoc", () => {
  it("distinguishes camp docs from raid docs", () => {
    const camp = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
    const raid = createBlankMap({ displayName: "Woods", id: "woods" });
    expect(isCampDoc(camp)).toBe(true);
    expect(isRaidDoc(camp)).toBe(false);
    expect(isCampDoc(raid)).toBe(false);
    expect(isRaidDoc(raid)).toBe(true);
  });
});
