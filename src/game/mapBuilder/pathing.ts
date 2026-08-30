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

export function waypointInPlayableBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return x >= -1 && y >= -1 && x <= width && y <= height;
}
