import { DEFAULT_EDITOR_PALETTE, emptyTerrain, validateNewMapInput } from "./document";
import { emptyVisualTileLayers } from "./visualTiles";
import { MAP_BUILDER_SCHEMA_VERSION, type EditorMapDoc } from "./schema";

export const DEFAULT_CAMP_WIDTH = 24;
export const DEFAULT_CAMP_HEIGHT = 18;

export function createBlankCampMap(input: {
  displayName: string;
  id: string;
  width?: number;
  height?: number;
}): EditorMapDoc {
  const width = input.width ?? DEFAULT_CAMP_WIDTH;
  const height = input.height ?? DEFAULT_CAMP_HEIGHT;
  const err = validateNewMapInput({
    displayName: input.displayName,
    id: input.id,
    width,
    height,
  });
  if (err) throw new Error(err);
  return {
    schemaVersion: MAP_BUILDER_SCHEMA_VERSION,
    mapType: "camp",
    id: input.id,
    displayName: input.displayName.trim(),
    width,
    height,
    status: "draft",
    revision: 1,
    sourceMapId: null,
    palette: DEFAULT_EDITOR_PALETTE,
    threat: 2,
    threatLabel: "MEDIUM THREAT",
    desc: "Camp layout draft.",
    hpMult: 1,
    lootMult: 1,
    waveMods: null,
    sector: "CAMP",
    geo: { x: 50, y: 50 },
    terrain: emptyTerrain(width, height),
    lanes: [],
    props: [],
    cover: [],
    crates: [],
    extraction: [],
    sentries: [],
    checkpoints: [],
    edges: [],
    gates: [],
    zones: [],
    collisionWalls: [],
    bridges: [],
    tileset: null,
    visualLayers: emptyVisualTileLayers(),
  };
}

export function isCampDoc(doc: Pick<EditorMapDoc, "mapType">): boolean {
  return doc.mapType === "camp";
}

export function isRaidDoc(doc: Pick<EditorMapDoc, "mapType">): boolean {
  return doc.mapType !== "camp";
}
