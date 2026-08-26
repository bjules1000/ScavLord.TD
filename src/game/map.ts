import { COLS, ROWS, TILE } from "./data";

export type PropType =
  | "crate"
  | "tree"
  | "rock"
  | "barrel"
  | "hut"
  | "truck"
  | "tanker"
  | "forklift"
  | "office";
export type Prop = { tx: number; ty: number; type: PropType };
export type CheckpointPart = { tx: number; ty: number; type: "booth" | "gate" | "gate2" | "post" };
export type CoverType = "full" | "half";
export type CoverPiece = { tx: number; ty: number; type: CoverType };

export interface Palette {
  grassA: string;
  grassB: string;
  grassC: string;
  speckLight: string;
  speckDark: string;
  roadOuter: string;
  roadMid: string;
  roadInner: string;
  roadLine: string;
}

export interface WaveMods {
  /** multiplier on enemy counts per wave */
  countMult: number;
  /** shift (in waves) before heavier enemy types join; positive = later */
  heavyDelay: number;
}

export interface MapDef {
  id: string;
  name: string;
  threat: 1 | 2 | 3;
  threatLabel: string;
  desc: string;
  /** enemy hp / speed multiplier */
  hpMult: number;
  /** payout & loot quality multiplier */
  lootMult: number;
  /** wave composition tuning: fewer / later heavy enemies on easy maps */
  waveMods?: WaveMods;
  /** position on the region map, 0..100 percent */
  geo: { x: number; y: number };
  /** short callsign shown on the region map */
  sector: string;
  path: Array<[number, number]>;
  props: Prop[];
  checkpoint: CheckpointPart[];
  cover: Array<[number, number, CoverType]>;
  crates: Array<[number, number]>;
  palette: Palette;
}


export interface GameMap {
  def: MapDef;
  PIX: Array<[number, number]>;
  SEG_LEN: number[];
  BLOCKED: boolean[][];
  PROPS: Prop[];
  CHECKPOINT: CheckpointPart[];
  COVER: CoverPiece[];
  CRATES: Array<{ tx: number; ty: number }>;
}

const WOODS_PAL: Palette = {
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

const KOLKHOZ_PAL: Palette = {
  grassA: "#343b2a",
  grassB: "#2d3425",
  grassC: "#272d20",
  speckLight: "#3d472f",
  speckDark: "#20261b",
  roadOuter: "#3a3328",
  roadMid: "#4a4437",
  roadInner: "#585141",
  roadLine: "#6b6252",
};

const FACTORY_PAL: Palette = {
  grassA: "#2c2e32",
  grassB: "#26282c",
  grassC: "#212327",
  speckLight: "#3a3d43",
  speckDark: "#1a1c20",
  roadOuter: "#2f3136",
  roadMid: "#3d4046",
  roadInner: "#4b4f56",
  roadLine: "#6a6f78",
};

export const MAP_DEFS: MapDef[] = [
  {
    id: "woods",
    name: "PINE CUT",
    threat: 1,
    threatLabel: "LOW THREAT",
    desc: "Long winding trail through the pines. Slow scav pressure, lots of room to set up.",
    hpMult: 0.85,
    lootMult: 0.85,
    waveMods: { countMult: 0.6, heavyDelay: 3 },
    geo: { x: 22, y: 30 },
    sector: "SECTOR N-2",
    palette: WOODS_PAL,
    path: [
      [-1, 1],
      [4, 1],
      [4, 5],
      [8, 5],
      [8, 1],
      [13, 1],
      [13, 8],
      [6, 8],
      [6, 11],
      [17, 11],
      [17, 5],
      [20, 5],
    ],
    props: [
      { tx: 1, ty: 3, type: "tree" },
      { tx: 2, ty: 7, type: "tree" },
      { tx: 6, ty: 3, type: "tree" },
      { tx: 10, ty: 3, type: "tree" },
      { tx: 11, ty: 6, type: "hut" },
      { tx: 15, ty: 2, type: "tree" },
      { tx: 18, ty: 2, type: "tree" },
      { tx: 19, ty: 8, type: "tree" },
      { tx: 3, ty: 12, type: "tree" },
      { tx: 9, ty: 9, type: "rock" },
      { tx: 15, ty: 8, type: "truck" },
      { tx: 0, ty: 10, type: "rock" },
      { tx: 12, ty: 12, type: "barrel" },
    ],
    checkpoint: [{ tx: 2, ty: 0, type: "post" }],
    cover: [
      [3, 3, "half"],
      [7, 3, "full"],
      [12, 6, "half"],
      [5, 9, "full"],
      [16, 9, "half"],
      [14, 4, "full"],
    ],
    crates: [
      [1, 5],
      [10, 10],
      [18, 6],
    ],
  },
  {
    id: "kolkhoz",
    name: "GRAIN GATE",
    threat: 2,
    threatLabel: "MEDIUM THREAT",
    desc: "Old collective-farm checkpoint. Balanced lanes, hard cover near the gates.",
    hpMult: 1,
    lootMult: 1,
    geo: { x: 52, y: 58 },
    sector: "SECTOR C-7",
    palette: KOLKHOZ_PAL,
    path: [
      [-1, 2],
      [5, 2],
      [5, 6],
      [1, 6],
      [1, 10],
      [11, 10],
      [11, 4],
      [16, 4],
      [16, 9],
      [20, 9],
    ],
    props: [
      { tx: 8, ty: 1, type: "hut" },
      { tx: 14, ty: 1, type: "tree" },
      { tx: 17, ty: 1, type: "tree" },
      { tx: 18, ty: 2, type: "rock" },
      { tx: 9, ty: 4, type: "crate" },
      { tx: 8, ty: 6, type: "barrel" },
      { tx: 3, ty: 8, type: "tree" },
      { tx: 13, ty: 7, type: "hut" },
      { tx: 6, ty: 11, type: "barrel" },
      { tx: 15, ty: 11, type: "tree" },
      { tx: 18, ty: 6, type: "rock" },
      { tx: 0, ty: 0, type: "tree" },
      { tx: 2, ty: 4, type: "rock" },
      { tx: 10, ty: 2, type: "crate" },
      { tx: 1, ty: 12, type: "tree" },
      { tx: 19, ty: 12, type: "tree" },
      { tx: 9, ty: 11, type: "tree" },
      { tx: 7, ty: 3, type: "tanker" },
      { tx: 15, ty: 7, type: "truck" },
    ],
    checkpoint: [
      { tx: 2, ty: 1, type: "booth" },
      { tx: 2, ty: 2, type: "gate" },
      { tx: 2, ty: 3, type: "post" },
      { tx: 16, ty: 8, type: "gate2" },
    ],
    cover: [
      [3, 4, "full"],
      [7, 7, "half"],
      [10, 8, "half"],
      [13, 3, "full"],
      [14, 5, "half"],
      [17, 6, "full"],
      [4, 9, "half"],
      [12, 11, "full"],
    ],
    crates: [
      [6, 4],
      [12, 8],
      [17, 2],
      [3, 11],
    ],
  },
  {
    id: "factory",
    name: "THE WORKS",
    threat: 3,
    threatLabel: "HIGH THREAT",
    desc: "Motorized lift, office passage, tight concrete halls. Point-blank fights — best loot in the region.",
    hpMult: 1.3,
    lootMult: 1.35,
    waveMods: { countMult: 1.15, heavyDelay: -1 },
    geo: { x: 78, y: 34 },
    sector: "SECTOR E-1",
    palette: FACTORY_PAL,
    path: [
      [-1, 2],
      [6, 2],
      [6, 6],
      [2, 6],
      [2, 11],
      [9, 11],
      [9, 6],
      [13, 6],
      [13, 11],
      [17, 11],
      [17, 2],
      [20, 2],
    ],
    props: [
      { tx: 10, ty: 8, type: "office" },
      { tx: 11, ty: 9, type: "office" },
      { tx: 14, ty: 3, type: "forklift" },
      { tx: 4, ty: 0, type: "tanker" },
      { tx: 8, ty: 0, type: "crate" },
      { tx: 11, ty: 1, type: "barrel" },
      { tx: 15, ty: 0, type: "crate" },
      { tx: 19, ty: 6, type: "truck" },
      { tx: 0, ty: 8, type: "barrel" },
      { tx: 7, ty: 8, type: "crate" },
      { tx: 5, ty: 12, type: "barrel" },
      { tx: 11, ty: 3, type: "hut" },
    ],
    checkpoint: [
      { tx: 3, ty: 1, type: "booth" },
      { tx: 3, ty: 2, type: "gate" },
      { tx: 17, ty: 8, type: "gate2" },
    ],
    cover: [
      [10, 9, "full"],
      [11, 8, "full"],
      [10, 10, "half"],
      [12, 8, "half"],
      [4, 8, "full"],
      [5, 9, "half"],
      [8, 4, "full"],
      [15, 5, "half"],
    ],
    crates: [
      [11, 10],
      [4, 10],
      [8, 3],
      [15, 8],
    ],
  },
];

export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAP_DEFS.map((m) => [m.id, m]));

export function buildMap(def: MapDef): GameMap {
  const PIX: Array<[number, number]> = def.path.map(([x, y]) => [
    (x + 0.5) * TILE,
    (y + 0.5) * TILE,
  ]);
  const SEG_LEN = PIX.slice(0, -1).map((p, i) => {
    const q = PIX[i + 1]!;
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const BLOCKED: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (let i = 0; i < PIX.length - 1; i++) {
    const [ax, ay] = PIX[i]!;
    const [bx, by] = PIX[i + 1]!;
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps;
      const y = ay + ((by - ay) * s) / steps;
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++) {
          const tx = Math.floor((x + ox * 10) / TILE);
          const ty = Math.floor((y + oy * 10) / TILE);
          if (tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS) BLOCKED[ty]![tx] = true;
        }
    }
  }
  const PROPS = def.props.filter((p) => !BLOCKED[p.ty]?.[p.tx]);
  const COVER: CoverPiece[] = def.cover
    .filter(([tx, ty]) => !BLOCKED[ty]?.[tx] && !PROPS.some((p) => p.tx === tx && p.ty === ty))
    .map(([tx, ty, type]) => ({ tx, ty, type }));
  const CRATES = def.crates
    .map(([tx, ty]) => ({ tx, ty }))
    .filter(
      (c) =>
        !BLOCKED[c.ty]?.[c.tx] &&
        !PROPS.some((p) => p.tx === c.tx && p.ty === c.ty) &&
        !COVER.some((p) => p.tx === c.tx && p.ty === c.ty),
    );
  return { def, PIX, SEG_LEN, BLOCKED, PROPS, CHECKPOINT: def.checkpoint, COVER, CRATES };
}

export function pathPoint(map: GameMap, seg: number, t: number): [number, number] {
  const a = map.PIX[seg] ?? map.PIX[0]!;
  const b = map.PIX[seg + 1] ?? map.PIX[map.PIX.length - 1]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function isRoad(map: GameMap, tx: number, ty: number) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
  return !!map.BLOCKED[ty]![tx];
}

export function isBuildable(map: GameMap, tx: number, ty: number) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
  if (map.BLOCKED[ty]![tx]) return false;
  if (map.PROPS.some((p) => p.tx === tx && p.ty === ty)) return false;
  if (map.CRATES.some((p) => p.tx === tx && p.ty === ty)) return false;
  if (map.COVER.some((c) => c.tx === tx && c.ty === ty)) return false;
  return true;
}

export function adjacentCover(cover: CoverPiece[], tx: number, ty: number) {
  return cover.filter(
    (c) => Math.abs(c.tx - tx) <= 1 && Math.abs(c.ty - ty) <= 1 && !(c.tx === tx && c.ty === ty),
  );
}

export const COVER_VALUE: Record<CoverType, number> = { full: 0.7, half: 0.4 };

/** Best protection for a tile against fire coming from (srcX, srcY) in pixels. */
export function coverProtectionFrom(
  cover: CoverPiece[],
  tx: number,
  ty: number,
  srcX: number,
  srcY: number,
) {
  const cx = tx * TILE + TILE / 2;
  const cy = ty * TILE + TILE / 2;
  let vx = srcX - cx;
  let vy = srcY - cy;
  const len = Math.hypot(vx, vy) || 1;
  vx /= len;
  vy /= len;
  let best = 0;
  for (const c of adjacentCover(cover, tx, ty)) {
    let dx = c.tx - tx;
    let dy = c.ty - ty;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const align = vx * dx + vy * dy;
    if (align <= 0.35) continue;
    best = Math.max(best, COVER_VALUE[c.type] * Math.min(1, (align - 0.35) / 0.45));
  }
  return best;
}

export function bestCoverAt(cover: CoverPiece[], tx: number, ty: number) {
  let best = 0;
  for (const c of adjacentCover(cover, tx, ty)) best = Math.max(best, COVER_VALUE[c.type]);
  return best;
}
