import { TILE } from "../data";
import { drawProp } from "../draw";
import type { TerrainKind } from "../mapBuilder/schema";
import type { CampGameMap } from "./campMap";

const TERRAIN_FILL: Partial<Record<TerrainKind, string>> = {
  WATER: "#1a4a6a",
  MOUNTAIN: "#3a3c42",
  HIGH_GROUND: "#6a5430",
};

/** Flat placeholder terrain, matching the map editor's own terrain-preview style (not raid's photo texture). */
export function drawCampTerrain(ctx: CanvasRenderingContext2D, map: CampGameMap) {
  const pal = map.def.palette;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const kind: TerrainKind = map.terrain[y]?.[x] ?? "GROUND";
      const px = x * TILE;
      const py = y * TILE;
      if (kind === "ROAD") {
        ctx.fillStyle = pal.roadOuter;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = pal.roadMid;
        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
        continue;
      }
      const n = ((x * 17 + y * 31) % 10) / 10;
      const ground = n > 0.7 ? pal.grassA : n > 0.35 ? pal.grassB : pal.grassC;
      ctx.fillStyle = kind === "GROUND" ? ground : (TERRAIN_FILL[kind] ?? ground);
      ctx.fillRect(px, py, TILE, TILE);
    }
  }
}

export function drawCampProps(ctx: CanvasRenderingContext2D, map: CampGameMap, time: number) {
  for (const prop of map.props) {
    drawProp(ctx, prop.tx * TILE, prop.ty * TILE, prop.type, time);
  }
}

export function drawCampScene(ctx: CanvasRenderingContext2D, map: CampGameMap, time: number) {
  ctx.clearRect(0, 0, map.width * TILE, map.height * TILE);
  drawCampTerrain(ctx, map);
  drawCampProps(ctx, map, time);
}
