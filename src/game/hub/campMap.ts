import type { HubAction } from "../campActions";
import type { Palette, PropType } from "../map";
import type { CampPropType, EditorZone, SpecialZoneType, TerrainKind } from "../mapBuilder/schema";

export interface CampStationProp {
  id: string;
  type: PropType | CampPropType;
  tx: number;
  ty: number;
  /** Which hub screen this prop opens when interacted with. Undefined = decorative. */
  hubAction?: HubAction;
}

/** Shipped, runtime-facing camp layout. Hand-copied from a locked MapBuilder camp export. */
export interface CampMapDef {
  id: string;
  displayName: string;
  width: number;
  height: number;
  palette: Palette;
  terrain: TerrainKind[][];
  props: CampStationProp[];
  zones?: EditorZone[];
}

export interface CampGameMap {
  def: CampMapDef;
  width: number;
  height: number;
  terrain: TerrainKind[][];
  props: CampStationProp[];
  zones: EditorZone[];
}

export function buildCampMap(def: CampMapDef): CampGameMap {
  return {
    def,
    width: def.width,
    height: def.height,
    terrain: def.terrain,
    props: def.props,
    zones: def.zones ?? [],
  };
}

/** "tx,ty" cell keys for the first zone of the given type — empty if the map has none. */
export function campZoneCellSet(map: CampGameMap, type: SpecialZoneType): Set<string> {
  const zone = map.zones.find((z) => z.type === type);
  return new Set(zone ? zone.cells.map(([x, y]) => `${x},${y}`) : []);
}

function isWalkableCampTerrain(kind: TerrainKind): boolean {
  return kind === "GROUND" || kind === "ROAD" || kind === "HIGH_GROUND";
}

/** A tile is walkable if its terrain allows it and no prop occupies it. */
export function campWalkable(map: CampGameMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  const kind = map.terrain[ty]?.[tx];
  if (!kind || !isWalkableCampTerrain(kind)) return false;
  return !map.props.some((p) => p.tx === tx && p.ty === ty);
}

export function stationAt(map: CampGameMap, tx: number, ty: number): CampStationProp | undefined {
  return map.props.find((p) => p.tx === tx && p.ty === ty && p.hubAction != null);
}
