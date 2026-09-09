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

/** A crossroads through the campfire at the center — cosmetic only, both kinds are walkable. */
function buildTerrain(): TerrainKind[][] {
  const rows: TerrainKind[][] = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row: TerrainKind[] = [];
    for (let x = 0; x < WIDTH; x++) {
      row.push(x === 12 || y === 9 ? "ROAD" : "GROUND");
    }
    rows.push(row);
  }
  return rows;
}

const PROPS: CampStationProp[] = [
  { id: "prop-1", type: "fire", tx: 12, ty: 9 },
  { id: "prop-2", type: "tent", tx: 12, ty: 5 },
  { id: "prop-3", type: "crate", tx: 6, ty: 9, hubAction: "supplies" },
  { id: "prop-4", type: "gun-bench", tx: 18, ty: 9, hubAction: "gear" },
  { id: "prop-5", type: "ops-table", tx: 9, ty: 13, hubAction: "skills" },
  { id: "prop-6", type: "map-table", tx: 15, ty: 13, hubAction: "region" },
  { id: "prop-7", type: "radio", tx: 12, ty: 13, hubAction: "radio" },
];

export const CAMP_MAP_DEF: CampMapDef = {
  id: "main-camp",
  displayName: "Main Camp",
  width: WIDTH,
  height: HEIGHT,
  palette: CAMP_PALETTE,
  terrain: buildTerrain(),
  props: PROPS,
};
