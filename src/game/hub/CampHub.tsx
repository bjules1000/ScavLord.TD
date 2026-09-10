import { useEffect, useRef, useState } from "react";
import { TILE } from "../data";
import { drawOperator, type DrawableOperator } from "../draw";
import type { CosmeticLoadout } from "../cosmetics";
import type { HubAction } from "../campActions";
import { buildCampMap, type CampGameMap, type CampStationProp } from "./campMap";
import { CAMP_MAP_DEF } from "./campMaps/campMain";
import { drawCampScene } from "./drawCampScene";
import { nearestStation, stepCampMove, type CampMoveInput } from "./campMovement";
import { usePrefersReducedMotion } from "./useReducedMotion";

/** Tuned against a TILE=32 scene at the default camp size — needs a real playtest. */
const PLAYER_SPEED_PX = TILE * 6.9;
const INTERACT_RADIUS_PX = TILE * 2.8;
const PLAYER_CANVAS_PX = 80;
const PLAYER_DRAW_SCALE = 2;

export interface CampPlayerGear {
  weapon: string;
  armor: string | null;
  attachments: string[];
  level: number;
  cosmetics: CosmeticLoadout;
}

const CAMP_MAP: CampGameMap = buildCampMap(CAMP_MAP_DEF);
const CAMP_WIDTH_PX = CAMP_MAP.width * TILE;
const CAMP_HEIGHT_PX = CAMP_MAP.height * TILE;

function campBlocked(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= CAMP_MAP.width || ty >= CAMP_MAP.height) return true;
  const kind = CAMP_MAP.terrain[ty]?.[tx];
  const walkableTerrain = kind === "GROUND" || kind === "ROAD" || kind === "HIGH_GROUND";
  if (!walkableTerrain) return true;
  return CAMP_MAP.props.some((p) => p.tx === tx && p.ty === ty);
}

function tileCenterPx(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

/** Bottom-center tile if it's open, else the first open tile scanning from the bottom up. */
function findSpawnPoint(): { x: number; y: number } {
  const preferredTx = Math.floor(CAMP_MAP.width / 2);
  const preferredTy = CAMP_MAP.height - 2;
  if (!campBlocked(preferredTx, preferredTy)) return tileCenterPx(preferredTx, preferredTy);
  for (let ty = CAMP_MAP.height - 1; ty >= 0; ty--) {
    for (let tx = 0; tx < CAMP_MAP.width; tx++) {
      if (!campBlocked(tx, ty)) return tileCenterPx(tx, ty);
    }
  }
  return { x: CAMP_WIDTH_PX / 2, y: CAMP_HEIGHT_PX / 2 };
}

export default function CampHub({
  onAction,
  walkable = true,
  player,
}: {
  onAction: (action: HubAction) => void;
  /** False while a station's menu is open on top of the scene — movement/interact pause. */
  walkable?: boolean;
  player: CampPlayerGear;
}) {
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerCanvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const playerPosRef = useRef(findSpawnPoint());
  const facingRef = useRef(-Math.PI / 2);
  const heldKeysRef = useRef<Set<string>>(new Set());
  const nearStationRef = useRef<CampStationProp | null>(null);
  const [nearStationId, setNearStationId] = useState<string | null>(null);

  /** WASD held-state + the E interact key. Paused while a station's menu is open. */
  useEffect(() => {
    if (!walkable) return;
    const TRACKED = new Set(["w", "a", "s", "d"]);
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (TRACKED.has(key)) heldKeysRef.current.add(key);
      if (key === "e" && !e.repeat) {
        const action = nearStationRef.current?.hubAction;
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

  /** Scene redraw + movement + station proximity + player sprite redraw. Movement pauses while !walkable. */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (walkable) {
        const keys = heldKeysRef.current;
        const input: CampMoveInput = {
          up: keys.has("w"),
          down: keys.has("s"),
          left: keys.has("a"),
          right: keys.has("d"),
        };
        if (input.up || input.down || input.left || input.right) {
          playerPosRef.current = stepCampMove(
            playerPosRef.current.x,
            playerPosRef.current.y,
            input,
            dt,
            PLAYER_SPEED_PX,
            { width: CAMP_WIDTH_PX, height: CAMP_HEIGHT_PX },
            { tileSize: TILE, blocked: campBlocked },
          );
          const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
          if (dx !== 0 || dy !== 0) facingRef.current = Math.atan2(dy, dx);
        }

        const pos = playerPosRef.current;
        const station = nearestStation(pos.x, pos.y, CAMP_MAP.props, TILE, INTERACT_RADIUS_PX);
        nearStationRef.current = station;
        setNearStationId((prev) => {
          const nextId = station?.id ?? null;
          return prev === nextId ? prev : nextId;
        });
      }

      const scene = sceneCanvasRef.current;
      const sceneCtx = scene?.getContext("2d");
      if (scene && sceneCtx) {
        sceneCtx.imageSmoothingEnabled = false;
        drawCampScene(sceneCtx, CAMP_MAP, reducedMotion ? 0 : now);
      }

      const canvas = playerCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const pos = playerPosRef.current;
        canvas.style.left = `${(pos.x / CAMP_WIDTH_PX) * 100}%`;
        canvas.style.top = `${(pos.y / CAMP_HEIGHT_PX) * 100}%`;
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
          cosmetics: player.cosmetics,
        };
        drawOperator(ctx, sprite, canvas.width / 2, canvas.height / 2, PLAYER_DRAW_SCALE, now, { pad: false });
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [walkable, player.weapon, player.armor, player.attachments, player.level, reducedMotion]);

  const promptStation = nearStationId
    ? CAMP_MAP.props.find((p) => p.id === nearStationId)
    : undefined;

  return (
    <div
      className="relative mx-auto w-full bg-[#0a0c08]"
      style={{ aspectRatio: `${CAMP_WIDTH_PX} / ${CAMP_HEIGHT_PX}` }}
    >
      <canvas
        ref={sceneCanvasRef}
        width={CAMP_WIDTH_PX}
        height={CAMP_HEIGHT_PX}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />

      {walkable && (
        <canvas
          ref={playerCanvasRef}
          width={PLAYER_CANVAS_PX}
          height={PLAYER_CANVAS_PX}
          className="pointer-events-none absolute z-[5]"
          style={{
            width: `${PLAYER_CANVAS_PX}px`,
            height: `${PLAYER_CANVAS_PX}px`,
            left: `${(playerPosRef.current.x / CAMP_WIDTH_PX) * 100}%`,
            top: `${(playerPosRef.current.y / CAMP_HEIGHT_PX) * 100}%`,
            transform: "translate(-50%, -50%)",
            imageRendering: "pixelated",
          }}
        />
      )}

      {walkable && promptStation && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-[6] whitespace-nowrap rounded border border-primary/60 bg-black/70 px-2 py-1 font-display text-[8px] tracking-wide text-primary sm:text-[9px]"
          style={{
            left: `${((promptStation.tx + 0.5) / CAMP_MAP.width) * 100}%`,
            top: `${(promptStation.ty / CAMP_MAP.height) * 100}%`,
            transform: "translate(-50%, calc(-100% - 6px))",
          }}
        >
          E · {promptStation.hubAction?.toUpperCase()}
        </div>
      )}
    </div>
  );
}
