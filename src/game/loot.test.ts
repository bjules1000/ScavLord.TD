import { describe, expect, it } from "bun:test";
import { ITEMS } from "./gear";
import {
  CANONICAL_ITEM_WEIGHT,
  CANONICAL_LOOT_RULES,
  VALUE_BASIS_KEY,
  crateExpectedValue,
  crateExtraProbability,
  firstSlotChance,
  generateCrate,
  kindProbabilities,
  lootableItems,
  normalizeWeights,
  poolShare,
  rarityProbabilities,
  weightedTableExpectedValue,
} from "./loot";

describe("loot weight normalization", () => {
  it("weighted table normalizes correctly", () => {
    expect(normalizeWeights([30, 25, 10, 2])).toEqual([30 / 67, 25 / 67, 10 / 67, 2 / 67]);
  });

  it("zero-weight behavior is handled safely", () => {
    expect(normalizeWeights([0, 0, 0])).toEqual([0, 0, 0]);
    expect(normalizeWeights([2, 0, 2])).toEqual([0.5, 0, 0.5]);
    expect(normalizeWeights([])).toEqual([]);
  });

  it("negative weights are treated as zero during normalize", () => {
    expect(normalizeWeights([-4, 4])).toEqual([0, 1]);
  });
});

describe("simple weighted expected value", () => {
  it("simple weighted table EV is correct", () => {
    expect(
      weightedTableExpectedValue([
        { weight: 1, value: 100 },
        { weight: 1, value: 300 },
      ]),
    ).toBe(200);
    expect(
      weightedTableExpectedValue([
        { weight: 3, value: 10 },
        { weight: 1, value: 90 },
      ]),
    ).toBe(30);
  });

  it("empty table EV is 0", () => {
    expect(weightedTableExpectedValue([])).toBe(0);
  });

  it("EV uses documented canonical sale/value basis", () => {
    expect(VALUE_BASIS_KEY).toBe("value");
    expect(ITEMS.every((i) => typeof i.value === "number")).toBe(true);
  });
});

describe("canonical generator math", () => {
  it("kind bands match the extracted canonical rules at wave 1", () => {
    const p = kindProbabilities(true, 1, CANONICAL_LOOT_RULES);
    expect(p.weapon).toBeCloseTo(0.074);
    expect(p.attachment).toBeCloseTo((1 - 0.074) * 0.32);
    expect(p.backpack).toBe(0);
    const sum = p.weapon + p.attachment + p.armor + p.meds + p.valuable;
    expect(sum).toBeCloseTo(1);
  });

  it("rarity uses U(0,1) + wave * factor * lootMult", () => {
    const r = rarityProbabilities(1, 1, CANONICAL_LOOT_RULES);
    expect(r.epic).toBe(0);
    expect(r.common).toBeCloseTo(0.68 - 0.022);
    expect(r.rare).toBeCloseTo(1 - r.common - r.epic);
  });

  it("crate extra-item chance is crateExtraChance * lootMult, clamped", () => {
    expect(crateExtraProbability(1, CANONICAL_LOOT_RULES)).toBeCloseTo(0.4);
    expect(crateExtraProbability(1.35, CANONICAL_LOOT_RULES)).toBeCloseTo(0.54);
    expect(crateExtraProbability(10, CANONICAL_LOOT_RULES)).toBe(1);
  });
});

describe("crate expected value uses canonical generation", () => {
  const catalog = ITEMS;
  const rules = CANONICAL_LOOT_RULES;
  const weights = {};

  it("crate EV is not a naive one-item Σp·v because of the extra-item roll", () => {
    const crate = crateExpectedValue(1, 1, catalog, rules, weights);
    expect(crate.supported).toBe(true);
    if (!crate.supported) return;
    const first = lootableItems(catalog).reduce(
      (a, i) => a + firstSlotChance(i.id, 1, 1, catalog, rules, weights) * i.value,
      0,
    );
    expect(crate.value).toBeGreaterThan(first);
    expect(crate.formula).toContain("P(extra)");
    expect(crate.formula).toContain("item value (sell/stash)");
  });

  it("first-slot chances follow rarity: commons at wave 1, epics once the epic threshold is reachable", () => {
    for (const item of lootableItems(catalog).filter((i) => i.rarity !== "epic")) {
      expect(firstSlotChance(item.id, 1, 1, catalog, rules, weights)).toBeGreaterThan(0);
      expect(poolShare(item.id, catalog, weights)).toBeGreaterThan(0);
    }
    for (const item of lootableItems(catalog).filter((i) => i.rarity === "epic")) {
      expect(firstSlotChance(item.id, 1, 1, catalog, rules, weights)).toBe(0);
      expect(firstSlotChance(item.id, 10, 1, catalog, rules, weights)).toBeGreaterThan(0);
    }
  });

  it("backpacks are not in the lootable pool", () => {
    expect(lootableItems(catalog).some((i) => i.kind === "backpack")).toBe(false);
    expect(firstSlotChance("bp_scav", 1, 1, catalog, rules, weights)).toBe(0);
  });
});

describe("injected rng crate generation", () => {
  it("honors weights when picking inside a known pool", () => {
    const rareAtt = ITEMS.filter((i) => i.kind === "attachment" && i.rarity === "rare");
    expect(rareAtt.length).toBeGreaterThan(1);
    const target = rareAtt[1]!;
    const others = rareAtt.filter((i) => i.id !== target.id);
    const weights = Object.fromEntries(others.map((i) => [i.id, 0]));
    weights[target.id] = 10;
    const values = [0.9, 0.2, 0.7, 0];
    let i = 0;
    const rng = () => values[i++] ?? 0.5;
    const crate = generateCrate(1, 1, 1, { catalog: ITEMS, weights, rng });
    expect(crate.length).toBe(1);
    expect(crate[0]!.kind).toBe("attachment");
    expect(crate[0]!.id).toBe(target.id);
  });
});

describe("canonical item weight", () => {
  it("defaults to 1", () => {
    expect(CANONICAL_ITEM_WEIGHT).toBe(1);
  });
});
