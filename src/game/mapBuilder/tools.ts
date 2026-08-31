import type { TerrainKind } from "./schema";

export const TERRAIN_PAINT_KINDS = ["GROUND", "ROAD", "WATER", "MOUNTAIN", "HIGH_GROUND"] as const;

export function selectTerrainTool(kind: TerrainKind): { id: "terrain"; terrain: TerrainKind } {
  return { id: "terrain", terrain: kind };
}

export function selectEraserTool(): { id: "eraser" } {
  return { id: "eraser" };
}

export function selectInspectTool(): { id: "select" } {
  return { id: "select" };
}

export function isTerrainPaintMode(tool: { id: string }): boolean {
  return tool.id === "terrain";
}

export function isTerrainEraserMode(tool: { id: string }): boolean {
  return tool.id === "eraser";
}

export function isInspectMode(tool: { id: string }): boolean {
  return tool.id === "select";
}
