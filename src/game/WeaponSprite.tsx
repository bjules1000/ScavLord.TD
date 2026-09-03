/**
 * Assembled weapon sprite compositor with optional slot hotspots.
 * Tries PNG parts under /game/weapons/...; falls back to a schematic when missing.
 */

import { useEffect, useState } from "react";
import {
  composeWeaponLayers,
  platformForWeaponId,
  resolveSlotHitAreas,
  resolveVisualState,
  type WeaponVisualSlot,
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
        imageRendering: "pixelated",
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
  scale = 4,
  selectedSlot = null,
  hoverSlot = null,
  onSelectSlot,
  onHoverSlot,
  interactive = false,
}: {
  weaponId: string;
  scavMods?: WeaponVisualState | null;
  className?: string;
  scale?: number;
  selectedSlot?: WeaponVisualSlot | null;
  hoverSlot?: WeaponVisualSlot | null;
  onSelectSlot?: (slot: WeaponVisualSlot) => void;
  onHoverSlot?: (slot: WeaponVisualSlot | null) => void;
  interactive?: boolean;
}) {
  const platform = platformForWeaponId(weaponId);
  const layers = composeWeaponLayers(weaponId, scavMods);
  const resolved = resolveVisualState(weaponId, scavMods);
  const hitAreas = interactive ? resolveSlotHitAreas(weaponId) : null;
  const intScale = Math.max(1, Math.round(scale));

  if (!platform || !layers) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-border/60 bg-black/20 text-[9px] text-muted-foreground ${className}`}
        style={{ width: 160 * intScale, height: 48 * intScale }}
      >
        NO BENCH PLATFORM
      </div>
    );
  }

  const active = hoverSlot ?? selectedSlot;

  return (
    <div
      className={`relative bg-[#141210] ${className}`}
      style={{
        width: platform.width * intScale,
        height: platform.height * intScale,
        imageRendering: "pixelated",
      }}
      data-platform={platform.id}
      data-parts={JSON.stringify(resolved?.parts ?? {})}
      data-selected-slot={selectedSlot ?? ""}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: platform.width,
          height: platform.height,
          transform: `scale(${intScale})`,
          imageRendering: "pixelated",
        }}
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
        {hitAreas?.map((area) => {
          const selected = selectedSlot === area.slot;
          const hovered = hoverSlot === area.slot;
          return (
            <button
              key={area.slot}
              type="button"
              aria-label={area.label}
              data-hotspot={area.slot}
              className={`absolute border transition-colors ${
                selected
                  ? "border-primary/90 bg-primary/20"
                  : hovered
                    ? "border-accent/70 bg-accent/10"
                    : "border-transparent bg-transparent hover:border-accent/50 hover:bg-white/5"
              }`}
              style={{
                left: area.hitbox.x,
                top: area.hitbox.y,
                width: area.hitbox.w,
                height: area.hitbox.h,
              }}
              onMouseEnter={() => onHoverSlot?.(area.slot)}
              onMouseLeave={() => onHoverSlot?.(null)}
              onClick={() => onSelectSlot?.(area.slot)}
            />
          );
        })}
      </div>
      {active && (
        <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 border border-border/60 bg-black/70 px-1.5 py-0.5 font-mono text-[8px] tracking-wide text-accent">
          {hitAreas?.find((h) => h.slot === active)?.label ?? active.toUpperCase()}
        </div>
      )}
    </div>
  );
}
