/**
 * Modular scav weapon visuals — platforms, parts, anchors, composition.
 * Factory attachments remain separate; this is the improvised Bench build layer.
 */

export type WeaponVisualSlot =
  | "stock"
  | "magazine"
  | "optic"
  | "underbarrel"
  | "muzzle";

export const WEAPON_VISUAL_SLOTS: readonly WeaponVisualSlot[] = [
  "stock",
  "magazine",
  "optic",
  "underbarrel",
  "muzzle",
] as const;

export type WeaponVisualPlatformId = "ak" | "sks";

/** Per-instance scav visual build. Lives on equipped kits and stash compound guns. */
export type WeaponVisualState = {
  platformId: WeaponVisualPlatformId;
  parts: Partial<Record<WeaponVisualSlot, string>>;
};

export type Anchor = { x: number; y: number };

/** Clickable region in platform logical coordinates (same space as anchors). */
export type Hitbox = { x: number; y: number; w: number; h: number };

export type SlotAnchor = Anchor & { hitbox?: Hitbox };

export type WeaponVisualPlatform = {
  id: WeaponVisualPlatformId;
  /** Catalog weapon ids that use this visual platform. */
  weaponIds: readonly string[];
  displayName: string;
  /** Logical canvas size for composition (px). */
  width: number;
  height: number;
  baseSprite: string;
  anchors: Record<WeaponVisualSlot, SlotAnchor>;
  /** Back-to-front paint order. */
  layerOrder: readonly ("base" | WeaponVisualSlot)[];
  defaultParts: Record<WeaponVisualSlot, string | null>;
  supportedSlots: readonly WeaponVisualSlot[];
};

export type WeaponVisualPart = {
  id: string;
  name: string;
  platformId: WeaponVisualPlatformId;
  slot: WeaponVisualSlot;
  spriteKey: string;
  /** Optional offset from platform anchor. */
  offset?: Anchor;
  improvised?: boolean;
  destructive?: boolean;
  /** Relative modifiers applied when this part is active. */
  mods?: WeaponVisualPartMods;
};

export type WeaponVisualPartMods = {
  weightAdd?: number;
  accuracyAdd?: number;
  rangeAdd?: number;
  rangeMult?: number;
  reloadTimeMult?: number;
  moveMult?: number;
};

/** Canonical platforms. */
export const WEAPON_VISUAL_PLATFORMS: Record<WeaponVisualPlatformId, WeaponVisualPlatform> = {
  ak: {
    id: "ak",
    weaponIds: ["ak74"],
    displayName: "AK",
    width: 160,
    height: 48,
    baseSprite: "/game/weapons/ak/base.png",
    anchors: {
      stock: { x: 8, y: 22, hitbox: { x: 0, y: 8, w: 42, h: 36 } },
      magazine: { x: 78, y: 34, hitbox: { x: 68, y: 28, w: 28, h: 20 } },
      optic: { x: 72, y: 10, hitbox: { x: 58, y: 0, w: 40, h: 16 } },
      underbarrel: { x: 92, y: 36, hitbox: { x: 84, y: 30, w: 36, h: 18 } },
      muzzle: { x: 142, y: 20, hitbox: { x: 128, y: 10, w: 32, h: 24 } },
    },
    layerOrder: ["stock", "base", "muzzle", "magazine", "underbarrel", "optic"],
    defaultParts: {
      stock: "ak_stock_default",
      magazine: "ak_mag_default",
      optic: null,
      underbarrel: null,
      muzzle: "ak_muzzle_default",
    },
    supportedSlots: ["stock", "magazine", "optic", "underbarrel", "muzzle"],
  },
  sks: {
    id: "sks",
    weaponIds: ["sks"],
    displayName: "SKS",
    width: 168,
    height: 48,
    baseSprite: "/game/weapons/sks/base.png",
    anchors: {
      stock: { x: 6, y: 22, hitbox: { x: 0, y: 8, w: 48, h: 36 } },
      magazine: { x: 74, y: 34, hitbox: { x: 64, y: 28, w: 26, h: 18 } },
      optic: { x: 70, y: 10, hitbox: { x: 56, y: 0, w: 42, h: 16 } },
      underbarrel: { x: 96, y: 36, hitbox: { x: 88, y: 30, w: 34, h: 18 } },
      muzzle: { x: 150, y: 20, hitbox: { x: 136, y: 10, w: 32, h: 24 } },
    },
    layerOrder: ["stock", "base", "muzzle", "magazine", "underbarrel", "optic"],
    defaultParts: {
      stock: "sks_stock_default",
      magazine: null,
      optic: null,
      underbarrel: null,
      muzzle: "sks_muzzle_default",
    },
    supportedSlots: ["stock", "optic", "muzzle"],
  },
};

function part(
  id: string,
  name: string,
  platformId: WeaponVisualPlatformId,
  slot: WeaponVisualSlot,
  spriteFile: string,
  extra: Partial<WeaponVisualPart> = {},
): WeaponVisualPart {
  return {
    id,
    name,
    platformId,
    slot,
    spriteKey: `/game/weapons/${platformId}/parts/${slot}/${spriteFile}.png`,
    ...extra,
  };
}

/** Visual part catalog for AK + SKS pilots. */
export const WEAPON_VISUAL_PARTS: Record<string, WeaponVisualPart> = {
  // AK stock
  ak_stock_default: part("ak_stock_default", "WOOD STOCK", "ak", "stock", "default"),
  ak_stock_none: part("ak_stock_none", "NO STOCK", "ak", "stock", "none", {
    improvised: true,
    destructive: true,
    mods: { weightAdd: -0.9, accuracyAdd: -0.12, moveMult: 1.08 },
  }),
  ak_stock_welded: part("ak_stock_welded", "WELDED STOCK", "ak", "stock", "welded", {
    improvised: true,
    mods: { weightAdd: 0.45, accuracyAdd: 0.04 },
  }),
  ak_stock_cut: part("ak_stock_cut", "CUT STOCK", "ak", "stock", "cut", {
    improvised: true,
    destructive: true,
    mods: { weightAdd: -0.55, accuracyAdd: -0.07, moveMult: 1.04 },
  }),
  ak_stock_cut_wrapped: part("ak_stock_cut_wrapped", "CUT + WRAP", "ak", "stock", "cut_wrapped", {
    improvised: true,
    destructive: true,
    mods: { weightAdd: -0.4, accuracyAdd: -0.04, moveMult: 1.03 },
  }),
  // AK magazine
  ak_mag_default: part("ak_mag_default", "AK MAG", "ak", "magazine", "default"),
  ak_mag_taped: part("ak_mag_taped", "TAPED MAGS", "ak", "magazine", "taped", {
    improvised: true,
    mods: { weightAdd: 0.35, reloadTimeMult: 0.82 },
  }),
  // AK underbarrel
  ak_grip_taped: part("ak_grip_taped", "TAPED FOREGRIP", "ak", "underbarrel", "taped_grip", {
    improvised: true,
    mods: { weightAdd: 0.15, accuracyAdd: 0.03 },
  }),
  // AK optic
  ak_optic_beer_bottle: part("ak_optic_beer_bottle", "BEER BOTTLE SIGHT", "ak", "optic", "beer_sight", {
    improvised: true,
    mods: { weightAdd: 0.2, accuracyAdd: 0.02, rangeAdd: 4 },
  }),
  // AK muzzle
  ak_muzzle_default: part("ak_muzzle_default", "FULL BARREL", "ak", "muzzle", "default"),
  ak_muzzle_sawed: part("ak_muzzle_sawed", "SAWED BARREL", "ak", "muzzle", "sawed", {
    improvised: true,
    destructive: true,
    mods: { weightAdd: -0.35, accuracyAdd: -0.08, rangeMult: 0.78, moveMult: 1.03 },
  }),

  // SKS stock
  sks_stock_default: part("sks_stock_default", "WOOD STOCK", "sks", "stock", "default"),
  sks_stock_cut: part("sks_stock_cut", "CUT STOCK", "sks", "stock", "cut", {
    improvised: true,
    destructive: true,
    mods: { weightAdd: -0.5, accuracyAdd: -0.06, moveMult: 1.04 },
  }),
  sks_stock_cut_wrapped: part("sks_stock_cut_wrapped", "CUT + WRAP", "sks", "stock", "cut_wrapped", {
    improvised: true,
    destructive: true,
    mods: { weightAdd: -0.35, accuracyAdd: -0.03, moveMult: 1.03 },
  }),
  // SKS optic
  sks_optic_beer_bottle: part("sks_optic_beer_bottle", "BEER BOTTLE SIGHT", "sks", "optic", "beer_sight", {
    improvised: true,
    mods: { weightAdd: 0.2, accuracyAdd: 0.02, rangeAdd: 4 },
  }),
  // SKS muzzle
  sks_muzzle_default: part("sks_muzzle_default", "FULL BARREL", "sks", "muzzle", "default"),
  sks_muzzle_sawed: part("sks_muzzle_sawed", "SAWED BARREL", "sks", "muzzle", "sawed", {
    improvised: true,
    destructive: true,
    mods: { weightAdd: -0.3, accuracyAdd: -0.07, rangeMult: 0.8, moveMult: 1.03 },
  }),
};

export function platformForWeaponId(weaponId: string): WeaponVisualPlatform | null {
  for (const p of Object.values(WEAPON_VISUAL_PLATFORMS)) {
    if (p.weaponIds.includes(weaponId)) return p;
  }
  return null;
}

export function platformIdForWeapon(weaponId: string): WeaponVisualPlatformId | null {
  return platformForWeaponId(weaponId)?.id ?? null;
}

export function visualPart(partId: string | null | undefined): WeaponVisualPart | null {
  if (!partId) return null;
  return WEAPON_VISUAL_PARTS[partId] ?? null;
}

/** Default scav visual state for a supported weapon. Null if not a pilot platform. */
export function defaultVisualState(weaponId: string): WeaponVisualState | null {
  const platform = platformForWeaponId(weaponId);
  if (!platform) return null;
  const parts: Partial<Record<WeaponVisualSlot, string>> = {};
  for (const slot of platform.supportedSlots) {
    const id = platform.defaultParts[slot];
    if (id) parts[slot] = id;
  }
  return { platformId: platform.id, parts };
}

/** Normalize / fill defaults without mutating. Safe for missing optional slots. */
export function resolveVisualState(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
): WeaponVisualState | null {
  const platform = platformForWeaponId(weaponId);
  if (!platform) return null;
  const base = defaultVisualState(weaponId);
  if (!base) return null;
  if (!state || state.platformId !== platform.id) return base;
  const parts: Partial<Record<WeaponVisualSlot, string>> = { ...base.parts };
  for (const slot of platform.supportedSlots) {
    if (!(slot in state.parts)) continue;
    const candidate = state.parts[slot];
    if (candidate == null) {
      delete parts[slot];
      continue;
    }
    const def = visualPart(candidate);
    if (!def || def.platformId !== platform.id || def.slot !== slot) continue;
    parts[slot] = candidate;
  }
  return { platformId: platform.id, parts };
}

export function partIdInSlot(state: WeaponVisualState | null, slot: WeaponVisualSlot): string | null {
  if (!state) return null;
  return state.parts[slot] ?? null;
}

export function setPartInState(
  state: WeaponVisualState,
  slot: WeaponVisualSlot,
  partId: string | null,
): WeaponVisualState {
  const parts = { ...state.parts };
  if (partId == null) delete parts[slot];
  else parts[slot] = partId;
  return { platformId: state.platformId, parts };
}

export type ComposedWeaponLayer = {
  key: string;
  kind: "base" | WeaponVisualSlot;
  partId: string | null;
  spriteKey: string;
  x: number;
  y: number;
  label: string;
  missing: boolean;
};

/**
 * Resolve deterministic draw layers for a weapon build.
 * Does not load images — returns metadata for the renderer.
 */
export function composeWeaponLayers(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
): ComposedWeaponLayer[] | null {
  const platform = platformForWeaponId(weaponId);
  const resolved = resolveVisualState(weaponId, state);
  if (!platform || !resolved) return null;

  const layers: ComposedWeaponLayer[] = [];
  for (const kind of platform.layerOrder) {
    if (kind === "base") {
      layers.push({
        key: "base",
        kind: "base",
        partId: null,
        spriteKey: platform.baseSprite,
        x: 0,
        y: 0,
        label: platform.displayName,
        missing: false,
      });
      continue;
    }
    if (!platform.supportedSlots.includes(kind)) continue;
    const partId = resolved.parts[kind] ?? null;
    if (!partId) continue;
    const def = visualPart(partId);
    if (!def) {
      layers.push({
        key: `${kind}:missing`,
        kind,
        partId,
        spriteKey: "",
        x: platform.anchors[kind].x,
        y: platform.anchors[kind].y,
        label: `?${partId}`,
        missing: true,
      });
      continue;
    }
    const ox = def.offset?.x ?? 0;
    const oy = def.offset?.y ?? 0;
    layers.push({
      key: `${kind}:${partId}`,
      kind,
      partId,
      spriteKey: def.spriteKey,
      x: platform.anchors[kind].x + ox,
      y: platform.anchors[kind].y + oy,
      label: def.name,
      missing: false,
    });
  }
  return layers;
}

/** Aggregate scav part modifiers for combat/stat resolution. */
export function scavVisualMods(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
): Required<WeaponVisualPartMods> {
  const empty: Required<WeaponVisualPartMods> = {
    weightAdd: 0,
    accuracyAdd: 0,
    rangeAdd: 0,
    rangeMult: 1,
    reloadTimeMult: 1,
    moveMult: 1,
  };
  const resolved = resolveVisualState(weaponId, state);
  if (!resolved) return empty;
  let out = { ...empty };
  for (const partId of Object.values(resolved.parts)) {
    if (!partId) continue;
    const def = visualPart(partId);
    const m = def?.mods;
    if (!m) continue;
    out.weightAdd += m.weightAdd ?? 0;
    out.accuracyAdd += m.accuracyAdd ?? 0;
    out.rangeAdd += m.rangeAdd ?? 0;
    out.rangeMult *= m.rangeMult ?? 1;
    out.reloadTimeMult *= m.reloadTimeMult ?? 1;
    out.moveMult *= m.moveMult ?? 1;
  }
  return out;
}

export function slotLabel(slot: WeaponVisualSlot): string {
  switch (slot) {
    case "stock":
      return "STOCK";
    case "magazine":
      return "MAG";
    case "optic":
      return "SIGHT";
    case "underbarrel":
      return "GRIP";
    case "muzzle":
      return "BARREL";
  }
}

/** Resolve clickable hotspots for supported slots only. */
export function resolveSlotHitAreas(
  weaponId: string,
): { slot: WeaponVisualSlot; hitbox: Hitbox; label: string }[] | null {
  const platform = platformForWeaponId(weaponId);
  if (!platform) return null;
  const out: { slot: WeaponVisualSlot; hitbox: Hitbox; label: string }[] = [];
  for (const slot of platform.supportedSlots) {
    const anchor = platform.anchors[slot];
    const hitbox =
      anchor.hitbox ??
      ({
        x: Math.max(0, anchor.x - 12),
        y: Math.max(0, anchor.y - 10),
        w: 28,
        h: 22,
      } satisfies Hitbox);
    out.push({ slot, hitbox, label: slotLabel(slot) });
  }
  return out;
}

export function currentPartLabel(
  weaponId: string,
  state: WeaponVisualState | null | undefined,
  slot: WeaponVisualSlot,
): string {
  const resolved = resolveVisualState(weaponId, state);
  if (!resolved) return "—";
  const id = resolved.parts[slot];
  if (!id) return "NONE";
  return visualPart(id)?.name ?? id;
}

/** Deep clone for previews. */
export function cloneVisualState(state: WeaponVisualState): WeaponVisualState {
  return { platformId: state.platformId, parts: { ...state.parts } };
}
