/**
 * Player/scav cosmetic slots — head/torso/legs/hat, composed onto one fixed silhouette.
 * Mirrors weaponVisuals.ts's platform/part/resolve/compose shape: one "platform" (the
 * body) instead of several. Both which option is equipped and which color is picked are
 * click-to-select (a style grid + a color palette per slot) — see CosmeticsPanel.tsx.
 *
 * Recoloring: a sprite marks a region (e.g. "hair", "skin") with one flat marker color
 * in the source PNG; a separate optional shading-overlay PNG (composited multiply) adds
 * shading independent of whichever color is picked. See cosmeticRender.ts for the actual
 * pixel-level swap — this file only resolves *which* colors apply, as pure data.
 */

export type CosmeticSlot = "head" | "torso" | "legs" | "hat" | "arms" | "armor";

/** UI cycling order. */
export const COSMETIC_SLOTS: readonly CosmeticSlot[] = [
  "hat",
  "head",
  "torso",
  "arms",
  "legs",
  "armor",
];

export type PlaceholderRect = { x: number; y: number; w: number; h: number };

/**
 * Authoring contract: every option's PNG is a layer on the SAME shared canvas (width x
 * height below) — the artist draws one figure across aligned layers (legs/torso/head/hat),
 * so a part's pixels already sit exactly where they belong. Real sprites are never scaled
 * or repositioned: they're drawn at native size, at (0, 0), stacked in layerOrder. Retune
 * width/height to match your actual Aseprite canvas — this must be exact, not a suggestion.
 */
export const COSMETIC_FIGURE = {
  width: 32,
  height: 32,
  /**
   * Back-to-front paint order. Armor sits above hat/head (worn over the assembled figure)
   * but arms are drawn last of all, on top of armor — hands stay visible over a vest/helmet
   * since they hold whatever weapon the figure is aiming.
   */
  layerOrder: [
    "legs",
    "torso",
    "head",
    "hat",
    "armor",
    "arms",
  ] as const satisfies readonly CosmeticSlot[],
  /**
   * ONLY used to size/position the flat-color fallback box before a slot has real art.
   * Real sprites ignore this entirely (see the contract above) — never used to scale or
   * place actual PNGs.
   */
  placeholderRects: {
    hat: { x: 8, y: 0, w: 16, h: 5 },
    head: { x: 10, y: 5, w: 12, h: 8 },
    torso: { x: 6, y: 13, w: 20, h: 11 },
    legs: { x: 8, y: 24, w: 16, h: 8 },
    arms: { x: 2, y: 13, w: 28, h: 11 },
    armor: { x: 6, y: 4, w: 20, h: 20 },
  } satisfies Record<CosmeticSlot, PlaceholderRect>,
};

/** Open/extensible — a sprite can declare any region name it needs (e.g. "hair", "skin", "fabric"). */
export type PaintRegionId = string;

export interface ColorSwatch {
  id: string;
  name: string;
  hex: string;
}

/**
 * Curated swatch list per region name. Placeholder-but-real colors — edit freely once
 * actual art/color needs are known. A region with no entry here can't be cycled.
 */
export const SWATCH_LISTS: Record<PaintRegionId, ColorSwatch[]> = {
  hair: [
    { id: "hair-brown", name: "BROWN", hex: "#5a3a22" },
    { id: "hair-dark-brown", name: "DARK BROWN", hex: "#2e1d10" },
    { id: "hair-auburn", name: "AUBURN", hex: "#6b3420" },
    { id: "hair-ginger", name: "GINGER", hex: "#a85a2e" },
    { id: "hair-blonde", name: "BLONDE", hex: "#c9a227" },
    { id: "hair-ash-blonde", name: "ASH BLONDE", hex: "#b8a878" },
    { id: "hair-grey", name: "GREY", hex: "#8a8a86" },
    { id: "hair-white", name: "WHITE", hex: "#e8e4d8" },
    { id: "hair-black", name: "BLACK", hex: "#1c1712" },
  ],
  skin: [
    { id: "skin-pale", name: "PALE", hex: "#d8b088" },
    { id: "skin-fair", name: "FAIR", hex: "#e8c9a8" },
    { id: "skin-tan", name: "TAN", hex: "#a8764a" },
    { id: "skin-olive", name: "OLIVE", hex: "#8a6a42" },
    { id: "skin-brown", name: "BROWN", hex: "#6b4226" },
    { id: "skin-dark-brown", name: "DARK BROWN", hex: "#4a2c18" },
    { id: "skin-deep", name: "DEEP", hex: "#3c2414" },
    { id: "skin-ebony", name: "EBONY", hex: "#241408" },
  ],
  fabric: [
    { id: "fabric-olive", name: "OLIVE", hex: "#4a5a3a" },
    { id: "fabric-black", name: "BLACK", hex: "#1c1c1c" },
    { id: "fabric-tan", name: "TAN", hex: "#8a7a55" },
    { id: "fabric-navy", name: "NAVY", hex: "#2a3245" },
    { id: "fabric-charcoal", name: "CHARCOAL", hex: "#3a3a3a" },
    { id: "fabric-forest", name: "FOREST", hex: "#2e4a2e" },
    { id: "fabric-khaki", name: "KHAKI", hex: "#b0a575" },
    { id: "fabric-maroon", name: "MAROON", hex: "#5a2a2a" },
    { id: "fabric-slate", name: "SLATE", hex: "#3a4a5a" },
    { id: "fabric-brown", name: "BROWN", hex: "#4a3620" },
  ],
  trim: [
    { id: "trim-black", name: "BLACK", hex: "#14130f" },
    { id: "trim-brown", name: "BROWN", hex: "#4a3720" },
    { id: "trim-steel", name: "STEEL", hex: "#6a6e76" },
    { id: "trim-gold", name: "GOLD", hex: "#c9a227" },
    { id: "trim-silver", name: "SILVER", hex: "#b8bcc0" },
    { id: "trim-red", name: "RED", hex: "#7a1e1e" },
    { id: "trim-white", name: "WHITE", hex: "#d8d4c8" },
    { id: "trim-orange", name: "ORANGE", hex: "#b5651d" },
  ],
};

/** Regions with this name share ONE choice across every slot, instead of one choice per slot. */
export const GLOBAL_PAINT_REGIONS: readonly PaintRegionId[] = ["skin", "hair"];

export interface CosmeticOption {
  id: string;
  slot: CosmeticSlot;
  name: string;
  /**
   * Fixed-path PNG, e.g. "/game/cosmetics/head/scout.png", full COSMETIC_FIGURE canvas
   * size with only this part's pixels opaque. Drawn at native size, unscaled. Absent =
   * placeholder block.
   */
  spriteKey?: string;
  /** Optional multiply-blend shading overlay, same size as spriteKey. */
  shadingKey?: string;
  /** Intentionally nothing (e.g. "no hat") — renders neither a sprite nor a placeholder block. */
  empty?: boolean;
  /** Region name -> the literal flat marker hex authored in spriteKey for that region. */
  paintRegions?: Record<PaintRegionId, string>;
  /**
   * Extra marker colors in spriteKey that reuse an already-resolved region's color instead of
   * picking their own swatch — e.g. a pre-baked shadow tone authored as its own flat marker.
   * `factor` scales the resolved color (1 = identical, <1 = darker), matching whatever ratio
   * the art was drawn with (e.g. a #baba00 shadow marker next to a #ffff00 skin marker implies
   * factor = 0x ba/0xff).
   */
  shadeMarkers?: { region: PaintRegionId; markerHex: string; factor: number }[];
  /**
   * A second sprite from this same option, drawn immediately after the "head" layer instead of
   * at this slot's normal stacking position — e.g. a collar/scarf that wraps in front of the
   * head. Recolored the same way as spriteKey, via its own marker map (regions resolve through
   * this option's own slot, so they track the same chosen swatches automatically).
   */
  frontOverlay?: { spriteKey: string; paintRegions: Record<PaintRegionId, string> };
}

/**
 * Shared shading ratios: an art asset's darker marker color sits at this fraction of its base
 * marker color (e.g. a #baba00 shadow-skin marker next to a #ffff00 base-skin marker implies
 * factor = 0xba/0xff), so the derived shade always tracks whatever swatch is actually chosen.
 */
const SKIN_SHADOW_FACTOR = 0xba / 0xff;
const TRIM_SHADOW_FACTOR = 0xa4 / 0xff;
const TRIM_DEEP_SHADOW_FACTOR = 0x5d / 0xff;
const FABRIC_SHADOW_FACTOR = 0xad / 0xff;
const FABRIC_DEEP_SHADOW_FACTOR = 0x70 / 0xff;
const HAIR_SHADOW_FACTOR = 0xdb / 0xff;
const HAIR_DEEP_SHADOW_FACTOR = 0xb2 / 0xff;

/**
 * Real catalog — every option here has actual art. First entry per slot is the default.
 * A hat/armor slot's "NONE" option is a deliberate choice (see CosmeticOption.empty), not a
 * missing-art placeholder, so it stays.
 */
export const COSMETIC_CATALOG: Record<CosmeticSlot, CosmeticOption[]> = {
  head: [
    {
      id: "head-wolf",
      slot: "head",
      name: "WOLF",
      spriteKey: "/game/cosmetics/head/wolf.png",
      paintRegions: { hair: "#ffffff", skin: "#ffff00" },
      shadeMarkers: [
        { region: "hair", markerHex: "#dbdbdb", factor: HAIR_SHADOW_FACTOR },
        { region: "hair", markerHex: "#b2b2b2", factor: HAIR_DEEP_SHADOW_FACTOR },
        { region: "skin", markerHex: "#baba00", factor: SKIN_SHADOW_FACTOR },
      ],
    },
    {
      id: "head-stash",
      slot: "head",
      name: "STASH",
      spriteKey: "/game/cosmetics/head/stash.png",
      paintRegions: { hair: "#000000", skin: "#ffff00" },
      shadeMarkers: [{ region: "skin", markerHex: "#baba00", factor: SKIN_SHADOW_FACTOR }],
    },
  ],
  torso: [
    {
      id: "torso-wolf",
      slot: "torso",
      name: "WOLF",
      spriteKey: "/game/cosmetics/torso/wolf.png",
      paintRegions: { fabric: "#ff00ff", trim: "#00ffff", skin: "#ffff00" },
      shadeMarkers: [
        { region: "fabric", markerHex: "#ad00ad", factor: FABRIC_SHADOW_FACTOR },
        { region: "fabric", markerHex: "#700270", factor: FABRIC_DEEP_SHADOW_FACTOR },
        { region: "skin", markerHex: "#baba00", factor: SKIN_SHADOW_FACTOR },
      ],
    },
    {
      id: "torso-stash",
      slot: "torso",
      name: "STASH",
      spriteKey: "/game/cosmetics/torso/stash.png",
      paintRegions: { fabric: "#ff00ff", trim: "#00ffff", skin: "#ffff00" },
      shadeMarkers: [
        { region: "fabric", markerHex: "#ad00ad", factor: FABRIC_SHADOW_FACTOR },
        { region: "fabric", markerHex: "#700270", factor: FABRIC_DEEP_SHADOW_FACTOR },
        { region: "trim", markerHex: "#02a2a5", factor: TRIM_SHADOW_FACTOR },
        { region: "trim", markerHex: "#005d5d", factor: TRIM_DEEP_SHADOW_FACTOR },
        { region: "skin", markerHex: "#baba00", factor: SKIN_SHADOW_FACTOR },
      ],
      // The collar wraps up in front of the neck — drawn after "head" instead of at torso's
      // normal (below-head) position. Recolors with the same trim swatch as the rest of it.
      frontOverlay: {
        spriteKey: "/game/cosmetics/torso/stash-collar.png",
        paintRegions: { trim: "#000000" },
      },
    },
    {
      id: "torso-jacket",
      slot: "torso",
      name: "JACKET",
      spriteKey: "/game/cosmetics/torso/jacket.png",
      paintRegions: { fabric: "#ff00ff", trim: "#00ffff", skin: "#ffff00" },
      shadeMarkers: [
        { region: "fabric", markerHex: "#ad00ad", factor: FABRIC_SHADOW_FACTOR },
        { region: "fabric", markerHex: "#700270", factor: FABRIC_DEEP_SHADOW_FACTOR },
        { region: "trim", markerHex: "#005d5d", factor: TRIM_DEEP_SHADOW_FACTOR },
        { region: "skin", markerHex: "#baba00", factor: SKIN_SHADOW_FACTOR },
      ],
    },
  ],
  legs: [
    {
      id: "legs-wolf",
      slot: "legs",
      name: "WOLF",
      spriteKey: "/game/cosmetics/legs/wolf.png",
      paintRegions: { fabric: "#ff00ff", trim: "#00ffff" },
      shadeMarkers: [
        { region: "fabric", markerHex: "#ad00ad", factor: FABRIC_SHADOW_FACTOR },
        { region: "fabric", markerHex: "#700270", factor: FABRIC_DEEP_SHADOW_FACTOR },
      ],
    },
    {
      id: "legs-stash",
      slot: "legs",
      name: "STASH",
      spriteKey: "/game/cosmetics/legs/stash.png",
      paintRegions: { fabric: "#ff00ff", trim: "#00ffff" },
    },
  ],
  hat: [
    {
      id: "hat-wolf-cap",
      slot: "hat",
      name: "WOLF CAP",
      spriteKey: "/game/cosmetics/hat/wolf-cap.png",
      paintRegions: { hair: "#ffffff", fabric: "#ff00ff" },
      shadeMarkers: [
        { region: "hair", markerHex: "#b2b2b2", factor: HAIR_DEEP_SHADOW_FACTOR },
        { region: "fabric", markerHex: "#ad00ad", factor: FABRIC_SHADOW_FACTOR },
      ],
    },
    { id: "hat-none", slot: "hat", name: "NONE", empty: true },
    {
      id: "hat-ushanka",
      slot: "hat",
      name: "USHANKA",
      spriteKey: "/game/cosmetics/hat/ushanka.png",
      paintRegions: { fabric: "#ff00ff" },
    },
    {
      id: "hat-cap-forward",
      slot: "hat",
      name: "FORWARD CAP",
      spriteKey: "/game/cosmetics/hat/cap-forward.png",
      paintRegions: { fabric: "#ff00ff", trim: "#00ffff" },
    },
    {
      id: "hat-cap-backward",
      slot: "hat",
      name: "BACKWARD CAP",
      spriteKey: "/game/cosmetics/hat/cap-backward.png",
      paintRegions: { fabric: "#ff00ff", trim: "#00ffff", hair: "#000000" },
    },
    {
      id: "hat-beanie",
      slot: "hat",
      name: "BEANIE",
      spriteKey: "/game/cosmetics/hat/beanie.png",
      paintRegions: { fabric: "#ff00ff" },
    },
    {
      id: "hat-beanie-pompon",
      slot: "hat",
      name: "BEANIE (POMPON)",
      spriteKey: "/game/cosmetics/hat/beanie-pompon.png",
      paintRegions: { fabric: "#ff00ff", trim: "#00ffff" },
    },
  ],
  arms: [
    {
      id: "arms-wolf",
      slot: "arms",
      name: "WOLF",
      spriteKey: "/game/cosmetics/arms/wolf.png",
      paintRegions: { fabric: "#ff00ff", skin: "#ffff00" },
      shadeMarkers: [
        { region: "fabric", markerHex: "#ad00ad", factor: FABRIC_SHADOW_FACTOR },
        { region: "fabric", markerHex: "#700270", factor: FABRIC_DEEP_SHADOW_FACTOR },
        { region: "skin", markerHex: "#baba00", factor: SKIN_SHADOW_FACTOR },
      ],
    },
    {
      id: "arms-stash",
      slot: "arms",
      name: "STASH",
      spriteKey: "/game/cosmetics/arms/stash.png",
      paintRegions: { fabric: "#ff00ff", skin: "#ffff00" },
      shadeMarkers: [
        { region: "fabric", markerHex: "#ad00ad", factor: FABRIC_SHADOW_FACTOR },
        { region: "fabric", markerHex: "#700270", factor: FABRIC_DEEP_SHADOW_FACTOR },
        { region: "skin", markerHex: "#baba00", factor: SKIN_SHADOW_FACTOR },
      ],
    },
    {
      id: "arms-jacket",
      slot: "arms",
      name: "JACKET",
      spriteKey: "/game/cosmetics/arms/jacket.png",
      paintRegions: { fabric: "#ff00ff" },
      shadeMarkers: [
        { region: "fabric", markerHex: "#ad00ad", factor: FABRIC_SHADOW_FACTOR },
        { region: "fabric", markerHex: "#700270", factor: FABRIC_DEEP_SHADOW_FACTOR },
      ],
    },
  ],
  armor: [
    { id: "armor-none", slot: "armor", name: "NONE", empty: true },
    { id: "armor-paca", slot: "armor", name: "PACA", spriteKey: "/game/cosmetics/armor/paca.png" },
    { id: "armor-slick", slot: "armor", name: "SLICK", spriteKey: "/game/cosmetics/armor/slick.png" },
    { id: "armor-6b23", slot: "armor", name: "6B23", spriteKey: "/game/cosmetics/armor/6b23.png" },
    { id: "armor-zbralo", slot: "armor", name: "ZBRALO", spriteKey: "/game/cosmetics/armor/zbralo.png" },
  ],
};

export interface CosmeticLoadout {
  head: string;
  torso: string;
  legs: string;
  hat: string;
  arms: string;
  armor: string;
  /** Swatch id per global region (see GLOBAL_PAINT_REGIONS — currently "skin" and "hair"). */
  globalPaint: Record<PaintRegionId, string>;
  /** Swatch id per region, scoped to the slot — everything not in GLOBAL_PAINT_REGIONS. */
  slotPaint: Partial<Record<CosmeticSlot, Record<PaintRegionId, string>>>;
}

export function cosmeticOption(slot: CosmeticSlot, id: string): CosmeticOption | null {
  return COSMETIC_CATALOG[slot].find((o) => o.id === id) ?? null;
}

export function defaultCosmeticLoadout(): CosmeticLoadout {
  const loadout = { globalPaint: {}, slotPaint: {} } as CosmeticLoadout;
  for (const slot of COSMETIC_SLOTS) loadout[slot] = COSMETIC_CATALOG[slot][0]!.id;
  return loadout;
}

function sanitizePaintMap(raw: Record<string, string> | null | undefined): Record<PaintRegionId, string> {
  const out: Record<PaintRegionId, string> = {};
  if (!raw) return out;
  for (const region of Object.keys(SWATCH_LISTS)) {
    const candidate = raw[region];
    if (candidate && SWATCH_LISTS[region]!.some((s) => s.id === candidate)) out[region] = candidate;
  }
  return out;
}

/** Normalize/fill defaults without mutating. Safe for a missing or stale loadout. */
export function resolveCosmeticLoadout(
  state: Partial<CosmeticLoadout> | null | undefined,
): CosmeticLoadout {
  const loadout = defaultCosmeticLoadout();
  if (!state) return loadout;
  for (const slot of COSMETIC_SLOTS) {
    const candidate = state[slot];
    if (candidate && cosmeticOption(slot, candidate)) loadout[slot] = candidate;
  }
  loadout.globalPaint = sanitizePaintMap(state.globalPaint);
  const slotPaint: Partial<Record<CosmeticSlot, Record<PaintRegionId, string>>> = {};
  for (const slot of COSMETIC_SLOTS) {
    const sanitized = sanitizePaintMap(state.slotPaint?.[slot]);
    if (Object.keys(sanitized).length) slotPaint[slot] = sanitized;
  }
  loadout.slotPaint = slotPaint;
  return loadout;
}

/** Sets the equipped option for a slot directly. No-op if optionId isn't in that slot's catalog. */
export function selectCosmeticOption(
  loadout: CosmeticLoadout,
  slot: CosmeticSlot,
  optionId: string,
): CosmeticLoadout {
  if (!cosmeticOption(slot, optionId)) return loadout;
  return { ...loadout, [slot]: optionId };
}

/** The swatch id currently in effect for a region on a slot (global regions ignore `slot`). */
export function resolvePaintSwatchId(
  loadout: CosmeticLoadout,
  slot: CosmeticSlot,
  region: PaintRegionId,
): string {
  const list = SWATCH_LISTS[region];
  if (!list || !list.length) return "";
  const chosen = GLOBAL_PAINT_REGIONS.includes(region)
    ? loadout.globalPaint[region]
    : loadout.slotPaint[slot]?.[region];
  if (chosen && list.some((s) => s.id === chosen)) return chosen;
  return list[0]!.id;
}

export function paintSwatch(
  loadout: CosmeticLoadout,
  slot: CosmeticSlot,
  region: PaintRegionId,
): ColorSwatch | null {
  const list = SWATCH_LISTS[region];
  if (!list || !list.length) return null;
  const id = resolvePaintSwatchId(loadout, slot, region);
  return list.find((s) => s.id === id) ?? list[0]!;
}

/** Sets a region's swatch directly, routing through globalPaint or slotPaint as appropriate. */
function applyPaintSwatch(
  loadout: CosmeticLoadout,
  slot: CosmeticSlot,
  region: PaintRegionId,
  swatchId: string,
): CosmeticLoadout {
  if (GLOBAL_PAINT_REGIONS.includes(region)) {
    return { ...loadout, globalPaint: { ...loadout.globalPaint, [region]: swatchId } };
  }
  return {
    ...loadout,
    slotPaint: {
      ...loadout.slotPaint,
      [slot]: { ...loadout.slotPaint[slot], [region]: swatchId },
    },
  };
}

/** Sets a region's swatch directly. No-op if swatchId isn't a valid id for that region. */
export function selectPaintSwatch(
  loadout: CosmeticLoadout,
  slot: CosmeticSlot,
  region: PaintRegionId,
  swatchId: string,
): CosmeticLoadout {
  const list = SWATCH_LISTS[region];
  if (!list || !list.some((s) => s.id === swatchId)) return loadout;
  return applyPaintSwatch(loadout, slot, region, swatchId);
}

function pickOne<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]!;
}

/**
 * A fully random but always-valid loadout — one random option per slot, plus a random
 * swatch for every paint region those chosen options actually declare (global regions
 * like skin/hair shared across slots, everything else scoped per-slot). Pass a seeded
 * rng (e.g. mulberry32) for deterministic, reproducible recruits; defaults to Math.random.
 */
export function randomCosmeticLoadout(rng: () => number = Math.random): CosmeticLoadout {
  let loadout = defaultCosmeticLoadout();
  for (const slot of COSMETIC_SLOTS) {
    loadout = selectCosmeticOption(loadout, slot, pickOne(COSMETIC_CATALOG[slot], rng).id);
  }
  for (const region of GLOBAL_PAINT_REGIONS) {
    const list = SWATCH_LISTS[region];
    if (!list?.length) continue;
    loadout = selectPaintSwatch(loadout, COSMETIC_SLOTS[0]!, region, pickOne(list, rng).id);
  }
  for (const slot of COSMETIC_SLOTS) {
    const option = cosmeticOption(slot, loadout[slot]);
    for (const region of Object.keys(option?.paintRegions ?? {})) {
      if (GLOBAL_PAINT_REGIONS.includes(region)) continue;
      const list = SWATCH_LISTS[region];
      if (!list?.length) continue;
      loadout = selectPaintSwatch(loadout, slot, region, pickOne(list, rng).id);
    }
  }
  return loadout;
}

export interface ComposedCosmeticRecolor {
  region: PaintRegionId;
  markerHex: string;
  targetHex: string;
}

export interface ComposedCosmeticLayer {
  key: string;
  slot: CosmeticSlot;
  optionId: string;
  spriteKey?: string;
  shadingKey?: string;
  /** Intentionally nothing (e.g. "no hat") — the renderer draws neither a sprite nor a placeholder. */
  empty: boolean;
  /** Fallback box, used ONLY when there's no spriteKey yet — never scales/positions real art. */
  placeholder: PlaceholderRect;
  label: string;
  recolor: ComposedCosmeticRecolor[];
  /** First active region's resolved color — used only as the placeholder fill until spriteKey exists. */
  placeholderColor?: string;
  /** See CosmeticOption.frontOverlay — drawn by the renderer right after the "head" layer. */
  frontOverlay?: { spriteKey: string; recolor: ComposedCosmeticRecolor[] };
}

function darkenHex(hex: string, factor: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const scale = (channel: number) => Math.max(0, Math.min(255, Math.round(channel * factor)));
  const r = scale((n >> 16) & 255);
  const g = scale((n >> 8) & 255);
  const b = scale(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function resolveRecolor(
  paintRegions: Record<PaintRegionId, string> | undefined,
  resolved: CosmeticLoadout,
  slot: CosmeticSlot,
): ComposedCosmeticRecolor[] {
  const recolor: ComposedCosmeticRecolor[] = [];
  if (!paintRegions) return recolor;
  for (const [region, markerHex] of Object.entries(paintRegions)) {
    const swatch = paintSwatch(resolved, slot, region);
    if (swatch) recolor.push({ region, markerHex, targetHex: swatch.hex });
  }
  return recolor;
}

/** Resolve deterministic draw layers for a loadout. Does not load images. */
export function composeCosmeticLayers(
  loadout: Partial<CosmeticLoadout> | null | undefined,
): ComposedCosmeticLayer[] {
  const resolved = resolveCosmeticLoadout(loadout);
  const layers: ComposedCosmeticLayer[] = [];
  for (const slot of COSMETIC_FIGURE.layerOrder) {
    const optionId = resolved[slot];
    const option = cosmeticOption(slot, optionId);
    const recolor = resolveRecolor(option?.paintRegions, resolved, slot);
    for (const shade of option?.shadeMarkers ?? []) {
      const swatch = paintSwatch(resolved, slot, shade.region);
      if (swatch) {
        recolor.push({
          region: shade.region,
          markerHex: shade.markerHex,
          targetHex: darkenHex(swatch.hex, shade.factor),
        });
      }
    }
    const frontOverlay = option?.frontOverlay
      ? {
          spriteKey: option.frontOverlay.spriteKey,
          recolor: resolveRecolor(option.frontOverlay.paintRegions, resolved, slot),
        }
      : undefined;
    layers.push({
      key: `${slot}:${optionId}`,
      slot,
      optionId,
      ...(option?.spriteKey ? { spriteKey: option.spriteKey } : {}),
      ...(option?.shadingKey ? { shadingKey: option.shadingKey } : {}),
      empty: option?.empty ?? false,
      placeholder: COSMETIC_FIGURE.placeholderRects[slot],
      label: option?.name ?? optionId,
      recolor,
      ...(recolor.length ? { placeholderColor: recolor[0]!.targetHex } : {}),
      ...(frontOverlay ? { frontOverlay } : {}),
    });
  }
  return layers;
}
