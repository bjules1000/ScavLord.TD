import { describe, expect, it } from "bun:test";
import atlasFrames from "../atlas.json";
import gearFrames from "../gear-atlas.json";
import { spriteLabCatalog } from "../sprites";

describe("Sprites Lab catalog", () => {
  const catalog = spriteLabCatalog();

  it("lists every bundled atlas and gear placeholder plus the floor texture", () => {
    expect(catalog.filter((entry) => entry.sheet === "atlas")).toHaveLength(
      Object.keys(atlasFrames).length,
    );
    expect(catalog.filter((entry) => entry.sheet === "gear")).toHaveLength(
      Object.keys(gearFrames).length,
    );
    expect(catalog.filter((entry) => entry.sheet === "floor")).toEqual([
      { sheet: "floor", name: "floor", width: 32, height: 32 },
    ]);
  });

  it("has unique slots with valid authored dimensions", () => {
    const keys = catalog.map((entry) => `${entry.sheet}:${entry.name}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(catalog.every((entry) => entry.width > 0 && entry.height > 0)).toBe(true);
  });
});
