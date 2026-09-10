import type { CampMapDef, CampStationProp } from "../campMap";
import type { Palette } from "../../map";
import type { EditorZone, TerrainKind } from "../../mapBuilder/schema";

const WIDTH = 24;
const HEIGHT = 18;

/** Matches the map editor's DEFAULT_EDITOR_PALETTE. Duplicated as a literal so the shipped
 * hub bundle doesn't pull in the dev-only mapBuilder module graph just for a color constant. */
const CAMP_PALETTE: Palette = {
  grassA: "#2e3a24",
  grassB: "#27321f",
  grassC: "#222c1b",
  speckLight: "#3a4a2a",
  speckDark: "#1b2415",
  roadOuter: "#3a3328",
  roadMid: "#4a4034",
  roadInner: "#5b503f",
  roadLine: "#6d6250",
};

const TERRAIN_LEGEND: Record<string, TerrainKind> = {
  G: "GROUND",
  H: "HIGH_GROUND",
  M: "MOUNTAIN",
  W: "WATER",
};

/** Authored in the camp map editor. One character represents one terrain tile. */
const TERRAIN_ROWS = [
  "MMMMMMMMMGGGMMMMMMMMMMMM",
  "MMMMMMMGGGGGGMMMMMMMMMMM",
  "MMHHGGGGGGGGGGMMMMMMMMMM",
  "MHHHGGGGGGGGGGGGMMMMMMMM",
  "MHHHGGGGGGGGGGGGGMMMMMMM",
  "MHHHHGGGGGGGGGGGGGMMMMMM",
  "MHHHHHGGGGGGGGGGGGGMMMMM",
  "MHHHHHHGGGGGGGGGGGGMMMMM",
  "MMHHHHHGGGGGGGGGGGGMMMMM",
  "MMMHHHGGGGGGGGGGGGGGGGMM",
  "MMMMHGGGGGGGGGGGGGGGGGGM",
  "MMMMGGGGGGGGGGGGGGGGGGGG",
  "MMMGGGGGMMMGGGGGGGGGGGGG",
  "MMGGGGMMMMMGGGGGGGGGGGWW",
  "MGGGGMMMMMMMGGGGGGGGGWWW",
  "GGGGGMMMMMMMGMMMGGGWWWWW",
  "GGGGMMMMMMMMMMMMMGWWWWWW",
  "GGMMMMMMMMMMMMMMMWWWWWWW",
] as const;

function buildTerrain(): TerrainKind[][] {
  return TERRAIN_ROWS.map((row) => [...row].map((tile) => TERRAIN_LEGEND[tile]!));
}

/** Authored in the camp map editor (main-camp.camp.json export). The range-table prop
 * had no hubAction in that export — re-added here so the range station stays reachable. */
const PROPS: CampStationProp[] = [
  { id: "prop-1", type: "map-table", tx: 12, ty: 1, hubAction: "region" },
  { id: "prop-2", type: "range-table", tx: 4, ty: 2, hubAction: "range" },
  { id: "prop-3", type: "crate", tx: 14, ty: 3, hubAction: "supplies" },
  { id: "prop-4", type: "crate", tx: 15, ty: 3 },
  { id: "prop-5", type: "range-dummy", tx: 1, ty: 4 },
  { id: "prop-6", type: "crate", tx: 14, ty: 4 },
  { id: "prop-7", type: "crate", tx: 15, ty: 4 },
  { id: "prop-8", type: "gun-bench", tx: 16, ty: 4, hubAction: "gear" },
  { id: "prop-9", type: "tent", tx: 14, ty: 5 },
  { id: "prop-10", type: "range-dummy", tx: 1, ty: 6 },
  { id: "prop-11", type: "radio", tx: 18, ty: 6, hubAction: "radio" },
  { id: "prop-12", type: "fire", tx: 14, ty: 7 },
  { id: "prop-13", type: "ops-table", tx: 18, ty: 7, hubAction: "skills" },
];

/** Only the zone enclosing the range table/dummies is kept — the export also carried a
 * leftover "zone-range" rectangle from before the range was moved, dropped here.
 * [3,2]/[3,3]/[4,3]/[2,2]/[6,2]/[6,3] are added on top of the exported cells: none of
 * the walkable tiles within interact range of the range-table prop at (4,2) (its own
 * tile is prop-occupied and unwalkable) were covered by the exported zone, so standing
 * anywhere near enough to interact with the table left the player just outside the
 * zone and weapon test mode immediately auto-deactivated. */
const ZONES: EditorZone[] = [
  {
    id: "zone-range",
    type: "SHOOTING_RANGE",
    name: "SHOOTING RANGE",
    cells: [
      [5, 2], [5, 3], [5, 4], [4, 4], [4, 5], [3, 6], [3, 7], [2, 7], [2, 8], [1, 8],
      [1, 2], [1, 3], [2, 3], [3, 4], [4, 6], [5, 6], [5, 7], [5, 8], [6, 8],
      [3, 2], [3, 3], [4, 3], [2, 2], [6, 2], [6, 3],
    ],
  },
];

export const CAMP_MAP_DEF: CampMapDef = {
  id: "main-camp",
  displayName: "Main Camp",
  width: WIDTH,
  height: HEIGHT,
  palette: CAMP_PALETTE,
  terrain: buildTerrain(),
  props: PROPS,
  zones: ZONES,
};
