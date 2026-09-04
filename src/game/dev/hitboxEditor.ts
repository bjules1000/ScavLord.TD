/**
 * Wave Lab hitbox authoring helpers.
 *
 * Transform (canonical):
 * - Storage: normalized EnemyHitZone {x,y,width,height} in [0,1] over enemy collision AABB.
 * - Runtime collision: enemyWorldBounds(cx, cy, size) → zoneWorldRect → shape test.
 * - Wave Lab canvas: same AABB mapped into a padded content rect; sprite drawn at AABB center
 *   with the same bodyW / (cx, cy-1) convention as drawEnemy, so authored zones align with raid hits.
 */

import type { EnemyHitZone, HitZoneShape } from "../enemyHitZones";
import { enemyWorldBounds, resolveHitZoneAtPoint } from "../enemyHitZones";

export const HITBOX_CANVAS_W = 320;
export const HITBOX_CANVAS_H = 420;
export const HITBOX_PAD = 28;
export const HITBOX_HANDLE_PX = 8;
export const HITBOX_MIN_SIZE = 0.04;

export type HitboxCanvasLayout = {
  canvasW: number;
  canvasH: number;
  pad: number;
  contentLeft: number;
  contentTop: number;
  contentW: number;
  contentH: number;
};

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

export function layoutHitboxCanvas(
  canvasW = HITBOX_CANVAS_W,
  canvasH = HITBOX_CANVAS_H,
  pad = HITBOX_PAD,
): HitboxCanvasLayout {
  return {
    canvasW,
    canvasH,
    pad,
    contentLeft: pad,
    contentTop: pad,
    contentW: Math.max(1, canvasW - pad * 2),
    contentH: Math.max(1, canvasH - pad * 2),
  };
}

/**
 * Content rect matches enemyWorldBounds aspect so artScale is uniform and
 * normalized zones map 1:1 to the same AABB used by combat.
 */
export function layoutHitboxCanvasForEnemy(
  size: number,
  canvasW = HITBOX_CANVAS_W,
  canvasH = HITBOX_CANVAS_H,
  pad = HITBOX_PAD,
): HitboxCanvasLayout {
  const world = enemyWorldBounds(0, 0, size);
  const availW = Math.max(1, canvasW - pad * 2);
  const availH = Math.max(1, canvasH - pad * 2);
  const aspect = world.width / Math.max(1e-6, world.height);
  let contentW: number;
  let contentH: number;
  if (availW / availH > aspect) {
    contentH = availH;
    contentW = availH * aspect;
  } else {
    contentW = availW;
    contentH = availW / aspect;
  }
  return {
    canvasW,
    canvasH,
    pad,
    contentLeft: (canvasW - contentW) / 2,
    contentTop: (canvasH - contentH) / 2,
    contentW,
    contentH,
  };
}

/** Map canvas pixel → normalized [0,1] over content AABB (may be outside). */
export function screenToNormalized(
  layout: HitboxCanvasLayout,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return {
    x: (sx - layout.contentLeft) / layout.contentW,
    y: (sy - layout.contentTop) / layout.contentH,
  };
}

export function normalizedToScreen(
  layout: HitboxCanvasLayout,
  nx: number,
  ny: number,
): { x: number; y: number } {
  return {
    x: layout.contentLeft + nx * layout.contentW,
    y: layout.contentTop + ny * layout.contentH,
  };
}

export function zoneScreenRect(
  layout: HitboxCanvasLayout,
  zone: Pick<EnemyHitZone, "x" | "y" | "width" | "height">,
): { x: number; y: number; w: number; h: number } {
  const tl = normalizedToScreen(layout, zone.x, zone.y);
  return {
    x: tl.x,
    y: tl.y,
    w: zone.width * layout.contentW,
    h: zone.height * layout.contentH,
  };
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Keep zone inside unit square with minimum size. Does not mutate shape/id/etc. */
export function clampZoneGeometry(
  zone: Pick<EnemyHitZone, "x" | "y" | "width" | "height">,
  minSize = HITBOX_MIN_SIZE,
): { x: number; y: number; width: number; height: number } {
  let width = Math.max(minSize, Math.min(1, zone.width));
  let height = Math.max(minSize, Math.min(1, zone.height));
  let x = clamp01(zone.x);
  let y = clamp01(zone.y);
  if (x + width > 1) x = 1 - width;
  if (y + height > 1) y = 1 - height;
  x = clamp01(x);
  y = clamp01(y);
  return { x, y, width, height };
}

/**
 * Move zone so its top-left follows (nx - grabOffX, ny - grabOffY).
 * grab offsets are normalized distances from pointer to zone origin at drag start.
 */
export function moveZoneByGrab(
  zone: Pick<EnemyHitZone, "x" | "y" | "width" | "height">,
  nx: number,
  ny: number,
  grabOffX: number,
  grabOffY: number,
): { x: number; y: number; width: number; height: number } {
  return clampZoneGeometry({
    x: nx - grabOffX,
    y: ny - grabOffY,
    width: zone.width,
    height: zone.height,
  });
}

/** Resize via bounding-box corner handle; works for both ellipse and rect storage. */
export function resizeZoneByHandle(
  start: Pick<EnemyHitZone, "x" | "y" | "width" | "height">,
  handle: ResizeHandle,
  nx: number,
  ny: number,
  minSize = HITBOX_MIN_SIZE,
): { x: number; y: number; width: number; height: number } {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  let x1 = start.x;
  let y1 = start.y;
  let x2 = right;
  let y2 = bottom;
  if (handle === "nw") {
    x1 = nx;
    y1 = ny;
  } else if (handle === "ne") {
    x2 = nx;
    y1 = ny;
  } else if (handle === "sw") {
    x1 = nx;
    y2 = ny;
  } else {
    x2 = nx;
    y2 = ny;
  }
  x1 = clamp01(x1);
  y1 = clamp01(y1);
  x2 = clamp01(x2);
  y2 = clamp01(y2);
  let x = Math.min(x1, x2);
  let y = Math.min(y1, y2);
  let width = Math.max(minSize, Math.abs(x2 - x1));
  let height = Math.max(minSize, Math.abs(y2 - y1));
  return clampZoneGeometry({ x, y, width, height }, minSize);
}

export function handlePositions(
  layout: HitboxCanvasLayout,
  zone: Pick<EnemyHitZone, "x" | "y" | "width" | "height">,
): Record<ResizeHandle, { x: number; y: number }> {
  const r = zoneScreenRect(layout, zone);
  return {
    nw: { x: r.x, y: r.y },
    ne: { x: r.x + r.w, y: r.y },
    sw: { x: r.x, y: r.y + r.h },
    se: { x: r.x + r.w, y: r.y + r.h },
  };
}

export function hitTestHandle(
  layout: HitboxCanvasLayout,
  zone: Pick<EnemyHitZone, "x" | "y" | "width" | "height">,
  sx: number,
  sy: number,
  handlePx = HITBOX_HANDLE_PX,
): ResizeHandle | null {
  const half = handlePx;
  const positions = handlePositions(layout, zone);
  for (const h of ["nw", "ne", "sw", "se"] as const) {
    const p = positions[h];
    if (Math.abs(sx - p.x) <= half && Math.abs(sy - p.y) <= half) return h;
  }
  return null;
}

/** Deterministic zone pick under cursor (same priority rule as combat). */
export function selectZoneAtScreen(
  zones: readonly EnemyHitZone[],
  layout: HitboxCanvasLayout,
  sx: number,
  sy: number,
): string | null {
  const { x, y } = screenToNormalized(layout, sx, sy);
  const unit = { left: 0, top: 0, width: 1, height: 1 };
  const hit = resolveHitZoneAtPoint(zones, unit, x, y);
  return hit?.zone.id ?? null;
}

export function pointInZoneScreen(
  layout: HitboxCanvasLayout,
  zone: EnemyHitZone,
  sx: number,
  sy: number,
): boolean {
  const { x, y } = screenToNormalized(layout, sx, sy);
  return (
    resolveHitZoneAtPoint([zone], { left: 0, top: 0, width: 1, height: 1 }, x, y) != null
  );
}

export function shapeLabel(shape: HitZoneShape): string {
  return shape === "ellipse" ? "ELLIPSE" : "RECTANGLE";
}

export function parseShapeLabel(label: string): HitZoneShape {
  const s = label.toLowerCase();
  if (s === "rect" || s === "rectangle" || s === "square") return "rect";
  return "ellipse";
}

/** Changing shape keeps geometry; only the shape field flips. */
export function withShape(zone: EnemyHitZone, shape: HitZoneShape): EnemyHitZone {
  return { ...zone, shape };
}

export function newCustomHitZone(existing: readonly EnemyHitZone[]): EnemyHitZone {
  let n = 1;
  const ids = new Set(existing.map((z) => z.id));
  while (ids.has(`custom_${n}`)) n++;
  return {
    id: `custom_${n}`,
    displayName: `ZONE ${n}`,
    shape: "rect",
    x: 0.3,
    y: 0.3,
    width: 0.4,
    height: 0.25,
    damageMult: 1,
    enabled: true,
    priority: 15,
  };
}

export const ZONE_PALETTE: Record<string, string> = {
  head: "#e85d4c",
  body: "#5a9fd4",
  legs: "#7bc96f",
};

export function zoneColor(id: string, index: number): string {
  if (ZONE_PALETTE[id]) return ZONE_PALETTE[id]!;
  const palette = ["#ffd166", "#c084fc", "#f472b6", "#34d399", "#60a5fa"];
  return palette[index % palette.length]!;
}
