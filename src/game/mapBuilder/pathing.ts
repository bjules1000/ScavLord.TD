import type { EditorLane, EditorMapDoc } from "./schema";

export function sameCell(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function isOrthogonalPair(a: [number, number], b: [number, number]): boolean {
  const dx = a[0] !== b[0];
  const dy = a[1] !== b[1];
  return dx !== dy;
}

/** Inclusive orthogonal cells from a to b. Empty when the pair is diagonal. */
export function cellsBetween(a: [number, number], b: [number, number]): Array<[number, number]> {
  if (a[0] !== b[0] && a[1] !== b[1]) return [];
  const out: Array<[number, number]> = [];
  if (a[0] === b[0]) {
    const step = b[1] >= a[1] ? 1 : -1;
    for (let y = a[1]; y !== b[1] + step; y += step) out.push([a[0], y]);
    return out;
  }
  const step = b[0] >= a[0] ? 1 : -1;
  for (let x = a[0]; x !== b[0] + step; x += step) out.push([x, a[1]]);
  return out;
}

export function pathCells(waypoints: Array<[number, number]>): Array<[number, number]> {
  if (waypoints.length === 0) return [];
  if (waypoints.length === 1) return [waypoints[0]!];
  const out: Array<[number, number]> = [];
  const seen = new Set<string>();
  const push = (c: [number, number]) => {
    const key = `${c[0]},${c[1]}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  for (let i = 0; i < waypoints.length - 1; i++) {
    const seg = cellsBetween(waypoints[i]!, waypoints[i + 1]!);
    if (!seg.length) return [];
    for (const c of seg) push(c);
  }
  return out;
}

export function onMapCells(
  cells: Array<[number, number]>,
  width: number,
  height: number,
): Array<[number, number]> {
  return cells.filter(([x, y]) => x >= 0 && y >= 0 && x < width && y < height);
}

export function lanesAtTile(doc: EditorMapDoc, tx: number, ty: number): string[] {
  return doc.lanes
    .filter((lane) => pathCells(lane.waypoints).some(([x, y]) => x === tx && y === ty))
    .map((lane) => lane.id);
}

export function nextLaneId(existing: readonly EditorLane[]): string {
  const used = new Set(existing.map((l) => l.id));
  const suggested = ["MAIN", "A", "B", "NORTH", "EAST", "SOUTH", "WEST"];
  for (const id of suggested) {
    if (!used.has(id)) return id;
  }
  let n = 1;
  while (used.has(`LANE_${n}`)) n += 1;
  return `LANE_${n}`;
}

export function isLegalPathTerrain(doc: EditorMapDoc, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) {
    return waypointInPlayableBounds(x, y, doc.width, doc.height);
  }
  return doc.terrain[y]![x] === "ROAD";
}

/** Cells that would be appended by a PATH click, or null if the step is illegal. */
export function pathAppendCells(
  doc: EditorMapDoc,
  waypoints: Array<[number, number]>,
  cell: [number, number],
): Array<[number, number]> | null {
  if (!isLegalPathTerrain(doc, cell[0], cell[1])) return null;
  const last = waypoints[waypoints.length - 1];
  if (!last) return [cell];
  if (sameCell(last, cell)) return null;
  if (!isOrthogonalPair(last, cell)) return null;
  const fill = cellsBetween(last, cell).slice(1);
  if (!fill.length) return null;
  if (fill.some(([x, y]) => !isLegalPathTerrain(doc, x, y))) return null;
  const occupied = new Set(pathCells(waypoints).map(([x, y]) => `${x},${y}`));
  if (fill.some(([x, y]) => occupied.has(`${x},${y}`))) return null;
  return fill;
}

export function laneLabelShort(id: string): string {
  const compact: Record<string, string> = { NORTH: "N", EAST: "E", SOUTH: "S", WEST: "W" };
  return compact[id] ?? id;
}

export function waypointInPlayableBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return x >= -1 && y >= -1 && x <= width && y <= height;
}
