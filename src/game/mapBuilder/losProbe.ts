/**
 * Map Builder LOS Probe — diagnostic overlays only.
 *
 * Visibility uses the canonical raid helpers (`traceLineOfSight` /
 * `hasLineOfSight`). Range is ignored. Nothing here is persisted into
 * map JSON or EditorMapDoc.
 */
import { TILE } from "../data";
import {
  hasLineOfSight,
  tileCenterWorld,
  traceLineOfSight,
  worldToTile,
  type LosHit,
  type SightPos,
} from "../los";
import { buildMap, isRoad, type GameMap } from "../map";
import {
  canOccupyHighSurface,
  canOccupyLowSurface,
  elevatedSurfaceAt,
  enemyLaneSurface,
  type ElevatedSurfaceKind,
} from "../surfaces";
import type { SurfaceLevel } from "../types";
import { toProductionMapDef } from "./adapters";
import { productionPathFromLane } from "./ports";
import type { EditorMapDoc } from "./schema";

export const LOS_PROBE_SAMPLE_TILES = 0.25;
export const LOS_PROBE_JOIN_EPS = 1e-6;
/** World-pixel radius for hovering / selecting a path sample. */
export const LOS_PROBE_HIT_RADIUS = 10;

export type LosProbeTargetMode = "PATH" | "CUSTOM";

export interface LosProbePoint {
  tx: number;
  ty: number;
  surface: SurfaceLevel;
  x: number;
  y: number;
}

export interface LosProbeState {
  origin: LosProbePoint | null;
  mode: LosProbeTargetMode;
  customTarget: LosProbePoint | null;
  hoverSampleIndex: number | null;
  selectedSampleIndex: number | null;
}

export interface PathSample {
  x: number;
  y: number;
  along: number;
}

export interface ProbeSampleResult extends PathSample {
  index: number;
  surface: SurfaceLevel;
  hit: LosHit;
}

export interface PathSweepResult {
  results: ProbeSampleResult[];
  visible: number;
  blocked: number;
}

export function emptyLosProbeState(): LosProbeState {
  return {
    origin: null,
    mode: "PATH",
    customTarget: null,
    hoverSampleIndex: null,
    selectedSampleIndex: null,
  };
}

export function gameMapFromEditorDoc(doc: EditorMapDoc): GameMap {
  return buildMap(toProductionMapDef(doc));
}

export function waypointsToPix(waypoints: Array<[number, number]>, tile = TILE): Array<[number, number]> {
  return waypoints.map(([x, y]) => [(x + 0.5) * tile, (y + 0.5) * tile]);
}

export function editorLanePix(doc: EditorMapDoc, laneId: string, tile = TILE): Array<[number, number]> {
  const lane = doc.lanes.find((l) => l.id === laneId);
  if (!lane) return [];
  return waypointsToPix(productionPathFromLane(lane), tile);
}

export function lanePixForId(map: GameMap, laneId: string): Array<[number, number]> {
  const lane = map.lanes.find((l) => l.id === laneId);
  return lane?.PIX ?? [];
}

/**
 * Deterministic samples along a polyline. Includes endpoints and authored
 * joins once. Spacing is in world pixels. Duplicate join points are skipped.
 */
export function sampleWorldPolyline(
  pix: Array<[number, number]>,
  spacing = LOS_PROBE_SAMPLE_TILES * TILE,
  eps = LOS_PROBE_JOIN_EPS,
): PathSample[] {
  if (!pix.length) return [];
  const first = pix[0]!;
  if (pix.length === 1 || !(spacing > 0)) {
    return [{ x: first[0], y: first[1], along: 0 }];
  }

  const out: PathSample[] = [];
  const push = (x: number, y: number, along: number) => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) <= eps) return;
    out.push({ x, y, along });
  };

  push(first[0], first[1], 0);
  let along = 0;
  for (let i = 0; i < pix.length - 1; i++) {
    const a = pix[i]!;
    const b = pix[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len <= eps) continue;
    const startAlong = along;
    const endAlong = along + len;
    for (let d = startAlong + spacing; d < endAlong - eps; d += spacing) {
      const u = (d - startAlong) / len;
      push(a[0] + dx * u, a[1] + dy * u, d);
    }
    along = endAlong;
    push(b[0], b[1], along);
  }
  return out;
}

export function sampleLanePath(
  waypoints: Array<[number, number]>,
  tile = TILE,
  stepTiles = LOS_PROBE_SAMPLE_TILES,
): PathSample[] {
  return sampleWorldPolyline(waypointsToPix(waypoints, tile), stepTiles * tile);
}

export function sampleActiveLane(
  map: GameMap,
  laneId: string,
  tile = TILE,
  stepTiles = LOS_PROBE_SAMPLE_TILES,
): PathSample[] {
  return sampleWorldPolyline(lanePixForId(map, laneId), stepTiles * tile);
}

export function probeSurfacesAt(map: GameMap, tx: number, ty: number): SurfaceLevel[] {
  const high = canOccupyHighSurface(map, tx, ty);
  const low = canOccupyLowSurface(map, tx, ty) || isRoad(map, tx, ty);
  const out: SurfaceLevel[] = [];
  if (high) out.push("HIGH");
  if (low) out.push("GROUND");
  if (!out.length) out.push("GROUND");
  return out;
}

export function resolveProbePoint(map: GameMap, tx: number, ty: number, preferred?: SurfaceLevel): LosProbePoint {
  const surfaces = probeSurfacesAt(map, tx, ty);
  const surface = preferred && surfaces.includes(preferred) ? preferred : surfaces[0]!;
  const c = tileCenterWorld(tx, ty);
  return { tx, ty, surface, x: c.x, y: c.y };
}

export function cycleProbeSurface(map: GameMap, point: LosProbePoint): LosProbePoint {
  const surfaces = probeSurfacesAt(map, point.tx, point.ty);
  const i = surfaces.indexOf(point.surface);
  const next = surfaces[(i + 1) % surfaces.length]!;
  return resolveProbePoint(map, point.tx, point.ty, next);
}

export function probePointAsSight(point: LosProbePoint): SightPos {
  return { x: point.x, y: point.y, surface: point.surface };
}

export function evaluatePathSweep(map: GameMap, origin: SightPos, samples: PathSample[]): PathSweepResult {
  const results: ProbeSampleResult[] = samples.map((s, index) => {
    const surface = enemyLaneSurface(map, Math.floor(s.x / TILE), Math.floor(s.y / TILE));
    const hit = traceLineOfSight(map, origin, { x: s.x, y: s.y, surface });
    return { ...s, index, surface, hit };
  });
  let visible = 0;
  for (const r of results) if (r.hit.clear) visible += 1;
  return { results, visible, blocked: results.length - visible };
}

export function evaluateCustomProbe(map: GameMap, origin: SightPos, target: SightPos): LosHit {
  return traceLineOfSight(map, origin, target);
}

export function nearestSampleIndex(
  samples: Array<{ x: number; y: number }>,
  x: number,
  y: number,
  radius = LOS_PROBE_HIT_RADIUS,
): number | null {
  let best = -1;
  let bestD = radius;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}

export function applyLosProbeClick(
  state: LosProbeState,
  map: GameMap,
  click: { tx: number; ty: number; x: number; y: number },
  samples: Array<{ x: number; y: number }>,
): LosProbeState {
  if (state.mode === "PATH") {
    if (state.origin) {
      const hitIdx = nearestSampleIndex(samples, click.x, click.y);
      if (hitIdx != null) {
        return { ...state, selectedSampleIndex: hitIdx, hoverSampleIndex: hitIdx };
      }
    }
    const origin =
      state.origin && state.origin.tx === click.tx && state.origin.ty === click.ty
        ? cycleProbeSurface(map, state.origin)
        : resolveProbePoint(map, click.tx, click.ty);
    return { ...state, origin, selectedSampleIndex: null };
  }

  if (!state.origin || (state.origin.tx === click.tx && state.origin.ty === click.ty)) {
    const origin =
      state.origin && state.origin.tx === click.tx && state.origin.ty === click.ty
        ? cycleProbeSurface(map, state.origin)
        : resolveProbePoint(map, click.tx, click.ty);
    return { ...state, origin };
  }

  const existing = state.customTarget;
  const customTarget =
    existing && existing.tx === click.tx && existing.ty === click.ty
      ? cycleProbeSurface(map, existing)
      : resolveProbePoint(map, click.tx, click.ty);
  return { ...state, customTarget };
}

export function applyLosProbeHover(
  state: LosProbeState,
  samples: Array<{ x: number; y: number }>,
  world: { x: number; y: number } | null,
): LosProbeState {
  if (state.mode !== "PATH" || !world) {
    return state.hoverSampleIndex == null ? state : { ...state, hoverSampleIndex: null };
  }
  const hoverSampleIndex = nearestSampleIndex(samples, world.x, world.y);
  if (hoverSampleIndex === state.hoverSampleIndex) return state;
  return { ...state, hoverSampleIndex };
}

export function clampProbeSelection(state: LosProbeState, sampleCount: number): LosProbeState {
  const clamp = (idx: number | null) =>
    idx == null || idx < 0 || idx >= sampleCount ? null : idx;
  const hoverSampleIndex = clamp(state.hoverSampleIndex);
  const selectedSampleIndex = clamp(state.selectedSampleIndex);
  if (hoverSampleIndex === state.hoverSampleIndex && selectedSampleIndex === state.selectedSampleIndex) {
    return state;
  }
  return { ...state, hoverSampleIndex, selectedSampleIndex };
}

export function activeProbeSampleIndex(state: LosProbeState): number | null {
  return state.selectedSampleIndex ?? state.hoverSampleIndex;
}

export function displaySurface(surface: SurfaceLevel): "LOW" | "HIGH" {
  return surface === "HIGH" ? "HIGH" : "LOW";
}

export function probeKindLabel(map: GameMap, tx: number, ty: number, surface: SurfaceLevel): string {
  if (surface === "HIGH") {
    const elev: ElevatedSurfaceKind | null = elevatedSurfaceAt(map, tx, ty);
    if (elev === "SUSPENDED_BRIDGE") return "SUSPENDED_BRIDGE";
    if (elev === "HIGH_GROUND") return "HIGH_GROUND";
    return "HIGH";
  }
  if (isRoad(map, tx, ty)) return "ROAD";
  return "GROUND";
}

export function formatOriginLine(map: GameMap, origin: LosProbePoint): string {
  return `ORIGIN: (${origin.tx},${origin.ty}) · ${displaySurface(origin.surface)} · ${probeKindLabel(map, origin.tx, origin.ty, origin.surface)}`;
}

export function formatPathLosSummary(visible: number, total: number): string {
  return `PATH LOS: ${visible} / ${total} VISIBLE`;
}

export function formatProbeBlocker(hit: LosHit): string {
  if (hit.clear) return "CLEAR LOS";
  const tile = hit.edge ?? (hit.point ? worldToTile(hit.point.x, hit.point.y) : null);
  const coord = tile && Number.isFinite(tile.tx) && Number.isFinite(tile.ty) ? ` · (${tile.tx},${tile.ty})` : "";
  if (hit.blocker === "MOUNTAIN") return `BLOCKED · MOUNTAIN${coord}`;
  if (hit.blocker === "RIDGE") return `BLOCKED · HIGH_GROUND MASS${coord}`;
  if (hit.blocker === "BRIDGE_DECK") return "BLOCKED · BRIDGE DECK";
  if (hit.blocker === "SOLID_WALL") {
    const e = hit.edge;
    if (e?.edge) return `BLOCKED · SOLID WALL · EDGE (${e.tx},${e.ty},${e.edge})`;
    return `BLOCKED · SOLID WALL${coord}`;
  }
  return "BLOCKED";
}

export function probeHitMatchesGameplay(map: GameMap, from: SightPos, to: SightPos, hit: LosHit): boolean {
  return hit.clear === hasLineOfSight(map, from, to);
}

const SAMPLE_CLEAR = "#46d46a";
const SAMPLE_BLOCKED = "#d4453c";
const ORIGIN_FILL = "#f4f0dc";
const ORIGIN_STROKE = "#c43ec8";
const CUSTOM_FILL = "#f0a020";
const RAY_CLEAR = "rgba(70, 212, 106, 0.9)";
const RAY_BLOCKED = "rgba(212, 69, 60, 0.95)";
const HIT_MARK = "#fff4c8";

export interface LosProbeOverlay {
  origin: LosProbePoint | null;
  mode: LosProbeTargetMode;
  customTarget: LosProbePoint | null;
  customHit: LosHit | null;
  samples: ProbeSampleResult[];
  activeSampleIndex: number | null;
}

export function drawLosProbeOverlay(ctx: CanvasRenderingContext2D, overlay: LosProbeOverlay): void {
  const { origin, samples, activeSampleIndex, customTarget, customHit, mode } = overlay;

  if (mode === "PATH") {
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      const active = i === activeSampleIndex;
      drawSampleMark(ctx, s.x, s.y, s.hit.clear ? SAMPLE_CLEAR : SAMPLE_BLOCKED, active);
    }
  }

  if (origin && mode === "PATH" && activeSampleIndex != null) {
    const s = samples[activeSampleIndex];
    if (s) drawProbeRay(ctx, origin, s.x, s.y, s.hit);
  }

  if (origin && mode === "CUSTOM" && customTarget && customHit) {
    drawProbeRay(ctx, origin, customTarget.x, customTarget.y, customHit);
    drawDiamond(ctx, customTarget.x, customTarget.y, 6, CUSTOM_FILL, "#111");
  }

  if (origin) drawOriginMark(ctx, origin.x, origin.y);
}

function drawSampleMark(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string, active: boolean): void {
  const size = active ? 5 : 3;
  ctx.save();
  ctx.fillStyle = "#111";
  ctx.fillRect(x - size - 1, y - size - 1, size * 2 + 2, size * 2 + 2);
  ctx.fillStyle = fill;
  ctx.fillRect(x - size, y - size, size * 2, size * 2);
  if (active) {
    ctx.strokeStyle = "#f4f0dc";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - size - 2, y - size - 2, size * 2 + 4, size * 2 + 4);
  }
  ctx.restore();
}

function drawOriginMark(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = ORIGIN_STROKE;
  ctx.fillStyle = ORIGIN_FILL;
  ctx.lineWidth = 2;
  ctx.fillRect(x - 6, y - 6, 12, 12);
  ctx.strokeRect(x - 6.5, y - 6.5, 13, 13);
  ctx.beginPath();
  ctx.moveTo(x - 10, y);
  ctx.lineTo(x + 10, y);
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x, y + 10);
  ctx.stroke();
  ctx.restore();
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawProbeRay(ctx: CanvasRenderingContext2D, origin: LosProbePoint, tx: number, ty: number, hit: LosHit): void {
  const end = hit.clear || !hit.point ? { x: tx, y: ty } : hit.point;
  ctx.save();
  ctx.strokeStyle = hit.clear ? RAY_CLEAR : RAY_BLOCKED;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  if (!hit.clear && hit.point) {
    ctx.fillStyle = HIT_MARK;
    ctx.strokeStyle = RAY_BLOCKED;
    ctx.lineWidth = 1;
    ctx.fillRect(hit.point.x - 3, hit.point.y - 3, 6, 6);
    ctx.strokeRect(hit.point.x - 3.5, hit.point.y - 3.5, 7, 7);
  }
  ctx.restore();
}
