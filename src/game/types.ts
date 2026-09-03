import type { TargetMode } from "./targeting";

/** Two tactical surfaces. Not a 3D Z stack. */
export type SurfaceLevel = "GROUND" | "HIGH";

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

export interface MoveNode {
  tx: number;
  ty: number;
  surface: SurfaceLevel;
}

/** Raid-only operator travel. Not persisted. */
export interface OperatorMoveState {
  x: number;
  y: number;
  /** Remaining tile centers, current segment first. */
  path: MoveNode[];
  dest: MoveNode;
  pendingDest: MoveNode | null;
}

export interface Tower {
  id: number;
  tx: number;
  ty: number;
  /**
   * Tactical surface this operator occupies. Raid runtime only.
   * GROUND = base cell; HIGH = high ground or suspended bridge deck.
   * Logical surface updates when a movement segment completes.
   */
  surface?: SurfaceLevel;
  /** In-raid travel. Null/absent when stationary. */
  move?: OperatorMoveState | null;
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
  /** Persistent crew operator deployed from hideout. */
  operatorId?: string;
  level?: number;
  xp?: number;
  /** armor id from gear.ts ARMORS */
  armor?: string | null;
  armorHp?: number;
  /** Rounds currently loaded. Raid runtime only. */
  ammo: number;
  /** Milliseconds remaining on the current reload action. 0 = not reloading. */
  reloadLeft: number;
  targetMode: TargetMode;
  /** MANUAL lock. Null means hold fire. */
  manualTargetId: number | null;
  /** Last chosen target this tick, for UI. */
  engageTargetId: number | null;
  /** Fixed aim direction for HOLD_ANGLE mode. Angle in radians. */
  holdAngle?: number | null;
  /** World point the player clicked for HOLD_ANGLE (UI display). */
  holdAnglePoint?: { x: number; y: number } | null;
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
  /** Index into GameMap.lanes. 0 = MAIN. */
  lane: number;
  seg: number;
  t: number;
  x: number;
  y: number;
  /** Authored lane traffic stays GROUND even under a suspended bridge. */
  surface?: SurfaceLevel;
  /** Live wire currently occupying this enemy; null when off wire. */
  contactingWireId: number | null;
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
  /** Visual-only shot line. Never deals damage. */
  tracer?: boolean;
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
