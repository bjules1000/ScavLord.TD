/**
 * Composited player/scav cosmetic preview. Tries a PNG per slot from cosmetics.ts's
 * catalog; falls back to a colored placeholder block when the sprite is missing (no
 * art authored yet) or intentionally skips the layer for an "empty" option (no hat).
 */

import { useEffect, useState } from "react";
import { COSMETIC_FIGURE, composeCosmeticLayers, type CosmeticLoadout } from "./cosmetics";

const SLOT_COLOR: Record<string, string> = {
  head: "#c9a56a",
  torso: "#5a6a4a",
  legs: "#3a3a4a",
  hat: "#8a4a3a",
};

function useImageOk(src: string | undefined): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!src) {
      setOk(false);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setOk(true);
    };
    img.onerror = () => {
      if (!cancelled) setOk(false);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return ok;
}

function CosmeticLayerImage({
  spriteKey,
  slot,
  x,
  y,
  w,
  h,
  label,
}: {
  spriteKey: string | undefined;
  slot: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}) {
  const ok = useImageOk(spriteKey);
  if (ok && spriteKey) {
    return (
      <img
        src={spriteKey}
        alt={label}
        className="pointer-events-none absolute"
        style={{ left: x, top: y, width: w, height: h, imageRendering: "pixelated" }}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center overflow-hidden border border-black/40 text-[5px] font-bold leading-none text-black/70"
      style={{ left: x, top: y, width: w, height: h, background: SLOT_COLOR[slot] ?? "#666" }}
      title={label}
    >
      {label.slice(0, 3).toUpperCase()}
    </div>
  );
}

export default function CosmeticFigure({
  loadout,
  scale = 4,
  className = "",
}: {
  loadout: CosmeticLoadout;
  scale?: number;
  className?: string;
}) {
  const layers = composeCosmeticLayers(loadout);
  const intScale = Math.max(1, Math.round(scale));

  return (
    <div
      className={`relative bg-transparent ${className}`}
      style={{
        width: COSMETIC_FIGURE.width * intScale,
        height: COSMETIC_FIGURE.height * intScale,
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: COSMETIC_FIGURE.width,
          height: COSMETIC_FIGURE.height,
          transform: `scale(${intScale})`,
          imageRendering: "pixelated",
        }}
      >
        {layers.map((layer) =>
          layer.empty ? null : (
            <CosmeticLayerImage
              key={layer.key}
              spriteKey={layer.spriteKey}
              slot={layer.slot}
              x={layer.x}
              y={layer.y}
              w={layer.w}
              h={layer.h}
              label={layer.label}
            />
          ),
        )}
      </div>
    </div>
  );
}
