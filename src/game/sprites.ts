import frames from "./atlas.json";
import gearFrames from "./gear-atlas.json";

export type FrameName = keyof typeof frames;
export type GearFrameName = keyof typeof gearFrames;

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
  if (!atlas.ready || !atlas.img) return false;
  const f = frames[name];
  if (!f) return false;
  const scale = Math.min(boxW / f.w, boxH / f.h);
  const dw = f.w * scale;
  const dh = f.h * scale;
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
  blit(ctx, atlas.img, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
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
  if (!gear.ready || !gear.img) return false;
  const f = gearFrames[name];
  if (!f) return false;
  const dw = width;
  const dh = width * (f.h / f.w);
  let dx = x;
  let dy = y;
  if (opts.anchor === "center") {
    dx = x - dw / 2;
    dy = y - dh / 2;
  } else {
    dy = y - dh / 2;
  }
  blit(ctx, gear.img, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
  return true;
}
