/**
 * Canonical raid loot generation.
 *
 * Resolution order for one slot:
 *   1. source context → loot profile (map + crate|reward)
 *   2. eligibility: enabled, weight > 0, minWave ≤ wave ≤ maxWave (if set), lootable kind
 *   3. kind roll among kinds that still have eligible unused items
 *      (weapon band scales with wave; leftover is split by rest bands.
 *       empty kinds are zeroed and remaining kind probabilities are renormalized.
 *       no eligible weapons is treated like weaponAllowed=false.)
 *   4. rarity from U(0,1) + wave * rarityWaveFactor * map.lootMult
 *   5. weighted pick in kind+rarity among source-eligible items
 *      empty tier → any eligible of that kind. NEVER the global catalog.
 *   6. crate extra slot: P = clamp01(crateExtraChance * lootMult)
 *   7. at most one weapon per open/reward set; without replacement
 *
 * Canonical default profiles keep every lootable item enabled, weight 1,
 * minWave 1, maxWave unset — equivalent to the previous shared pool.
 *
 * Expected-value basis: ItemDef.value ("item value (sell/stash)").
 */

import type { Item, ItemDef, ItemKind, Rarity } from "./gear";
import {
  LOOTABLE_KINDS,
  eligibleLootItems,
  isLootableKind,
  kindsWithEligibleItems,
  resolveProfileEntry,
  type LootProfile,
  type LootSourceId,
  type ProfileIssue,
} from "./lootProfiles";

export { LOOTABLE_KINDS, isLootableKind } from "./lootProfiles";

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
  /** Sparse per-item overrides for the resolved source profile. */
  profile?: LootProfile;
  sourceId?: LootSourceId;
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

export function lootableItems(catalog: readonly ItemDef[]): ItemDef[] {
  return catalog.filter((i) => isLootableKind(i.kind));
}

export function itemWeight(id: string, weights: LootWeights): number {
  const w = weights[id];
  return typeof w === "number" && Number.isFinite(w) ? w : CANONICAL_ITEM_WEIGHT;
}

export function profileWeight(id: string, profile: LootProfile | undefined, weights: LootWeights): number {
  return resolveProfileEntry(id, profile, itemWeight(id, weights)).weight;
}

export function emptyKindChances(): KindChanceMap {
  return { weapon: 0, attachment: 0, armor: 0, meds: 0, valuable: 0, backpack: 0 };
}

/**
 * Canonical kind bands, with empty source-eligible kinds zeroed and the rest
 * renormalized to 1. If no weapons are eligible, this matches weaponAllowed=false
 * (the weapon band is not rolled, leftover bands use the full unit interval).
 */
export function eligibleKindProbabilities(
  weaponAllowed: boolean,
  flags: Record<ItemKind, boolean>,
  wave: number,
  rules: LootRules,
): KindChanceMap {
  const raw = kindProbabilities(weaponAllowed && flags.weapon, wave, rules);
  const masked = emptyKindChances();
  for (const kind of LOOTABLE_KINDS) {
    masked[kind] = flags[kind] ? raw[kind] : 0;
  }
  const sum = LOOTABLE_KINDS.reduce((acc, kind) => acc + masked[kind], 0);
  if (sum <= 0) return emptyKindChances();
  if (Math.abs(sum - 1) < 1e-12) return masked;
  const scale = 1 / sum;
  const out = emptyKindChances();
  for (const kind of LOOTABLE_KINDS) out[kind] = masked[kind] * scale;
  return out;
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

function restKindsComplete(flags: Record<ItemKind, boolean>): boolean {
  return LOOTABLE_KINDS.filter((k) => k !== "weapon").every((k) => flags[k]);
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

function sampleKind(chances: KindChanceMap, rng: Rng): ItemKind | null {
  const sum = LOOTABLE_KINDS.reduce((acc, kind) => acc + chances[kind], 0);
  if (sum <= 0) return null;
  let r = rng() * sum;
  for (const kind of LOOTABLE_KINDS) {
    r -= chances[kind];
    if (r < 0) return kind;
  }
  return LOOTABLE_KINDS[LOOTABLE_KINDS.length - 1]!;
}

function pickEligibleKind(
  weaponAllowed: boolean,
  flags: Record<ItemKind, boolean>,
  wave: number,
  rules: LootRules,
  rng: Rng,
): ItemKind | null {
  if (restKindsComplete(flags)) {
    if (!flags.weapon && !LOOTABLE_KINDS.some((k) => k !== "weapon" && flags[k])) return null;
    return pickKind(weaponAllowed && flags.weapon, wave, rules, rng);
  }
  return sampleKind(eligibleKindProbabilities(weaponAllowed, flags, wave, rules), rng);
}

function weightedPick(
  list: readonly ItemDef[],
  profile: LootProfile | undefined,
  weights: LootWeights,
  rng: Rng,
): ItemDef {
  const w = list.map((i) => Math.max(0, profileWeight(i.id, profile, weights)));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return list[Math.floor(rng() * list.length)]!;
  let r = rng() * sum;
  for (let i = 0; i < list.length; i++) {
    r -= w[i]!;
    if (r < 0) return list[i]!;
  }
  return list[list.length - 1]!;
}

function poolOfKind(
  eligible: readonly ItemDef[],
  kind: ItemKind,
  profile: LootProfile | undefined,
  weights: LootWeights,
): ItemDef[] {
  const ofKind = eligible.filter((i) => i.kind === kind);
  const positive = ofKind.filter((i) => profileWeight(i.id, profile, weights) > 0);
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
  profile?: LootProfile,
): ItemDef | null {
  const roll = rng() + wave * rules.rarityWaveFactor * lootMult;
  const tier: Rarity = roll > rules.rarityEpicAt ? "epic" : roll > rules.rarityRareAt ? "rare" : "common";
  const eligible = eligibleLootItems(catalog, wave, profile, (id) => itemWeight(id, weights), used);
  const ofKind = poolOfKind(eligible, kind, profile, weights);
  const tiered = ofKind.filter((i) => i.rarity === tier);
  const list = tiered.length ? tiered : ofKind;
  if (list.length === 0) return null;
  return weightedPick(list, profile, weights, rng);
}

function defaultRuntime(partial?: Partial<LootRuntime> & { catalog: readonly ItemDef[] }): {
  catalog: readonly ItemDef[];
  rules: LootRules;
  weights: LootWeights;
  profile: LootProfile | undefined;
  sourceId: LootSourceId | undefined;
  rng: Rng;
} {
  return {
    catalog: partial!.catalog,
    rules: partial?.rules ?? CANONICAL_LOOT_RULES,
    weights: partial?.weights ?? {},
    profile: partial?.profile,
    sourceId: partial?.sourceId,
    rng: partial?.rng ?? Math.random,
  };
}

function rollSlots(
  count: number,
  wave: number,
  uidStart: number,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  profile: LootProfile | undefined,
  rng: Rng,
): Item[] {
  const out: Item[] = [];
  const used = new Set<string>();
  let weaponsLeft = 1;
  for (let i = 0; i < count; i++) {
    const eligible = eligibleLootItems(catalog, wave, profile, (id) => itemWeight(id, weights), used);
    if (eligible.length === 0) break;
    const flags = kindsWithEligibleItems(eligible);
    const kind = pickEligibleKind(weaponsLeft > 0, flags, wave, rules, rng);
    if (!kind) break;
    if (kind === "weapon") weaponsLeft--;
    const def = pickOfKind(kind, wave, lootMult, used, catalog, rules, weights, rng, profile);
    if (!def) break;
    used.add(def.id);
    out.push({ ...def, uid: uidStart + i });
  }
  return out;
}

export function generateChoices(
  wave: number,
  uidStart: number,
  lootMult: number,
  runtime: Partial<LootRuntime> & { catalog: readonly ItemDef[] },
): Item[] {
  const { catalog, rules, weights, profile, rng } = defaultRuntime(runtime);
  const slots = Math.max(0, Math.round(rules.waveRewardSlots));
  return rollSlots(slots, wave, uidStart, lootMult, catalog, rules, weights, profile, rng);
}

export function generateCrate(
  wave: number,
  uidStart: number,
  lootMult: number,
  runtime: Partial<LootRuntime> & { catalog: readonly ItemDef[] },
): Item[] {
  const { catalog, rules, weights, profile, rng } = defaultRuntime(runtime);
  const extra = rng() < rules.crateExtraChance * lootMult ? 1 : 0;
  return rollSlots(1 + extra, wave, uidStart, lootMult, catalog, rules, weights, profile, rng);
}

export type SlotDistribution = Map<string, number>;

/**
 * Probability of each item id being selected on one generation slot
 * (kind roll + rarity roll + weighted pick inside the source-eligible pool).
 */
export function slotDistribution(
  used: ReadonlySet<string>,
  weaponAllowed: boolean,
  wave: number,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  profile?: LootProfile,
): SlotDistribution {
  const dist: SlotDistribution = new Map();
  const eligible = eligibleLootItems(catalog, wave, profile, (id) => itemWeight(id, weights), used);
  const flags = kindsWithEligibleItems(eligible);
  const kindP = eligibleKindProbabilities(weaponAllowed, flags, wave, rules);
  const rarP = rarityProbabilities(wave, lootMult, rules);
  for (const kind of LOOTABLE_KINDS) {
    const pk = kindP[kind];
    if (pk <= 0) continue;
    const ofKind = poolOfKind(eligible, kind, profile, weights);
    if (ofKind.length === 0) continue;
    for (const rarity of RARITIES) {
      const pr = rarP[rarity];
      if (pr <= 0) continue;
      const tiered = ofKind.filter((i) => i.rarity === rarity);
      const list = tiered.length ? tiered : ofKind;
      const shares = normalizeWeights(list.map((i) => profileWeight(i.id, profile, weights)));
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
  profile?: LootProfile,
): number {
  return slotDistribution(new Set(), weaponAllowed, wave, lootMult, catalog, rules, weights, profile).get(itemId) ?? 0;
}

export function poolShare(
  itemId: string,
  catalog: readonly ItemDef[],
  weights: LootWeights,
  profile?: LootProfile,
  wave?: number,
): number {
  const item = catalog.find((i) => i.id === itemId);
  if (!item || !isLootableKind(item.kind)) return 0;
  const pool =
    wave == null
      ? catalog.filter((i) => isLootableKind(i.kind))
      : eligibleLootItems(catalog, wave, profile, (id) => itemWeight(id, weights));
  if (wave != null && !pool.some((i) => i.id === itemId)) return 0;
  const peers = pool.filter((i) => i.kind === item.kind && i.rarity === item.rarity);
  const shares = normalizeWeights(peers.map((i) => profileWeight(i.id, profile, weights)));
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
  `Each slot: source-profile eligibility, then P(kind) * P(rarity) * (weight / sum of weights in the kind+rarity pool, with empty-tier fallback inside the source). ` +
  `At most one weapon per roll. Without replacement. Basis: ${VALUE_BASIS_LABEL}.`;

const REWARD_FORMULA =
  `EV = E[max ${VALUE_BASIS_LABEL} among the ${CANONICAL_LOOT_RULES.waveRewardSlots} offered items]. ` +
  `Assumes the player takes the highest-value choice. Same source-profile + kind/rarity/weight slot model as crates, without replacement, max one weapon.`;

/**
 * Expected combined sell/stash value of items generated by one crate open.
 */
export function crateExpectedValue(
  wave: number,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  profile?: LootProfile,
): LootEvResult {
  const lootable = eligibleLootItems(catalog, wave, profile, (id) => itemWeight(id, weights));
  if (lootable.length === 0) return { supported: true, value: 0, formula: CRATE_FORMULA };
  const dist1 = slotDistribution(new Set(), true, wave, lootMult, catalog, rules, weights, profile);
  if (dist1.size === 0) return { supported: true, value: 0, formula: CRATE_FORMULA };
  const extraP = crateExtraProbability(lootMult, rules);
  let ev = expectedValueFromDist(dist1, catalog);
  if (extraP > 0) {
    for (const [id, p] of dist1) {
      if (p <= 0) continue;
      const def = catalog.find((i) => i.id === id);
      const weaponsLeft = def?.kind === "weapon" ? 0 : 1;
      const dist2 = slotDistribution(new Set([id]), weaponsLeft > 0, wave, lootMult, catalog, rules, weights, profile);
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
  profile?: LootProfile,
): LootEvResult {
  const slots = Math.max(0, Math.round(rules.waveRewardSlots));
  if (slots === 0) return { supported: true, value: 0, formula: REWARD_FORMULA };
  const memo = new Map<string, number>();
  const walk = (used: string[], weaponsLeft: number, remaining: number, best: number): number => {
    if (remaining === 0) return best;
    const key = `${used.slice().sort().join(",")}|${weaponsLeft}|${remaining}|${best}`;
    const hit = memo.get(key);
    if (hit != null) return hit;
    const dist = slotDistribution(new Set(used), weaponsLeft > 0, wave, lootMult, catalog, rules, weights, profile);
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

export type ExpectedAppearancesResult =
  | { supported: true; perOpen: number; perTenOpens: number; formula: string }
  | { supported: false; reason: string };

const CRATE_APPEARANCES_FORMULA =
  "E[count per open] = P(slot 1 = item) + P(extra) * P(slot 2 = item | slot 1). Without replacement, at most one weapon. ×10 for ten opens.";

const REWARD_APPEARANCES_FORMULA =
  "E[count per reward set] = sum of P(item in slot i) across wave-reward slots. Without replacement, at most one weapon. ×10 for ten sets.";

export function crateExpectedItemCount(
  itemId: string,
  wave: number,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  profile?: LootProfile,
): number {
  const dist1 = slotDistribution(new Set(), true, wave, lootMult, catalog, rules, weights, profile);
  const p1 = dist1.get(itemId) ?? 0;
  const extraP = crateExtraProbability(lootMult, rules);
  if (extraP <= 0) return p1;
  let p2 = 0;
  for (const [id, p] of dist1) {
    if (p <= 0) continue;
    const def = catalog.find((i) => i.id === id);
    const weaponsLeft = def?.kind === "weapon" ? 0 : 1;
    const dist2 = slotDistribution(new Set([id]), weaponsLeft > 0, wave, lootMult, catalog, rules, weights, profile);
    p2 += p * (dist2.get(itemId) ?? 0);
  }
  return p1 + extraP * p2;
}

export function rewardExpectedItemCount(
  itemId: string,
  wave: number,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  profile?: LootProfile,
): number {
  const slots = Math.max(0, Math.round(rules.waveRewardSlots));
  if (slots === 0) return 0;
  const memo = new Map<string, number>();
  const walk = (used: string[], weaponsLeft: number, remaining: number): number => {
    if (remaining === 0) return 0;
    const key = `${used.slice().sort().join(",")}|${weaponsLeft}|${remaining}`;
    const hit = memo.get(key);
    if (hit != null) return hit;
    const dist = slotDistribution(new Set(used), weaponsLeft > 0, wave, lootMult, catalog, rules, weights, profile);
    if (dist.size === 0) {
      memo.set(key, 0);
      return 0;
    }
    let acc = 0;
    for (const [id, p] of dist) {
      if (p <= 0) continue;
      const def = catalog.find((i) => i.id === id);
      const nextWeapons = def?.kind === "weapon" ? 0 : weaponsLeft;
      const hitItem = id === itemId ? 1 : 0;
      acc += p * (hitItem + walk([...used, id], nextWeapons, remaining - 1));
    }
    memo.set(key, acc);
    return acc;
  };
  return walk([], 1, slots);
}

export function expectedAppearances(
  itemId: string,
  sourceType: "crate" | "reward",
  wave: number,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  profile?: LootProfile,
): ExpectedAppearancesResult {
  const perOpen =
    sourceType === "crate"
      ? crateExpectedItemCount(itemId, wave, lootMult, catalog, rules, weights, profile)
      : rewardExpectedItemCount(itemId, wave, lootMult, catalog, rules, weights, profile);
  return {
    supported: true,
    perOpen,
    perTenOpens: perOpen * 10,
    formula: sourceType === "crate" ? CRATE_APPEARANCES_FORMULA : REWARD_APPEARANCES_FORMULA,
  };
}

export type ProgressionRow = {
  wave: number;
  eligible: boolean;
  firstSlotChance: number;
};

export const PROGRESSION_PREVIEW_WAVES = 12;

export function itemEligibleAtWave(
  itemId: string,
  wave: number,
  catalog: readonly ItemDef[],
  weights: LootWeights,
  profile?: LootProfile,
): boolean {
  const def = catalog.find((i) => i.id === itemId);
  if (!def) return false;
  return eligibleLootItems(catalog, wave, profile, (id) => itemWeight(id, weights)).some((i) => i.id === itemId);
}

export function progressionPreview(
  itemId: string,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  profile?: LootProfile,
  throughWave = PROGRESSION_PREVIEW_WAVES,
): ProgressionRow[] {
  const rows: ProgressionRow[] = [];
  for (let wave = 1; wave <= throughWave; wave++) {
    rows.push({
      wave,
      eligible: itemEligibleAtWave(itemId, wave, catalog, weights, profile),
      firstSlotChance: firstSlotChance(itemId, wave, lootMult, catalog, rules, weights, true, profile),
    });
  }
  return rows;
}

export function earliestPositiveChanceWave(
  itemId: string,
  lootMult: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  profile?: LootProfile,
  throughWave = 40,
): number | null {
  for (let wave = 1; wave <= throughWave; wave++) {
    if (firstSlotChance(itemId, wave, lootMult, catalog, rules, weights, true, profile) > 0) return wave;
  }
  return null;
}

export function validateLootPoolWarnings(
  sourceId: string,
  wave: number,
  catalog: readonly ItemDef[],
  rules: LootRules,
  weights: LootWeights,
  profile?: LootProfile,
): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const eligible = eligibleLootItems(catalog, wave, profile, (id) => itemWeight(id, weights));
  if (eligible.length === 0) {
    issues.push({
      level: "warning",
      code: "EMPTY_SOURCE",
      message: `Source ${sourceId} has no eligible items at wave ${wave}.`,
      sourceId,
    });
    return issues;
  }
  const flags = kindsWithEligibleItems(eligible);
  const weaponAllowed = flags.weapon;
  const chances = eligibleKindProbabilities(true, flags, wave, rules);
  if (chances.weapon > 0 && !flags.weapon) {
    issues.push({
      level: "warning",
      code: "NO_WEAPON",
      message: `Source ${sourceId} can roll weapon kind at wave ${wave} but no weapon is eligible.`,
      sourceId,
    });
  }
  if (!weaponAllowed && kindProbabilities(true, wave, rules).weapon > 0) {
    issues.push({
      level: "warning",
      code: "NO_WEAPON",
      message: `Source ${sourceId} has no eligible weapon at wave ${wave}; weapon chance is redistributed.`,
      sourceId,
    });
  }
  for (const kind of LOOTABLE_KINDS) {
    const raw = kindProbabilities(weaponAllowed, wave, rules)[kind];
    if (raw > 0 && !flags[kind]) {
      issues.push({
        level: "warning",
        code: "EMPTY_KIND",
        message: `Source ${sourceId} has no eligible ${kind} at wave ${wave}; that kind is skipped.`,
        sourceId,
      });
    }
  }
  return issues;
}

export function raidScrapValue(sellValue: number): number {
  return sellValue * RAID_SCRAP_MULT;
}
