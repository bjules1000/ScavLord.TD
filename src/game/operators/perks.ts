export type TraitPolarity = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  polarity: TraitPolarity;
  /** Recruitment cost weight. Negative traits use negative weights. */
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
    polarity: "POSITIVE",
    costWeight: 120,
    combat: { aim: 3 },
  },
  lightfoot: {
    id: "lightfoot",
    name: "LIGHTFOOT",
    desc: "Moves better under kit weight.",
    polarity: "POSITIVE",
    costWeight: 100,
    combat: { mobility: 3 },
  },
  tough: {
    id: "tough",
    name: "TOUGH",
    desc: "Slightly higher survivability.",
    polarity: "POSITIVE",
    costWeight: 110,
    combat: { toughness: 3 },
  },
  quick_hands: {
    id: "quick_hands",
    name: "QUICK HANDS",
    desc: "Faster reload rhythm.",
    polarity: "POSITIVE",
    costWeight: 100,
    combat: { handling: 3 },
  },
  gunsmith: {
    id: "gunsmith",
    name: "GUNSMITH",
    desc: "Repair efficiency (future).",
    polarity: "NEUTRAL",
    costWeight: 80,
    combat: {},
  },
  medic: {
    id: "medic",
    name: "MEDIC",
    desc: "Field treatment (future).",
    polarity: "NEUTRAL",
    costWeight: 80,
    combat: {},
  },
  scrounger: {
    id: "scrounger",
    name: "SCROUNGER",
    desc: "Loot utility (future).",
    polarity: "NEUTRAL",
    costWeight: 70,
    combat: {},
  },
  quartermaster: {
    id: "quartermaster",
    name: "QUARTERMASTER",
    desc: "Ammo efficiency (future).",
    polarity: "NEUTRAL",
    costWeight: 70,
    combat: {},
  },
  wobbly_aim: {
    id: "wobbly_aim",
    name: "WOBBLY AIM",
    desc: "Slightly less steady under pressure.",
    polarity: "NEGATIVE",
    costWeight: -60,
    combat: { aim: -2 },
  },
  heavy_boots: {
    id: "heavy_boots",
    name: "HEAVY BOOTS",
    desc: "Moves a bit slower under kit.",
    polarity: "NEGATIVE",
    costWeight: -55,
    combat: { mobility: -2 },
  },
  slow_hands: {
    id: "slow_hands",
    name: "SLOW HANDS",
    desc: "Reload rhythm is slightly sluggish.",
    polarity: "NEGATIVE",
    costWeight: -55,
    combat: { handling: -2 },
  },
};

export const RECRUITABLE_PERK_IDS = ["marksman", "lightfoot", "tough", "quick_hands"] as const;

export const RECRUITABLE_NEGATIVE_TRAIT_IDS = ["wobbly_aim", "heavy_boots", "slow_hands"] as const;

export const PERK_BY_ID = PERKS;

export function isCanonicalPerkId(id: string): boolean {
  return !!PERKS[id];
}

export function traitPolarity(id: string): TraitPolarity {
  return PERKS[id]?.polarity ?? "NEUTRAL";
}

export function isPositivePerkId(id: string): boolean {
  return traitPolarity(id) === "POSITIVE";
}

export function isNegativeTraitId(id: string): boolean {
  return traitPolarity(id) === "NEGATIVE";
}

export function allTraitIds(candidate: { perkIds: string[]; negativeTraitIds?: string[] }): string[] {
  return [...candidate.perkIds, ...(candidate.negativeTraitIds ?? [])];
}
