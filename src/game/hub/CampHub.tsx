import { useCallback, useEffect, useRef, useState } from "react";
import PlacementLayer from "../dev/PlacementLayer";
import { type PlacementOffset } from "../dev/placement";
import { drawOperator, type DrawableOperator } from "../draw";
import { nearestStation, stepCampMove, type CampMoveInput } from "./campMovement";
import {
  FIRE_FRAME_MS,
  campPlateSrc,
  fireVisibleObjects,
  shouldAnimateFire,
} from "./animate";
import CampAtmosphere, { usePrefersReducedMotion } from "./CampAtmosphere";
import {
  CAMP_IMAGE_H,
  CAMP_IMAGE_W,
  HUB_HOTSPOTS,
  type HubAction,
  type HubHotspot,
} from "./hotspots";

const LABEL_DELAY_MS = 180;
/** Image-pixel units/sec — tuned against the 1448x1086 camp scene, needs a real playtest. */
const PLAYER_SPEED_PX = 220;
const INTERACT_RADIUS_PX = 90;
const PLAYER_CANVAS_PX = 80;
const PLAYER_DRAW_SCALE = 2;

export interface CampPlayerGear {
  weapon: string;
  armor: string | null;
  attachments: string[];
  level: number;
}

function useFireStep(intervalMs: number, running: boolean): number {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setStep((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, running]);

  return step;
}

function readDebugHub(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugHub") === "1";
}

export default function CampHub({
  onAction,
  editMode = false,
  controlsEnabled = false,
  walkable = true,
  player,
}: {
  onAction: (action: HubAction) => void;
  editMode?: boolean;
  controlsEnabled?: boolean;
  /** False while a station's menu is open on top of the scene — movement/interact pause. */
  walkable?: boolean;
  player: CampPlayerGear;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [debug, setDebug] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<Record<string, PlacementOffset>>({});
  const reducedMotion = usePrefersReducedMotion();
  const fireRunning = shouldAnimateFire(reducedMotion, editMode);
  const fireStep = useFireStep(FIRE_FRAME_MS, fireRunning);
  const fireObjects = fireVisibleObjects(fireStep, reducedMotion);

  const playerPosRef = useRef({ x: CAMP_IMAGE_W / 2, y: CAMP_IMAGE_H * 0.7 });
  const facingRef = useRef(-Math.PI / 2);
  const heldKeysRef = useRef<Set<string>>(new Set());
  const playerCanvasRef = useRef<HTMLCanvasElement>(null);
  const nearStationRef = useRef<HubHotspot | null>(null);
  const [nearStationId, setNearStationId] = useState<string | null>(null);

  useEffect(() => {
    setDebug(readDebugHub());
  }, []);

  useEffect(() => {
    if (!editMode) setSelectedId(null);
  }, [editMode]);

  const onSelect = useCallback((id: string) => setSelectedId(id), []);
  const onDeselect = useCallback(() => setSelectedId(null), []);
  const onOffsetChange = useCallback((id: string, offset: PlacementOffset) => {
    setOffsets((prev) => ({ ...prev, [id]: offset }));
  }, []);

  /** WASD held-state + the E interact key. Paused while a station's menu is open. */
  useEffect(() => {
    if (!walkable) return;
    const TRACKED = new Set(["w", "a", "s", "d"]);
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (TRACKED.has(key)) heldKeysRef.current.add(key);
      if (key === "e" && !e.repeat) {
        const action = nearStationRef.current?.action;
        if (action) onAction(action);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (TRACKED.has(key)) heldKeysRef.current.delete(key);
    };
    const onBlur = () => heldKeysRef.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      heldKeysRef.current.clear();
    };
  }, [walkable, onAction]);

  /** Movement + station proximity + player sprite redraw. Paused (frozen in place) while !walkable. */
  useEffect(() => {
    if (!walkable) return;
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const keys = heldKeysRef.current;
      const input: CampMoveInput = {
        up: keys.has("w"),
        down: keys.has("s"),
        left: keys.has("a"),
        right: keys.has("d"),
      };
      if (input.up || input.down || input.left || input.right) {
        playerPosRef.current = stepCampMove(playerPosRef.current.x, playerPosRef.current.y, input, dt, PLAYER_SPEED_PX, {
          width: CAMP_IMAGE_W,
          height: CAMP_IMAGE_H,
        });
        const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (dx !== 0 || dy !== 0) facingRef.current = Math.atan2(dy, dx);
      }

      const pos = playerPosRef.current;
      const station = nearestStation(pos.x, pos.y, HUB_HOTSPOTS, CAMP_IMAGE_W, CAMP_IMAGE_H, INTERACT_RADIUS_PX);
      nearStationRef.current = station;
      setNearStationId((prev) => {
        const nextId = station?.id ?? null;
        return prev === nextId ? prev : nextId;
      });

      const canvas = playerCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        canvas.style.left = `${(pos.x / CAMP_IMAGE_W) * 100}%`;
        canvas.style.top = `${(pos.y / CAMP_IMAGE_H) * 100}%`;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const sprite: DrawableOperator = {
          id: 0,
          weapon: player.weapon,
          armor: player.armor,
          attachments: player.attachments,
          hurt: 0,
          angle: facingRef.current,
          pmc: true,
          level: player.level,
          flash: 0,
        };
        drawOperator(ctx, sprite, canvas.width / 2, canvas.height / 2, PLAYER_DRAW_SCALE, now, { pad: false });
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [walkable, player.weapon, player.armor, player.attachments, player.level]);

  const promptSpot = nearStationId ? HUB_HOTSPOTS.find((s) => s.id === nearStationId) : undefined;

  return (
    <div
      ref={frameRef}
      className="relative mx-auto w-full bg-[#12180f]"
      style={{ aspectRatio: `${CAMP_IMAGE_W} / ${CAMP_IMAGE_H}` }}
      onPointerDown={() => {
        if (controlsEnabled) setSelectedId(null);
      }}
    >
      <img
        src={campPlateSrc(reducedMotion)}
        alt="Scav camp"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        style={{ imageRendering: "pixelated", objectFit: "contain" }}
      />

      <CampAtmosphere reducedMotion={reducedMotion} />

      <PlacementLayer
        objects={fireObjects}
        offsets={offsets}
        selectedId={selectedId}
        editMode={editMode}
        controlsEnabled={controlsEnabled}
        imageW={CAMP_IMAGE_W}
        imageH={CAMP_IMAGE_H}
        frameRef={frameRef}
        onSelect={onSelect}
        onOffsetChange={onOffsetChange}
        onDeselect={onDeselect}
      />

      {HUB_HOTSPOTS.map((spot) => (
        <HotspotButton
          key={spot.id}
          spot={spot}
          debug={debug}
          raised={activeId === spot.id}
          inert={controlsEnabled}
          onEnter={() => setActiveId(spot.id)}
          onLeave={() => setActiveId((id) => (id === spot.id ? null : id))}
          onAction={onAction}
        />
      ))}

      {walkable && (
        <canvas
          ref={playerCanvasRef}
          width={PLAYER_CANVAS_PX}
          height={PLAYER_CANVAS_PX}
          className="pointer-events-none absolute z-[5]"
          style={{
            width: `${PLAYER_CANVAS_PX}px`,
            height: `${PLAYER_CANVAS_PX}px`,
            left: `${(playerPosRef.current.x / CAMP_IMAGE_W) * 100}%`,
            top: `${(playerPosRef.current.y / CAMP_IMAGE_H) * 100}%`,
            transform: "translate(-50%, -50%)",
            imageRendering: "pixelated",
          }}
        />
      )}

      {walkable && promptSpot && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-[6] whitespace-nowrap rounded border border-primary/60 bg-black/70 px-2 py-1 font-display text-[8px] tracking-wide text-primary sm:text-[9px]"
          style={{
            left: `${promptSpot.xPercent + promptSpot.widthPercent / 2}%`,
            top: `${promptSpot.yPercent}%`,
            transform: "translate(-50%, calc(-100% - 6px))",
          }}
        >
          E · {promptSpot.label}
        </div>
      )}
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
  inert,
  onEnter,
  onLeave,
  onAction,
}: {
  spot: HubHotspot;
  debug: boolean;
  raised: boolean;
  inert: boolean;
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
      tabIndex={inert ? -1 : 0}
      onClick={() => {
        if (inert) return;
        if (spot.action) onAction(spot.action);
      }}
      onMouseEnter={() => {
        if (inert) return;
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
        if (inert) return;
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
        pointerEvents: inert ? "none" : "auto",
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
