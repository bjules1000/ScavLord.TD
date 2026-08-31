import { COLS, ROWS } from "./data";
import { isBuildable, isHighGround, isMountain, isRoad, isWater, type GameMap } from "./map";
import type { SurfaceLevel } from "./types";

export type { SurfaceLevel };

/** Independent base cell. Never replaced by a HIGH overlay. */
export type BaseTerrainKind = "GROUND" | "ROAD" | "WATER" | "MOUNTAIN";

/** Optional elevated walkable overlay on top of `BaseTerrainKind`. */
export type ElevatedSurfaceKind = "HIGH_GROUND" | "SUSPENDED_BRIDGE";

/**
 * Raid draw passes, bottom → top.
 * LOW entities sit under the elevated deck; HIGH entities sit on it.
 * Combat/UI overlays stay last. Projectiles stay in the overlay pass.
 */
export const RAID_DRAW_PASSES = [
  "baseTerrain",
  "lowEntities",
  "elevatedSurface",
  "highEntities",
  "overlays",
] as const;

export type RaidDrawPass = (typeof RAID_DRAW_PASSES)[number];

export function raidDrawPassIndex(pass: RaidDrawPass): number {
  return RAID_DRAW_PASSES.indexOf(pass);
}

export function entityDrawPass(surface: SurfaceLevel): "lowEntities" | "highEntities" {
  return surface === "HIGH" ? "highEntities" : "lowEntities";
}

export function entitySurface(entity: { surface?: SurfaceLevel }): SurfaceLevel {
  return entity.surface ?? "GROUND";
}

export function inMapBounds(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS;
}

export function hasSuspendedBridge(map: GameMap, tx: number, ty: number): boolean {
  if (!inMapBounds(tx, ty)) return false;
  return !!map.BRIDGE[ty]![tx];
}

/**
 * Base terrain only. A suspended bridge does not convert ROAD/WATER/GROUND
 * into a different base kind.
 */
export function baseTerrainAt(map: GameMap, tx: number, ty: number): BaseTerrainKind | null {
  if (!inMapBounds(tx, ty)) return null;
  if (isMountain(map, tx, ty)) return "MOUNTAIN";
  if (isWater(map, tx, ty)) return "WATER";
  if (isRoad(map, tx, ty)) return "ROAD";
  return "GROUND";
}

/**
 * Elevated overlay, independent of base terrain.
 * A bridge deck wins over HIGH_GROUND on the same cell.
 */
export function elevatedSurfaceAt(map: GameMap, tx: number, ty: number): ElevatedSurfaceKind | null {
  if (!inMapBounds(tx, ty)) return null;
  if (hasSuspendedBridge(map, tx, ty)) return "SUSPENDED_BRIDGE";
  if (isHighGround(map, tx, ty) && !isMountain(map, tx, ty)) return "HIGH_GROUND";
  return null;
}

export function tileHasFurniture(map: GameMap, tx: number, ty: number): boolean {
  if (!inMapBounds(tx, ty)) return false;
  if (map.PROPS.some((p) => p.tx === tx && p.ty === ty)) return true;
  if (map.CRATES.some((p) => p.tx === tx && p.ty === ty)) return true;
  if (map.COVER.some((c) => c.tx === tx && c.ty === ty)) return true;
  return false;
}

/** LOW occupancy. ROAD/WATER/MOUNTAIN stay illegal for standing on the base cell. */
export function canOccupyLowSurface(map: GameMap, tx: number, ty: number): boolean {
  return isBuildable(map, tx, ty);
}

/**
 * HIGH occupancy. Legality comes from the elevated overlay, not the base cell.
 * ROAD or WATER under a structurally authored bridge does not veto the deck.
 */
export function canOccupyHighSurface(map: GameMap, tx: number, ty: number): boolean {
  if (!inMapBounds(tx, ty)) return false;
  if (isMountain(map, tx, ty)) return false;
  if (!elevatedSurfaceAt(map, tx, ty)) return false;
  if (tileHasFurniture(map, tx, ty)) return false;
  return true;
}

/**
 * Temporary pre-movement click targeting: a tile with a placeable HIGH surface
 * deploys onto HIGH (bridge deck / high ground). There is no LOW-vs-HIGH picker yet.
 *
 * Later movement will keep LOW operators on the base cell under a bridge and
 * HIGH operators on the connected deck; changing level will require a slope.
 */
export function operatorPlacementSurface(map: GameMap, tx: number, ty: number): SurfaceLevel | null {
  if (canOccupyHighSurface(map, tx, ty)) return "HIGH";
  if (canOccupyLowSurface(map, tx, ty)) return "GROUND";
  return null;
}

export function canPlaceOperator(map: GameMap, tx: number, ty: number): boolean {
  return operatorPlacementSurface(map, tx, ty) !== null;
}

/** Barricades/wire occupy the LOW cell and do not veto a HIGH deck above. */
export function lowObstacleBlocksOperator(surface: SurfaceLevel, hasLowObstacle: boolean): boolean {
  return surface === "GROUND" && hasLowObstacle;
}

/**
 * Authored lane traffic stays GROUND/LOW. A bridge overlay is not a lane cell
 * and does not elevate enemies on the ROAD underneath.
 */
export function enemyLaneSurface(_map?: GameMap, _tx?: number, _ty?: number): SurfaceLevel {
  return "GROUND";
}

export function partitionBySurface<T extends { surface?: SurfaceLevel }>(items: T[]): { low: T[]; high: T[] } {
  const low: T[] = [];
  const high: T[] = [];
  for (const item of items) {
    if (entitySurface(item) === "HIGH") high.push(item);
    else low.push(item);
  }
  return { low, high };
}
