import { TILE } from "../data";
import type { CheckpointPart, CoverType, PropType } from "../map";
import { inBounds } from "./document";
import { edgeFromCursor } from "./edges";
import { cellsBetween, isOrthogonalPair, pathCells, sameCell } from "./pathing";
import {
  applyEndpoint,
  applyPathClick,
  applySpawn,
  eraseTiles,
  paintTiles,
  paintZoneCells,
  placeCheckpoint,
  placeCover,
  placeCrate,
  placeEdgeObject,
  placeGate,
  placeProp,
  setLaneWaypoints,
} from "./paint";
import type { EditorMapDoc, TileEdge } from "./schema";
import type { EditorTool } from "./tools";
import { isDragPlaceProp } from "./tools";

export interface AuthorCell {
  tx: number;
  ty: number;
  localX: number;
  localY: number;
}

export interface AuthorContext {
  laneId: string;
  zoneId: string | null;
  tileSize?: number;
}

function edgeOf(cell: AuthorCell, tile: number): TileEdge {
  return edgeFromCursor(cell.localX, cell.localY, tile);
}

export function applyAuthor(
  doc: EditorMapDoc,
  tool: EditorTool,
  cell: AuthorCell,
  ctx: AuthorContext,
): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const tile = ctx.tileSize ?? TILE;
  const pos: [number, number] = [cell.tx, cell.ty];
  switch (tool.id) {
    case "select":
      return doc;
    case "terrain":
      return paintTiles(doc, [pos], tool.terrain);
    case "eraser":
      return eraseTiles(doc, [pos]);
    case "prop":
      return placeProp(doc, cell.tx, cell.ty, tool.type);
    case "cover":
      return placeCover(doc, cell.tx, cell.ty, tool.type);
    case "crate":
      return placeCrate(doc, cell.tx, cell.ty);
    case "checkpoint":
      return placeCheckpoint(doc, cell.tx, cell.ty, tool.type);
    case "edge":
      return placeEdgeObject(doc, cell.tx, cell.ty, edgeOf(cell, tile), tool.type);
    case "erase-prop":
      return erasePropAt(doc, cell.tx, cell.ty, edgeOf(cell, tile));
    case "path":
      return applyPathClick(doc, ctx.laneId, pos);
    case "spawn":
      return applySpawn(doc, ctx.laneId, snapCell(cell, doc, tile));
    case "end":
      return applyEndpoint(doc, ctx.laneId, snapCell(cell, doc, tile));
    case "zone":
      return paintZoneCells(doc, [pos], ctx.zoneId);
    case "gate":
      return placeGate(doc, tool.gateId, ctx.laneId, cell.tx, cell.ty, edgeOf(cell, tile));
    case "erase-gameplay":
      return eraseGameplayAt(doc, ctx.laneId, cell.tx, cell.ty);
    default:
      return doc;
  }
}

export function applyAuthorStroke(
  doc: EditorMapDoc,
  tool: EditorTool,
  cells: AuthorCell[],
  ctx: AuthorContext,
): EditorMapDoc {
  if (!cells.length || doc.status === "locked") return doc;
  if (isSinglePlaceTool(tool)) return applyAuthor(doc, tool, cells[0]!, ctx);
  let next = doc;
  let zoneId = ctx.zoneId;
  for (const cell of cells) {
    next = applyAuthor(next, tool, cell, { ...ctx, zoneId });
    if (tool.id === "zone" && !zoneId) zoneId = next.zones[next.zones.length - 1]?.id ?? null;
  }
  return next;
}

export function isSinglePlaceTool(tool: EditorTool): boolean {
  if (tool.id === "prop") return !isDragPlaceProp(tool.type);
  if (tool.id === "checkpoint") return tool.type !== "post";
  return tool.id === "spawn" || tool.id === "end" || tool.id === "gate" || tool.id === "edge";
}

function snapCell(cell: AuthorCell, doc: EditorMapDoc, tile: number): [number, number] {
  let x = cell.tx;
  let y = cell.ty;
  if (cell.tx === 0 && cell.localX < tile / 3) x = -1;
  if (cell.tx === doc.width - 1 && cell.localX > (tile * 2) / 3) x = doc.width;
  if (cell.ty === 0 && cell.localY < tile / 3) y = -1;
  if (cell.ty === doc.height - 1 && cell.localY > (tile * 2) / 3) y = doc.height;
  return [x, y];
}

export function erasePropAt(doc: EditorMapDoc, tx: number, ty: number, edge?: TileEdge): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const edgeHit = edge
    ? doc.edges.find((e) => e.tx === tx && e.ty === ty && e.edge === edge)
    : doc.edges.find((e) => e.tx === tx && e.ty === ty);
  if (edgeHit) {
    return { ...doc, edges: doc.edges.filter((e) => e.id !== edgeHit.id) };
  }
  return {
    ...doc,
    props: doc.props.filter((p) => !(p.tx === tx && p.ty === ty)),
    cover: doc.cover.filter((p) => !(p.tx === tx && p.ty === ty)),
    crates: doc.crates.filter((p) => !(p.tx === tx && p.ty === ty)),
    checkpoints: doc.checkpoints.filter((p) => !(p.tx === tx && p.ty === ty)),
  };
}

export function erasePathAt(doc: EditorMapDoc, laneId: string, tx: number, ty: number): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const lane = doc.lanes.find((l) => l.id === laneId);
  if (!lane) return doc;
  const hitWp = lane.waypoints.findIndex((w) => w[0] === tx && w[1] === ty);
  if (hitWp >= 0) {
    return setLaneWaypoints(
      doc,
      laneId,
      lane.waypoints.filter((_, i) => i !== hitWp),
    );
  }
  for (let i = 0; i < lane.waypoints.length - 1; i++) {
    const seg = cellsBetween(lane.waypoints[i]!, lane.waypoints[i + 1]!);
    if (seg.some((c) => c[0] === tx && c[1] === ty)) {
      return setLaneWaypoints(doc, laneId, [...lane.waypoints.slice(0, i + 1), ...lane.waypoints.slice(i + 2)]);
    }
  }
  return doc;
}

export function eraseSpawn(doc: EditorMapDoc, laneId: string): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const lane = doc.lanes.find((l) => l.id === laneId);
  if (!lane || !lane.waypoints.length) return doc;
  return setLaneWaypoints(doc, laneId, lane.waypoints.slice(1));
}

export function eraseEndpoint(doc: EditorMapDoc, laneId: string): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const lane = doc.lanes.find((l) => l.id === laneId);
  if (!lane || lane.waypoints.length < 2) return doc;
  return setLaneWaypoints(doc, laneId, lane.waypoints.slice(0, -1));
}

export function eraseZoneAt(doc: EditorMapDoc, tx: number, ty: number): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const zones = doc.zones
    .map((z) => ({ ...z, cells: z.cells.filter(([x, y]) => !(x === tx && y === ty)) }))
    .filter((z) => z.cells.length > 0);
  if (zones.length === doc.zones.length && zones.every((z, i) => z.cells.length === doc.zones[i]!.cells.length)) {
    return doc;
  }
  return { ...doc, zones };
}

export function eraseGateAt(doc: EditorMapDoc, tx: number, ty: number): EditorMapDoc {
  if (doc.status === "locked") return doc;
  if (!doc.gates.some((g) => g.tx === tx && g.ty === ty)) return doc;
  return { ...doc, gates: doc.gates.filter((g) => !(g.tx === tx && g.ty === ty)) };
}

export function eraseGameplayAt(doc: EditorMapDoc, laneId: string, tx: number, ty: number): EditorMapDoc {
  const lane = doc.lanes.find((l) => l.id === laneId);
  const spawn = lane?.waypoints[0];
  const end = lane && lane.waypoints.length > 1 ? lane.waypoints[lane.waypoints.length - 1] : undefined;
  if (spawn && spawn[0] === tx && spawn[1] === ty) return eraseSpawn(doc, laneId);
  if (end && end[0] === tx && end[1] === ty) return eraseEndpoint(doc, laneId);
  if (doc.gates.some((g) => g.tx === tx && g.ty === ty)) return eraseGateAt(doc, tx, ty);
  if (doc.zones.some((z) => z.cells.some(([x, y]) => x === tx && y === ty))) return eraseZoneAt(doc, tx, ty);
  if (lane && pathCells(lane.waypoints).some((c) => c[0] === tx && c[1] === ty)) {
    return erasePathAt(doc, laneId, tx, ty);
  }
  return doc;
}

export function pathStepValid(doc: EditorMapDoc, laneId: string, cell: [number, number]): boolean {
  const lane = doc.lanes.find((l) => l.id === laneId);
  if (!lane) return false;
  const last = lane.waypoints[lane.waypoints.length - 1];
  if (!last) return true;
  if (sameCell(last, cell)) return false;
  return isOrthogonalPair(last, cell);
}

export function gameplayEraseTarget(
  doc: EditorMapDoc,
  laneId: string,
  tx: number,
  ty: number,
): "spawn" | "endpoint" | "gate" | "zone" | "path" | null {
  const lane = doc.lanes.find((l) => l.id === laneId);
  const spawn = lane?.waypoints[0];
  const end = lane && lane.waypoints.length > 1 ? lane.waypoints[lane.waypoints.length - 1] : undefined;
  if (spawn && spawn[0] === tx && spawn[1] === ty) return "spawn";
  if (end && end[0] === tx && end[1] === ty) return "endpoint";
  if (doc.gates.some((g) => g.tx === tx && g.ty === ty)) return "gate";
  if (doc.zones.some((z) => z.cells.some(([x, y]) => x === tx && y === ty))) return "zone";
  if (lane && pathCells(lane.waypoints).some((c) => c[0] === tx && c[1] === ty)) return "path";
  return null;
}

export function propAt(doc: EditorMapDoc, tx: number, ty: number): boolean {
  return (
    doc.props.some((p) => p.tx === tx && p.ty === ty) ||
    doc.cover.some((p) => p.tx === tx && p.ty === ty) ||
    doc.crates.some((p) => p.tx === tx && p.ty === ty) ||
    doc.checkpoints.some((p) => p.tx === tx && p.ty === ty) ||
    doc.edges.some((p) => p.tx === tx && p.ty === ty)
  );
}

