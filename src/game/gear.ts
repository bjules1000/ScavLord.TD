import { generateChoices, generateCrate, type LootRuntime } from "./loot";

export type Rarity = "common" | "rare" | "epic";

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#8b8c7c",
  rare: "#6fd6ff",
  epic: "#f0b400",
};

export type WeaponClass = "shotgun" | "pistolCarbine" | "rifle" | "lmg" | "sniper" | "launcher";
export type ReloadType = "MAGAZINE" | "PER_ROUND";

/** Canonical attachment mount names — one attachment per mount on a weapon. */
export type AttachMount = "optic" | "muzzle" | "magazine" | "underbarrel";

/** Weapon families used for attachment compatibility. */
export type WeaponCategory = "pistol" | "shotgun" | "ar" | "lmg" | "sniper" | "launcher";

export interface AttachmentCompatibility {
  weaponCategories?: WeaponCategory[];
  weaponIds?: string[];
  excludedWeaponIds?: string[];
}

export interface WeaponDef {
  id: string;
  name: string;
  cls: WeaponClass;
  /** Compatibility family for attachment rules. */
  category?: WeaponCategory;
  /** Supported attachment mounts — capacity is mounts.length. */
  attachmentSlots?: AttachMount[];
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
    category: "pistol",
    attachmentSlots: ["optic", "magazine"],
    damage: 10,
    range: 100,
    cooldown: 550,
    accuracy: 0.75,
    splash: 0,
    slots: 2,
    magSize: 7,
    reloadType: "MAGAZINE",
    reloadMs: 1700,
    weight: 1,
    color: "#6b5f42",
    accent: "#e0c86a",
    gunLen: 8,
  },
  toz: {
    id: "toz",
    name: "SAWED-OFF",
    cls: "shotgun",
    category: "shotgun",
    attachmentSlots: ["muzzle"],
    damage: 7,
    range: 95,
    cooldown: 810,
    accuracy: 0.3,
    splash: 0,
    slots: 1,
    magSize: 2,
    reloadType: "PER_ROUND",
    reloadMs: 1150,
    pellets: 8,
    spread: 0.45,
    maxPelletHits: 2,
    secondaryHitMult: 0.3,
    weight: 2,
    color: "#7d8c5c",
    accent: "#d9e07a",
    gunLen: 11,
  },
  mp133: {
    id: "mp133",
    name: "PUMP 12",
    cls: "shotgun",
    category: "shotgun",
    attachmentSlots: ["muzzle", "optic"],
    damage: 11,
    range: 105,
    cooldown: 780,
    accuracy: 0.35,
    splash: 0,
    slots: 2,
    magSize: 6,
    reloadType: "PER_ROUND",
    reloadMs: 800,
    pellets: 7,
    spread: 0.4,
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
    category: "ar",
    attachmentSlots: ["optic", "muzzle", "magazine"],
    damage: 23,
    range: 135,
    cooldown: 780,
    accuracy: 0.6,
    splash: 0,
    slots: 2,
    magSize: 10,
    reloadType: "MAGAZINE",
    reloadMs: 2200,
    weight: 3,
    color: "#6f7f52",
    accent: "#e0c86a",
    gunLen: 14,
  },
  ak74: {
    id: "ak74",
    name: "KALASH RIFLE",
    cls: "rifle",
    category: "ar",
    attachmentSlots: ["optic", "muzzle", "magazine", "underbarrel"],
    damage: 21,
    range: 125,
    cooldown: 420,
    accuracy: 0.5,
    splash: 0,
    slots: 3,
    magSize: 30,
    reloadType: "MAGAZINE",
    reloadMs: 2500,
    weight: 3,
    color: "#6b5f42",
    accent: "#f0b400",
    gunLen: 14,
  },
  sks: {
    id: "sks",
    name: "SKS CARBINE",
    cls: "rifle",
    category: "ar",
    attachmentSlots: ["optic", "muzzle"],
    damage: 28,
    range: 140,
    cooldown: 520,
    accuracy: 0.69,
    splash: 0,
    slots: 2,
    magSize: 10,
    reloadType: "MAGAZINE",
    reloadMs: 2600,
    weight: 3.4,
    color: "#5a4f3a",
    accent: "#d4c48a",
    gunLen: 16,
  },
  m4: {
    id: "m4",
    name: "SERVICE CARBINE",
    cls: "rifle",
    category: "ar",
    attachmentSlots: ["optic", "muzzle", "magazine", "underbarrel"],
    damage: 24,
    range: 122,
    cooldown: 330,
    accuracy: 0.7,
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
    category: "lmg",
    attachmentSlots: ["optic", "muzzle"],
    damage: 17,
    range: 120,
    cooldown: 235,
    accuracy: 0.4,
    splash: 0,
    slots: 2,
    magSize: 75,
    reloadType: "MAGAZINE",
    reloadMs: 4900,
    weight: 6.25,
    color: "#4d5a63",
    accent: "#ff7a2f",
    gunLen: 17,
  },
  sv98: {
    id: "sv98",
    name: "BOLT RIFLE",
    cls: "sniper",
    category: "sniper",
    attachmentSlots: ["optic", "muzzle", "underbarrel"],
    damage: 78,
    range: 205,
    cooldown: 1550,
    accuracy: 0.8,
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
    category: "sniper",
    attachmentSlots: ["optic", "muzzle", "underbarrel"],
    damage: 110,
    range: 230,
    cooldown: 2000,
    accuracy: 0.8,
    splash: 0,
    slots: 3,
    magSize: 5,
    reloadType: "MAGAZINE",
    reloadMs: 3100,
    weight: 5,
    color: "#4a4336",
    accent: "#cfe0ff",
    gunLen: 21,
  },
  dvl10: {
    id: "dvl10",
    name: "LONG RIFLE",
    cls: "sniper",
    category: "sniper",
    attachmentSlots: ["optic", "muzzle", "magazine", "underbarrel"],
    damage: 150,
    range: 255,
    cooldown: 2700,
    accuracy: 0.9,
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
    category: "launcher",
    attachmentSlots: ["muzzle"],
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
  slot?: AttachMount;
  compatibility?: AttachmentCompatibility;
  damageMult: number;
  rangeMult: number;
  /** Flat range added after multipliers. */
  rangeAdd?: number;
  rofMult: number;
  accuracy: number;
  pen: number;
  /** Extra loaded rounds. Combat still reloads from infinite reserve. */
  magSizeAdd?: number;
  /** Multiplicative reload duration; stacks across attachments. */
  reloadTimeMult?: number;
  /** Additive pellet cone half-angle (shotguns). */
  spreadAdd?: number;
  /** Gameplay weight units. Installed attachments add to equipped load. */
  weight: number;
}

const att = (
  id: string,
  name: string,
  slot: AttachMount,
  partial: Partial<Omit<AttachmentDef, "id" | "name" | "slot">> & Pick<AttachmentDef, "weight">,
): AttachmentDef => ({
  id,
  name,
  slot,
  damageMult: 1,
  rangeMult: 1,
  rofMult: 1,
  accuracy: 0,
  pen: 0,
  ...partial,
});

export const ATTACHMENTS: Record<string, AttachmentDef> = {
  // —— Optics ——
  red_dot: att("red_dot", "RED DOT", "optic", {
    compatibility: { weaponCategories: ["pistol", "ar", "shotgun"] },
    accuracy: 0.03,
    weight: 0.15,
  }),
  optic_2x: att("optic_2x", "2X COMBAT OPTIC", "optic", {
    compatibility: { weaponCategories: ["ar", "lmg"] },
    accuracy: 0.03,
    rangeAdd: 8,
    weight: 0.3,
  }),
  optic: att("optic", "4X SCOPE", "optic", {
    compatibility: { weaponCategories: ["ar", "sniper"] },
    accuracy: 0.05,
    rangeAdd: 16,
    weight: 0.5,
  }),
  marksman_scope: att("marksman_scope", "MARKSMAN SCOPE", "optic", {
    compatibility: { weaponCategories: ["sniper"] },
    accuracy: 0.07,
    rangeAdd: 24,
    weight: 0.75,
  }),
  thermal: att("thermal", "THERMAL SIGHT", "optic", {
    damageMult: 1,
    rangeMult: 1.3,
    accuracy: 0.2,
    weight: 0.5,
  }),

  // —— Muzzle ——
  light_comp: att("light_comp", "LIGHT COMPENSATOR", "muzzle", {
    compatibility: { weaponCategories: ["pistol", "ar"] },
    accuracy: 0.02,
    reloadTimeMult: 1.03,
    weight: 0.15,
  }),
  brake: att("brake", "MUZZLE BRAKE", "muzzle", {
    compatibility: { weaponCategories: ["ar", "lmg"] },
    accuracy: 0.03,
    weight: 0.25,
  }),
  tight_choke: att("tight_choke", "TIGHT CHOKE", "muzzle", {
    compatibility: { weaponCategories: ["shotgun"] },
    spreadAdd: -0.1,
    rangeAdd: 6,
    weight: 0.15,
  }),
  wide_choke: att("wide_choke", "WIDE CHOKE", "muzzle", {
    compatibility: { weaponCategories: ["shotgun"] },
    spreadAdd: 0.12,
    rangeAdd: -5,
    weight: 0.1,
  }),
  supp: att("supp", "SUPPRESSOR", "muzzle", {
    damageMult: 1.12,
    rangeMult: 1.06,
    accuracy: 0.07,
    weight: 0.5,
  }),

  // —— Magazines ——
  ar_drum: att("ar_drum", "STANAG DRUM", "magazine", {
    compatibility: { weaponIds: ["adar", "m4"] },
    magSizeAdd: 30,
    reloadTimeMult: 1.12,
    weight: 2.2,
  }),
  ak_drum: att("ak_drum", "AK DRUM", "magazine", {
    compatibility: { weaponIds: ["ak74"] },
    magSizeAdd: 30,
    reloadTimeMult: 1.15,
    weight: 2.4,
  }),
  pistol_ext: att("pistol_ext", "EXTENDED MAG", "magazine", {
    compatibility: { weaponCategories: ["pistol"] },
    magSizeAdd: 8,
    weight: 0.4,
  }),
  pistol_drum: att("pistol_drum", "PISTOL DRUM", "magazine", {
    compatibility: { weaponIds: ["pm"] },
    magSizeAdd: 20,
    reloadTimeMult: 1.12,
    weight: 0.9,
  }),
  stanag_ext: att("stanag_ext", "STANAG EXTENDED MAG", "magazine", {
    compatibility: { weaponIds: ["adar", "m4"] },
    magSizeAdd: 10,
    weight: 0.45,
  }),
  quick_mag: att("quick_mag", "QUICK MAG", "magazine", {
    compatibility: { weaponIds: ["adar", "m4", "ak74"] },
    reloadTimeMult: 0.82,
    weight: 0.25,
  }),
  dvl_ext: att("dvl_ext", "DVL EXTENDED MAG", "magazine", {
    compatibility: { weaponIds: ["dvl10"] },
    magSizeAdd: 5,
    weight: 0.45,
  }),
  mag: att("mag", "DRUM MAG", "magazine", {
    rofMult: 1.28,
    accuracy: -0.02,
    magSizeAdd: 4,
    weight: 0.75,
  }),

  // —— Underbarrel ——
  grip: att("grip", "VERTICAL GRIP", "underbarrel", {
    compatibility: { weaponCategories: ["ar", "lmg"] },
    accuracy: 0.04,
    weight: 0.35,
  }),
  angled_grip: att("angled_grip", "ANGLED GRIP", "underbarrel", {
    compatibility: { weaponCategories: ["ar"] },
    accuracy: 0.02,
    reloadTimeMult: 0.92,
    weight: 0.25,
  }),
  heavy_grip: att("heavy_grip", "HEAVY FOREGRIP", "underbarrel", {
    compatibility: { weaponCategories: ["ar", "lmg"] },
    accuracy: 0.06,
    weight: 0.7,
  }),
  laser: att("laser", "TAC LASER", "underbarrel", {
    rofMult: 1.08,
    accuracy: 0.13,
    weight: 0.25,
  }),
  m995: att("m995", "AP ROUNDS", "underbarrel", {
    damageMult: 1.1,
    pen: 6,
    weight: 0.25,
  }),
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
  let reloadMs = weapon.reloadMs;
  let reloadTimeMult = 1;
  let spread = weapon.spread;
  for (const id of attachments) {
    const a = lookup(id);
    if (!a) continue;
    damage *= a.damageMult;
    range *= a.rangeMult;
    range += a.rangeAdd ?? 0;
    cooldown /= a.rofMult;
    accuracy += a.accuracy;
    pen += a.pen;
    magSize += a.magSizeAdd ?? 0;
    reloadTimeMult *= a.reloadTimeMult ?? 1;
    if (spread != null) spread += a.spreadAdd ?? 0;
  }
  reloadMs = Math.max(100, Math.round(reloadMs * reloadTimeMult));
  if (spread != null) spread = Math.max(0.05, spread);
  return {
    damage,
    range: Math.max(1, range),
    cooldown,
    accuracy: Math.max(0.15, Math.min(0.99, accuracy)),
    pen,
    magSize: Math.max(1, magSize),
    splash: weapon.splash,
    slots: weapon.slots,
    reloadMs,
    reloadType: weapon.reloadType,
    spread,
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
  paca: { id: "paca", name: "SOFT VEST", reduction: 0.25, durability: 110, plate: "#4a4636", trim: "#6f6a4f", weight: 2 },
  sixb23: { id: "sixb23", name: "RIOT PLATES", reduction: 0.35, durability: 190, plate: "#3f4a38", trim: "#6fd6ff", weight: 4 },
  slick: { id: "slick", name: "PLATE CARRIER", reduction: 0.55, durability: 300, plate: "#26282b", trim: "#f0b400", weight: 6 },
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

export type ItemKind = "weapon" | "attachment" | "armor" | "meds" | "throwable" | "valuable" | "backpack";

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
  /** Improvised Bench visual/build state for this packed gun. */
  scavMods?: import("./weaponVisuals").WeaponVisualState | null;
}

export const ITEMS: ItemDef[] = [
  // weapons
  { id: "w_pm", kind: "weapon", ref: "pm", name: "SIDEARM", rarity: "common", value: 80, desc: "7-round pistol. Steady fire, magazine reload.", price: 250 },
  { id: "w_toz", kind: "weapon", ref: "toz", name: "SAWED-OFF", rarity: "common", value: 70, desc: "Two shells, eight pellets. Brutal on clusters, loads one round at a time.", price: 300 },
  { id: "w_mp133", kind: "weapon", ref: "mp133", name: "PUMP 12", rarity: "rare", value: 480, desc: "7-pellet spread, brutal up close, no reach.", price: 1700 },
  { id: "w_adar", kind: "weapon", ref: "adar", name: "SPORT CARBINE", rarity: "common", value: 260, desc: "More range and punch, slower cycle.", price: 900 },
  { id: "w_ak74", kind: "weapon", ref: "ak74", name: "KALASH RIFLE", rarity: "rare", value: 420, desc: "Fast, loose, three mod slots.", price: 1500 },
  { id: "w_sks", kind: "weapon", ref: "sks", name: "SKS CARBINE", rarity: "rare", value: 380, desc: "Hard-hitting carbine. Ready for Bench work.", price: 1400 },
  { id: "w_pkm", kind: "weapon", ref: "pkm", name: "SQUAD LMG", rarity: "rare", value: 520, desc: "Belt-fed spray. Terrible accuracy.", price: 2000 },
  { id: "w_m4", kind: "weapon", ref: "m4", name: "SERVICE CARBINE", rarity: "rare", value: 640, desc: "Accurate, four mod slots.", price: 2600 },
  { id: "w_sv98", kind: "weapon", ref: "sv98", name: "BOLT RIFLE", rarity: "epic", value: 900, desc: "Huge range and damage, very slow.", price: 4200 },
  { id: "w_m700", kind: "weapon", ref: "m700", name: "HUNTING BOLT", rarity: "epic", value: 1150, desc: "110 dmg, huge range, very slow.", price: 5200 },
  { id: "w_dvl10", kind: "weapon", ref: "dvl10", name: "LONG RIFLE", rarity: "epic", value: 1500, desc: "150 dmg one-shot cannon, 4 mod slots.", price: 7200 },
  { id: "w_m32", kind: "weapon", ref: "m32", name: "ROTARY GL", rarity: "epic", value: 950, desc: "Frag rounds, area damage.", price: 4600 },
  // attachments
  { id: "a_red_dot", kind: "attachment", ref: "red_dot", name: "RED DOT", rarity: "common", value: 90, desc: "ACC +3%. Light general-purpose optic.", price: 320 },
  { id: "a_optic_2x", kind: "attachment", ref: "optic_2x", name: "2X COMBAT OPTIC", rarity: "rare", value: 180, desc: "ACC +3%, RNG +8. Mid-range optic.", price: 680 },
  { id: "a_optic", kind: "attachment", ref: "optic", name: "4X SCOPE", rarity: "rare", value: 280, desc: "ACC +5%, RNG +16. Long-lane optic.", price: 1050 },
  { id: "a_marksman", kind: "attachment", ref: "marksman_scope", name: "MARKSMAN SCOPE", rarity: "epic", value: 520, desc: "ACC +7%, RNG +24. Precision sniper glass.", price: 2200 },
  { id: "a_thermal", kind: "attachment", ref: "thermal", name: "THERMAL SIGHT", rarity: "epic", value: 560, desc: "+30% range, +20% hit chance.", price: 2400 },
  { id: "a_light_comp", kind: "attachment", ref: "light_comp", name: "LIGHT COMPENSATOR", rarity: "common", value: 95, desc: "ACC +2%. Light muzzle control.", price: 340 },
  { id: "a_brake", kind: "attachment", ref: "brake", name: "MUZZLE BRAKE", rarity: "rare", value: 150, desc: "ACC +3%. Sustained-fire muzzle control.", price: 560 },
  { id: "a_tight_choke", kind: "attachment", ref: "tight_choke", name: "TIGHT CHOKE", rarity: "rare", value: 160, desc: "Tighter spread, +6 range.", price: 580 },
  { id: "a_wide_choke", kind: "attachment", ref: "wide_choke", name: "WIDE CHOKE", rarity: "rare", value: 140, desc: "Wider spread, -5 range. Crowd coverage.", price: 520 },
  { id: "a_ar_drum", kind: "attachment", ref: "ar_drum", name: "STANAG DRUM", rarity: "epic", value: 520, desc: "MAG +30, WT +2.2, RLD +12%. ADAR/M4 only.", price: 1800 },
  { id: "a_ak_drum", kind: "attachment", ref: "ak_drum", name: "AK DRUM", rarity: "epic", value: 540, desc: "MAG +30, WT +2.4, RLD +15%. AK74 only.", price: 1900 },
  { id: "a_pistol_ext", kind: "attachment", ref: "pistol_ext", name: "EXTENDED MAG", rarity: "rare", value: 140, desc: "MAG +8. Pistols only.", price: 420 },
  { id: "a_pistol_drum", kind: "attachment", ref: "pistol_drum", name: "PISTOL DRUM", rarity: "epic", value: 380, desc: "MAG +20, WT +0.9. PM only.", price: 1400 },
  { id: "a_stanag_ext", kind: "attachment", ref: "stanag_ext", name: "STANAG EXTENDED MAG", rarity: "rare", value: 200, desc: "MAG +10. ADAR/M4 only.", price: 720 },
  { id: "a_quick_mag", kind: "attachment", ref: "quick_mag", name: "QUICK MAG", rarity: "epic", value: 360, desc: "RLD -18%. No extra capacity. ADAR/M4/AK74.", price: 1300 },
  { id: "a_dvl_ext", kind: "attachment", ref: "dvl_ext", name: "DVL EXTENDED MAG", rarity: "epic", value: 420, desc: "MAG +5. DVL10 only.", price: 1600 },
  { id: "a_grip", kind: "attachment", ref: "grip", name: "VERTICAL GRIP", rarity: "rare", value: 130, desc: "ACC +4%. Stable underbarrel grip.", price: 500 },
  { id: "a_angled_grip", kind: "attachment", ref: "angled_grip", name: "ANGLED GRIP", rarity: "epic", value: 280, desc: "ACC +2%, RLD -8%. Handling grip.", price: 980 },
  { id: "a_heavy_grip", kind: "attachment", ref: "heavy_grip", name: "HEAVY FOREGRIP", rarity: "epic", value: 320, desc: "ACC +6%, WT +0.7. Heavy stability grip.", price: 1100 },
  { id: "a_mag", kind: "attachment", ref: "mag", name: "DRUM MAG", rarity: "rare", value: 220, desc: "Legacy +4 magazine, +ROF.", price: 900 },
  { id: "a_supp", kind: "attachment", ref: "supp", name: "SUPPRESSOR", rarity: "rare", value: 300, desc: "+12% damage, +6% range, +7% hit chance.", price: 1200 },
  { id: "a_laser", kind: "attachment", ref: "laser", name: "TAC LASER", rarity: "rare", value: 260, desc: "+13% hit chance, +8% ROF.", price: 1000 },
  { id: "a_m995", kind: "attachment", ref: "m995", name: "AP ROUNDS", rarity: "epic", value: 420, desc: "+6 armor pen, +10% damage.", price: 1800 },
  // body armor — only your operator can wear it
  { id: "ar_paca", kind: "armor", ref: "paca", name: "SOFT VEST", rarity: "common", value: 220, desc: "-25% incoming, 110 durability.", price: 700 },
  { id: "ar_6b23", kind: "armor", ref: "sixb23", name: "RIOT PLATES", rarity: "rare", value: 480, desc: "-35% incoming, 190 durability.", price: 1600 },
  { id: "ar_slick", kind: "armor", ref: "slick", name: "PLATE CARRIER", rarity: "epic", value: 820, desc: "-55% incoming, 300 durability.", price: 3800 },
  // meds

  { id: "g_frag", kind: "throwable", name: "FRAG GRENADE", rarity: "rare", value: 180, desc: "Thrown fragmentation grenade. 0.8s fuse, heavy area damage.", price: 650 },
  { id: "g_smoke", kind: "throwable", name: "SMOKE GRENADE", rarity: "common", value: 110, desc: "Creates an 8-second smoke cloud that blocks sight.", price: 400 },
  { id: "g_impact", kind: "throwable", name: "IMPACT GRENADE", rarity: "epic", value: 260, desc: "Short-range grenade that detonates on arrival.", price: 950 },
  { id: "g_flash", kind: "throwable", name: "FLASH GRENADE", rarity: "rare", value: 150, desc: "Blinds enemies, preventing attacks for 3.5 seconds.", price: 520 },
  { id: "g_stun", kind: "throwable", name: "STUN GRENADE", rarity: "rare", value: 170, desc: "Stops enemies for 2.25 seconds and deals light damage.", price: 580 },

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
  if (runtime?.profile) next.profile = runtime.profile;
  if (runtime?.sourceId) next.sourceId = runtime.sourceId;
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

