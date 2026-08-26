import { useEffect, useState } from "react";
import {
  CAMP_IMAGE_H,
  CAMP_IMAGE_SRC,
  CAMP_IMAGE_W,
  HUB_HOTSPOTS,
  type HubAction,
  type HubHotspot,
} from "./hotspots";

function readDebugHub(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugHub") === "1";
}

export default function CampHub({ onAction }: { onAction: (action: HubAction) => void }) {
  const [debug, setDebug] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setDebug(readDebugHub());
  }, []);

  return (
    <div
      className="relative mx-auto w-full bg-[#12180f]"
      style={{ aspectRatio: `${CAMP_IMAGE_W} / ${CAMP_IMAGE_H}` }}
    >
      <img
        src={CAMP_IMAGE_SRC}
        alt="Scav camp"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        style={{ imageRendering: "pixelated", objectFit: "contain" }}
      />

      {HUB_HOTSPOTS.map((spot) => (
        <HotspotButton
          key={spot.id}
          spot={spot}
          debug={debug}
          active={activeId === spot.id}
          onEnter={() => setActiveId(spot.id)}
          onLeave={() => setActiveId((id) => (id === spot.id ? null : id))}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

function boxStyle(spot: HubHotspot) {
  return {
    left: `${spot.xPercent}%`,
    top: `${spot.yPercent}%`,
    width: `${spot.widthPercent}%`,
    height: `${spot.heightPercent}%`,
  };
}

function HotspotButton({
  spot,
  debug,
  active,
  onEnter,
  onLeave,
  onAction,
}: {
  spot: HubHotspot;
  debug: boolean;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onAction: (action: HubAction) => void;
}) {
  const labelAbove = spot.yPercent > 18;
  const coords = `${spot.xPercent},${spot.yPercent} ${spot.widthPercent}×${spot.heightPercent}`;

  if (!spot.enabled) {
    if (!debug) return null;
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          ...boxStyle(spot),
          outline: "2px dashed #6f7f52",
          outlineOffset: "-2px",
        }}
      >
        <span
          className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-display text-[8px] tracking-wide text-muted-foreground sm:text-[9px] ${
            labelAbove ? "bottom-full mb-1" : "top-full mt-1"
          }`}
          style={{ textShadow: "0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000" }}
        >
          {spot.label} · RADIO {coords}
        </span>
      </div>
    );
  }

  const showChrome = active || debug;

  return (
    <button
      type="button"
      aria-label={spot.label}
      onClick={() => {
        if (spot.action) onAction(spot.action);
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className="absolute cursor-pointer border-0 bg-transparent p-0"
      style={{
        ...boxStyle(spot),
        outline: showChrome ? "2px solid #f0b400" : "2px solid transparent",
        outlineOffset: "-2px",
        boxShadow: active ? "inset 0 0 0 999px rgba(240,180,0,0.14)" : "none",
        zIndex: active ? 2 : 1,
      }}
    >
      {showChrome && (
        <span
          className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-display text-[8px] tracking-wide text-primary sm:text-[9px] ${
            labelAbove ? "bottom-full mb-1" : "top-full mt-1"
          }`}
          style={{ textShadow: "0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000" }}
        >
          {spot.label}
          {debug ? `  ${coords}` : ""}
        </span>
      )}
    </button>
  );
}
