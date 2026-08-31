import { TILE } from "../data";
import { drawCheckpoint, drawCover, drawCrate, drawProp } from "../draw";
import type { CheckpointPart, CoverType, PropType } from "../map";
import { inBounds, terrainAt } from "./document";
import { laneLabelShort, pathCells } from "./pathing";
import { EDITOR_GUTTER, canvasPixelSize, hitLanePort, overlayPathCells, portOutsideCell } from "./ports";
import type { BoundaryPort, EditorMapDoc, TerrainKind, TileEdge } from "./schema";

export interface LayerFlags {
  terrain: boolean;
  roads: boolean;
  markers: boolean;
  props: boolean;
  grid: boolean;
  extras: boolean;
  paths: boolean;
}

export const DEFAULT_LAYERS: LayerFlags = {
  terrain: true,
  roads: true,
  markers: true,
  props: true,
  grid: true,
  extras: true,
  paths: true,
};

export const PATH_ACTIVE_COLOR = "#f0b400";
export const PATH_INACTIVE_COLOR = "#e8e4d4";

export function pathStrokeStyle(active: boolean): { color: string; width: number } {
  return active ? { color: PATH_ACTIVE_COLOR, width: 5 } : { color: PATH_INACTIVE_COLOR, width: 4 };
}

export interface VisiblePathOverlay {
  id: string;
  cells: Array<[number, number]>;
  style: { color: string; width: number };
  active: boolean;
}

/** PATHS layer visibility only. Turning the layer off never mutates lane data. */
export function visiblePathOverlays(
  doc: EditorMapDoc,
  layers: LayerFlags,
  activeLaneId: string,
): VisiblePathOverlay[] {
  if (!layers.paths) return [];
  return doc.lanes.map((lane) => ({
    id: lane.id,
    cells: pathCells(overlayPathCells(lane)),
    style: pathStrokeStyle(lane.id === activeLaneId),
    active: lane.id === activeLaneId,
  }));
}

const TERRAIN_FILL: Record<TerrainKind, string> = {
  GROUND: "",
  ROAD: "",
  WATER: "#1a4a6a",
  MOUNTAIN: "#3a3c42",
  HIGH_GROUND: "#6a5430",
};

export function tileAt(px: number, py: number, doc: EditorMapDoc): { tx: number; ty: number } | null {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (!inBounds(doc, tx, ty)) return null;
  return { tx, ty };
}

/**
 * Map a client pointer onto a tile using the canvas display box.
 * Works at any zoom because it uses displayed size vs logical TILE grid.
 * `gutter` is presentation-only space around the playable grid (default 0 for tests).
 */
export function clientToTile(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
  tile = TILE,
  gutter = 0,
): { tx: number; ty: number; localX: number; localY: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const canvasW = width * tile + gutter * 2;
  const canvasH = height * tile + gutter * 2;
  const px = ((clientX - rect.left) / rect.width) * canvasW;
  const py = ((clientY - rect.top) / rect.height) * canvasH;
  const playableX = px - gutter;
  const playableY = py - gutter;
  const tx = Math.floor(playableX / tile);
  const ty = Math.floor(playableY / tile);
  if (gutter <= 0) {
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return null;
  } else if (tx < -1 || ty < -1 || tx > width || ty > height) {
    return null;
  }
  return { tx, ty, localX: playableX - tx * tile, localY: playableY - ty * tile };
}

export function drawEditorMap(
  ctx: CanvasRenderingContext2D,
  doc: EditorMapDoc,
  layers: LayerFlags,
  hover: {
    tx: number;
    ty: number;
    ghost: string | null;
    invalid?: boolean;
    edge?: TileEdge;
    ghostItem?: "prop" | "cover" | "crate" | "checkpoint" | "spawn" | "end" | "erase" | "path" | null;
    ghostProp?: PropType | null;
    ghostCover?: CoverType | null;
    ghostCheckpoint?: CheckpointPart["type"] | null;
    pathPreview?: Array<[number, number]>;
    portPreview?: BoundaryPort | null;
  } | null,
  activeLaneId: string,
) {
  const gutter = EDITOR_GUTTER;
  const { w: canvasW, h: canvasH } = canvasPixelSize(doc.width, doc.height);
  const W = doc.width * TILE;
  const H = doc.height * TILE;
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = "#0a0c08";
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.save();
  ctx.translate(gutter, gutter);

  if (layers.terrain) {
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        const kind = terrainAt(doc, x, y) ?? "GROUND";
        const n = ((x * 17 + y * 31) % 10) / 10;
        const ground = n > 0.7 ? doc.palette.grassA : n > 0.35 ? doc.palette.grassB : doc.palette.grassC;
        ctx.fillStyle = kind === "GROUND" || kind === "ROAD" ? ground : TERRAIN_FILL[kind] || ground;
        if (kind === "HIGH_GROUND") ctx.fillStyle = TERRAIN_FILL.HIGH_GROUND;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        if (kind === "WATER") {
          ctx.fillStyle = "#2a6a8a";
          ctx.fillRect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8);
        }
        if (kind === "MOUNTAIN") {
          ctx.fillStyle = "#5a5e66";
          ctx.fillRect(x * TILE + 6, y * TILE + 8, TILE - 12, TILE - 16);
        }
        if (kind === "HIGH_GROUND") {
          ctx.fillStyle = "#8a7040";
          ctx.fillRect(x * TILE + 3, y * TILE + 3, TILE - 6, 4);
        }
      }
    }
  }

  if (layers.roads) {
    const pal = doc.palette;
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        if (terrainAt(doc, x, y) !== "ROAD") continue;
        const px = x * TILE;
        const py = y * TILE;
        ctx.fillStyle = pal.roadOuter;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = pal.roadMid;
        ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
        ctx.fillStyle = pal.roadInner;
        ctx.fillRect(px + 7, py + 7, TILE - 14, TILE - 14);
        ctx.fillStyle = pal.roadLine;
        const n = terrainAt(doc, x, y - 1) === "ROAD";
        const s = terrainAt(doc, x, y + 1) === "ROAD";
        const w = terrainAt(doc, x - 1, y) === "ROAD";
        const e = terrainAt(doc, x + 1, y) === "ROAD";
        if ((w || e) && !((n || s) && !(w || e))) {
          ctx.fillRect(px + 4, py + TILE / 2 - 1, TILE - 8, 2);
        } else if (n || s) {
          ctx.fillRect(px + TILE / 2 - 1, py + 4, 2, TILE - 8);
        }
      }
    }
  }

  if (layers.extras) {
    ctx.save();
    ctx.strokeStyle = "rgba(240, 180, 0, 0.55)";
    ctx.setLineDash([5, 4]);
    for (const zone of doc.zones) {
      if (!zone.cells.length) continue;
      const xs = zone.cells.map(([x]) => x);
      const ys = zone.cells.map(([, y]) => y);
      const x0 = Math.min(...xs) * TILE;
      const y0 = Math.min(...ys) * TILE;
      const x1 = (Math.max(...xs) + 1) * TILE;
      const y1 = (Math.max(...ys) + 1) * TILE;
      ctx.strokeRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    }
    ctx.restore();
  }

  if (layers.props) {
    for (const c of doc.cover) drawCover(ctx, c.tx * TILE, c.ty * TILE, c.type);
    for (const p of doc.props) drawProp(ctx, p.tx * TILE, p.ty * TILE, p.type);
    for (const c of doc.checkpoints) drawCheckpoint(ctx, c.tx * TILE, c.ty * TILE, c.type);
    for (const c of doc.crates) drawCrate(ctx, c.tx, c.ty, 0, false);
    for (const e of doc.edges) drawEdgeMark(ctx, e.tx, e.ty, e.edge, e.type === "wall" ? "#8a8c80" : "#c9c2a6");
  }

  if (layers.paths) {
    const overlays = visiblePathOverlays(doc, layers, activeLaneId);
    const inactive = overlays.filter((o) => !o.active);
    const active = overlays.filter((o) => o.active);
    for (const overlay of [...inactive, ...active]) {
      drawPathPolyline(ctx, overlay.cells, overlay.style.color, overlay.style.width);
    }
  }

  if (layers.paths || layers.markers) {
    for (const lane of doc.lanes) {
      const firstOnMap = lane.waypoints.find(([x, y]) => x >= 0 && y >= 0 && x < doc.width && y < doc.height);
      if (!firstOnMap) continue;
      drawLaneLabel(ctx, firstOnMap[0], firstOnMap[1], laneLabelShort(lane.id), lane.id === activeLaneId);
    }
  }

  if (layers.markers) {
    for (const lane of doc.lanes) {
      if (lane.spawn) {
        const [sx, sy] = portOutsideCell(lane.spawn);
        drawMarker(ctx, sx, sy, "#4dd36a", "S");
      }
      if (lane.endpoint) {
        const [ex, ey] = portOutsideCell(lane.endpoint);
        drawMarker(ctx, ex, ey, "#f0b400", "E");
      }
    }
    for (const g of doc.gates) {
      drawEdgeMark(ctx, g.tx, g.ty, g.edge, "#ff7a2f");
      ctx.fillStyle = "#ff7a2f";
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(g.id[0]!, g.tx * TILE + TILE / 2, g.ty * TILE + 10);
    }
  }

  if (layers.grid) {
    ctx.strokeStyle = "rgba(240, 180, 0, 0.28)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= doc.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * TILE + 0.5, 0);
      ctx.lineTo(x * TILE + 0.5, H);
      ctx.stroke();
    }
    for (let y = 0; y <= doc.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE + 0.5);
      ctx.lineTo(W, y * TILE + 0.5);
      ctx.stroke();
    }
  }

  if (hover) {
    if (hover.ghostItem === "path" && hover.pathPreview && hover.pathPreview.length) {
      drawPathPolyline(ctx, hover.pathPreview, hover.invalid ? "#c23b2c" : PATH_ACTIVE_COLOR, 3, 0.55);
    }
    const portPreview = hover.portPreview;
    if (portPreview && (hover.ghostItem === "spawn" || hover.ghostItem === "end")) {
      ctx.save();
      ctx.globalAlpha = hover.invalid ? 0.35 : 0.55;
      const [mx, my] = portOutsideCell(portPreview);
      drawMarker(ctx, mx, my, hover.ghostItem === "spawn" ? "#4dd36a" : "#f0b400", hover.ghostItem === "spawn" ? "S" : "E");
      ctx.restore();
      ctx.strokeStyle = hover.invalid ? "#c23b2c" : "#f0b400";
      ctx.lineWidth = 2;
      ctx.strokeRect(hover.tx * TILE + 1, hover.ty * TILE + 1, TILE - 2, TILE - 2);
    } else {
      ctx.save();
      ctx.globalAlpha = hover.invalid ? 0.45 : 0.4;
      ctx.fillStyle = hover.invalid ? "#c23b2c" : hover.ghost ?? "#f0b400";
      ctx.fillRect(hover.tx * TILE, hover.ty * TILE, TILE, TILE);
      if (!hover.invalid && hover.ghostItem === "prop" && hover.ghostProp) {
        ctx.globalAlpha = 0.55;
        drawProp(ctx, hover.tx * TILE, hover.ty * TILE, hover.ghostProp);
      }
      if (!hover.invalid && hover.ghostItem === "cover" && hover.ghostCover) {
        ctx.globalAlpha = 0.55;
        drawCover(ctx, hover.tx * TILE, hover.ty * TILE, hover.ghostCover);
      }
      if (!hover.invalid && hover.ghostItem === "crate") {
        ctx.globalAlpha = 0.55;
        drawCrate(ctx, hover.tx, hover.ty, 0, false);
      }
      if (!hover.invalid && hover.ghostItem === "checkpoint" && hover.ghostCheckpoint) {
        ctx.globalAlpha = 0.55;
        drawCheckpoint(ctx, hover.tx * TILE, hover.ty * TILE, hover.ghostCheckpoint);
      }
      if (hover.edge) drawEdgeMark(ctx, hover.tx, hover.ty, hover.edge, hover.invalid ? "#c23b2c" : "#f0b400");
      ctx.restore();
      ctx.strokeStyle = hover.invalid ? "#c23b2c" : hover.ghostItem === "erase" ? "#c23b2c" : "#f0b400";
      ctx.lineWidth = 2;
      ctx.strokeRect(hover.tx * TILE + 1, hover.ty * TILE + 1, TILE - 2, TILE - 2);
    }
  }

  ctx.restore();
}

function drawPathPolyline(
  ctx: CanvasRenderingContext2D,
  cells: Array<[number, number]>,
  color: string,
  width: number,
  alpha = 1,
) {
  if (!cells.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = "miter";
  ctx.lineCap = "square";
  ctx.strokeStyle = color;
  if (cells.length === 1) {
    const [x, y] = cells[0]!;
    const px = x * TILE + TILE / 2;
    const py = y * TILE + TILE / 2;
    ctx.fillStyle = color;
    ctx.fillRect(px - 6, py - 6, 12, 12);
    ctx.restore();
    return;
  }
  ctx.lineWidth = width + 2;
  ctx.strokeStyle = "rgba(12, 14, 10, 0.55)";
  ctx.beginPath();
  cells.forEach(([x, y], idx) => {
    const px = x * TILE + TILE / 2;
    const py = y * TILE + TILE / 2;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  cells.forEach(([x, y], idx) => {
    const px = x * TILE + TILE / 2;
    const py = y * TILE + TILE / 2;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}

function drawLaneLabel(ctx: CanvasRenderingContext2D, tx: number, ty: number, label: string, active: boolean) {
  const x = tx * TILE + 6;
  const y = ty * TILE + 8;
  ctx.save();
  ctx.font = "8px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(12, 14, 10, 0.75)";
  ctx.fillRect(x - 2, y - 5, label.length * 6 + 4, 10);
  ctx.fillStyle = active ? PATH_ACTIVE_COLOR : PATH_INACTIVE_COLOR;
  ctx.fillText(label, x, y);
  ctx.restore();
}

function drawMarker(ctx: CanvasRenderingContext2D, tx: number, ty: number, color: string, tag: string) {
  const x = tx * TILE + TILE / 2;
  const y = ty * TILE + TILE / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(x - 8, y - 8, 16, 16);
  ctx.fillStyle = "#111";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tag, x, y + 1);
  ctx.restore();
}

function drawEdgeMark(ctx: CanvasRenderingContext2D, tx: number, ty: number, edge: TileEdge, color: string) {
  const x = tx * TILE;
  const y = ty * TILE;
  ctx.fillStyle = color;
  if (edge === "N") ctx.fillRect(x + 4, y + 1, TILE - 8, 5);
  if (edge === "S") ctx.fillRect(x + 4, y + TILE - 6, TILE - 8, 5);
  if (edge === "W") ctx.fillRect(x + 1, y + 4, 5, TILE - 8);
  if (edge === "E") ctx.fillRect(x + TILE - 6, y + 4, 5, TILE - 8);
}

export function hitObject(doc: EditorMapDoc, tx: number, ty: number): { kind: string; id: string } | null {
  const port = hitLanePort(doc, tx, ty);
  if (port) return { kind: port.kind, id: `${port.kind}:${port.laneId}` };
  for (const lane of doc.lanes) {
    if (lane.spawn && lane.spawn.tx === tx && lane.spawn.ty === ty) {
      return { kind: "spawn", id: `spawn:${lane.id}` };
    }
    if (lane.endpoint && lane.endpoint.tx === tx && lane.endpoint.ty === ty) {
      return { kind: "endpoint", id: `endpoint:${lane.id}` };
    }
  }
  const prop = doc.props.find((p) => p.tx === tx && p.ty === ty);
  if (prop) return { kind: "prop", id: prop.id };
  const cover = doc.cover.find((p) => p.tx === tx && p.ty === ty);
  if (cover) return { kind: "cover", id: cover.id };
  const crate = doc.crates.find((p) => p.tx === tx && p.ty === ty);
  if (crate) return { kind: "crate", id: crate.id };
  const cp = doc.checkpoints.find((p) => p.tx === tx && p.ty === ty);
  if (cp) return { kind: "checkpoint", id: cp.id };
  const gate = doc.gates.find((p) => p.tx === tx && p.ty === ty);
  if (gate) return { kind: "gate", id: gate.id };
  const zone = doc.zones.find((z) => z.cells.some(([x, y]) => x === tx && y === ty));
  if (zone) return { kind: "zone", id: zone.id };
  return { kind: "tile", id: `${tx},${ty}` };
}
