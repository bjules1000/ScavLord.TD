import { inBounds, isWalkableTerrain, nextObjectId, occupantAt, terrainAt } from "./document";
import { edgeKey } from "./edges";
import { isOrthogonalPair } from "./pathing";
import type { CheckpointPart, CoverType, PropType } from "../map";
import type {
  EditorCheckpoint,
  EditorCover,
  EditorCrate,
  EditorEdgeObject,
  EditorGate,
  EditorMapDoc,
  EditorProp,
  EditorZone,
  GateId,
  SpecialZoneType,
  TerrainKind,
  TileEdge,
} from "./schema";

export function paintTiles(doc: EditorMapDoc, tiles: Array<[number, number]>, kind: TerrainKind): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const terrain = doc.terrain.map((row) => row.slice());
  let changed = false;
  for (const [x, y] of tiles) {
    if (!inBounds(doc, x, y)) continue;
    if (terrain[y]![x] === kind) continue;
    terrain[y]![x] = kind;
    changed = true;
  }
  return changed ? { ...doc, terrain } : doc;
}

export function eraseTiles(doc: EditorMapDoc, tiles: Array<[number, number]>): EditorMapDoc {
  return paintTiles(doc, tiles, "GROUND");
}

export function canPlaceOccupant(doc: EditorMapDoc, tx: number, ty: number): boolean {
  if (doc.status === "locked") return false;
  if (!inBounds(doc, tx, ty)) return false;
  const terrain = terrainAt(doc, tx, ty);
  if (!terrain || !isWalkableTerrain(terrain)) return false;
  return occupantAt(doc, tx, ty) === null;
}

export function placeProp(doc: EditorMapDoc, tx: number, ty: number, type: PropType): EditorMapDoc {
  if (!canPlaceOccupant(doc, tx, ty)) return doc;
  const next: EditorProp = { id: nextObjectId(doc, "prop"), type, tx, ty };
  return { ...doc, props: [...doc.props, next] };
}

export function placeCover(doc: EditorMapDoc, tx: number, ty: number, type: CoverType): EditorMapDoc {
  if (!canPlaceOccupant(doc, tx, ty)) return doc;
  const next: EditorCover = { id: nextObjectId(doc, "cover"), type, tx, ty };
  return { ...doc, cover: [...doc.cover, next] };
}

export function placeCrate(doc: EditorMapDoc, tx: number, ty: number): EditorMapDoc {
  if (!canPlaceOccupant(doc, tx, ty)) return doc;
  const next: EditorCrate = { id: nextObjectId(doc, "crate"), tx, ty };
  return { ...doc, crates: [...doc.crates, next] };
}

export function placeCheckpoint(
  doc: EditorMapDoc,
  tx: number,
  ty: number,
  type: CheckpointPart["type"],
): EditorMapDoc {
  if (!canPlaceOccupant(doc, tx, ty)) return doc;
  const next: EditorCheckpoint = { id: nextObjectId(doc, "cp"), type, tx, ty };
  return { ...doc, checkpoints: [...doc.checkpoints, next] };
}

export function placeEdgeObject(
  doc: EditorMapDoc,
  tx: number,
  ty: number,
  edge: TileEdge,
  type: EditorEdgeObject["type"],
): EditorMapDoc {
  if (doc.status === "locked") return doc;
  if (!inBounds(doc, tx, ty)) return doc;
  if (doc.edges.some((e) => e.tx === tx && e.ty === ty && e.edge === edge)) return doc;
  const next: EditorEdgeObject = { id: nextObjectId(doc, "edge"), type, tx, ty, edge };
  return { ...doc, edges: [...doc.edges, next] };
}

export function placeGate(
  doc: EditorMapDoc,
  id: GateId,
  laneId: string,
  tx: number,
  ty: number,
  edge: TileEdge,
): EditorMapDoc {
  if (doc.status === "locked") return doc;
  if (!inBounds(doc, tx, ty)) return doc;
  const next: EditorGate = { id, laneId, tx, ty, edge };
  return { ...doc, gates: [...doc.gates.filter((g) => g.id !== id), next] };
}

export function paintZoneCells(
  doc: EditorMapDoc,
  cells: Array<[number, number]>,
  zoneId: string | null,
  type: SpecialZoneType = "RESOURCE_SITE",
): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const valid = cells.filter(([x, y]) => inBounds(doc, x, y));
  if (!valid.length) return doc;
  const existing = zoneId ? doc.zones.find((z) => z.id === zoneId) : undefined;
  if (existing) {
    const have = new Set(existing.cells.map(([x, y]) => `${x},${y}`));
    const merged = existing.cells.slice();
    for (const c of valid) {
      const key = `${c[0]},${c[1]}`;
      if (have.has(key)) continue;
      have.add(key);
      merged.push(c);
    }
    return {
      ...doc,
      zones: doc.zones.map((z) => (z.id === existing.id ? { ...z, cells: merged } : z)),
    };
  }
  const created: EditorZone = {
    id: nextObjectId(doc, "zone"),
    type,
    name: type.replace("_", " "),
    cells: valid,
  };
  return { ...doc, zones: [...doc.zones, created] };
}

export function removeObject(doc: EditorMapDoc, id: string): EditorMapDoc {
  if (doc.status === "locked") return doc;
  return {
    ...doc,
    props: doc.props.filter((p) => p.id !== id),
    cover: doc.cover.filter((p) => p.id !== id),
    crates: doc.crates.filter((p) => p.id !== id),
    checkpoints: doc.checkpoints.filter((p) => p.id !== id),
    edges: doc.edges.filter((p) => p.id !== id),
    zones: doc.zones.filter((p) => p.id !== id),
    gates: doc.gates.filter((p) => p.id !== id),
  };
}

export function eraseOccupants(doc: EditorMapDoc, tiles: Array<[number, number]>): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const keys = new Set(tiles.map(([x, y]) => `${x},${y}`));
  return {
    ...doc,
    props: doc.props.filter((p) => !keys.has(`${p.tx},${p.ty}`)),
    cover: doc.cover.filter((p) => !keys.has(`${p.tx},${p.ty}`)),
    crates: doc.crates.filter((p) => !keys.has(`${p.tx},${p.ty}`)),
    checkpoints: doc.checkpoints.filter((p) => !keys.has(`${p.tx},${p.ty}`)),
    edges: doc.edges.filter((p) => !keys.has(`${p.tx},${p.ty}`)),
    gates: doc.gates.filter((p) => !keys.has(`${p.tx},${p.ty}`)),
    zones: doc.zones
      .map((z) => ({ ...z, cells: z.cells.filter(([x, y]) => !keys.has(`${x},${y}`)) }))
      .filter((z) => z.cells.length > 0),
  };
}

export function setLaneWaypoints(
  doc: EditorMapDoc,
  laneId: string,
  waypoints: Array<[number, number]>,
): EditorMapDoc {
  if (doc.status === "locked") return doc;
  return {
    ...doc,
    lanes: doc.lanes.map((l) => (l.id === laneId ? { ...l, waypoints: waypoints.map((w) => [w[0], w[1]] as [number, number]) } : l)),
  };
}

export function addLane(doc: EditorMapDoc, id: string): EditorMapDoc {
  if (doc.status === "locked") return doc;
  if (doc.lanes.some((l) => l.id === id)) return doc;
  return { ...doc, lanes: [...doc.lanes, { id, waypoints: [] }] };
}

export function removeLane(doc: EditorMapDoc, id: string): EditorMapDoc {
  if (doc.status === "locked") return doc;
  if (doc.lanes.length <= 1) return doc;
  return {
    ...doc,
    lanes: doc.lanes.filter((l) => l.id !== id),
    gates: doc.gates.filter((g) => g.laneId !== id),
  };
}

export function snapOffMap(
  tx: number,
  ty: number,
  localX: number,
  localY: number,
  width: number,
  height: number,
  tile: number,
): [number, number] {
  let x = tx;
  let y = ty;
  if (tx === 0 && localX < tile / 3) x = -1;
  if (tx === width - 1 && localX > (tile * 2) / 3) x = width;
  if (ty === 0 && localY < tile / 3) y = -1;
  if (ty === height - 1 && localY > (tile * 2) / 3) y = height;
  return [x, y];
}

export function applyPathClick(doc: EditorMapDoc, laneId: string, cell: [number, number]): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const lane = doc.lanes.find((l) => l.id === laneId);
  if (!lane) return doc;
  const last = lane.waypoints[lane.waypoints.length - 1];
  if (last && last[0] === cell[0] && last[1] === cell[1]) return doc;
  if (last && !isOrthogonalPair(last, cell)) return doc;
  return setLaneWaypoints(doc, laneId, [...lane.waypoints, cell]);
}

export function applySpawn(doc: EditorMapDoc, laneId: string, cell: [number, number]): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const lane = doc.lanes.find((l) => l.id === laneId);
  if (!lane) return doc;
  if (!lane.waypoints.length) return setLaneWaypoints(doc, laneId, [cell]);
  return setLaneWaypoints(doc, laneId, [cell, ...lane.waypoints.slice(1)]);
}

export function applyEndpoint(doc: EditorMapDoc, laneId: string, cell: [number, number]): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const lane = doc.lanes.find((l) => l.id === laneId);
  if (!lane) return doc;
  if (!lane.waypoints.length) return setLaneWaypoints(doc, laneId, [cell]);
  if (lane.waypoints.length === 1) return setLaneWaypoints(doc, laneId, [lane.waypoints[0]!, cell]);
  return setLaneWaypoints(doc, laneId, [...lane.waypoints.slice(0, -1), cell]);
}

export function renameLane(doc: EditorMapDoc, from: string, to: string): EditorMapDoc {
  if (doc.status === "locked") return doc;
  if (!to || doc.lanes.some((l) => l.id === to)) return doc;
  return {
    ...doc,
    lanes: doc.lanes.map((l) => (l.id === from ? { ...l, id: to } : l)),
    gates: doc.gates.map((g) => (g.laneId === from ? { ...g, laneId: to } : g)),
  };
}

export { edgeKey };
