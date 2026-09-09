import { describe, expect, it } from "bun:test";
import {
  COSMETIC_CATALOG,
  COSMETIC_FIGURE,
  COSMETIC_SLOTS,
  composeCosmeticLayers,
  cosmeticOption,
  cycleCosmeticOption,
  defaultCosmeticLoadout,
  resolveCosmeticLoadout,
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
