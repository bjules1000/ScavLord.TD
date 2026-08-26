export type TowerKind = "scout" | "sniper" | "gunner" | "grenadier";

export interface TowerDef {
  kind: TowerKind;
  name: string;
  role: string;
  cost: number;
  damage: number;
  range: number;
  cooldown: number; // ms
  splash: number;
  color: string;
  accent: string;
  desc: string;
}

export interface Tower {
  id: number;
  tx: number;
  ty: number;
  /** weapon id from gear.ts WEAPONS */
  weapon: string;
  /** attachment ids from gear.ts ATTACHMENTS */
  attachments: string[];
  cd: number;
  angle: number;
  flash: number;
  kills: number;
  hp: number;
  maxHp: number;
  hurt: number;
  /** true for the player's own operator — dies once, run over */
  pmc?: boolean;
  level?: number;
  xp?: number;
  /** armor id from gear.ts ARMORS (player operator only) */
  armor?: string | null;
  armorHp?: number;
}

export type EnemyKind = "scav" | "raider" | "sniperScav" | "pmc" | "boss";

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  bounty: number;
  armor: number; // flat damage reduction
  damage: number; // lives lost on leak
  fireRange: number;
  fireCooldown: number;
  towerDamage: number;
  body: string;
  gear: string;
  size: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  seg: number;
  t: number;
  x: number;
  y: number;
  slow: number;
  hitFlash: number;
  step: number;
  fireCd: number;
  aim: number;
  muzzle: number;
  /** Reached the extract objective; lives already deducted. Not a kill. */
  leaked?: boolean;
  /** Bounty / XP / quest kill already paid. */
  counted?: boolean;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  targetId: number;
  speed: number;
  damage: number;
  splash: number;
  color: string;
  trail: number;
  pen?: number;
  miss?: boolean;
  /** shotgun pellet: hits the first enemy it passes through */
  pellet?: boolean;
  hostile?: boolean;
  towerId?: number;
  sx?: number;
  sy?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface FloatText {
  x: number;
  y: number;
  life: number;
  text: string;
  color: string;
}

export interface Perk {
  id: string;
  name: string;
  desc: string;
  apply: (s: Modifiers) => void;
}

export interface Modifiers {
  damageMult: number;
  rangeMult: number;
  fireRateMult: number;
  incomeMult: number;
  critChance: number;
  slowChance: number;
  armorPierce: number;
  startBonus: number;
}
