import { describe, expect, it } from "bun:test";
import {
  COSMETIC_CATALOG,
  COSMETIC_FIGURE,
  COSMETIC_SLOTS,
  GLOBAL_PAINT_REGIONS,
  SWATCH_LISTS,
  composeCosmeticLayers,
  cosmeticOption,
  cycleCosmeticOption,
  cyclePaintSwatch,
  defaultCosmeticLoadout,
  paintSwatch,
  resolveCosmeticLoadout,
  resolvePaintSwatchId,
} from "./cosmetics";

describe("defaultCosmeticLoadout", () => {
  it("picks the first catalog option for every slot", () => {
    const loadout = defaultCosmeticLoadout();
    for (const slot of COSMETIC_SLOTS) {
      expect(loadout[slot]).toBe(COSMETIC_CATALOG[slot][0]!.id);
    }
  });
});

describe("cycleCosmeticOption", () => {
  it("moves to the next option in the catalog", () => {
    const loadout = defaultCosmeticLoadout();
    const next = cycleCosmeticOption(loadout, "head", 1);
    expect(next.head).toBe(COSMETIC_CATALOG.head[1]!.id);
    // Other slots untouched.
    expect(next.torso).toBe(loadout.torso);
  });

  it("wraps forward past the last option", () => {
    const loadout = defaultCosmeticLoadout();
    const lastIndex = COSMETIC_CATALOG.legs.length - 1;
    let cur = loadout;
    for (let i = 0; i < lastIndex; i++) cur = cycleCosmeticOption(cur, "legs", 1);
    expect(cur.legs).toBe(COSMETIC_CATALOG.legs[lastIndex]!.id);
    const wrapped = cycleCosmeticOption(cur, "legs", 1);
    expect(wrapped.legs).toBe(COSMETIC_CATALOG.legs[0]!.id);
  });

  it("wraps backward before the first option", () => {
    const loadout = defaultCosmeticLoadout();
    const prev = cycleCosmeticOption(loadout, "torso", -1);
    expect(prev.torso).toBe(COSMETIC_CATALOG.torso[COSMETIC_CATALOG.torso.length - 1]!.id);
  });

  it("recovers from an unknown current id by starting at index 0", () => {
    const loadout = { ...defaultCosmeticLoadout(), hat: "not-a-real-id" };
    const next = cycleCosmeticOption(loadout, "hat", 1);
    expect(next.hat).toBe(COSMETIC_CATALOG.hat[1]!.id);
  });
});

describe("resolveCosmeticLoadout", () => {
  it("returns full defaults for null/undefined input", () => {
    expect(resolveCosmeticLoadout(null)).toEqual(defaultCosmeticLoadout());
    expect(resolveCosmeticLoadout(undefined)).toEqual(defaultCosmeticLoadout());
  });

  it("preserves valid slots and backfills invalid or missing ones", () => {
    const validHead = COSMETIC_CATALOG.head[1]!.id;
    const resolved = resolveCosmeticLoadout({ head: validHead, legs: "bogus-id" });
    expect(resolved.head).toBe(validHead);
    expect(resolved.legs).toBe(COSMETIC_CATALOG.legs[0]!.id);
    expect(resolved.torso).toBe(COSMETIC_CATALOG.torso[0]!.id);
    expect(resolved.hat).toBe(COSMETIC_CATALOG.hat[0]!.id);
  });
});

describe("composeCosmeticLayers", () => {
  it("produces one layer per slot in the figure's declared layer order", () => {
    const layers = composeCosmeticLayers(defaultCosmeticLoadout());
    expect(layers.map((l) => l.slot)).toEqual([...COSMETIC_FIGURE.layerOrder]);
  });

  it("positions each layer at its slot's fixed anchor", () => {
    const layers = composeCosmeticLayers(defaultCosmeticLoadout());
    for (const layer of layers) {
      const anchor = COSMETIC_FIGURE.anchors[layer.slot];
      expect(layer.x).toBe(anchor.x);
      expect(layer.y).toBe(anchor.y);
      expect(layer.w).toBe(anchor.w);
      expect(layer.h).toBe(anchor.h);
    }
  });

  it("marks the default hat as empty (no sprite, no placeholder)", () => {
    const layers = composeCosmeticLayers(defaultCosmeticLoadout());
    const hat = layers.find((l) => l.slot === "hat")!;
    expect(hat.empty).toBe(true);
    expect(hat.spriteKey).toBeUndefined();
  });

  it("normalizes a null/undefined loadout instead of throwing", () => {
    expect(() => composeCosmeticLayers(null)).not.toThrow();
    expect(composeCosmeticLayers(undefined).length).toBe(COSMETIC_SLOTS.length);
  });
});

describe("cosmeticOption", () => {
  it("finds a known option by slot and id", () => {
    const id = COSMETIC_CATALOG.torso[0]!.id;
    expect(cosmeticOption("torso", id)?.id).toBe(id);
  });

  it("returns null for an unknown id", () => {
    expect(cosmeticOption("torso", "nope")).toBeNull();
  });
});

describe("resolvePaintSwatchId / paintSwatch", () => {
  it("defaults to the first swatch in the region's list", () => {
    const loadout = defaultCosmeticLoadout();
    expect(resolvePaintSwatchId(loadout, "head", "hair")).toBe(SWATCH_LISTS.hair![0]!.id);
    expect(paintSwatch(loadout, "head", "hair")?.id).toBe(SWATCH_LISTS.hair![0]!.id);
  });

  it("returns empty/null for a region with no swatch list", () => {
    const loadout = defaultCosmeticLoadout();
    expect(resolvePaintSwatchId(loadout, "head", "not-a-region")).toBe("");
    expect(paintSwatch(loadout, "head", "not-a-region")).toBeNull();
  });
});

describe("cyclePaintSwatch", () => {
  it("cycles a non-global region independently per slot", () => {
    let loadout = defaultCosmeticLoadout();
    loadout = cyclePaintSwatch(loadout, "torso", "fabric", 1);
    const torsoFabric = resolvePaintSwatchId(loadout, "torso", "fabric");
    expect(torsoFabric).toBe(SWATCH_LISTS.fabric![1]!.id);
    // legs' fabric choice is untouched by torso's cycle.
    expect(resolvePaintSwatchId(loadout, "legs", "fabric")).toBe(SWATCH_LISTS.fabric![0]!.id);
  });

  it("wraps around a region's swatch list in both directions", () => {
    let loadout = defaultCosmeticLoadout();
    const last = SWATCH_LISTS.trim!.length - 1;
    for (let i = 0; i < last; i++) loadout = cyclePaintSwatch(loadout, "hat", "trim", 1);
    expect(resolvePaintSwatchId(loadout, "hat", "trim")).toBe(SWATCH_LISTS.trim![last]!.id);
    loadout = cyclePaintSwatch(loadout, "hat", "trim", 1);
    expect(resolvePaintSwatchId(loadout, "hat", "trim")).toBe(SWATCH_LISTS.trim![0]!.id);
    loadout = cyclePaintSwatch(loadout, "hat", "trim", -1);
    expect(resolvePaintSwatchId(loadout, "hat", "trim")).toBe(SWATCH_LISTS.trim![last]!.id);
  });

  it("is a no-op for a region with no swatch list", () => {
    const loadout = defaultCosmeticLoadout();
    expect(cyclePaintSwatch(loadout, "head", "not-a-region", 1)).toBe(loadout);
  });

  it("treats skin as global: cycling from one slot is visible from every slot", () => {
    expect(GLOBAL_PAINT_REGIONS).toContain("skin");
    let loadout = defaultCosmeticLoadout();
    loadout = cyclePaintSwatch(loadout, "head", "skin", 1);
    const expected = SWATCH_LISTS.skin![1]!.id;
    expect(resolvePaintSwatchId(loadout, "head", "skin")).toBe(expected);
    // Same global value read from an entirely different slot.
    expect(resolvePaintSwatchId(loadout, "torso", "skin")).toBe(expected);
    expect(resolvePaintSwatchId(loadout, "legs", "skin")).toBe(expected);
  });
});

describe("composeCosmeticLayers recolor metadata", () => {
  it("attaches a recolor entry and placeholderColor for an option with paintRegions", () => {
    const layers = composeCosmeticLayers(defaultCosmeticLoadout());
    const head = layers.find((l) => l.slot === "head")!;
    expect(head.recolor.length).toBe(2);
    expect(head.recolor.some((r) => r.region === "hair")).toBe(true);
    expect(head.recolor.some((r) => r.region === "skin")).toBe(true);
    expect(head.placeholderColor).toBe(head.recolor[0]!.targetHex);
  });

  it("leaves recolor empty for an option with no paintRegions", () => {
    // head-c ("VISOR") declares no paintRegions.
    const loadout = { ...defaultCosmeticLoadout(), head: "head-c" };
    const layers = composeCosmeticLayers(loadout);
    const head = layers.find((l) => l.slot === "head")!;
    expect(head.recolor).toEqual([]);
    expect(head.placeholderColor).toBeUndefined();
  });

  it("resolves the actual chosen swatch hex into targetHex, not just the default", () => {
    let loadout = defaultCosmeticLoadout();
    loadout = cyclePaintSwatch(loadout, "head", "hair", 1);
    const layers = composeCosmeticLayers(loadout);
    const hair = layers.find((l) => l.slot === "head")!.recolor.find((r) => r.region === "hair")!;
    expect(hair.targetHex).toBe(SWATCH_LISTS.hair![1]!.hex);
  });
});
