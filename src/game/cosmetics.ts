/**
 * Player/scav cosmetic slots — head/torso/legs/hat, composed onto one fixed silhouette.
 * Mirrors weaponVisuals.ts's platform/part/resolve/compose shape: one "platform" (the
 * body) instead of several, and no click-to-edit hotspots (this is arrow-cycling).
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
  "legs",
  "arms",
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
    { id: "hair-ginger", name: "GINGER", hex: "#a85a2e" },
    { id: "hair-blonde", name: "BLONDE", hex: "#c9a227" },
    { id: "hair-black", name: "BLACK", hex: "#1c1712" },
  ],
  skin: [
    { id: "skin-pale", name: "PALE", hex: "#d8b088" },
    { id: "skin-tan", name: "TAN", hex: "#a8764a" },
    { id: "skin-brown", name: "BROWN", hex: "#6b4226" },
    { id: "skin-deep", name: "DEEP", hex: "#3c2414" },
  ],
  fabric: [
    { id: "fabric-olive", name: "OLIVE", hex: "#4a5a3a" },
    { id: "fabric-black", name: "BLACK", hex: "#1c1c1c" },
    { id: "fabric-tan", name: "TAN", hex: "#8a7a55" },
    { id: "fabric-navy", name: "NAVY", hex: "#2a3245" },
  ],
  trim: [
    { id: "trim-black", name: "BLACK", hex: "#14130f" },
    { id: "trim-brown", name: "BROWN", hex: "#4a3720" },
    { id: "trim-steel", name: "STEEL", hex: "#6a6e76" },
    { id: "trim-gold", name: "GOLD", hex: "#c9a227" },
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
}

/** Placeholder catalog. Real options are added by dropping a PNG + one entry here. */
export const COSMETIC_CATALOG: Record<CosmeticSlot, CosmeticOption[]> = {
  head: [
    { id: "head-a", slot: "head", name: "GRUNT", paintRegions: { hair: "#ff00ff", skin: "#00ffff" } },
    { id: "head-b", slot: "head", name: "BALACLAVA", paintRegions: { skin: "#00ffff" } },
    { id: "head-c", slot: "head", name: "VISOR" },
    {
      id: "head-wolf",
      slot: "head",
      name: "WOLF",
      spriteKey: "/game/cosmetics/head/wolf.png",
      paintRegions: { hair: "#000000", skin: "#ffff00" },
    },
  ],
  torso: [
    { id: "torso-a", slot: "torso", name: "FIELD JACKET", paintRegions: { fabric: "#ff00ff" } },
    { id: "torso-b", slot: "torso", name: "PLATE CARRIER" },
    { id: "torso-c", slot: "torso", name: "RAIN SLICKER", paintRegions: { fabric: "#ff00ff" } },
    {
      id: "torso-wolf",
      slot: "torso",
      name: "WOLF",
      spriteKey: "/game/cosmetics/torso/wolf.png",
      paintRegions: { fabric: "#ff00ff", trim: "#00ffff", skin: "#ffff00" },
    },
  ],
  legs: [
    { id: "legs-a", slot: "legs", name: "FATIGUES", paintRegions: { fabric: "#ff00ff" } },
    { id: "legs-b", slot: "legs", name: "CARGO PANTS", paintRegions: { fabric: "#ff00ff" } },
    { id: "legs-c", slot: "legs", name: "WADERS" },
    {
      id: "legs-wolf",
      slot: "legs",
      name: "WOLF",
      spriteKey: "/game/cosmetics/legs/wolf.png",
      paintRegions: { fabric: "#ff00ff", trim: "#00ffff" },
    },
  ],
  hat: [
    { id: "hat-none", slot: "hat", name: "NONE", empty: true },
    { id: "hat-a", slot: "hat", name: "BOONIE", paintRegions: { trim: "#ff00ff" } },
    { id: "hat-b", slot: "hat", name: "USHANKA", spriteKey: "/game/cosmetics/hat/ushanka.png" },
    {
      id: "hat-wolf-cap",
      slot: "hat",
      name: "WOLF CAP",
      spriteKey: "/game/cosmetics/hat/wolf-cap.png",
      paintRegions: { hair: "#000000", fabric: "#ff00ff" },
    },
    { id: "hat-cap-forward", slot: "hat", name: "FORWARD CAP", spriteKey: "/game/cosmetics/hat/cap-forward.png" },
    { id: "hat-cap-backward", slot: "hat", name: "BACKWARD CAP", spriteKey: "/game/cosmetics/hat/cap-backward.png" },
    { id: "hat-beanie", slot: "hat", name: "BEANIE", spriteKey: "/game/cosmetics/hat/beanie.png" },
    { id: "hat-beanie-pompon", slot: "hat", name: "BEANIE (POMPON)", spriteKey: "/game/cosmetics/hat/beanie-pompon.png" },
  ],
  arms: [
    {
      id: "arms-wolf",
      slot: "arms",
      name: "WOLF",
      spriteKey: "/game/cosmetics/arms/wolf.png",
      paintRegions: { fabric: "#ff00ff", skin: "#ffff00" },
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

/** Wraps around the catalog array for that slot. Pure — returns a new loadout. */
export function cycleCosmeticOption(
  loadout: CosmeticLoadout,
  slot: CosmeticSlot,
  direction: 1 | -1,
): CosmeticLoadout {
  const options = COSMETIC_CATALOG[slot];
  const currentIndex = options.findIndex((o) => o.id === loadout[slot]);
  const base = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = (base + direction + options.length) % options.length;
  return { ...loadout, [slot]: options[nextIndex]!.id };
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

/** Wraps around that region's swatch list. Pure — returns a new loadout. */
export function cyclePaintSwatch(
  loadout: CosmeticLoadout,
  slot: CosmeticSlot,
  region: PaintRegionId,
  direction: 1 | -1,
): CosmeticLoadout {
  const list = SWATCH_LISTS[region];
  if (!list || !list.length) return loadout;
  const currentId = resolvePaintSwatchId(loadout, slot, region);
  const currentIndex = list.findIndex((s) => s.id === currentId);
  const base = currentIndex === -1 ? 0 : currentIndex;
  const nextId = list[(base + direction + list.length) % list.length]!.id;
  if (GLOBAL_PAINT_REGIONS.includes(region)) {
    return { ...loadout, globalPaint: { ...loadout.globalPaint, [region]: nextId } };
  }
  return {
    ...loadout,
    slotPaint: {
      ...loadout.slotPaint,
      [slot]: { ...loadout.slotPaint[slot], [region]: nextId },
    },
  };
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
    const recolor: ComposedCosmeticRecolor[] = [];
    if (option?.paintRegions) {
      for (const [region, markerHex] of Object.entries(option.paintRegions)) {
        const swatch = paintSwatch(resolved, slot, region);
        if (swatch) recolor.push({ region, markerHex, targetHex: swatch.hex });
      }
    }
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
    });
  }
  return layers;
}
