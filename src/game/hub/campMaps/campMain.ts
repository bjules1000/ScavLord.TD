import type { CampMapDef, CampStationProp } from "../campMap";
import type { Palette } from "../../map";
import type { TerrainKind } from "../../mapBuilder/schema";

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
  "MMMMMMMGGGGGMMMMMMMMMMMM",
  "MMMMHHHGGGGGGMMMMMMMMMMM",
  "MMHHHHHGGGGGGGMMMMMMMMMM",
  "MHHHHHGGGGGGGGGGMMMMMMMM",
  "HHHHHHGGGGGGGGGGGMMMMMMM",
  "HHHHHHGGGGGGGGGGGGMMMMMM",
  "HMMHHGGGGGGGGGGGGGGMMMMM",
  "MMMMGGGGGGGGGGGGGGGMMMMM",
  "MMMMGGGGGGGGGGGGGGGMMMMM",
  "MMMGGGGGGGGGGGGGGGGGGGMM",
  "MMMGGGGGGGGGGGGGGGGGGGGM",
  "MMGGGGGMMMGGGGGGGGGGGGGG",
  "GGGGGGMMMMMGGGGGGGGGGGGG",
  "GGGGGGMMMMMGGGGGGGGGGGWW",
  "GGGGGMMMMMMMGGGGGGGGGWWW",
  "GGGGGMMMMMMMGMMMGGGWWWWW",
  "GGGGMMMMMMMMMMMMMGWWWWWW",
  "GGMMMMMMMMMMMMMMMWWWWWWW",
] as const;

function buildTerrain(): TerrainKind[][] {
  return TERRAIN_ROWS.map((row) => [...row].map((tile) => TERRAIN_LEGEND[tile]!));
}

const PROPS: CampStationProp[] = [
  { id: "prop-1", type: "map-table", tx: 12, ty: 1, hubAction: "region" },
  { id: "prop-2", type: "crate", tx: 14, ty: 3, hubAction: "supplies" },
  { id: "prop-3", type: "crate", tx: 15, ty: 3 },
  { id: "prop-4", type: "crate", tx: 14, ty: 4 },
  { id: "prop-5", type: "crate", tx: 15, ty: 4 },
  { id: "prop-6", type: "gun-bench", tx: 16, ty: 4, hubAction: "gear" },
  { id: "prop-7", type: "tent", tx: 14, ty: 5 },
  { id: "prop-8", type: "radio", tx: 18, ty: 6, hubAction: "radio" },
  { id: "prop-9", type: "fire", tx: 14, ty: 7 },
  { id: "prop-10", type: "ops-table", tx: 18, ty: 7, hubAction: "skills" },
  { id: "prop-range-table", type: "range-table", tx: 5, ty: 12, hubAction: "range" },
  { id: "prop-range-dummy", type: "range-dummy", tx: 5, ty: 9 },
];

/** Inclusive [tx0,ty0]-[tx1,ty1] rectangle as explicit [x, y] cells, matching the
 * builder's cell-based EditorZone shape. */
function rectCells(tx0: number, ty0: number, tx1: number, ty1: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) cells.push([tx, ty]);
  }
  return cells;
}

export const CAMP_MAP_DEF: CampMapDef = {
  id: "main-camp",
  displayName: "Main Camp",
  width: WIDTH,
  height: HEIGHT,
  palette: CAMP_PALETTE,
  terrain: buildTerrain(),
  props: PROPS,
  zones: [
    {
      id: "zone-range",
      type: "SHOOTING_RANGE",
      name: "SHOOTING RANGE",
      cells: rectCells(3, 8, 8, 13),
    },
  ],
};
