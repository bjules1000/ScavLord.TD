import { useEffect, useRef, useState } from "react";
import CampAtmosphere from "./CampAtmosphere";
import {
  CAMP_IMAGE_H,
  CAMP_IMAGE_SRC,
  CAMP_IMAGE_W,
  HUB_HOTSPOTS,
  type HubAction,
  type HubHotspot,
} from "./hotspots";

const LABEL_DELAY_MS = 180;

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

      <CampAtmosphere />

      {HUB_HOTSPOTS.map((spot) => (
        <HotspotButton
          key={spot.id}
          spot={spot}
          debug={debug}
          raised={activeId === spot.id}
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
  raised,
  onEnter,
  onLeave,
  onAction,
}: {
  spot: HubHotspot;
  debug: boolean;
  raised: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onAction: (action: HubAction) => void;
}) {
  const coords = `${spot.xPercent},${spot.yPercent} ${spot.widthPercent}×${spot.heightPercent}`;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (labelTimer.current) clearTimeout(labelTimer.current);
  }, []);

  const clearLabelTimer = () => {
    if (labelTimer.current) {
      clearTimeout(labelTimer.current);
      labelTimer.current = null;
    }
  };

  if (!spot.enabled) {
    if (!debug) return null;
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute z-[3]"
        style={{
          ...boxStyle(spot),
          outline: "2px dashed #6f7f52",
          outlineOffset: "-2px",
        }}
      >
        <span
          className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-display text-[8px] tracking-wide text-muted-foreground sm:text-[9px]"
          style={{
            top: 0,
            transform: "translate(-50%, calc(-100% - 4px))",
            textShadow: "0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000",
          }}
        >
          {spot.label} · RADIO {coords}
        </span>
      </div>
    );
  }

  const cue = spot.cue ?? { x: 22, y: 22, w: 56, h: 56 };
  const lab = spot.labelPos ?? { x: 50, y: 8, side: "above" as const };
  const showCue = !debug && (hovered || focused);
  const labelVisible = debug || showLabel;
  const glow = focused ? 0.28 : 0.15;

  return (
    <button
      type="button"
      aria-label={spot.label}
      onClick={() => {
        if (spot.action) onAction(spot.action);
      }}
      onMouseEnter={() => {
        onEnter();
        setHovered(true);
        clearLabelTimer();
        labelTimer.current = setTimeout(() => setShowLabel(true), LABEL_DELAY_MS);
      }}
      onMouseLeave={() => {
        onLeave();
        setHovered(false);
        clearLabelTimer();
        if (!focused) setShowLabel(false);
      }}
      onFocus={() => {
        onEnter();
        setFocused(true);
        clearLabelTimer();
        setShowLabel(true);
      }}
      onBlur={() => {
        onLeave();
        setFocused(false);
        clearLabelTimer();
        if (!hovered) setShowLabel(false);
      }}
      className="absolute cursor-pointer border-0 bg-transparent p-0 outline-none"
      style={{
        ...boxStyle(spot),
        outline: debug ? "2px solid #f0b400" : "none",
        outlineOffset: debug ? "-2px" : undefined,
        boxShadow: debug && raised ? "inset 0 0 0 999px rgba(240,180,0,0.14)" : "none",
        zIndex: raised ? 4 : 3,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: `${cue.x}%`,
          top: `${cue.y}%`,
          width: `${cue.w}%`,
          height: `${cue.h}%`,
          opacity: showCue ? 1 : 0,
          transition: "opacity 90ms linear",
          background: `radial-gradient(ellipse at 50% 42%, rgba(240,180,0,${glow}) 0%, rgba(232,140,48,${glow * 0.4}) 38%, transparent 70%)`,
          mixBlendMode: "screen",
        }}
      />
      {labelVisible && (
        <span
          className="pointer-events-none absolute z-10 whitespace-nowrap font-display text-[8px] tracking-wide text-primary sm:text-[9px]"
          style={{
            left: `${lab.x}%`,
            top: `${lab.y}%`,
            transform:
              lab.side === "above" ? "translate(-50%, calc(-100% - 3px))" : "translate(-50%, 5px)",
            textShadow: "0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000",
          }}
        >
          {spot.label}
          {debug ? `  ${coords}` : ""}
        </span>
      )}
    </button>
  );
}
