import type { CheckpointPart, CoverType, PropType } from "../map";
import type { GateId, TerrainKind } from "./schema";

export type EditorTool =
  | { id: "select" }
  | { id: "eraser" }
  | { id: "terrain"; terrain: TerrainKind }
  | { id: "path" }
  | { id: "spawn" }
  | { id: "end" }
  | { id: "gate"; gateId: GateId }
  | { id: "zone" }
  | { id: "prop"; type: PropType }
  | { id: "cover"; type: CoverType }
  | { id: "crate" }
  | { id: "checkpoint"; type: CheckpointPart["type"] }
  | { id: "edge"; type: "fence" | "wall" }
  | { id: "collision-wall" }
  | { id: "erase-wall" }
  | { id: "bridge" }
  | { id: "erase-bridge" }
  | { id: "erase-prop" }
  | { id: "erase-gameplay" };

export const TERRAIN_PAINT_KINDS = ["GROUND", "ROAD", "WATER", "MOUNTAIN", "HIGH_GROUND"] as const;
export const DRAG_PLACE_PROPS: PropType[] = ["tree", "rock", "barrel"];

export function selectTerrainTool(kind: TerrainKind): { id: "terrain"; terrain: TerrainKind } {
  return { id: "terrain", terrain: kind };
}

export function selectEraserTool(): EditorTool {
  return { id: "eraser" };
}

export function selectInspectTool(): EditorTool {
  return { id: "select" };
}

export function selectPropTool(type: PropType): EditorTool {
  return { id: "prop", type };
}

export function selectPropEraser(): EditorTool {
  return { id: "erase-prop" };
}

export function selectPathTool(): EditorTool {
  return { id: "path" };
}

export function selectGameplayEraser(): EditorTool {
  return { id: "erase-gameplay" };
}

export function isTerrainPaintMode(tool: EditorTool): boolean {
  return tool.id === "terrain";
}

export function isTerrainEraserMode(tool: EditorTool): boolean {
  return tool.id === "eraser";
}

export function isInspectMode(tool: EditorTool): boolean {
  return tool.id === "select";
}

export function isPropPlaceMode(tool: EditorTool): boolean {
  return tool.id === "prop" || tool.id === "cover" || tool.id === "crate" || tool.id === "checkpoint" || tool.id === "edge";
}

export function isPropEraseMode(tool: EditorTool): boolean {
  return tool.id === "erase-prop";
}

export function isGameplayEraseMode(tool: EditorTool): boolean {
  return tool.id === "erase-gameplay";
}

export function isPathMode(tool: EditorTool): boolean {
  return tool.id === "path";
}

export function isCollisionWallMode(tool: EditorTool): boolean {
  return tool.id === "collision-wall";
}

export function isEraseWallMode(tool: EditorTool): boolean {
  return tool.id === "erase-wall";
}

export function isBridgeMode(tool: EditorTool): boolean {
  return tool.id === "bridge";
}

export function isEraseBridgeMode(tool: EditorTool): boolean {
  return tool.id === "erase-bridge";
}

export function selectCollisionWallTool(): EditorTool {
  return { id: "collision-wall" };
}

export function selectEraseWallTool(): EditorTool {
  return { id: "erase-wall" };
}

export function selectBridgeTool(): EditorTool {
  return { id: "bridge" };
}

export function selectEraseBridgeTool(): EditorTool {
  return { id: "erase-bridge" };
}

export function isAuthoringTool(tool: EditorTool): boolean {
  return tool.id !== "select";
}

export function isDragPlaceProp(type: PropType): boolean {
  return type === "tree" || type === "rock" || type === "barrel";
}

export type { GateId, TerrainKind };
