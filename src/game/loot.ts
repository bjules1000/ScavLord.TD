/**
 * Canonical raid loot generation.
 *
 * The live game does not store per-crate weighted item tables. Crate opens and
 * post-wave rewards share one procedural pool:
 *
 *   1. pick a kind (weapon chance scales with wave; leftover is split by rest bands)
 *   2. roll a rarity tier from U(0,1) + wave * rarityWaveFactor * lootMult
 *   3. pick an item of that kind+tier (fallback: any of the kind, then any catalog item)
 *
 * Canonical item weights are all 1, so step 3 is uniform inside the tier pool.
 * DEV Economy Lab may override weights, kind/rarity scalars, and map lootMult.
 *
 * Expected-value basis: ItemDef.value ("item value (sell/stash)").
 * There is no separate extracted vs raid sale field.
 */

import type { Item, ItemDef, ItemKind, Rarity } from "./gear";

export const LOOTABLE_KINDS: readonly ItemKind[] = ["weapon", "attachment", "armor", "meds", "valuable"];

export const VALUE_BASIS_KEY = "value";
export const VALUE_BASIS_LABEL = "item value (sell/stash)";

/** Raid backpack scrap uses this multiplier on item value. Not a per-item field. */
export const RAID_SCRAP_MULT = 1.8;

export type LootRules = {
  weaponChanceBase: number;
  weaponChancePerWave: number;
  weaponChanceCap: number;
  /** Upper bound of leftover unit interval awarded to attachments. */
  restAttachment: number;
  /** Upper bound of leftover unit interval awarded through armor. */
  restArmor: number;
  /** Upper bound of leftover unit interval awarded through meds. Valuables take the rest. */
  restMeds: number;
  rarityWaveFactor: number;
  rarityRareAt: number;
  rarityEpicAt: number;
  crateExtraChance: number;
  waveRewardSlots: number;
};

export const CANONICAL_LOOT_RULES: LootRules = {
  weaponChanceBase: 0.07,
  weaponChancePerWave: 0.004,
  weaponChanceCap: 0.05,
  restAttachment: 0.32,
  restArmor: 0.42,
  restMeds: 0.68,
  rarityWaveFactor: 0.022,
  rarityRareAt: 0.68,
  rarityEpicAt: 1.12,
  crateExtraChance: 0.4,
  waveRewardSlots: 3,
};

export const CANONICAL_ITEM_WEIGHT = 1;

export type Rng = () => number;

export type LootWeights = Readonly<Record<string, number>>;

export type LootRuntime = {
  catalog: readonly ItemDef[];
  rules: LootRules;
  weights: LootWeights;
  rng?: Rng;
};

export type KindChanceMap = Record<ItemKind, number>;

const RARITIES: readonly Rarity[] = ["common", "rare", "epic"];

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/** P(U <= t) for U ~ [0, 1). */
function unitAtMost(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

/** P(U > t) for U ~ [0, 1). */
function unitGreaterThan(t: number): number {
  if (t >= 1) return 0;
  if (t <= 0) return 1;
  return 1 - t;
}

export function isLootableKind(kind: ItemKind): boolean {
  return (LOOTABLE_KINDS as readonly string[]).includes(kind);
}

export function lootableItems(catalog: readonly ItemDef[]): ItemDef[] {
  return catalog.filter((i) => isLootableKind(i.kind));
}

export function itemWeight(id: string, weights: LootWeights): number {
  const w = weights[id];
  return typeof w === "number" && Number.isFinite(w) ? w : CANONICAL_ITEM_WEIGHT;
}

/**
 * Normalize raw weights to shares that sum to 1.
 * Negative inputs are treated as 0. An all-zero (or empty) list yields all zeros.
 */
export function normalizeWeights(weights: readonly number[]): number[] {
  const clipped = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = clipped.reduce((a, b) => a + b, 0);
  if (sum <= 0) return clipped.map(() => 0);
  return clipped.map((w) => w / sum);
}

export function weightedTableExpectedValue(entries: readonly { weight: number; value: number }[]): number {
  if (entries.length === 0) return 0;
  const shares = normalizeWeights(entries.map((e) => e.weight));
  return shares.reduce((acc, share, i) => acc + share * entries[i]!.value, 0);
}

export function weaponChance(weaponAllowed: boolean, wave: number, rules: LootRules): number {
  if (!weaponAllowed) return 0;
  return rules.weaponChanceBase + Math.min(rules.weaponChanceCap, wave * rules.weaponChancePerWave);
}

export function kindProbabilities(weaponAllowed: boolean, wave: number, rules: LootRules): KindChanceMap {
  const wpn = weaponChance(weaponAllowed, wave, rules);
  const rest = 1 - wpn;
  return {
    weapon: wpn,
    attachment: rest * rules.restAttachment,
    armor: rest * (rules.restArmor - rules.restAttachment),
    meds: rest * (rules.restMeds - rules.restArmor),
    valuable: rest * (1 - rules.restMeds),
    backpack: 0,
  };
}

export function rarityProbabilities(wave: number, lootMult: number, rules: LootRules): Record<Rarity, number> {
  const offset = wave * rules.rarityWaveFactor * lootMult;
  const pEpic = unitGreaterThan(rules.rarityEpicAt - offset);
  const pCommon = unitAtMost(rules.rarityRareAt - offset);
  const pRare = Math.max(0, 1 - pEpic - pCommon);
  return { common: pCommon, rare: pRare, epic: pEpic };
}

export function crateExtraProbability(lootMult: number, rules: LootRules): number {
  return clamp01(rules.crateExtraChance * lootMult);
}

function pickKind(weaponAllowed: boolean, wave: number, rules: LootRules, rng: Rng): ItemKind {
  const wpn = weaponChance(weaponAllowed, wave, rules);
  const r = rng();
  if (r < wpn) return "weapon";
  const rest = (r - wpn) / (1 - wpn || 1);
  if (rest < rules.restAttachment) return "attachment";
  if (rest < rules.restArmor) return "armor";
  if (rest < rules.restMeds) return "meds";
  return "valuable";
}

function weightedPick(list: readonly ItemDef[], weights: LootWeights, rng: Rng): ItemDef {
  const w = list.map((i) => Math.max(0, itemWeight(i.id, weights)));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return list[Math.floor(rng() * list.length)]!;
  let r = rng() * sum;
  for (let i = 0; i < list.length; i++) {
    r -= w[i]!;
    if (r < 0) return list[i]!;
  }
  return list[list.length - 1]!;
}

function poolOfKind(catalog: readonly ItemDef[], kind: ItemKind, used: ReadonlySet<string>, weights: LootWeights): ItemDef[] {
  const ofKind = catalog.filter((i) => i.kind === kind && !used.has(i.id));
  const positive = ofKind.filter((i) => itemWeight(i.id, weights) > 0);
  return positive.length ? positive : ofKind;
}

export function pickOfKind(
  kind: ItemKind,
  wave: number,
  lootMult: number,
  used: ReadonlySet<string>,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  rng: Rng,
): ItemDef {
  const roll = rng() + wave * rules.rarityWaveFactor * lootMult;
  const tier: Rarity = roll > rules.rarityEpicAt ? "epic" : roll > rules.rarityRareAt ? "rare" : "common";
  const ofKind = poolOfKind(catalog, kind, used, weights);
  const tiered = ofKind.filter((i) => i.rarity === tier);
  const list = tiered.length ? tiered : ofKind.length ? ofKind : catalog.filter((i) => !used.has(i.id));
  const finalList = list.length ? list : catalog;
  return weightedPick(finalList, weights, rng);
}

function defaultRuntime(partial?: Partial<LootRuntime> & { catalog: readonly ItemDef[] }): {
  catalog: readonly ItemDef[];
  rules: LootRules;
  weights: LootWeights;
  rng: Rng;
} {
  return {
    catalog: partial!.catalog,
    rules: partial?.rules ?? CANONICAL_LOOT_RULES,
    weights: partial?.weights ?? {},
    rng: partial?.rng ?? Math.random,
  };
}

export function generateChoices(
  wave: number,
  uidStart: number,
  lootMult: number,
  runtime: Partial<LootRuntime> & { catalog: readonly ItemDef[] },
): Item[] {
  const { catalog, rules, weights, rng } = defaultRuntime(runtime);
  const out: Item[] = [];
  const used = new Set<string>();
  let weaponsLeft = 1;
  const slots = Math.max(0, Math.round(rules.waveRewardSlots));
  for (let i = 0; i < slots; i++) {
    const kind = pickKind(weaponsLeft > 0, wave, rules, rng);
    if (kind === "weapon") weaponsLeft--;
    const def = pickOfKind(kind, wave, lootMult, used, catalog, rules, weights, rng);
    used.add(def.id);
    out.push({ ...def, uid: uidStart + i });
  }
  return out;
}

export function generateCrate(
  wave: number,
  uidStart: number,
  lootMult: number,
  runtime: Partial<LootRuntime> & { catalog: readonly ItemDef[] },
): Item[] {
  const { catalog, rules, weights, rng } = defaultRuntime(runtime);
  const extra = rng() < rules.crateExtraChance * lootMult ? 1 : 0;
  const n = 1 + extra;
  const out: Item[] = [];
  const used = new Set<string>();
  let weaponsLeft = 1;
  for (let i = 0; i < n; i++) {
    const kind = pickKind(weaponsLeft > 0, wave, rules, rng);
    if (kind === "weapon") weaponsLeft--;
    const def = pickOfKind(kind, wave, lootMult, used, catalog, rules, weights, rng);
    used.add(def.id);
    out.push({ ...def, uid: uidStart + i });
  }
  return out;
}

export type SlotDistribution = Map<string, number>;

/**
 * Probability of each item id being selected on one generation slot
 * (kind roll + rarity roll + weighted pick inside the resulting pool).
 */
export function slotDistribution(
  used: ReadonlySet<string>,
  weaponAllowed: boolean,
  wave: number,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
): SlotDistribution {
  const dist: SlotDistribution = new Map();
  const kindP = kindProbabilities(weaponAllowed, wave, rules);
  const rarP = rarityProbabilities(wave, lootMult, rules);
  for (const kind of LOOTABLE_KINDS) {
    const pk = kindP[kind];
    if (pk <= 0) continue;
    const ofKind = poolOfKind(catalog, kind, used, weights);
    if (ofKind.length === 0) continue;
    for (const rarity of RARITIES) {
      const pr = rarP[rarity];
      if (pr <= 0) continue;
      const tiered = ofKind.filter((i) => i.rarity === rarity);
      const list = tiered.length ? tiered : ofKind;
      const shares = normalizeWeights(list.map((i) => itemWeight(i.id, weights)));
      for (let i = 0; i < list.length; i++) {
        const id = list[i]!.id;
        dist.set(id, (dist.get(id) ?? 0) + pk * pr * shares[i]!);
      }
    }
  }
  return dist;
}

export function firstSlotChance(
  itemId: string,
  wave: number,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  weaponAllowed = true,
): number {
  return slotDistribution(new Set(), weaponAllowed, wave, lootMult, catalog, rules, weights).get(itemId) ?? 0;
}

export function poolShare(
  itemId: string,
  catalog: readonly ItemDef[],
  weights: LootWeights,
): number {
  const item = catalog.find((i) => i.id === itemId);
  if (!item || !isLootableKind(item.kind)) return 0;
  const peers = catalog.filter((i) => i.kind === item.kind && i.rarity === item.rarity);
  const shares = normalizeWeights(peers.map((i) => itemWeight(i.id, weights)));
  const idx = peers.findIndex((i) => i.id === itemId);
  return idx >= 0 ? (shares[idx] ?? 0) : 0;
}

function valueOf(id: string, catalog: readonly ItemDef[]): number {
  return catalog.find((i) => i.id === id)?.value ?? 0;
}

function expectedValueFromDist(dist: SlotDistribution, catalog: readonly ItemDef[]): number {
  let ev = 0;
  for (const [id, p] of dist) ev += p * valueOf(id, catalog);
  return ev;
}

export type LootEvResult =
  | { supported: true; value: number; formula: string }
  | { supported: false; reason: string };

const CRATE_FORMULA =
  `EV = E[value of slot 1] + P(extra) * E[value of slot 2 | slot 1]. ` +
  `P(extra) = clamp01(crateExtraChance * lootMult). ` +
  `Each slot: P(kind) * P(rarity) * (weight / sum of weights in the kind+rarity pool, with empty-tier fallback). ` +
  `At most one weapon per roll. Without replacement. Basis: ${VALUE_BASIS_LABEL}.`;

const REWARD_FORMULA =
  `EV = E[max ${VALUE_BASIS_LABEL} among the ${CANONICAL_LOOT_RULES.waveRewardSlots} offered items]. ` +
  `Assumes the player takes the highest-value choice. Same kind/rarity/weight slot model as crates, without replacement, max one weapon.`;

/**
 * Expected combined sell/stash value of items generated by one crate open.
 */
export function crateExpectedValue(
  wave: number,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
): LootEvResult {
  const lootable = lootableItems(catalog);
  if (lootable.length === 0) return { supported: true, value: 0, formula: CRATE_FORMULA };
  const dist1 = slotDistribution(new Set(), true, wave, lootMult, catalog, rules, weights);
  if (dist1.size === 0) return { supported: true, value: 0, formula: CRATE_FORMULA };
  const extraP = crateExtraProbability(lootMult, rules);
  let ev = expectedValueFromDist(dist1, catalog);
  if (extraP > 0) {
    for (const [id, p] of dist1) {
      if (p <= 0) continue;
      const def = catalog.find((i) => i.id === id);
      const weaponsLeft = def?.kind === "weapon" ? 0 : 1;
      const dist2 = slotDistribution(new Set([id]), weaponsLeft > 0, wave, lootMult, catalog, rules, weights);
      ev += extraP * p * expectedValueFromDist(dist2, catalog);
    }
  }
  return { supported: true, value: ev, formula: CRATE_FORMULA };
}

/**
 * Expected sell/stash value of the best-value pick among wave-reward choices.
 */
export function rewardExpectedValue(
  wave: number,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
): LootEvResult {
  const slots = Math.max(0, Math.round(rules.waveRewardSlots));
  if (slots === 0) return { supported: true, value: 0, formula: REWARD_FORMULA };
  const memo = new Map<string, number>();
  const walk = (used: string[], weaponsLeft: number, remaining: number, best: number): number => {
    if (remaining === 0) return best;
    const key = `${used.slice().sort().join(",")}|${weaponsLeft}|${remaining}|${best}`;
    const hit = memo.get(key);
    if (hit != null) return hit;
    const dist = slotDistribution(new Set(used), weaponsLeft > 0, wave, lootMult, catalog, rules, weights);
    if (dist.size === 0) {
      memo.set(key, best);
      return best;
    }
    let acc = 0;
    for (const [id, p] of dist) {
      if (p <= 0) continue;
      const v = valueOf(id, catalog);
      const def = catalog.find((i) => i.id === id);
      const nextWeapons = def?.kind === "weapon" ? 0 : weaponsLeft;
      acc += p * walk([...used, id], nextWeapons, remaining - 1, Math.max(best, v));
    }
    memo.set(key, acc);
    return acc;
  };
  return { supported: true, value: walk([], 1, slots, 0), formula: REWARD_FORMULA };
}

export function raidScrapValue(sellValue: number): number {
  return sellValue * RAID_SCRAP_MULT;
}
