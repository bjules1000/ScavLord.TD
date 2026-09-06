import type { MapDef, PropType } from "../map";
import type { EnemyKind } from "../types";
import { WOODS_MAP } from "./woods";

const TERRAIN = [
  "...HMMMMMMMMMMMH.R...MMR......",
  "...HHHMMMMMMMHHH.R..MMMR......",
  "..HHHHHHMMMHHH...R..MMRR.MM.MM",
  ".RRRHH......HH.RRRRRRRR.MM...M",
  ".R.RHH.RRRRRHH.R....MMHHHM...M",
  ".R.RHH.R...R...R....MMHHHMM..M",
  ".RHRRRRR...R...R....MHHHHHMM..",
  ".RHH.......RRRRR....HHHHHHHMHH",
  ".RRHHHHHHHHHHHH......HHHH.MMHH",
  "..R.HHHHHHHHHHH...........MMHH",
  ".RR..HHMMMMMMHHHH.............",
  ".R...HHMMMMMMMMMMM...HHH......",
  ".R...HMMMMMMMMMMMMM..HHHH...HH",
  "RR...MMMMMMMMM......HHHHH...HH",
  ".....MMMMM..........HHHHH...HH",
  "....MM..............MMHHMMMMHH",
  "..M................MMM..MMMMMH",
  "HMMMM..............MM..MMMMMM.",
  "HHMMMM...................MM...",
  "HHHHHHH.......................",
] as const;

function terrainCells(mark: "R" | "H" | "M"): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  TERRAIN.forEach((row, ty) => [...row].forEach((cell, tx) => {
    if (cell === mark) cells.push([tx, ty]);
  }));
  return cells;
}

function parseProps(encoded: string): NonNullable<MapDef["props"]> {
  return encoded.split(";").map((entry) => {
    const [type, x, y] = entry.split(",");
    return { type: type as PropType, tx: Number(x), ty: Number(y) };
  });
}

function parseSentries(encoded: string): NonNullable<MapDef["sentries"]> {
  return encoded.split(";").map((entry) => {
    const [kind, x, y] = entry.split(",");
    return { kind: kind as EnemyKind, tx: Number(x), ty: Number(y), facing: Math.PI };
  });
}

function parseWalls(encoded: string): NonNullable<MapDef["collisionWalls"]> {
  return encoded.split(";").map((entry) => {
    const [x, y, edge, kind] = entry.split(",");
    const wall = { tx: Number(x), ty: Number(y), edge: edge as "N" | "E" | "S" | "W" };
    return kind === "S" ? { ...wall, kind: "SOLID" as const } : wall;
  });
}

const PROPS = "tree,0,0;tree,1,0;rock,2,0;tree,3,0;tree,15,0;tree,19,0;tree,0,1;tree,5,1;tree,18,2;tree,13,3;rock,2,4;tree,19,4;tree,2,5;rock,6,5;tree,10,5;tree,17,5;tree,18,5;tree,19,5;tree,18,6;tree,19,6;tree,4,7;tree,5,7;tree,7,8;tree,12,8;tree,17,8;tree,19,8;tree,10,9;tree,18,9;tree,19,9;rock,0,10;tree,6,10;tree,19,10;tree,0,11;tree,0,12;tree,2,12;tree,4,12;tree,19,12;tree,16,13;tree,13,14;tree,16,14;tree,9,15;forklift,11,15;tree,7,16;office,13,16;office,14,16;tree,17,16;truck,10,17;office,12,18;office,13,18;office,14,18;tree,8,19;tree,18,19";

const SENTRIES = "scav,8,3;scav,6,4;sniperScav,12,4;raider,16,4;sniperScav,26,4;sniperScav,28,4;scav,9,5;scav,22,5;sniperScav,21,8;sniperScav,12,9;raider,17,9;scav,3,10;raider,5,10;raider,18,10;scav,25,10;scav,2,11;scav,26,11;sniperScav,24,12;sniperScav,28,13;scav,2,14;raider,12,16;raider,15,16;sniperScav,0,17;boss,14,17;raider,11,18;raider,16,18;sniperScav,6,19;scav,21,19";

const WALLS =
  "2,0,E,M;3,0,E,M;3,0,N,M;4,0,N,M;4,0,S,M;5,0,S,M;13,0,S,M;14,0,E,M;14,0,N,M;14,0,S,M;15,0,E,M;2,1,E,M;5,1,E,M;6,1,S,M;7,1,S,M;11,1,S,M;12,1,E,M;12,1,S,M;14,1,S,M;15,1,S,M;1,2,E,M;2,2,S,M;3,2,S,M;7,2,E,M;7,2,S,M;8,2,S,M;9,2,S,M;10,2,E,M;10,2,S,M;13,2,E,M;3,3,E,M;5,3,E,M;11,3,E,M;13,3,E,M;22,3,S,M;3,4,E,M;5,4,E,M;11,4,E,M;12,4,S,M;13,4,E,M;2,5,S,M;3,5,E,M;4,5,S,M;5,5,E,M;5,5,S,M;1,6,E,M;2,6,E,M;3,6,S,M;26,6,S,M;28,6,S,M;1,7,E,M;2,7,S,M;3,7,E,M;4,7,S,M;5,7,S,M;6,7,S,M;7,7,S,M;8,7,S,M;10,7,S,M;11,7,S,M;12,7,S,M;14,7,S,M;19,7,E,M;20,7,S,M;26,7,E,M;26,7,S,M;27,7,E,M;2,8,E,M;3,8,S,M;14,8,E,M;20,8,E,M;21,8,S,M;22,8,S,M;23,8,S,M;24,8,E,M;24,8,S,M;27,8,E,M;3,9,E,M;4,9,S,M;7,9,S,M;8,9,S,M;9,9,S,M;10,9,S,S;11,9,S,S;12,9,S,S;14,9,E,M;15,9,S,M;27,9,E,M;29,9,S,M;4,10,E,M;6,10,E,M;12,10,E,S;13,10,S,S;14,10,S,S;15,10,S,S;16,10,E,M;16,10,S,S;17,10,S,S;21,10,S,M;22,10,S,M;23,10,S,M;6,11,E,M;6,11,S,M;17,11,E,S;18,11,S,S;20,11,E,M;23,11,E,M;24,11,S,M;29,11,S,M;4,12,E,M;5,12,E,M;5,12,S,M;6,12,S,M;14,12,S,S;15,12,S,S;16,12,S,S;17,12,S,S;18,12,E,S;18,12,S,S;20,12,E,M;20,12,S,M;24,12,E,M;27,12,E,M;10,13,S,S;11,13,S,S;12,13,S,S;13,13,E,S;13,13,S,S;19,13,E,M;24,13,E,M;27,13,E,M;9,14,E,S;9,14,S,S;11,14,S,M;20,14,S,S;21,14,S,S;27,14,E,M;10,15,E,M;11,15,E,M;11,15,S,M;13,15,S,S;14,15,S,S;19,15,E,S;19,15,S,S;21,15,E,S;23,15,S,M;27,15,E,M;28,15,S,M;10,16,S,M;12,16,E,S;13,16,S,S;14,16,E,S;14,16,S,S;18,16,E,S;21,16,E,S;21,16,S,S;28,16,E,M;9,17,E,M;10,17,E,M;10,17,S,M;12,17,S,S;13,17,S,S;14,17,S,S;18,17,E,S;19,17,S,S;20,17,E,S;20,17,S,S;11,18,E,S;12,18,S,S;13,18,S,S;14,18,E,S;14,18,S,S";

/** Locked map-builder export imported on 2026-09-06. */
export const WOODS_V2_MAP: MapDef = {
  ...WOODS_MAP,
  id: "woods-v2",
  name: "PINE CUT V2",
  width: 30,
  height: 20,
  desc: "Expanded Pine Cut conquest prototype. Clear entrenched sentries, then survive incoming waves.",
  geo: { x: 31, y: 30 },
  sector: "SECTOR N-3",
  path: [
    [-1, 13], [0, 13], [1, 13], [1, 12], [1, 11], [1, 10], [2, 10], [2, 9], [2, 8], [1, 8],
    [1, 7], [1, 6], [1, 5], [1, 4], [1, 3], [2, 3], [3, 3], [3, 4], [3, 5], [3, 6],
    [4, 6], [5, 6], [6, 6], [7, 6], [7, 5], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],
    [11, 5], [11, 6], [11, 7], [12, 7], [13, 7], [14, 7], [15, 7], [15, 6], [15, 5], [15, 4],
    [15, 3], [16, 3], [17, 3], [17, 2], [17, 1], [17, 0], [17, -1],
  ],
  road: terrainCells("R"),
  water: [],
  mountain: terrainCells("M"),
  highGround: terrainCells("H"),
  collisionWalls: parseWalls(WALLS),
  bridges: [
    { tx: 13, ty: 5, orientation: "V" }, { tx: 13, ty: 6, orientation: "V" },
    { tx: 13, ty: 7, orientation: "V" }, { tx: 28, ty: 10, orientation: "V" },
    { tx: 28, ty: 11, orientation: "V" },
  ],
  zones: [{ type: "RESOURCE_SITE", name: "RESOURCE SITE", cells: [[25, 0], [26, 0], [27, 0], [27, 1], [28, 1], [29, 1]] }],
  props: parseProps(PROPS),
  checkpoint: [{ type: "gate2", tx: 18, ty: 3 }],
  cover: [],
  crates: [[3, 12], [14, 13], [6, 15], [24, 18]],
  sentries: parseSentries(SENTRIES),
};
