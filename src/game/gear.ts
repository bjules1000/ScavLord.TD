import { generateChoices, generateCrate, type LootRuntime } from "./loot";

export type Rarity = "common" | "rare" | "epic";

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#8b8c7c",
  rare: "#6fd6ff",
  epic: "#f0b400",
};

export type WeaponClass = "shotgun" | "pistolCarbine" | "rifle" | "lmg" | "sniper" | "launcher";
export type ReloadType = "MAGAZINE" | "PER_ROUND";

export interface WeaponDef {
  id: string;
  name: string;
  cls: WeaponClass;
  damage: number;
  range: number; // in 32px art units, scaled at runtime
  cooldown: number; // ms
  accuracy: number; // 0..1 chance to hit
  splash: number;
  slots: number;
  magSize: number;
  reloadType: ReloadType;
  /** MAGAZINE: full dump. PER_ROUND: time to load one round. */
  reloadMs: number;
  /** shotguns fire several pellets per shot */
  pellets?: number;
  /** cone half-angle in radians for multi-pellet weapons */
  spread?: number;
  /** Max living enemies one pellet may strike (primary + limited penetration). */
  maxPelletHits?: number;
  /** Damage multiplier for the second enemy along a pellet trace. */
  secondaryHitMult?: number;
  /** Gameplay weight units. Operator move speed reads this via getEquippedWeight(). */
  weight: number;
  color: string;
  accent: string;
  gunLen: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  pm: {
    id: "pm",
    name: "SIDEARM",
    cls: "pistolCarbine",
    damage: 15,
    range: 92,
    cooldown: 400,
    accuracy: 0.78,
    splash: 0,
    slots: 2,
    magSize: 7,
    reloadType: "MAGAZINE",
    reloadMs: 1500,
    weight: 1,
    color: "#6b5f42",
    accent: "#e0c86a",
    gunLen: 8,
  },
  toz: {
    id: "toz",
    name: "SAWED-OFF",
    cls: "shotgun",
    damage: 7,
    range: 56,
    cooldown: 720,
    accuracy: 0.55,
    splash: 0,
    slots: 1,
    magSize: 2,
    reloadType: "PER_ROUND",
    reloadMs: 950,
    pellets: 9,
    spread: 0.32,
    maxPelletHits: 2,
    secondaryHitMult: 0.5,
    weight: 2,
    color: "#7d8c5c",
    accent: "#d9e07a",
    gunLen: 11,
  },
  mp133: {
    id: "mp133",
    name: "PUMP 12",
    cls: "shotgun",
    damage: 11,
    range: 74,
    cooldown: 760,
    accuracy: 0.62,
    splash: 0,
    slots: 2,
    magSize: 6,
    reloadType: "PER_ROUND",
    reloadMs: 800,
    pellets: 7,
    spread: 0.34,
    maxPelletHits: 2,
    secondaryHitMult: 0.5,
    weight: 3,
    color: "#6b4f3a",
    accent: "#ffb35c",
    gunLen: 13,
  },
  adar: {
    id: "adar",
    name: "SPORT CARBINE",
    cls: "rifle",
    damage: 22,
    range: 108,
    cooldown: 620,
    accuracy: 0.66,
    splash: 0,
    slots: 2,
    magSize: 20,
    reloadType: "MAGAZINE",
    reloadMs: 2100,
    weight: 3,
    color: "#6f7f52",
    accent: "#e0c86a",
    gunLen: 14,
  },
  ak74: {
    id: "ak74",
    name: "KALASH RIFLE",
    cls: "rifle",
    damage: 19,
    range: 100,
    cooldown: 380,
    accuracy: 0.62,
    splash: 0,
    slots: 3,
    magSize: 30,
    reloadType: "MAGAZINE",
    reloadMs: 2400,
    weight: 3.5,
    color: "#6b5f42",
    accent: "#f0b400",
    gunLen: 14,
  },
  m4: {
    id: "m4",
    name: "SERVICE CARBINE",
    cls: "rifle",
    damage: 24,
    range: 122,
    cooldown: 330,
    accuracy: 0.72,
    splash: 0,
    slots: 4,
    magSize: 30,
    reloadType: "MAGAZINE",
    reloadMs: 2200,
    weight: 3.5,
    color: "#4d5a63",
    accent: "#9fe0ff",
    gunLen: 15,
  },
  pkm: {
    id: "pkm",
    name: "SQUAD LMG",
    cls: "lmg",
    damage: 17,
    range: 104,
    cooldown: 155,
    accuracy: 0.52,
    splash: 0,
    slots: 2,
    magSize: 75,
    reloadType: "MAGAZINE",
    reloadMs: 4800,
    weight: 6,
    color: "#4d5a63",
    accent: "#ff7a2f",
    gunLen: 17,
  },
  sv98: {
    id: "sv98",
    name: "BOLT RIFLE",
    cls: "sniper",
    damage: 78,
    range: 205,
    cooldown: 1550,
    accuracy: 0.78,
    splash: 0,
    slots: 3,
    magSize: 10,
    reloadType: "MAGAZINE",
    reloadMs: 2800,
    weight: 4.5,
    color: "#5c6b4a",
    accent: "#f0b400",
    gunLen: 20,
  },
  m700: {
    id: "m700",
    name: "HUNTING BOLT",
    cls: "sniper",
    damage: 105,
    range: 228,
    cooldown: 2000,
    accuracy: 0.8,
    splash: 0,
    slots: 3,
    magSize: 5,
    reloadType: "MAGAZINE",
    reloadMs: 3000,
    weight: 5,
    color: "#4a4336",
    accent: "#cfe0ff",
    gunLen: 21,
  },
  dvl10: {
    id: "dvl10",
    name: "LONG RIFLE",
    cls: "sniper",
    damage: 150,
    range: 255,
    cooldown: 2700,
    accuracy: 0.86,
    splash: 0,
    slots: 4,
    magSize: 5,
    reloadType: "MAGAZINE",
    reloadMs: 3200,
    weight: 5.5,
    color: "#2f3338",
    accent: "#9fe0ff",
    gunLen: 23,
  },
  m32: {
    id: "m32",
    name: "ROTARY GL",
    cls: "launcher",
    damage: 52,
    range: 132,
    cooldown: 1700,
    accuracy: 0.7,
    splash: 46,
    slots: 1,
    magSize: 6,
    reloadType: "MAGAZINE",
    reloadMs: 3500,
    weight: 5,
    color: "#6b4f3a",
    accent: "#ff4a30",
    gunLen: 13,
  },
};

export interface AttachmentDef {
  id: string;
  name: string;
  damageMult: number;
  rangeMult: number;
  rofMult: number;
  accuracy: number;
  pen: number;
  /** Extra loaded rounds. Combat still reloads from infinite reserve. */
  magSizeAdd?: number;
  /** Gameplay weight units. Installed attachments add to equipped load. */
  weight: number;
}

export const ATTACHMENTS: Record<string, AttachmentDef> = {
  optic: { id: "optic", name: "4x SCOPE", damageMult: 1, rangeMult: 1.18, rofMult: 1, accuracy: 0.12, pen: 0, weight: 0.25 },
  thermal: { id: "thermal", name: "THERMAL SIGHT", damageMult: 1, rangeMult: 1.3, rofMult: 1, accuracy: 0.2, pen: 0, weight: 0.5 },
  grip: { id: "grip", name: "FOREGRIP", damageMult: 1, rangeMult: 1, rofMult: 1, accuracy: 0.14, pen: 0, weight: 0.25 },
  brake: { id: "brake", name: "MUZZLE BRAKE", damageMult: 1, rangeMult: 1.04, rofMult: 1.05, accuracy: 0.1, pen: 0, weight: 0.25 },
  mag: { id: "mag", name: "DRUM MAG", damageMult: 1, rangeMult: 1, rofMult: 1.28, accuracy: -0.02, pen: 0, magSizeAdd: 4, weight: 0.75 },
  supp: { id: "supp", name: "SUPPRESSOR", damageMult: 1.12, rangeMult: 1.06, rofMult: 1, accuracy: 0.07, pen: 0, weight: 0.5 },
  m995: { id: "m995", name: "AP ROUNDS", damageMult: 1.1, rangeMult: 1, rofMult: 1, accuracy: 0, pen: 6, weight: 0.25 },
  laser: { id: "laser", name: "TAC LASER", damageMult: 1, rangeMult: 1, rofMult: 1.08, accuracy: 0.13, pen: 0, weight: 0.25 },
};

/** Canonical attachment folding. Combat and the operator sidebar both read this. */
export function applyAttachmentMods(
  weapon: WeaponDef,
  attachments: readonly string[],
  lookup: (id: string) => AttachmentDef | undefined = (id) => ATTACHMENTS[id],
) {
  let damage = weapon.damage;
  let range = weapon.range;
  let cooldown = weapon.cooldown;
  let accuracy = weapon.accuracy;
  let pen = 0;
  let magSize = weapon.magSize;
  for (const id of attachments) {
    const a = lookup(id);
    if (!a) continue;
    damage *= a.damageMult;
    range *= a.rangeMult;
    cooldown /= a.rofMult;
    accuracy += a.accuracy;
    pen += a.pen;
    magSize += a.magSizeAdd ?? 0;
  }
  return {
    damage,
    range,
    cooldown,
    accuracy: Math.max(0.15, Math.min(0.99, accuracy)),
    pen,
    magSize: Math.max(1, magSize),
    splash: weapon.splash,
    slots: weapon.slots,
    reloadMs: weapon.reloadMs,
    reloadType: weapon.reloadType,
  };
}

export interface ArmorDef {
  id: string;
  name: string;
  /** flat fraction of incoming damage absorbed while durability lasts */
  reduction: number;
  durability: number;
  plate: string;
  trim: string;
  /** Gameplay weight units. Operator move speed reads this via getEquippedWeight(). */
  weight: number;
}

export const ARMORS: Record<string, ArmorDef> = {
  paca: { id: "paca", name: "SOFT VEST", reduction: 0.18, durability: 110, plate: "#4a4636", trim: "#6f6a4f", weight: 2 },
  sixb23: { id: "sixb23", name: "RIOT PLATES", reduction: 0.3, durability: 190, plate: "#3f4a38", trim: "#6fd6ff", weight: 4 },
  slick: { id: "slick", name: "PLATE CARRIER", reduction: 0.45, durability: 300, plate: "#26282b", trim: "#f0b400", weight: 6 },
};

export interface BackpackDef {
  id: string;
  name: string;
  /** extra slots over the base rig */
  bonus: number;
}

export const BACKPACKS: Record<string, BackpackDef> = {
  sling: { id: "sling", name: "SLING BAG", bonus: 0 },
  scavpack: { id: "scavpack", name: "SCAV SACK", bonus: 2 },
  pilgrim: { id: "pilgrim", name: "ALPINIST PACK", bonus: 4 },
  trizip: { id: "trizip", name: "RAID PACK", bonus: 6 },
};

export const BACKPACK_ORDER = ["sling", "scavpack", "pilgrim", "trizip"];

export type ItemKind = "weapon" | "attachment" | "armor" | "meds" | "valuable" | "backpack";

export interface ItemDef {
  id: string;
  kind: ItemKind;
  name: string;
  rarity: Rarity;
  value: number;
  desc: string;
  ref?: string; // weapon, attachment, armor or backpack id
  heal?: number;
  price?: number; // buyable in the hideout shop when unlocked
}



export interface Item extends ItemDef {
  uid: number;
  /** Attachments kept on a packed raid weapon until the player detaches them. */
  installed?: string[];
}

export const ITEMS: ItemDef[] = [
  // weapons
  { id: "w_pm", kind: "weapon", ref: "pm", name: "SIDEARM", rarity: "common", value: 80, desc: "7-round pistol. Steady fire, magazine reload.", price: 250 },
  { id: "w_toz", kind: "weapon", ref: "toz", name: "SAWED-OFF", rarity: "common", value: 70, desc: "Two shells, nine pellets. Brutal on clusters, loads one round at a time.", price: 300 },
  { id: "w_mp133", kind: "weapon", ref: "mp133", name: "PUMP 12", rarity: "rare", value: 480, desc: "7-pellet spread, brutal up close, no reach.", price: 1700 },
  { id: "w_adar", kind: "weapon", ref: "adar", name: "SPORT CARBINE", rarity: "common", value: 260, desc: "More range and punch, slower cycle.", price: 900 },
  { id: "w_ak74", kind: "weapon", ref: "ak74", name: "KALASH RIFLE", rarity: "rare", value: 420, desc: "Fast, loose, three mod slots.", price: 1500 },
  { id: "w_pkm", kind: "weapon", ref: "pkm", name: "SQUAD LMG", rarity: "rare", value: 520, desc: "Belt-fed spray. Terrible accuracy.", price: 2000 },
  { id: "w_m4", kind: "weapon", ref: "m4", name: "SERVICE CARBINE", rarity: "rare", value: 640, desc: "Accurate, four mod slots.", price: 2600 },
  { id: "w_sv98", kind: "weapon", ref: "sv98", name: "BOLT RIFLE", rarity: "epic", value: 900, desc: "Huge range and damage, very slow.", price: 4200 },
  { id: "w_m700", kind: "weapon", ref: "m700", name: "HUNTING BOLT", rarity: "epic", value: 1150, desc: "105 dmg, huge range, very slow.", price: 5200 },
  { id: "w_dvl10", kind: "weapon", ref: "dvl10", name: "LONG RIFLE", rarity: "epic", value: 1500, desc: "150 dmg one-shot cannon, 4 mod slots.", price: 7200 },
  { id: "w_m32", kind: "weapon", ref: "m32", name: "ROTARY GL", rarity: "epic", value: 950, desc: "Frag rounds, area damage.", price: 4600 },
  // attachments
  { id: "a_grip", kind: "attachment", ref: "grip", name: "FOREGRIP", rarity: "common", value: 110, desc: "+14% hit chance.", price: 450 },
  { id: "a_brake", kind: "attachment", ref: "brake", name: "MUZZLE BRAKE", rarity: "common", value: 130, desc: "+10% hit chance, small ROF/range.", price: 500 },
  { id: "a_optic", kind: "attachment", ref: "optic", name: "4x SCOPE", rarity: "rare", value: 240, desc: "+18% range, +12% hit chance.", price: 950 },
  { id: "a_mag", kind: "attachment", ref: "mag", name: "DRUM MAG", rarity: "rare", value: 220, desc: "+28% rate of fire, +4 magazine capacity.", price: 900 },
  { id: "a_supp", kind: "attachment", ref: "supp", name: "SUPPRESSOR", rarity: "rare", value: 300, desc: "+12% damage, +6% range, +7% hit chance.", price: 1200 },
  { id: "a_laser", kind: "attachment", ref: "laser", name: "TAC LASER", rarity: "rare", value: 260, desc: "+13% hit chance, +8% ROF.", price: 1000 },
  { id: "a_m995", kind: "attachment", ref: "m995", name: "AP ROUNDS", rarity: "epic", value: 420, desc: "+6 armor pen, +10% damage.", price: 1800 },
  { id: "a_thermal", kind: "attachment", ref: "thermal", name: "THERMAL SIGHT", rarity: "epic", value: 560, desc: "+30% range, +20% hit chance.", price: 2400 },
  // body armor — only your operator can wear it
  { id: "ar_paca", kind: "armor", ref: "paca", name: "SOFT VEST", rarity: "common", value: 220, desc: "-18% incoming, 110 durability.", price: 700 },
  { id: "ar_6b23", kind: "armor", ref: "sixb23", name: "RIOT PLATES", rarity: "rare", value: 480, desc: "-30% incoming, 190 durability.", price: 1600 },
  { id: "ar_slick", kind: "armor", ref: "slick", name: "PLATE CARRIER", rarity: "epic", value: 820, desc: "-45% incoming, 300 durability.", price: 3800 },
  // meds

  { id: "m_ifak", kind: "meds", name: "POCKET KIT", rarity: "common", value: 80, heal: 45, desc: "Heals an operator for 45 HP.", price: 260 },
  { id: "m_salewa", kind: "meds", name: "TRAUMA BAG", rarity: "common", value: 140, heal: 90, desc: "Heals an operator for 90 HP.", price: 420 },
  { id: "m_grizzly", kind: "meds", name: "SURGEON KIT", rarity: "rare", value: 280, heal: 220, desc: "Full trauma kit — 220 HP.", price: 850 },
  // valuables
  { id: "v_bolts", kind: "valuable", name: "BOLTS", rarity: "common", value: 60, desc: "Pure sell value." },
  { id: "v_gpu", kind: "valuable", name: "GRAPHICS CARD", rarity: "rare", value: 520, desc: "Pure sell value." },
  { id: "v_ledx", kind: "valuable", name: "MED BOARD", rarity: "epic", value: 700, desc: "Pure sell value." },
  { id: "v_btc", kind: "valuable", name: "COIN STASH", rarity: "epic", value: 900, desc: "Pure sell value." },
  // backpacks — shop only, buying one upgrades your rig permanently
  { id: "bp_scav", kind: "backpack", ref: "scavpack", name: "SCAV SACK", rarity: "common", value: 300, desc: "+2 raid backpack slots.", price: 900 },
  { id: "bp_pilgrim", kind: "backpack", ref: "pilgrim", name: "ALPINIST PACK", rarity: "rare", value: 900, desc: "+4 raid backpack slots.", price: 2600 },
  { id: "bp_trizip", kind: "backpack", ref: "trizip", name: "RAID PACK", rarity: "epic", value: 1600, desc: "+6 raid backpack slots.", price: 5200 },
];


export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export function makeItem(id: string, uid: number, catalog: Record<string, ItemDef> = ITEM_BY_ID): Item | null {
  const def = catalog[id];
  return def ? { ...def, uid } : null;
}

function lootRuntime(runtime?: Partial<LootRuntime>): Partial<LootRuntime> & { catalog: readonly ItemDef[] } {
  const next: Partial<LootRuntime> & { catalog: readonly ItemDef[] } = {
    catalog: runtime?.catalog ?? ITEMS,
  };
  if (runtime?.rules) next.rules = runtime.rules;
  if (runtime?.weights) next.weights = runtime.weights;
  if (runtime?.rng) next.rng = runtime.rng;
  return next;
}

/** Three post-wave choices, biased by wave depth and map threat. */
export function rollChoices(wave: number, uidStart: number, lootMult = 1, runtime?: Partial<LootRuntime>): Item[] {
  return generateChoices(wave, uidStart, lootMult, lootRuntime(runtime));
}

/** Loot found inside a map crate. */
export function rollCrate(wave: number, uidStart: number, lootMult = 1, runtime?: Partial<LootRuntime>): Item[] {
  return generateCrate(wave, uidStart, lootMult, lootRuntime(runtime));
}

