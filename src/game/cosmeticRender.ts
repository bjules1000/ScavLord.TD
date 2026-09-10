/**
 * Canvas-only recolor engine for cosmetic layers. Loads each layer's sprite/shading PNG,
 * does an exact marker-color -> target-color swap (alpha preserved), then composites the
 * shading overlay with a multiply blend so shading stays correct regardless of the chosen
 * color. Results are cached so the pixel loop only reruns when a swatch actually changes.
 *
 * Real sprites are never scaled or repositioned — every part is authored on the same
 * COSMETIC_FIGURE canvas and already sits exactly where it belongs, so layers are drawn at
 * native size, at (0, 0). Only the "no art yet" placeholder box uses layer.placeholder.
 */

import {
  COSMETIC_FIGURE,
  composeCosmeticLayers,
  type ComposedCosmeticRecolor,
  type CosmeticLoadout,
} from "./cosmetics";

/** Just enough shape to draw+recolor one sprite — a real layer, or a layer's frontOverlay. */
interface DrawableSprite {
  spriteKey?: string;
  shadingKey?: string;
  recolor: ComposedCosmeticRecolor[];
}

const SLOT_COLOR: Record<string, string> = {
  head: "#c9a56a",
  torso: "#5a6a4a",
  legs: "#3a3a4a",
  hat: "#8a4a3a",
  arms: "#c9a56a",
  armor: "#4a4a4a",
};

const imageCache = new Map<string, HTMLImageElement>();
const warnedMismatch = new Set<string>();

function loadImage(src: string, onReady: () => void): HTMLImageElement {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const img = new Image();
  img.onload = () => {
    if (
      (img.naturalWidth !== COSMETIC_FIGURE.width || img.naturalHeight !== COSMETIC_FIGURE.height) &&
      !warnedMismatch.has(src)
    ) {
      warnedMismatch.add(src);
      console.warn(
        `[cosmetics] ${src} is ${img.naturalWidth}x${img.naturalHeight}, expected the shared ` +
          `${COSMETIC_FIGURE.width}x${COSMETIC_FIGURE.height} canvas — it won't align with other layers.`,
      );
    }
    onReady();
  };
  img.onerror = onReady;
  img.src = src;
  imageCache.set(src, img);
  return img;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const recolorCache = new Map<string, HTMLCanvasElement>();

function recolorSignature(sprite: DrawableSprite): string {
  return `${sprite.spriteKey}|${sprite.shadingKey ?? ""}|${JSON.stringify(sprite.recolor)}`;
}

/** Draws + recolors a sprite onto a cached offscreen canvas. Null while assets load. */
function recoloredLayerCanvas(sprite: DrawableSprite, onReady: () => void): HTMLCanvasElement | null {
  if (!sprite.spriteKey) return null;
  const img = loadImage(sprite.spriteKey, onReady);
  if (!img.complete || !img.naturalWidth) return null;

  const signature = recolorSignature(sprite);
  const cached = recolorCache.get(signature);
  if (cached) return cached;

  const off = document.createElement("canvas");
  off.width = img.naturalWidth;
  off.height = img.naturalHeight;
  const octx = off.getContext("2d");
  if (!octx) return null;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(img, 0, 0);

  if (sprite.recolor.length) {
    const data = octx.getImageData(0, 0, off.width, off.height);
    const pixels = data.data;
    for (const { markerHex, targetHex } of sprite.recolor) {
      const [mr, mg, mb] = hexToRgb(markerHex);
      const [tr, tg, tb] = hexToRgb(targetHex);
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] === mr && pixels[i + 1] === mg && pixels[i + 2] === mb) {
          pixels[i] = tr;
          pixels[i + 1] = tg;
          pixels[i + 2] = tb;
        }
      }
    }
    octx.putImageData(data, 0, 0);
  }

  if (sprite.shadingKey) {
    const shadeImg = loadImage(sprite.shadingKey, onReady);
    if (shadeImg.complete && shadeImg.naturalWidth) {
      octx.globalCompositeOperation = "multiply";
      octx.drawImage(shadeImg, 0, 0);
      octx.globalCompositeOperation = "source-over";
    }
  }

  recolorCache.set(signature, off);
  return off;
}

/**
 * Draws a full cosmetic loadout onto ctx (a COSMETIC_FIGURE.width x height canvas).
 * `onReady` is called once per image that finishes loading, so the caller can trigger a
 * redraw once assets that weren't ready on the first pass become available.
 */
export function drawCosmeticFigure(
  ctx: CanvasRenderingContext2D,
  loadout: CosmeticLoadout,
  onReady: () => void,
) {
  ctx.clearRect(0, 0, COSMETIC_FIGURE.width, COSMETIC_FIGURE.height);
  // A layer's frontOverlay (e.g. a collar drawn from the torso option) must render above the
  // head instead of at its own slot's normal stacking position — queue it and flush right
  // after the head layer draws.
  const pendingFrontOverlays: DrawableSprite[] = [];
  for (const layer of composeCosmeticLayers(loadout)) {
    if (!layer.empty) {
      const canvas = recoloredLayerCanvas(layer, onReady);
      if (canvas) {
        // Native size, no stretch — every part is pre-aligned on the shared figure canvas.
        ctx.drawImage(canvas, 0, 0);
      } else {
        const { x, y, w, h } = layer.placeholder;
        ctx.fillStyle = layer.placeholderColor ?? SLOT_COLOR[layer.slot] ?? "#666";
        ctx.fillRect(x, y, w, h);
      }
      if (layer.frontOverlay) pendingFrontOverlays.push(layer.frontOverlay);
    }
    if (layer.slot === "head") {
      for (const overlay of pendingFrontOverlays) {
        const canvas = recoloredLayerCanvas(overlay, onReady);
        if (canvas) ctx.drawImage(canvas, 0, 0);
      }
      pendingFrontOverlays.length = 0;
    }
  }
}
