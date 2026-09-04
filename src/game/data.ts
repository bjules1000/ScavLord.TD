import type { BuiltinEnemyKind, EnemyDef, EnemyKind, Perk, TowerDef, TowerKind } from "./types";
import { cloneHitZones, defaultHitZones, type EnemyHitZone } from "./enemyHitZones";
import { builtinBehaviorForKind } from "./enemyBehavior";

/**
 * QA-tuned hit zones from Wave Lab LIVE authoring.
 * HEAD width/height taken from HITBOX screenshots; BODY/LEGS sizes scaled from
 * each enemy's HEAD vs default HEAD so silhouette fit is preserved until a
 * full JSON export with all three zones is available.
 */
function tunedZones(opts: {
  head: { x: number; y: number; width: number; height: number };
  body: { x: number; y: number };
  legs: { x: number; y: number };
}): EnemyHitZone[] {
  const defHead = defaultHitZones().find((z) => z.id === "head")!;
  const scaleW = opts.head.width / defHead.width;
  const scaleH = opts.head.height / defHead.height;
  return cloneHitZones(defaultHitZones()).map((z) => {
    if (z.id === "head") {
      return {
        ...z,
        shape: "rect" as const,
        x: opts.head.x,
        y: opts.head.y,
        width: opts.head.width,
        height: opts.head.height,
      };
    }
    if (z.id === "body") {
      return {
        ...z,
        shape: "rect" as const,
        x: opts.body.x,
        y: opts.body.y,
        width: Number((z.width * scaleW).toFixed(3)),
        height: Number((z.height * scaleH).toFixed(3)),
      };
    }
    if (z.id === "legs") {
      return {
        ...z,
        shape: "rect" as const,
        x: opts.legs.x,
        y: opts.legs.y,
        width: Number((z.width * scaleW).toFixed(3)),
        height: Number((z.height * scaleH).toFixed(3)),
      };
    }
    return z;
  });
}

export const TILE = 44;

export const SCALE = TILE / 32;
export const COLS = 20;
export const ROWS = 13;
/** Presentation-only margin around the playable raid board. Not extra gameplay tiles. */
export const BOARD_GUTTER = TILE;

/** Default lane waypoints (Kolkhoz / Grain Gate) — unused; live paths live in map.ts. */
export const PATH: Array<[number, number]> = [
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
];

export const TOWERS: Record<TowerKind, TowerDef> = {
  scout: {
    kind: "scout",
    name: "SCOUT",
    role: "SKS / fast",
    cost: 120,
    damage: 9,
    range: 84,
    cooldown: 380,
    splash: 0,
    color: "#7d8c5c",
    accent: "#d9e07a",
    desc: "Cheap rifleman. High rate of fire, low punch.",
  },
  sniper: {
    kind: "sniper",
    name: "SNIPER",
    role: "bolt / long",
    cost: 260,
    damage: 46,
    range: 190,
    cooldown: 1450,
    splash: 0,
    color: "#5c6b4a",
    accent: "#f0b400",
    desc: "Extreme range, shreds armor. Slow cycle.",
  },
  gunner: {
    kind: "gunner",
    name: "GUNNER",
    role: "lmg / suppress",
    cost: 320,
    damage: 14,
    range: 105,
    cooldown: 150,
    splash: 0,
    color: "#4d5a63",
    accent: "#ff7a2f",
    desc: "Belt-fed wall of lead. Melts light scavs.",
  },
  grenadier: {
    kind: "grenadier",
    name: "GRENADIER",
    role: "GP-25 / splash",
    cost: 400,
    damage: 34,
    range: 130,
    cooldown: 1700,
    splash: 44,
    color: "#6b4f3a",
    accent: "#ff4a30",
    desc: "Frag rounds. Area damage on impact.",
  },
};

export const TOWER_ORDER: TowerKind[] = ["scout", "sniper", "gunner", "grenadier"];

export const ENEMIES: Record<BuiltinEnemyKind, EnemyDef> & Record<string, EnemyDef> = {
  scav: {
    kind: "scav",
    fireRange: 60, fireCooldown: 2100, towerDamage: 5,
    name: "Scav",
    hp: 35,
    speed: 35,
    bounty: 22,
    armor: 0,
    damage: 1,
    body: "#8a7a5c",
    gear: "#4b4030",
    size: 13,
    attackProfile: "uzi",
    artProfile: "light",
    hitZones: tunedZones({
      head: { x: 0.41, y: 0.268, width: 0.159, height: 0.114 },
      body: { x: 0.36, y: 0.38 },
      legs: { x: 0.38, y: 0.56 },
    }),
    behavior: builtinBehaviorForKind("scav"),
  },
  sniperScav: {
    kind: "sniperScav",
    fireRange: 65, fireCooldown: 1700, towerDamage: 15,
    name: "Shotgun Scav",
    hp: 55,
    speed: 32,
    bounty: 36,
    armor: 0,
    damage: 1,
    body: "#6b5340",
    gear: "#3a2a1c",
    size: 14,
    attackProfile: "sg",
    artProfile: "light",
    hitZones: tunedZones({
      head: { x: 0.4, y: 0.266, width: 0.162, height: 0.109 },
      body: { x: 0.35, y: 0.38 },
      legs: { x: 0.37, y: 0.57 },
    }),
    behavior: builtinBehaviorForKind("sniperScav"),
  },
  raider: {
    kind: "raider",
    fireRange: 110, fireCooldown: 1550, towerDamage: 10,
    name: "Rifle Scav",
    hp: 75,
    speed: 30,
    bounty: 40,
    armor: 2,
    damage: 2,
    body: "#5e6b4d",
    gear: "#2f3626",
    size: 15,
    attackProfile: "ak",
    artProfile: "heavy",
    hitZones: tunedZones({
      head: { x: 0.396, y: 0.252, width: 0.196, height: 0.108 },
      body: { x: 0.33, y: 0.36 },
      legs: { x: 0.38, y: 0.6 },
    }),
    behavior: builtinBehaviorForKind("raider"),
  },
  pmc: {
    kind: "pmc",
    fireRange: 90, fireCooldown: 1450, towerDamage: 14,
    name: "Armored Raider",
    hp: 195,
    speed: 25,
    bounty: 80,
    armor: 5,
    damage: 2,
    body: "#3f4a55",
    gear: "#20272e",
    size: 16,
    attackProfile: "ak",
    artProfile: "heavy",
    hitZones: tunedZones({
      head: { x: 0.396, y: 0.251, width: 0.207, height: 0.109 },
      body: { x: 0.32, y: 0.36 },
      legs: { x: 0.36, y: 0.59 },
    }),
    behavior: builtinBehaviorForKind("pmc"),
  },
  boss: {
    kind: "boss",
    fireRange: 90, fireCooldown: 1100, towerDamage: 15,
    name: "Enforcer",
    hp: 1150,
    speed: 22,
    bounty: 600,
    armor: 5,
    damage: 5,
    body: "#5a3a28",
    gear: "#241810",
    size: 22,
    attackProfile: "ak",
    artProfile: "heavy",
    hitZones: tunedZones({
      head: { x: 0.388, y: 0.229, width: 0.226, height: 0.134 },
      body: { x: 0.3, y: 0.35 },
      legs: { x: 0.34, y: 0.6 },
    }),
    behavior: builtinBehaviorForKind("boss"),
  },
};

export interface WaveGroup {
  kind: EnemyKind;
  count: number;
  gap: number;
}
export interface Wave {
  name: string;
  groups: WaveGroup[];
}

export interface WaveTuning {
  countMult: number;
  heavyDelay: number;
}

export function buildWave(n: number, tuning?: WaveTuning): Wave {
  const cm = tuning?.countMult ?? 1;
  const hd = tuning?.heavyDelay ?? 0;
  const amt = (v: number) => Math.max(1, Math.round(v * cm));
  const groups: WaveGroup[] = [];
  if (n % 10 === 0) {
    groups.push({ kind: "boss", count: 1 + Math.floor(n / 20), gap: 1600 });
    groups.push({ kind: "raider", count: amt(4 + n), gap: 500 });
    return { name: `RAID BOSS — ENFORCER`, groups };
  }
  groups.push({ kind: "scav", count: amt(5 + n * 2), gap: Math.max(220, 620 - n * 22) });
  if (n >= 2 + hd) groups.push({ kind: "sniperScav", count: amt(1 + Math.floor(n / 2)), gap: 520 });
  if (n >= 4 + hd) groups.push({ kind: "raider", count: amt(Math.floor(n / 2)), gap: 640 });
  if (n >= 7 + hd) groups.push({ kind: "pmc", count: amt(Math.floor((n - 4) / 2)), gap: 780 });
  const names = [
    "SCAV ROAMERS",
    "CHECKPOINT PROBE",
    "SHOTGUN SWEEP",
    "RIFLE LINE",
    "ARMORED PUSH",
    "RAIDERS INBOUND",
    "FULL SCALE ASSAULT",
  ];
  return { name: names[Math.min(names.length - 1, Math.floor((n - 1) / 2))]!, groups };
}

export function waveScale(n: number) {
  return { hp: 1 + (n - 1) * 0.18 + Math.pow(n / 11, 2), speed: 1 + (n - 1) * 0.01 };
}

export const PERKS: Perk[] = [
  {
    id: "ap",
    name: "AP ROUNDS",
    desc: "+4 armor penetration on all shots.",
    apply: (s) => (s.armorPierce += 4),
  },
  {
    id: "dmg",
    name: "WEAPON MODS",
    desc: "+15% damage from every operator.",
    apply: (s) => (s.damageMult *= 1.15),
  },
  {
    id: "range",
    name: "THERMAL OPTICS",
    desc: "+12% range on every operator.",
    apply: (s) => (s.rangeMult *= 1.12),
  },
  {
    id: "rof",
    name: "DRUM MAGS",
    desc: "+15% rate of fire.",
    apply: (s) => (s.fireRateMult *= 1.15),
  },
  {
    id: "loot",
    name: "SCAV BACKPACK",
    desc: "+25% roubles from kills.",
    apply: (s) => (s.incomeMult *= 1.25),
  },
  {
    id: "crit",
    name: "HEADSHOT DRILLS",
    desc: "+10% chance to deal double damage.",
    apply: (s) => (s.critChance += 0.1),
  },
  {
    id: "slow",
    name: "LEG META",
    desc: "+18% chance to cripple (slow) a target.",
    apply: (s) => (s.slowChance += 0.18),
  },
  {
    id: "stash",
    name: "HIDEOUT STASH",
    desc: "+250 roubles at the start of each wave.",
    apply: (s) => (s.startBonus += 250),
  },
];
