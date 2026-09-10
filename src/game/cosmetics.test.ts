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

  it("carries its slot's placeholder rect (used only until real art exists)", () => {
    const layers = composeCosmeticLayers(defaultCosmeticLoadout());
    for (const layer of layers) {
      expect(layer.placeholder).toEqual(COSMETIC_FIGURE.placeholderRects[layer.slot]);
    }
  });

  it("renders the default hat as real art, not the empty placeholder", () => {
    const layers = composeCosmeticLayers(defaultCosmeticLoadout());
    const hat = layers.find((l) => l.slot === "hat")!;
    expect(hat.empty).toBe(false);
    expect(hat.spriteKey).toBe("/game/cosmetics/hat/wolf-cap.png");
  });

  it("marks an explicitly-empty option as empty (no sprite, no placeholder)", () => {
    const loadout = { ...defaultCosmeticLoadout(), hat: "hat-none" };
    const layers = composeCosmeticLayers(loadout);
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
    expect(head.recolor.length).toBeGreaterThan(0);
    expect(head.recolor.some((r) => r.region === "hair")).toBe(true);
    expect(head.recolor.some((r) => r.region === "skin")).toBe(true);
    expect(head.placeholderColor).toBe(head.recolor[0]!.targetHex);
  });

  it("leaves recolor empty for an option with no paintRegions", () => {
    // hat-none is the deliberate "no hat" choice — no spriteKey, no paintRegions.
    const loadout = { ...defaultCosmeticLoadout(), hat: "hat-none" };
    const layers = composeCosmeticLayers(loadout);
    const hat = layers.find((l) => l.slot === "hat")!;
    expect(hat.recolor).toEqual([]);
    expect(hat.placeholderColor).toBeUndefined();
  });

  it("resolves the actual chosen swatch hex into targetHex, not just the default", () => {
    let loadout = defaultCosmeticLoadout();
    loadout = cyclePaintSwatch(loadout, "head", "hair", 1);
    const layers = composeCosmeticLayers(loadout);
    const hair = layers.find((l) => l.slot === "head")!.recolor.find((r) => r.region === "hair")!;
    expect(hair.targetHex).toBe(SWATCH_LISTS.hair![1]!.hex);
  });
});

function channels(hex: string): [number, number, number] {
  return [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16)) as [number, number, number];
}

describe("composeCosmeticLayers shadeMarkers", () => {
  it("derives a darkened variant of the region's resolved color (head-stash's #baba00)", () => {
    const loadout = { ...defaultCosmeticLoadout(), head: "head-stash" };
    const head = composeCosmeticLayers(loadout).find((l) => l.slot === "head")!;
    const base = head.recolor.find((r) => r.markerHex === "#ffff00")!;
    const shade = head.recolor.find((r) => r.markerHex === "#baba00")!;
    expect(shade.region).toBe("skin");
    const [r, g, b] = channels(base.targetHex);
    const [dr, dg, db] = channels(shade.targetHex);
    expect(dr).toBe(Math.round(r * (0xba / 0xff)));
    expect(dg).toBe(Math.round(g * (0xba / 0xff)));
    expect(db).toBe(Math.round(b * (0xba / 0xff)));
  });

  it("tracks the region's swatch when it changes, not a fixed color", () => {
    let loadout = { ...defaultCosmeticLoadout(), head: "head-stash" };
    loadout = cyclePaintSwatch(loadout, "head", "skin", 1);
    const head = composeCosmeticLayers(loadout).find((l) => l.slot === "head")!;
    const shade = head.recolor.find((r) => r.markerHex === "#baba00")!;
    const [r, g, b] = channels(SWATCH_LISTS.skin![1]!.hex);
    const [dr, dg, db] = channels(shade.targetHex);
    expect(dr).toBe(Math.round(r * (0xba / 0xff)));
    expect(dg).toBe(Math.round(g * (0xba / 0xff)));
    expect(db).toBe(Math.round(b * (0xba / 0xff)));
  });

  it("supports multiple shade tiers on the same region (jacket's 3-tone fabric)", () => {
    const loadout = { ...defaultCosmeticLoadout(), torso: "torso-jacket" };
    const torso = composeCosmeticLayers(loadout).find((l) => l.slot === "torso")!;
    const base = torso.recolor.find((r) => r.markerHex === "#ff00ff")!;
    const mid = torso.recolor.find((r) => r.markerHex === "#ad00ad")!;
    const deep = torso.recolor.find((r) => r.markerHex === "#700270")!;
    expect(mid.region).toBe("fabric");
    expect(deep.region).toBe("fabric");
    const [r, g, b] = channels(base.targetHex);
    const [mr, mg, mb] = channels(mid.targetHex);
    const [dr, dg, db] = channels(deep.targetHex);
    expect([mr, mg, mb]).toEqual([r, g, b].map((c) => Math.round(c * (0xad / 0xff))));
    expect([dr, dg, db]).toEqual([r, g, b].map((c) => Math.round(c * (0x70 / 0xff))));
    // Two more regions get their own single darker tier alongside fabric's three tiers.
    expect(torso.recolor.some((rc) => rc.region === "trim" && rc.markerHex === "#005d5d")).toBe(true);
    expect(torso.recolor.some((rc) => rc.region === "skin" && rc.markerHex === "#baba00")).toBe(true);
  });

  it("shades hair the same way as any other region (wolf's #dbdbdb/#b2b2b2 grey tiers)", () => {
    // head-wolf is the default, so a fresh loadout already has it.
    const head = composeCosmeticLayers(defaultCosmeticLoadout()).find((l) => l.slot === "head")!;
    const base = head.recolor.find((r) => r.markerHex === "#ffffff")!;
    const light = head.recolor.find((r) => r.markerHex === "#dbdbdb")!;
    const deep = head.recolor.find((r) => r.markerHex === "#b2b2b2")!;
    expect(light.region).toBe("hair");
    expect(deep.region).toBe("hair");
    const [r, g, b] = channels(base.targetHex);
    const [lr, lg, lb] = channels(light.targetHex);
    const [dr, dg, db] = channels(deep.targetHex);
    expect([lr, lg, lb]).toEqual([r, g, b].map((c) => Math.round(c * (0xdb / 0xff))));
    expect([dr, dg, db]).toEqual([r, g, b].map((c) => Math.round(c * (0xb2 / 0xff))));
  });
});

describe("composeCosmeticLayers frontOverlay", () => {
  it("resolves its own recolor set through the same slot's swatches (torso-stash's collar)", () => {
    const loadout = { ...defaultCosmeticLoadout(), torso: "torso-stash" };
    const torso = composeCosmeticLayers(loadout).find((l) => l.slot === "torso")!;
    expect(torso.frontOverlay?.spriteKey).toBe("/game/cosmetics/torso/stash-collar.png");
    const overlayTrim = torso.frontOverlay!.recolor.find((r) => r.region === "trim")!;
    const baseTrim = torso.recolor.find((r) => r.region === "trim")!;
    expect(overlayTrim.markerHex).toBe("#ffffff");
    expect(overlayTrim.targetHex).toBe(baseTrim.targetHex);
  });

  it("is undefined for options without a frontOverlay", () => {
    const torso = composeCosmeticLayers(defaultCosmeticLoadout()).find((l) => l.slot === "torso")!;
    expect(torso.frontOverlay).toBeUndefined();
  });
});
