export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  /** Recruitment cost weight. */
  costWeight: number;
  /** Live combat modifiers. Empty = dormant / future-facing. */
  combat: {
    aim?: number;
    toughness?: number;
    handling?: number;
    mobility?: number;
  };
}

export const PERKS: Record<string, PerkDef> = {
  marksman: {
    id: "marksman",
    name: "MARKSMAN",
    desc: "Steadier aim under pressure.",
    costWeight: 120,
    combat: { aim: 3 },
  },
  lightfoot: {
    id: "lightfoot",
    name: "LIGHTFOOT",
    desc: "Moves better under kit weight.",
    costWeight: 100,
    combat: { mobility: 3 },
  },
  tough: {
    id: "tough",
    name: "TOUGH",
    desc: "Slightly higher survivability.",
    costWeight: 110,
    combat: { toughness: 3 },
  },
  quick_hands: {
    id: "quick_hands",
    name: "QUICK HANDS",
    desc: "Faster reload rhythm.",
    costWeight: 100,
    combat: { handling: 3 },
  },
  gunsmith: {
    id: "gunsmith",
    name: "GUNSMITH",
    desc: "Repair efficiency (future).",
    costWeight: 80,
    combat: {},
  },
  medic: {
    id: "medic",
    name: "MEDIC",
    desc: "Field treatment (future).",
    costWeight: 80,
    combat: {},
  },
  scrounger: {
    id: "scrounger",
    name: "SCROUNGER",
    desc: "Loot utility (future).",
    costWeight: 70,
    combat: {},
  },
  quartermaster: {
    id: "quartermaster",
    name: "QUARTERMASTER",
    desc: "Ammo efficiency (future).",
    costWeight: 70,
    combat: {},
  },
};

export const RECRUITABLE_PERK_IDS = ["marksman", "lightfoot", "tough", "quick_hands"] as const;

export const PERK_BY_ID = PERKS;

export function isCanonicalPerkId(id: string): boolean {
  return !!PERKS[id];
}
