import { describe, expect, it } from "bun:test";
import { ITEMS } from "./gear";
import {
  CANONICAL_LOOT_RULES,
  crateExpectedValue,
  expectedAppearances,
  firstSlotChance,
  generateCrate,
  itemEligibleAtWave,
  rarityProbabilities,
} from "./loot";
import {
  canonicalLootSources,
  futureLootSourceId,
  isCanonicalLootSourceId,
  lootSourceId,
  mapHasCrates,
  validateProfileOverrides,
  type LootProfile,
} from "./lootProfiles";

const WOODS_CRATE = lootSourceId("woods", "crate");
const FACTORY_CRATE = lootSourceId("factory", "crate");
const WOODS_REWARD = lootSourceId("woods", "reward");

function profile(itemId: string, over: LootProfile[string]): LootProfile {
  return { [itemId]: over };
}

describe("canonical source contexts", () => {
  it("creates distinct crate and reward contexts per map that has them", () => {
    const ids = canonicalLootSources().map((s) => s.id);
    expect(ids).toContain(WOODS_CRATE);
    expect(ids).toContain(WOODS_REWARD);
    expect(ids).toContain(FACTORY_CRATE);
    expect(ids).toContain(lootSourceId("factory", "reward"));
    expect(ids).toContain(lootSourceId("kolkhoz", "reward"));
    expect(ids).not.toContain(lootSourceId("kolkhoz", "crate"));
    expect(mapHasCrates("kolkhoz")).toBe(false);
    expect(mapHasCrates("woods")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not invent enemy or boss sources", () => {
    expect(canonicalLootSources().every((s) => s.type === "crate" || s.type === "reward")).toBe(true);
    expect(isCanonicalLootSourceId(futureLootSourceId("enemy", "scav"))).toBe(false);
  });
});

describe("profile eligibility", () => {
  it("enabled item can spawn and disabled cannot", () => {
    expect(itemEligibleAtWave("w_pm", 1, ITEMS, {}, undefined)).toBe(true);
    expect(itemEligibleAtWave("w_pm", 1, ITEMS, {}, profile("w_pm", { enabled: false }))).toBe(false);
    expect(firstSlotChance("w_pm", 1, 1, ITEMS, CANONICAL_LOOT_RULES, {}, true, profile("w_pm", { enabled: false }))).toBe(0);
  });

  it("minWave and maxWave gate eligibility", () => {
    const gated = profile("w_ak74", { minWave: 5, maxWave: 7 });
    expect(itemEligibleAtWave("w_ak74", 4, ITEMS, {}, gated)).toBe(false);
    expect(itemEligibleAtWave("w_ak74", 5, ITEMS, {}, gated)).toBe(true);
    expect(itemEligibleAtWave("w_ak74", 7, ITEMS, {}, gated)).toBe(true);
    expect(itemEligibleAtWave("w_ak74", 8, ITEMS, {}, gated)).toBe(false);
    expect(firstSlotChance("w_ak74", 4, 1, ITEMS, CANONICAL_LOOT_RULES, {}, true, gated)).toBe(0);
    expect(firstSlotChance("w_ak74", 5, 1, ITEMS, CANONICAL_LOOT_RULES, {}, true, gated)).toBeGreaterThan(0);
  });

  it("unset maxWave remains eligible at high waves", () => {
    expect(itemEligibleAtWave("w_pm", 40, ITEMS, {}, profile("w_pm", { minWave: 1 }))).toBe(true);
  });

  it("weight 0 cannot spawn", () => {
    const zero = profile("v_gpu", { weight: 0 });
    expect(itemEligibleAtWave("v_gpu", 1, ITEMS, {}, zero)).toBe(false);
    expect(firstSlotChance("v_gpu", 1, 1, ITEMS, CANONICAL_LOOT_RULES, {}, true, zero)).toBe(0);
  });
});

describe("fallback never leaves the source profile", () => {
  it("disabled epic is not pulled when rarity falls back", () => {
    const slickOff = profile("ar_slick", { enabled: false });
    const rng = (() => {
      const values = [0.9, 0.99, 0.1, 0.99, 0.1];
      let i = 0;
      return () => values[i++] ?? 0.5;
    })();
    for (let n = 0; n < 8; n++) {
      const crate = generateCrate(12, 1, 1.35, { catalog: ITEMS, profile: slickOff, rng });
      expect(crate.some((i) => i.id === "ar_slick")).toBe(false);
    }
    expect(firstSlotChance("ar_slick", 12, 1.35, ITEMS, CANONICAL_LOOT_RULES, {}, true, slickOff)).toBe(0);
  });

  it("below-minWave item never appears through fallback", () => {
    const gated = profile("w_dvl10", { minWave: 20 });
    expect(firstSlotChance("w_dvl10", 12, 1.35, ITEMS, CANONICAL_LOOT_RULES, {}, true, gated)).toBe(0);
    const crate = generateCrate(12, 1, 1.35, { catalog: ITEMS, profile: gated, rng: () => 0.99 });
    expect(crate.some((i) => i.id === "w_dvl10")).toBe(false);
  });

  it("empty weapon pool does not pull a global weapon", () => {
    const noGuns: Record<string, { enabled: boolean }> = {};
    for (const item of ITEMS.filter((i) => i.kind === "weapon")) noGuns[item.id] = { enabled: false };
    expect(firstSlotChance("w_pm", 1, 1, ITEMS, CANONICAL_LOOT_RULES, {}, true, noGuns)).toBe(0);
    const crate = generateCrate(1, 1, 1, { catalog: ITEMS, profile: noGuns, rng: () => 0.01 });
    expect(crate.every((i) => i.kind !== "weapon")).toBe(true);
  });

  it("source with no eligible candidates returns no items", () => {
    const none: Record<string, { enabled: boolean }> = {};
    for (const item of ITEMS.filter((i) => i.kind !== "backpack")) none[item.id] = { enabled: false };
    const crate = generateCrate(1, 1, 1, { catalog: ITEMS, profile: none, rng: () => 0.2 });
    expect(crate).toEqual([]);
  });

  it("at most one weapon per crate", () => {
    const alwaysWeapon = () => {
      const values = [0.9, 0.01, 0.2, 0.01, 0.2];
      let i = 0;
      return () => values[i++] ?? 0.01;
    };
    const crate = generateCrate(10, 1, 10, { catalog: ITEMS, rng: alwaysWeapon() });
    expect(crate.filter((i) => i.kind === "weapon").length).toBeLessThanOrEqual(1);
  });
});

describe("source-specific probabilities", () => {
  it("canonical defaults match the previous shared-pool first-slot chances", () => {
    const a = firstSlotChance("v_gpu", 1, 1, ITEMS, CANONICAL_LOOT_RULES, {});
    const b = firstSlotChance("v_gpu", 1, 1, ITEMS, CANONICAL_LOOT_RULES, {}, true, undefined);
    expect(b).toBeCloseTo(a);
  });

  it("same item can have different probability across sources", () => {
    const pine = profile("w_ak74", { weight: 8 });
    const works = profile("w_ak74", { weight: 1 });
    const pPine = firstSlotChance("w_ak74", 1, 0.85, ITEMS, CANONICAL_LOOT_RULES, {}, true, pine);
    const pWorks = firstSlotChance("w_ak74", 1, 1.35, ITEMS, CANONICAL_LOOT_RULES, {}, true, works);
    expect(pPine).not.toBeCloseTo(pWorks, 5);
  });

  it("map lootMult still changes rarity-derived chance", () => {
    const low = firstSlotChance("v_gpu", 1, 0.85, ITEMS, CANONICAL_LOOT_RULES, {});
    const high = firstSlotChance("v_gpu", 1, 1.35, ITEMS, CANONICAL_LOOT_RULES, {});
    expect(high).not.toBe(low);
    const rLow = rarityProbabilities(1, 0.85, CANONICAL_LOOT_RULES);
    const rHigh = rarityProbabilities(1, 1.35, CANONICAL_LOOT_RULES);
    expect(rHigh.epic + rHigh.rare).toBeGreaterThan(rLow.epic + rLow.rare);
  });

  it("expected appearances is 10 times expected count per open", () => {
    const result = expectedAppearances("v_gpu", "crate", 1, 1, ITEMS, CANONICAL_LOOT_RULES, {});
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.perTenOpens).toBeCloseTo(result.perOpen * 10);
    expect(result.perOpen).toBeGreaterThan(0);
    expect(result.perOpen).toBeLessThan(1);
  });

  it("EV uses the effective source profile", () => {
    const base = crateExpectedValue(1, 1, ITEMS, CANONICAL_LOOT_RULES, {});
    const heavy = crateExpectedValue(1, 1, ITEMS, CANONICAL_LOOT_RULES, {}, profile("v_btc", { weight: 80 }));
    expect(base.supported && heavy.supported).toBe(true);
    if (base.supported && heavy.supported) expect(heavy.value).toBeGreaterThan(base.value);
  });
});

describe("profile validation", () => {
  it("rejects unknown items, sources, negative weight, and inverted waves", () => {
    const issues = validateProfileOverrides(
      {
        "not-a-source": { w_pm: { weight: 1 } },
        [WOODS_CRATE]: {
          nope: { weight: 1 },
          w_pm: { weight: -2, minWave: 0, maxWave: 1 },
        },
      },
      ITEMS,
    );
    expect(issues.some((i) => i.code === "UNKNOWN_SOURCE")).toBe(true);
    expect(issues.some((i) => i.code === "UNKNOWN_ITEM")).toBe(true);
    expect(issues.some((i) => i.code === "NEGATIVE_WEIGHT")).toBe(true);
    expect(issues.some((i) => i.code === "MIN_WAVE")).toBe(true);
  });
});
