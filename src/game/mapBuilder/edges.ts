import { TILE } from "../data";
import type { TileEdge } from "./schema";

/**
 * Cursor-relative N/E/S/W inside a tile. Same model as roadside barricade edges:
 * nearest side of the tile wins. Deterministic for the tile center (NORTH).
 */
export function edgeFromCursor(localX: number, localY: number, tile = TILE): TileEdge {
  const x = localX;
  const y = localY;
  const distN = y;
  const distS = tile - 1 - y;
  const distW = x;
  const distE = tile - 1 - x;
  const nearest = Math.min(distN, distS, distW, distE);
  if (nearest === distN) return "N";
  if (nearest === distE) return "E";
  if (nearest === distS) return "S";
  return "W";
}

export function edgeFromWorld(px: number, py: number, tx: number, ty: number, tile = TILE): TileEdge {
  return edgeFromCursor(px - tx * tile, py - ty * tile, tile);
}

export function edgeKey(tx: number, ty: number, edge: TileEdge): string {
  return `${tx},${ty},${edge}`;
}
