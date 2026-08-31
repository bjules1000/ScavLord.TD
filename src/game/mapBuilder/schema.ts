import type { CheckpointPart, CoverType, Palette, PropType, WaveMods } from "../map";

/** Dev-only authoring schema. Gameplay saves use `kolkhoz-meta-v5`. */
export const MAP_BUILDER_SCHEMA_VERSION = 1;
export const MAP_BUILDER_STORAGE_KEY = "scavlord.dev.mapBuilder.v1";
export const HISTORY_LIMIT = 80;

export const TERRAIN_KINDS = ["GROUND", "ROAD", "WATER", "MOUNTAIN", "HIGH_GROUND"] as const;
export type TerrainKind = (typeof TERRAIN_KINDS)[number];

export const TILE_EDGES = ["N", "E", "S", "W"] as const;
export type TileEdge = (typeof TILE_EDGES)[number];

export const SUGGESTED_LANE_IDS = ["MAIN", "A", "B", "NORTH", "EAST", "SOUTH", "WEST"] as const;
export const GATE_IDS = ["NORTH", "EAST", "SOUTH", "WEST"] as const;
export type GateId = (typeof GATE_IDS)[number];

export const SPECIAL_ZONE_TYPES = ["RESOURCE_SITE"] as const;
export type SpecialZoneType = (typeof SPECIAL_ZONE_TYPES)[number];

export const PROP_TYPES: PropType[] = [
  "tree",
  "rock",
  "crate",
  "barrel",
  "hut",
  "truck",
  "tanker",
  "forklift",
  "office",
];

export const COVER_TYPES: CoverType[] = ["full", "half"];
export const CHECKPOINT_TYPES: CheckpointPart["type"][] = ["booth", "gate", "gate2", "post"];
export const EDGE_OBJECT_TYPES = ["fence", "wall"] as const;
export type EdgeObjectType = (typeof EDGE_OBJECT_TYPES)[number];

export interface BoundaryPort {
  tx: number;
  ty: number;
  edge: TileEdge;
}

export interface EditorLane {
  id: string;
  waypoints: Array<[number, number]>;
  spawn: BoundaryPort | null;
  endpoint: BoundaryPort | null;
}

export interface EditorProp {
  id: string;
  type: PropType;
  tx: number;
  ty: number;
}

export interface EditorCover {
  id: string;
  type: CoverType;
  tx: number;
  ty: number;
}

export interface EditorCrate {
  id: string;
  tx: number;
  ty: number;
}

export interface EditorCheckpoint {
  id: string;
  type: CheckpointPart["type"];
  tx: number;
  ty: number;
}

export interface EditorEdgeObject {
  id: string;
  type: EdgeObjectType;
  tx: number;
  ty: number;
  edge: TileEdge;
}

export interface EditorGate {
  id: GateId;
  laneId: string;
  tx: number;
  ty: number;
  edge: TileEdge;
}

export interface EditorZone {
  id: string;
  type: SpecialZoneType;
  name: string;
  cells: Array<[number, number]>;
}

/** Canonical tile-edge collision/LOS blocker. See walls.ts for shared-edge identity. */
export interface CollisionWall {
  tx: number;
  ty: number;
  edge: TileEdge;
}

export const BRIDGE_ORIENTATIONS = ["H", "V"] as const;
export type BridgeOrientation = (typeof BRIDGE_ORIENTATIONS)[number];

/** Elevated walkable overlay. Base terrain under the tile is stored separately. */
export interface BridgeTile {
  tx: number;
  ty: number;
  orientation: BridgeOrientation;
}

export type SurfaceLevel = "GROUND" | "HIGH";

export interface EditorMapDoc {
  schemaVersion: typeof MAP_BUILDER_SCHEMA_VERSION;
  id: string;
  displayName: string;
  width: number;
  height: number;
  status: "draft" | "locked";
  revision: number;
  sourceMapId: string | null;
  palette: Palette;
  threat: 1 | 2 | 3;
  threatLabel: string;
  desc: string;
  hpMult: number;
  lootMult: number;
  waveMods: WaveMods | null;
  sector: string;
  geo: { x: number; y: number };
  terrain: TerrainKind[][];
  lanes: EditorLane[];
  props: EditorProp[];
  cover: EditorCover[];
  crates: EditorCrate[];
  checkpoints: EditorCheckpoint[];
  edges: EditorEdgeObject[];
  gates: EditorGate[];
  zones: EditorZone[];
  /** Invisible cliff/LOS blockers on canonical tile edges. Empty until authored. */
  collisionWalls: CollisionWall[];
  /** Suspended-bridge overlay tiles. Empty until authored. Independent of base terrain. */
  bridges: BridgeTile[];
}

export interface EditorStoreV1 {
  version: typeof MAP_BUILDER_SCHEMA_VERSION;
  activeId: string;
  docs: Record<string, EditorMapDoc>;
}

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export const MIN_MAP_SIZE = 8;
export const MAX_MAP_WIDTH = 40;
export const MAX_MAP_HEIGHT = 24;

export function isTerrainKind(value: unknown): value is TerrainKind {
  return typeof value === "string" && (TERRAIN_KINDS as readonly string[]).includes(value);
}

export function cloneDoc(doc: EditorMapDoc): EditorMapDoc {
  return structuredClone(doc);
}
