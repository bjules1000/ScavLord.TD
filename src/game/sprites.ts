import frames from "./atlas.json";
import gearFrames from "./gear-atlas.json";

export type FrameName = keyof typeof frames;
export type GearFrameName = keyof typeof gearFrames;
export type SpriteSheetName = "atlas" | "gear" | "floor";
export type SpriteSlotName = FrameName | GearFrameName | "floor";

export const SPRITE_LAB_STORAGE_KEY = "scavlord.dev.spriteLab.v1";

export type SpriteLabEntry = {
  sheet: SpriteSheetName;
  name: SpriteSlotName;
  width: number;
  height: number;
};

export const spriteLabCatalog = (): SpriteLabEntry[] => [
  ...Object.entries(frames).map(([name, frame]) => ({
    sheet: "atlas" as const,
    name: name as FrameName,
    width: frame.w,
    height: frame.h,
  })),
  ...Object.entries(gearFrames).map(([name, frame]) => ({
    sheet: "gear" as const,
    name: name as GearFrameName,
    width: frame.w,
    height: frame.h,
  })),
  { sheet: "floor", name: "floor", width: 32, height: 32 },
];

/**
 * Local pixel sheets in public/game/. Loaded at runtime so a missing file
 * never breaks the build — draw.ts falls back to procedural pixel art.
 * Do not point at Lovable CDN URLs.
 *
 * Current PNGs are bootstrap placeholders (see scripts/write-game-sprites.ts).
 * That script will not overwrite existing files without --force.
 */
const ATLAS_SRC = "/game/atlas.png";
const GEAR_SRC = "/game/gear.png";
const FLOOR_SRC = "/game/floor.png";

type Sheet = {
  img: HTMLImageElement | null;
  ready: boolean;
  failed: boolean;
};

const atlas: Sheet = { img: null, ready: false, failed: false };
const gear: Sheet = { img: null, ready: false, failed: false };
const floor: Sheet = { img: null, ready: false, failed: false };
const overrideImages = new Map<string, HTMLImageElement>();
let overridesHydrated = false;

function overrideKey(sheet: SpriteSheetName, name: SpriteSlotName) {
  return `${sheet}:${name}`;
}

function loadOverrideImage(key: string, src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      overrideImages.set(key, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("The selected file is not a readable PNG image."));
    img.src = src;
  });
}

function storedOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SPRITE_LAB_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function hydrateOverrides() {
  if (overridesHydrated || typeof window === "undefined") return;
  overridesHydrated = true;
  for (const [key, src] of Object.entries(storedOverrides())) {
    if (typeof src === "string" && src.startsWith("data:image/png"))
      void loadOverrideImage(key, src).catch(() => {});
  }
}

export function spriteOverrideData(
  sheet: SpriteSheetName,
  name: SpriteSlotName,
): string | undefined {
  return storedOverrides()[overrideKey(sheet, name)];
}

export async function applySpriteOverride(
  sheet: SpriteSheetName,
  name: SpriteSlotName,
  dataUrl: string,
) {
  if (!dataUrl.startsWith("data:image/png")) throw new Error("Only PNG files are supported.");
  const key = overrideKey(sheet, name);
  await loadOverrideImage(key, dataUrl);
  const next = { ...storedOverrides(), [key]: dataUrl };
  window.localStorage.setItem(SPRITE_LAB_STORAGE_KEY, JSON.stringify(next));
}

export function clearSpriteOverride(sheet: SpriteSheetName, name: SpriteSlotName) {
  const key = overrideKey(sheet, name);
  overrideImages.delete(key);
  const next = storedOverrides();
  delete next[key];
  window.localStorage.setItem(SPRITE_LAB_STORAGE_KEY, JSON.stringify(next));
}

function loadSheet(sheet: Sheet, src: string) {
  if (typeof window === "undefined") return;
  if (sheet.img || sheet.failed) return;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    sheet.ready = img.naturalWidth > 0;
    sheet.failed = !sheet.ready;
  };
  img.onerror = () => {
    sheet.ready = false;
    sheet.failed = true;
  };
  sheet.img = img;
  img.src = src;
}

function ensure() {
  hydrateOverrides();
  loadSheet(atlas, ATLAS_SRC);
  loadSheet(gear, GEAR_SRC);
  loadSheet(floor, FLOOR_SRC);
}

export const spritesReady = () => {
  ensure();
  return atlas.ready;
};
export const gearSpritesReady = () => {
  ensure();
  return gear.ready;
};
export const floorReadyFn = () => {
  ensure();
  return floor.ready;
};
export const floorImage = (): HTMLImageElement | null => {
  ensure();
  const replacement = overrideImages.get(overrideKey("floor", "floor"));
  if (replacement) return replacement;
  return floor.ready ? floor.img : null;
};

function blit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img,
    sx,
    sy,
    sw,
    sh,
    Math.round(dx),
    Math.round(dy),
    Math.round(dw),
    Math.round(dh),
  );
  ctx.imageSmoothingEnabled = prev;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: FrameName,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  opts: { anchor?: "bottom" | "center"; alpha?: number } = {},
) {
  ensure();
  const f = frames[name];
  if (!f) return false;
  const replacement = overrideImages.get(overrideKey("atlas", name));
  if (!replacement && (!atlas.ready || !atlas.img)) return false;
  const sourceW = replacement?.naturalWidth ?? f.w;
  const sourceH = replacement?.naturalHeight ?? f.h;
  const scale = Math.min(boxW / sourceW, boxH / sourceH);
  const dw = sourceW * scale;
  const dh = sourceH * scale;
  let dx = x;
  let dy = y;
  if (opts.anchor === "center") {
    dx = x + (boxW - dw) / 2;
    dy = y + (boxH - dh) / 2;
  } else if (opts.anchor === "bottom") {
    dx = x + (boxW - dw) / 2;
    dy = y + boxH - dh;
  }
  const prevA = ctx.globalAlpha;
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (replacement) blit(ctx, replacement, 0, 0, sourceW, sourceH, dx, dy, dw, dh);
  else blit(ctx, atlas.img!, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
  ctx.globalAlpha = prevA;
  return true;
}

export function drawGear(
  ctx: CanvasRenderingContext2D,
  name: GearFrameName,
  x: number,
  y: number,
  width: number,
  opts: { anchor?: "left" | "center" } = {},
) {
  ensure();
  const f = gearFrames[name];
  if (!f) return false;
  const replacement = overrideImages.get(overrideKey("gear", name));
  if (!replacement && (!gear.ready || !gear.img)) return false;
  const sourceW = replacement?.naturalWidth ?? f.w;
  const sourceH = replacement?.naturalHeight ?? f.h;
  const dw = width;
  const dh = width * (sourceH / sourceW);
  let dx = x;
  let dy = y;
  if (opts.anchor === "center") {
    dx = x - dw / 2;
    dy = y - dh / 2;
  } else {
    dy = y - dh / 2;
  }
  if (replacement) blit(ctx, replacement, 0, 0, sourceW, sourceH, dx, dy, dw, dh);
  else blit(ctx, gear.img!, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
  return true;
}
