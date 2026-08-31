import type { MapDef } from "./map";

export interface MapLaneDef {
  id: string;
  path: Array<[number, number]>;
}

/** MAIN first when present, then the remaining authored lanes. */
export function mapLaneDefs(def: MapDef): MapLaneDef[] {
  if (def.lanes && def.lanes.length > 0) {
    const main = def.lanes.find((l) => l.id === "MAIN");
    const rest = def.lanes.filter((l) => l.id !== "MAIN");
    return main ? [main, ...rest] : def.lanes.slice();
  }
  return [{ id: "MAIN", path: def.path }];
}

/** Round-robin across lanes. Spawn 0 → lane 0 (MAIN), spawn 1 → lane 1 (A), … */
export function assignSpawnLane(spawnIndex: number, laneCount: number): number {
  if (laneCount <= 1) return 0;
  return ((spawnIndex % laneCount) + laneCount) % laneCount;
}

/** Fraction of that enemy's own route, so FIRST/LAST stay fair across unequal lanes. */
export function lanePathProgress(seg: number, t: number, segCount: number): number {
  return (seg + t) / Math.max(1, segCount);
}
