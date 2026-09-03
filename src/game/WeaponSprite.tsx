/**
 * Assembled weapon sprite compositor.
 * Tries PNG parts under /game/weapons/...; falls back to a schematic when missing.
 */

import { useEffect, useState } from "react";
import {
  composeWeaponLayers,
  platformForWeaponId,
  resolveVisualState,
  type WeaponVisualState,
} from "./weaponVisuals";

const SLOT_COLOR: Record<string, string> = {
  base: "#8a7a55",
  stock: "#6b5a3a",
  magazine: "#4a5a3a",
  optic: "#7a8a9a",
  underbarrel: "#5a4a3a",
  muzzle: "#3a3a3a",
};

function useImageOk(src: string | null): boolean {
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

function LayerImage({
  src,
  x,
  y,
  label,
  kind,
}: {
  src: string;
  x: number;
  y: number;
  label: string;
  kind: string;
}) {
  const ok = useImageOk(src);
  if (ok) {
    return (
      <img
        src={src}
        alt={label}
        className="pointer-events-none absolute"
        style={{ left: x, top: y, imageRendering: "pixelated" }}
        draggable={false}
      />
    );
  }
  // Schematic fallback block
  const w = kind === "base" ? 96 : kind === "stock" ? 36 : kind === "muzzle" ? 28 : 22;
  const h = kind === "base" ? 18 : kind === "magazine" ? 20 : 12;
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center border border-black/40 text-[7px] font-bold leading-none text-black/70"
      style={{
        left: kind === "base" ? x + 24 : x,
        top: kind === "base" ? y + 14 : y,
        width: w,
        height: h,
        background: SLOT_COLOR[kind] ?? "#666",
      }}
      title={label}
    >
      {kind === "base" ? "RECV" : label.slice(0, 4)}
    </div>
  );
}

export default function WeaponSprite({
  weaponId,
  scavMods,
  className = "",
  scale = 2,
}: {
  weaponId: string;
  scavMods?: WeaponVisualState | null;
  className?: string;
  scale?: number;
}) {
  const platform = platformForWeaponId(weaponId);
  const layers = composeWeaponLayers(weaponId, scavMods);
  const resolved = resolveVisualState(weaponId, scavMods);

  if (!platform || !layers) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-border/60 bg-black/20 text-[9px] text-muted-foreground ${className}`}
        style={{ width: 160 * scale, height: 48 * scale }}
      >
        NO BENCH PLATFORM
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden border border-border/50 bg-[#1a1814] ${className}`}
      style={{ width: platform.width * scale, height: platform.height * scale }}
      data-platform={platform.id}
      data-parts={JSON.stringify(resolved?.parts ?? {})}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: platform.width, height: platform.height, transform: `scale(${scale})` }}
      >
        {layers.map((layer) => (
          <LayerImage
            key={layer.key}
            src={layer.spriteKey}
            x={layer.x}
            y={layer.y}
            label={layer.label}
            kind={layer.kind}
          />
        ))}
      </div>
    </div>
  );
}
