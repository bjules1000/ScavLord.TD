import type { MapDef } from "../map";
import { WOODS_MAP } from "./woods";

/** Expanded conquest prototype: Pine Cut copied onto a 30x20 authoring/play grid. */
export const WOODS_V2_MAP: MapDef = {
  ...WOODS_MAP,
  id: "woods-v2",
  name: "PINE CUT V2",
  width: 30,
  height: 20,
  desc: "Expanded Pine Cut conquest prototype. Clear entrenched sentries, then survive incoming waves.",
  geo: { x: 31, y: 30 },
  sector: "SECTOR N-3",
  path: WOODS_MAP.path.map(([x, y]) => [x, y]),
  water: (WOODS_MAP.water ?? []).map(([x, y]) => [x, y]),
  mountain: (WOODS_MAP.mountain ?? []).map(([x, y]) => [x, y]),
  highGround: (WOODS_MAP.highGround ?? []).map(([x, y]) => [x, y]),
  collisionWalls: (WOODS_MAP.collisionWalls ?? []).map((wall) => ({ ...wall })),
  bridges: (WOODS_MAP.bridges ?? []).map((bridge) => ({ ...bridge })),
  zones: (WOODS_MAP.zones ?? []).map((zone) => ({ ...zone, cells: zone.cells.map(([x, y]) => [x, y]) })),
  props: WOODS_MAP.props.map((prop) => ({ ...prop })),
  checkpoint: WOODS_MAP.checkpoint.map((part) => ({ ...part })),
  cover: WOODS_MAP.cover.map(([x, y, type]) => [x, y, type]),
  crates: WOODS_MAP.crates.map(([x, y]) => [x, y]),
  sentries: [
    { kind: "scav", tx: 6, ty: 4, facing: Math.PI },
    { kind: "sniperScav", tx: 12, ty: 9, facing: Math.PI },
    { kind: "raider", tx: 16, ty: 4, facing: Math.PI },
  ],
};
