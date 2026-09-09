/**
 * Player/scav cosmetic slots — head/torso/legs/hat, composed onto one fixed silhouette.
 * Mirrors weaponVisuals.ts's platform/part/resolve/compose shape: one "platform" (the
 * body) instead of several, and no click-to-edit hotspots (this is arrow-cycling).
 */

export type CosmeticSlot = "head" | "torso" | "legs" | "hat";

/** UI cycling order. */
export const COSMETIC_SLOTS: readonly CosmeticSlot[] = ["head", "torso", "legs", "hat"];

export type Anchor = { x: number; y: number; w: number; h: number };

/**
 * Authoring contract: every option's PNG for a slot must be exactly this box (w x h),
 * positioned so the character's silhouette lines up across every option. Placeholder
 * pixel values on a 32x64 canvas — retune once real Aseprite art sizes are known.
 */
export const COSMETIC_FIGURE = {
  width: 32,
  height: 64,
  /** Back-to-front paint order. */
  layerOrder: ["legs", "torso", "head", "hat"] as const satisfies readonly CosmeticSlot[],
  anchors: {
    legs: { x: 8, y: 40, w: 16, h: 24 },
    torso: { x: 6, y: 20, w: 20, h: 22 },
    head: { x: 10, y: 6, w: 12, h: 16 },
    hat: { x: 8, y: 0, w: 16, h: 10 },
  } satisfies Record<CosmeticSlot, Anchor>,
};

export interface CosmeticOption {
  id: string;
  slot: CosmeticSlot;
  name: string;
  /** Fixed-path PNG, e.g. "/game/cosmetics/head/scout.png". Absent = placeholder block. */
  spriteKey?: string;
  /** Intentionally nothing (e.g. "no hat") — renders neither a sprite nor a placeholder block. */
  empty?: boolean;
}

/** Placeholder catalog. Real options are added by dropping a PNG + one entry here. */
export const COSMETIC_CATALOG: Record<CosmeticSlot, CosmeticOption[]> = {
  head: [
    { id: "head-a", slot: "head", name: "GRUNT" },
    { id: "head-b", slot: "head", name: "BALACLAVA" },
    { id: "head-c", slot: "head", name: "VISOR" },
  ],
  torso: [
    { id: "torso-a", slot: "torso", name: "FIELD JACKET" },
    { id: "torso-b", slot: "torso", name: "PLATE CARRIER" },
    { id: "torso-c", slot: "torso", name: "RAIN SLICKER" },
  ],
  legs: [
    { id: "legs-a", slot: "legs", name: "FATIGUES" },
    { id: "legs-b", slot: "legs", name: "CARGO PANTS" },
    { id: "legs-c", slot: "legs", name: "WADERS" },
  ],
  hat: [
    { id: "hat-none", slot: "hat", name: "NONE", empty: true },
    { id: "hat-a", slot: "hat", name: "BOONIE" },
    { id: "hat-b", slot: "hat", name: "USHANKA" },
  ],
};

export interface CosmeticLoadout {
  head: string;
  torso: string;
  legs: string;
  hat: string;
}

export function cosmeticOption(slot: CosmeticSlot, id: string): CosmeticOption | null {
  return COSMETIC_CATALOG[slot].find((o) => o.id === id) ?? null;
}

export function defaultCosmeticLoadout(): CosmeticLoadout {
  const loadout = {} as CosmeticLoadout;
  for (const slot of COSMETIC_SLOTS) loadout[slot] = COSMETIC_CATALOG[slot][0]!.id;
  return loadout;
}

/** Normalize/fill defaults without mutating. Safe for a missing or stale loadout. */
export function resolveCosmeticLoadout(
  state: Partial<CosmeticLoadout> | null | undefined,
): CosmeticLoadout {
  const base = defaultCosmeticLoadout();
  if (!state) return base;
  const loadout = { ...base };
  for (const slot of COSMETIC_SLOTS) {
    const candidate = state[slot];
    if (candidate && cosmeticOption(slot, candidate)) loadout[slot] = candidate;
  }
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

export interface ComposedCosmeticLayer {
  key: string;
  slot: CosmeticSlot;
  optionId: string;
  spriteKey?: string;
  /** Intentionally nothing (e.g. "no hat") — the renderer draws neither a sprite nor a placeholder. */
  empty: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
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
    const anchor = COSMETIC_FIGURE.anchors[slot];
    layers.push({
      key: `${slot}:${optionId}`,
      slot,
      optionId,
      ...(option?.spriteKey ? { spriteKey: option.spriteKey } : {}),
      empty: option?.empty ?? false,
      x: anchor.x,
      y: anchor.y,
      w: anchor.w,
      h: anchor.h,
      label: option?.name ?? optionId,
    });
  }
  return layers;
}
