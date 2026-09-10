import { useEffect, useRef, useState } from "react";
import { TILE } from "../data";
import { drawOperator, type DrawableOperator } from "../draw";
import type { CosmeticLoadout } from "../cosmetics";
import type { HubAction } from "../campActions";
import { getShotDispersion, type Projectile } from "../shooting";
import {
  canShoot,
  consumeRound,
  forceStartReload,
  initAmmo,
  maybeStartReload,
  reloadProgress,
  tickReload,
} from "../weapons";
import { buildCampMap, campZoneCellSet, type CampGameMap, type CampStationProp } from "./campMap";
import { CAMP_MAP_DEF } from "./campMaps/campMain";
import { drawCampScene } from "./drawCampScene";
import { nearestStation, stepCampMove, type CampMoveInput } from "./campMovement";
import { usePrefersReducedMotion } from "./useReducedMotion";
import {
  applyDummyDamage,
  DUMMY_MAX_HP,
  fireHubShot,
  hubWeaponStats,
  nextDummyHp,
  tickHubProjectile,
} from "./rangeTest";

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

/** Both are optional-by-authoring: a camp map built without a range just disables it.
 * A layout can carry any number of range-dummy props — each tracks its own HP. */
const RANGE_DUMMY_PROPS = CAMP_MAP.props.filter((p) => p.type === "range-dummy");
const RANGE_ZONE_CELLS = campZoneCellSet(CAMP_MAP, "SHOOTING_RANGE");

interface DummyState {
  hp: number;
  zeroAt: number | null;
}

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

function inRangeZone(x: number, y: number): boolean {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  return RANGE_ZONE_CELLS.has(`${tx},${ty}`);
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
  /** Never called with "range" — the shooting-range table is toggled locally instead. */
  onAction: (action: Exclude<HubAction, "range">) => void;
  /** False while a station's menu is open on top of the scene — movement/interact pause. */
  walkable?: boolean;
  player: CampPlayerGear;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerCanvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const playerPosRef = useRef(findSpawnPoint());
  const facingRef = useRef(-Math.PI / 2);
  const heldKeysRef = useRef<Set<string>>(new Set());
  const nearStationRef = useRef<CampStationProp | null>(null);
  const [nearStationId, setNearStationId] = useState<string | null>(null);

  /** Shooting-range "weapon test mode" — toggled at the range table, auto-off on zone exit. */
  const [weaponTestActive, setWeaponTestActive] = useState(false);
  const dummyStatesRef = useRef<Map<string, DummyState>>(
    new Map(RANGE_DUMMY_PROPS.map((p) => [p.id, { hp: DUMMY_MAX_HP, zeroAt: null }])),
  );
  const cooldownRef = useRef(0);
  const flashRef = useRef(0);
  const aimAngleRef = useRef(0);
  const triggerHeldRef = useRef(false);
  const projectilesRef = useRef<Projectile[]>([]);
  const nextProjIdRef = useRef(1);
  const ammoRef = useRef(initAmmo(player.weapon));
  const reloadLeftRef = useRef(0);
  const manualReloadRef = useRef(false);

  /** Reset the loaded mag whenever the equipped weapon changes, so switching guns in
   * the gear screen doesn't carry over a stale ammo count next time the range opens. */
  useEffect(() => {
    ammoRef.current = initAmmo(player.weapon);
    reloadLeftRef.current = 0;
  }, [player.weapon]);

  /** WASD held-state + the E interact key. Paused while a station's menu is open. */
  useEffect(() => {
    if (!walkable) return;
    const TRACKED = new Set(["w", "a", "s", "d"]);
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (TRACKED.has(key)) heldKeysRef.current.add(key);
      if (key === "e" && !e.repeat) {
        const action = nearStationRef.current?.hubAction;
        if (action === "range") {
          setWeaponTestActive((prev) => {
            if (prev) triggerHeldRef.current = false;
            return !prev;
          });
        } else if (action) {
          onAction(action);
        }
      }
      if (key === "r" && !e.repeat) manualReloadRef.current = true;
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

  /** Mouse aim + fire while weapon test mode is available. Always listening (cheap) —
   * the fire loop below is what actually gates shooting on weaponTestActive. */
  useEffect(() => {
    if (!walkable) return;
    const el = wrapperRef.current;
    if (!el) return;
    const updateAim = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const worldX = ((clientX - rect.left) / rect.width) * CAMP_WIDTH_PX;
      const worldY = ((clientY - rect.top) / rect.height) * CAMP_HEIGHT_PX;
      const pos = playerPosRef.current;
      aimAngleRef.current = Math.atan2(worldY - pos.y, worldX - pos.x);
    };
    const onMouseMove = (e: MouseEvent) => updateAim(e.clientX, e.clientY);
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      updateAim(e.clientX, e.clientY);
      triggerHeldRef.current = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      triggerHeldRef.current = false;
    };
    const onBlur = () => {
      triggerHeldRef.current = false;
    };
    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      triggerHeldRef.current = false;
    };
  }, [walkable]);

  /** Scene redraw + movement + station proximity + player sprite redraw. Movement pauses while !walkable. */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const stats = weaponTestActive
        ? hubWeaponStats(player.weapon, player.attachments, player.level)
        : null;

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
        if (weaponTestActive) facingRef.current = aimAngleRef.current;

        const pos = playerPosRef.current;
        const station = nearestStation(pos.x, pos.y, CAMP_MAP.props, TILE, INTERACT_RADIUS_PX);
        nearStationRef.current = station;
        setNearStationId((prev) => {
          const nextId = station?.id ?? null;
          return prev === nextId ? prev : nextId;
        });

        if (weaponTestActive && !inRangeZone(pos.x, pos.y)) {
          setWeaponTestActive(false);
          triggerHeldRef.current = false;
        }
      }

      // Weapon-test fire trigger — cooldown always ticks so it's ready to go the
      // instant test mode (re)activates; only firing itself is gated on it.
      cooldownRef.current = Math.max(0, cooldownRef.current - dt * 1000);
      flashRef.current = Math.max(0, flashRef.current - dt);
      if (stats) {
        // Same order raid uses (TarkovTD.tsx): advance any in-progress reload first,
        // then gate firing on canShoot, then maybeStartReload after the fire attempt.
        const reloaded = tickReload(
          ammoRef.current,
          reloadLeftRef.current,
          dt * 1000,
          stats.magSize,
          stats.reloadMs,
          stats.reloadType,
          triggerHeldRef.current,
        );
        ammoRef.current = reloaded.ammo;
        reloadLeftRef.current = reloaded.reloadLeft;

        if (manualReloadRef.current) {
          manualReloadRef.current = false;
          reloadLeftRef.current = forceStartReload(
            ammoRef.current,
            reloadLeftRef.current,
            stats.magSize,
            stats.reloadMs,
          );
        }

        if (
          weaponTestActive &&
          triggerHeldRef.current &&
          cooldownRef.current <= 0 &&
          canShoot(ammoRef.current, reloadLeftRef.current)
        ) {
          const pos = playerPosRef.current;
          const angle = aimAngleRef.current;
          const origin = { x: pos.x + Math.cos(angle) * 12, y: pos.y - 4 + Math.sin(angle) * 12 };
          const shots = fireHubShot(origin, angle, stats, () => nextProjIdRef.current++);
          projectilesRef.current.push(...shots);
          cooldownRef.current = stats.cooldown;
          flashRef.current = 0.06;
          ammoRef.current = consumeRound(ammoRef.current);
        }

        reloadLeftRef.current = maybeStartReload(
          ammoRef.current,
          reloadLeftRef.current,
          stats.magSize,
          stats.reloadMs,
          stats.reloadType,
          triggerHeldRef.current,
        );
      } else {
        // Not in test mode — drop any manual-reload press so it doesn't fire late
        // once test mode is reactivated later.
        manualReloadRef.current = false;
      }

      // Advance live bullets + resolve dummy hits/regen — keeps running even after the
      // player leaves test mode, so a damaged dummy keeps healing on its own schedule.
      // A map authored without any dummies still expires bullets normally against an
      // empty target list; they just never hit anything.
      if (projectilesRef.current.length > 0) {
        const targets = RANGE_DUMMY_PROPS.map((p) => ({ id: p.id, pos: tileCenterPx(p.tx, p.ty) }));
        const alive: Projectile[] = [];
        for (const proj of projectilesRef.current) {
          const hit = tickHubProjectile(proj, dt, targets);
          if (hit) {
            const state = dummyStatesRef.current.get(hit.targetId);
            if (state) {
              const newHp = applyDummyDamage(state.hp, hit.damage, hit.pen);
              state.hp = newHp;
              // A hit that lands while zero is already in progress restarts the pause;
              // a hit that leaves it alive cancels any pending heal (acts like a raid enemy).
              state.zeroAt = newHp <= 0 ? now : null;
            }
          }
          if (!proj.dead) alive.push(proj);
        }
        projectilesRef.current = alive;
      }
      // Recompute from elapsed time every frame (not just once) so each dummy actually
      // steps all the way through 25/50/75/100% when left alone, instead of freezing
      // at the first step once hp is no longer exactly 0.
      for (const state of dummyStatesRef.current.values()) {
        if (state.zeroAt == null) continue;
        const healed = nextDummyHp(DUMMY_MAX_HP, now - state.zeroAt);
        state.hp = healed;
        if (healed >= DUMMY_MAX_HP) state.zeroAt = null;
      }

      const scene = sceneCanvasRef.current;
      const sceneCtx = scene?.getContext("2d");
      if (scene && sceneCtx) {
        sceneCtx.imageSmoothingEnabled = false;
        drawCampScene(sceneCtx, CAMP_MAP, reducedMotion ? 0 : now);
        // Each dummy itself is drawn by drawCampScene's generic prop pass (type
        // "range-dummy", see drawProp) — only its raid-style HP bar is drawn here,
        // hidden at full health.
        for (const dummyProp of RANGE_DUMMY_PROPS) {
          const state = dummyStatesRef.current.get(dummyProp.id);
          if (!state || state.hp >= DUMMY_MAX_HP) continue;
          const dummyPos = tileCenterPx(dummyProp.tx, dummyProp.ty);
          const dummySize = TILE * 0.7;
          const w = Math.max(16, dummySize + 6);
          sceneCtx.fillStyle = "#140f0d";
          sceneCtx.fillRect(Math.round(dummyPos.x - w / 2), Math.round(dummyPos.y - dummySize / 2 - 10), w, 4);
          sceneCtx.fillStyle = "#7ddc5a";
          sceneCtx.fillRect(
            Math.round(dummyPos.x - w / 2 + 1),
            Math.round(dummyPos.y - dummySize / 2 - 9),
            Math.max(0, (w - 2) * (state.hp / DUMMY_MAX_HP)),
            2,
          );
        }

        if (weaponTestActive && stats) {
          const pos = playerPosRef.current;
          const aimAngle = aimAngleRef.current;
          const coneHalf = getShotDispersion(stats.accuracy);

          sceneCtx.beginPath();
          sceneCtx.arc(pos.x, pos.y, stats.range, 0, Math.PI * 2);
          sceneCtx.strokeStyle = "rgba(110,220,255,0.7)";
          sceneCtx.setLineDash([4, 4]);
          sceneCtx.lineWidth = 1;
          sceneCtx.stroke();
          sceneCtx.setLineDash([]);

          sceneCtx.beginPath();
          sceneCtx.moveTo(pos.x, pos.y);
          sceneCtx.arc(pos.x, pos.y, stats.range, aimAngle - coneHalf, aimAngle + coneHalf);
          sceneCtx.closePath();
          sceneCtx.fillStyle = "rgba(110,220,255,0.08)";
          sceneCtx.fill();
          sceneCtx.strokeStyle = "rgba(110,220,255,0.35)";
          sceneCtx.lineWidth = 1;
          sceneCtx.stroke();

          sceneCtx.beginPath();
          sceneCtx.moveTo(pos.x, pos.y);
          sceneCtx.lineTo(pos.x + Math.cos(aimAngle) * stats.range, pos.y + Math.sin(aimAngle) * stats.range);
          sceneCtx.strokeStyle = "rgba(110,220,255,0.5)";
          sceneCtx.stroke();

          for (const proj of projectilesRef.current) {
            sceneCtx.fillStyle = proj.color;
            const sz = proj.splash > 0 ? 5 : proj.pellet ? 2 : 3;
            sceneCtx.fillRect(Math.round(proj.x) - 1, Math.round(proj.y) - 1, sz, sz);
          }

          // Ammo / reload readout — same visual convention as raid's operator "RLD"
          // indicator (draw.ts's drawTower): text + a fill-progress bar while reloading.
          const barW = 22;
          const bx = pos.x - barW / 2;
          const by = pos.y - 40;
          sceneCtx.save();
          sceneCtx.font = "7px monospace";
          sceneCtx.textAlign = "center";
          if (reloadLeftRef.current > 0) {
            sceneCtx.fillStyle = "#000";
            sceneCtx.fillText("RLD", pos.x + 1, by - 1);
            sceneCtx.fillStyle = "#f0b400";
            sceneCtx.fillText("RLD", pos.x, by - 2);
            sceneCtx.fillStyle = "#140f0d";
            sceneCtx.fillRect(bx, by, barW, 4);
            sceneCtx.fillStyle = "#f0b400";
            sceneCtx.fillRect(
              bx + 1,
              by + 1,
              (barW - 2) * reloadProgress(reloadLeftRef.current, stats.reloadMs),
              2,
            );
          } else {
            const ammoText = `${ammoRef.current}/${stats.magSize}`;
            sceneCtx.fillStyle = "#000";
            sceneCtx.fillText(ammoText, pos.x + 1, by + 1);
            sceneCtx.fillStyle = "#d8c98a";
            sceneCtx.fillText(ammoText, pos.x, by);
          }
          sceneCtx.restore();
        }
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
          flash: flashRef.current,
          cosmetics: player.cosmetics,
        };
        drawOperator(ctx, sprite, canvas.width / 2, canvas.height / 2, PLAYER_DRAW_SCALE, now, { pad: false });
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [walkable, weaponTestActive, player.weapon, player.armor, player.attachments, player.level, reducedMotion]);

  const promptStation = nearStationId
    ? CAMP_MAP.props.find((p) => p.id === nearStationId)
    : undefined;

  return (
    <div
      ref={wrapperRef}
      className="relative mx-auto w-full bg-[#0a0c08]"
      style={{
        aspectRatio: `${CAMP_WIDTH_PX} / ${CAMP_HEIGHT_PX}`,
        cursor: weaponTestActive ? "crosshair" : undefined,
      }}
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

      {walkable && promptStation && !weaponTestActive && (
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
