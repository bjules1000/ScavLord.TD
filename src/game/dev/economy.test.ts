import { beforeEach, describe, expect, it } from "bun:test";
import { ITEMS, ITEM_BY_ID, makeItem, rollCrate } from "../gear";
import { CANONICAL_ITEM_WEIGHT, CANONICAL_LOOT_RULES, firstSlotChance, weightedTableExpectedValue } from "../loot";
import {
  applyBalanceOverrides,
  BALANCE_STORAGE_KEY,
  emptyBalanceOverrides,
  formatBalancePatch,
  setOverrideField,
} from "./balance";
import {
  ECONOMY_STORAGE_KEY,
  applyEconomyOverrides,
  canonicalItem,
  earliestLootSummary,
  economyLabCatalog,
  economyPatchLines,
  effectiveItemDef,
  effectiveItemValue,
  effectiveLootRules,
  emptyEconomyOverrides,
  filterEconomyCatalog,
  filterLootSources,
  formatEconomyPatch,
  getEconomyOverrides,
  hydrateEconomyOverrides,
  itemEconomyFields,
  itemSourceRows,
  loadEconomyOverrides,
  lootSourceCatalog,
  lootSourceGroups,
  lootTableEntries,
  modifiedEconomyCount,
  parseStoredEconomy,
  resetEconomyItem,
  resetEconomySource,
  rollEffectiveCrate,
  saleValueOf,
  setItemEconomyField,
  setItemWeight,
  setLootRule,
  setMapLootMult,
  setSourceProfileField,
  sourceExpectedValue,
  type StorageLike,
} from "./economy";

const WOODS_CRATE = "woods:crate";
const WOODS_REWARD = "woods:reward";
const FACTORY_CRATE = "factory:crate";
const KOLKHOZ_REWARD = "kolkhoz:reward";

function memStore(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

beforeEach(() => {
  applyEconomyOverrides(emptyEconomyOverrides(), false, null);
  applyBalanceOverrides(emptyBalanceOverrides(), false, null);
});

describe("Economy Lab catalog", () => {
  it("canonical items populate Economy Lab", () => {
    const catalog = economyLabCatalog();
    expect(catalog.length).toBe(ITEMS.length);
    expect(catalog.some((e) => e.id === "v_gpu" && e.name === "GRAPHICS CARD")).toBe(true);
    expect(catalog.some((e) => e.id === "w_pm")).toBe(true);
    expect(catalog.some((e) => e.kind === "backpack")).toBe(true);
  });

  it("selected item exposes existing economy fields", () => {
    const gpu = canonicalItem("v_gpu")!;
    expect(itemEconomyFields(gpu).map((f) => f.key)).toEqual(["value"]);
    expect(gpu.value).toBe(520);
    expect(gpu.price).toBeUndefined();
    const pm = canonicalItem("w_pm")!;
    expect(itemEconomyFields(pm).map((f) => f.key)).toEqual(["value", "price"]);
    expect(pm.price).toBe(250);
  });

  it("category filters match canonical kinds", () => {
    const catalog = economyLabCatalog();
    expect(filterEconomyCatalog(catalog, "WEAPONS", "").every((e) => e.kind === "weapon")).toBe(true);
    expect(filterEconomyCatalog(catalog, "ARMOR", "").every((e) => e.kind === "armor")).toBe(true);
    expect(filterEconomyCatalog(catalog, "ATTACHMENTS", "").every((e) => e.kind === "attachment")).toBe(true);
    expect(filterEconomyCatalog(catalog, "LOOT", "").every((e) => e.kind === "valuable" || e.kind === "meds")).toBe(true);
    expect(filterEconomyCatalog(catalog, "ALL", "graphics").some((e) => e.id === "v_gpu")).toBe(true);
  });
});

describe("item economy overrides", () => {
  it("draft override changes effective economy value", () => {
    const result = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "value", 1650, 520);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(effectiveItemValue("v_gpu", result.overrides, true)).toBe(1650);
  });

  it("canonical source value remains unchanged", () => {
    const result = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "value", 1650, 520);
    expect(result.ok).toBe(true);
    expect(ITEM_BY_ID["v_gpu"]!.value).toBe(520);
    expect(ITEMS.find((i) => i.id === "v_gpu")!.value).toBe(520);
  });

  it("RESET ITEM restores canonical", () => {
    let over = emptyEconomyOverrides();
    const value = setItemEconomyField(over, "v_gpu", "value", 1650, 520);
    expect(value.ok).toBe(true);
    if (value.ok) over = value.overrides;
    const weight = setItemWeight(over, "v_gpu", 4);
    expect(weight.ok).toBe(true);
    if (weight.ok) over = weight.overrides;
    const price = setItemEconomyField(over, "w_pm", "price", 400, 250);
    expect(price.ok).toBe(true);
    if (price.ok) over = price.overrides;
    const reset = resetEconomyItem(over, "v_gpu");
    expect(reset.items["v_gpu"]).toBeUndefined();
    expect(reset.weights["v_gpu"]).toBeUndefined();
    expect(reset.items["w_pm"]?.price).toBe(400);
    expect(effectiveItemValue("v_gpu", reset, true)).toBe(520);
  });

  it("RESET ALL restores all", () => {
    const store = memStore();
    const value = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "value", 1650, 520);
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    applyEconomyOverrides(value.overrides, true, store);
    applyEconomyOverrides(emptyEconomyOverrides(), true, store);
    expect(getEconomyOverrides().items).toEqual({});
    expect(store.data[ECONOMY_STORAGE_KEY]).toBe(JSON.stringify(emptyEconomyOverrides()));
    expect(effectiveItemValue("v_gpu", getEconomyOverrides(), true)).toBe(520);
  });

  it("applied DEV override persists locally when enabled", () => {
    const store = memStore();
    const value = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "value", 1650, 520);
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    applyEconomyOverrides(value.overrides, true, store);
    expect(store.data[ECONOMY_STORAGE_KEY]).toContain("1650");
    applyEconomyOverrides(emptyEconomyOverrides(), false, null);
    const loaded = loadEconomyOverrides(true, store);
    expect(loaded.items["v_gpu"]?.value).toBe(1650);
    hydrateEconomyOverrides(true, store);
    expect(getEconomyOverrides().items["v_gpu"]?.value).toBe(1650);
  });

  it("overrides ignored when DEV tools disabled", () => {
    const store = memStore();
    const value = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "value", 1650, 520);
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    applyEconomyOverrides(value.overrides, true, store);
    expect(effectiveItemValue("v_gpu", value.overrides, false)).toBe(520);
    expect(loadEconomyOverrides(false, store).items).toEqual({});
    hydrateEconomyOverrides(false, store);
    expect(getEconomyOverrides().items).toEqual({});
    expect(saleValueOf(makeItem("v_gpu", 1)!, value.overrides, false)).toBe(520);
  });

  it("does not invent a shop price on valuables", () => {
    const result = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "price", 900, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("FIELD_ABSENT");
  });
});

describe("loot sources", () => {
  it("canonical loot sources follow map hierarchy without inventing Grain Gate crates", () => {
    const sources = lootSourceCatalog();
    expect(sources.some((s) => s.id === WOODS_CRATE && s.type === "crate" && !s.shared)).toBe(true);
    expect(sources.some((s) => s.id === WOODS_REWARD && s.type === "reward")).toBe(true);
    expect(sources.some((s) => s.id === FACTORY_CRATE)).toBe(true);
    expect(sources.some((s) => s.id === KOLKHOZ_REWARD)).toBe(true);
    expect(sources.some((s) => s.id === "kolkhoz:crate")).toBe(false);
    expect(sources.some((s) => s.id === "shop")).toBe(true);
    expect(sources.every((s) => s.implemented)).toBe(true);
    const groups = lootSourceGroups();
    expect(groups.map((g) => g.label)).toEqual(["PINE CUT", "GRAIN GATE", "THE WORKS", "SHOP"]);
    expect(groups.find((g) => g.mapId === "kolkhoz")?.children.map((c) => c.type)).toEqual(["reward"]);
  });

  it("source entries map to canonical item IDs", () => {
    const rows = lootTableEntries(WOODS_CRATE, emptyEconomyOverrides(), true, 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => ITEM_BY_ID[r.itemId])).toBe(true);
    expect(rows.every((r) => r.kind !== "backpack")).toBe(true);
    expect(rows.some((r) => r.itemId === "v_gpu")).toBe(true);
  });

  it("changing one weight recalculates effective percentages", () => {
    const base = lootTableEntries(WOODS_CRATE, emptyEconomyOverrides(), true, 1);
    const optic = base.find((r) => r.itemId === "a_optic")!;
    const mag = base.find((r) => r.itemId === "a_mag")!;
    expect(optic.poolShare).toBeCloseTo(mag.poolShare);
    const bumped = setSourceProfileField(emptyEconomyOverrides(), WOODS_CRATE, "a_optic", { weight: 3 });
    expect(bumped.ok).toBe(true);
    if (!bumped.ok) return;
    const next = lootTableEntries(WOODS_CRATE, bumped.overrides, true, 1);
    const optic2 = next.find((r) => r.itemId === "a_optic")!;
    const mag2 = next.find((r) => r.itemId === "a_mag")!;
    expect(optic2.poolShare).toBeGreaterThan(optic.poolShare);
    expect(optic2.firstSlotChance).toBeGreaterThan(optic.firstSlotChance);
    expect(mag2.poolShare).toBeLessThan(mag.poolShare);
  });

  it("Pine Cut weight change does not alter The Works", () => {
    const bumped = setSourceProfileField(emptyEconomyOverrides(), WOODS_CRATE, "w_ak74", { weight: 9 });
    expect(bumped.ok).toBe(true);
    if (!bumped.ok) return;
    const pine = lootTableEntries(WOODS_CRATE, bumped.overrides, true, 1).find((r) => r.itemId === "w_ak74")!;
    const works = lootTableEntries(FACTORY_CRATE, bumped.overrides, true, 1).find((r) => r.itemId === "w_ak74")!;
    const pineReward = lootTableEntries(WOODS_REWARD, bumped.overrides, true, 1).find((r) => r.itemId === "w_ak74")!;
    expect(pine.testWeight).toBe(9);
    expect(works.testWeight).toBe(CANONICAL_ITEM_WEIGHT);
    expect(pineReward.testWeight).toBe(CANONICAL_ITEM_WEIGHT);
  });

  it("zero-weight behavior handled safely", () => {
    const zero = setSourceProfileField(emptyEconomyOverrides(), WOODS_CRATE, "a_optic", { weight: 0 });
    expect(zero.ok).toBe(true);
    if (!zero.ok) return;
    const row = lootTableEntries(WOODS_CRATE, zero.overrides, true, 1).find((r) => r.itemId === "a_optic")!;
    expect(row.poolShare).toBe(0);
    expect(row.firstSlotChance).toBe(0);
    expect(row.testWeight).toBe(0);
    expect(row.eligible).toBe(false);
  });

  it("invalid negative weight rejected", () => {
    const neg = setItemWeight(emptyEconomyOverrides(), "a_optic", -1);
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.reason).toBe("NEGATIVE_WEIGHT");
    expect(emptyEconomyOverrides().weights["a_optic"]).toBeUndefined();
  });

  it("RESET SOURCE clears only that source profile", () => {
    let over = emptyEconomyOverrides();
    const w = setSourceProfileField(over, WOODS_CRATE, "v_gpu", { weight: 8 });
    expect(w.ok).toBe(true);
    if (w.ok) over = w.overrides;
    const other = setSourceProfileField(over, FACTORY_CRATE, "v_gpu", { weight: 5 });
    expect(other.ok).toBe(true);
    if (other.ok) over = other.overrides;
    const rule = setLootRule(over, "crateExtraChance", 0.9);
    expect(rule.ok).toBe(true);
    if (rule.ok) over = rule.overrides;
    const reset = resetEconomySource(over, WOODS_CRATE);
    expect(reset.profiles[WOODS_CRATE]).toBeUndefined();
    expect(reset.profiles[FACTORY_CRATE]?.["v_gpu"]?.weight).toBe(5);
    expect(reset.rules.crateExtraChance).toBe(0.9);
  });

  it("RESET SOURCE does not clear map lootMult", () => {
    const set = setMapLootMult(emptyEconomyOverrides(), "woods", 2);
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    const w = setSourceProfileField(set.overrides, WOODS_CRATE, "v_gpu", { weight: 4 });
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    const reset = resetEconomySource(w.overrides, WOODS_CRATE);
    expect(reset.maps["woods"]?.lootMult).toBe(2);
    expect(reset.profiles[WOODS_CRATE]).toBeUndefined();
  });

  it("draft table affects derived percentages before APPLY", () => {
    applyEconomyOverrides(emptyEconomyOverrides(), true, memStore());
    const draft = setSourceProfileField(emptyEconomyOverrides(), WOODS_CRATE, "a_optic", { weight: 9 });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const live = lootTableEntries(WOODS_CRATE, getEconomyOverrides(), true, 1).find((r) => r.itemId === "a_optic")!;
    const pending = lootTableEntries(WOODS_CRATE, draft.overrides, true, 1).find((r) => r.itemId === "a_optic")!;
    expect(live.testWeight).toBe(CANONICAL_ITEM_WEIGHT);
    expect(pending.testWeight).toBe(9);
    expect(pending.firstSlotChance).toBeGreaterThan(live.firstSlotChance);
  });

  it("APPLY affects subsequent effective loot resolution", () => {
    const store = memStore();
    const rareAtt = ITEMS.filter((i) => i.kind === "attachment" && i.rarity === "rare");
    const target = rareAtt[1]!;
    let over = emptyEconomyOverrides();
    for (const item of rareAtt) {
      const r = setSourceProfileField(over, WOODS_CRATE, item.id, { weight: item.id === target.id ? 10 : 0 });
      expect(r.ok).toBe(true);
      if (r.ok) over = r.overrides;
    }
    const seq = () => {
      const values = [0.9, 0.2, 0.7, 0];
      let i = 0;
      return () => values[i++] ?? 0.5;
    };
    const before = rollEffectiveCrate(1, 1, 1, emptyEconomyOverrides(), true, seq(), WOODS_CRATE);
    applyEconomyOverrides(over, true, store);
    const after = rollEffectiveCrate(1, 50, 1, getEconomyOverrides(), true, seq(), WOODS_CRATE);
    expect(before[0]?.kind).toBe("attachment");
    expect(before[0]?.id).not.toBe(target.id);
    expect(after[0]?.id).toBe(target.id);
  });

  it("already-generated loot is not retroactively changed", () => {
    const item = makeItem("v_gpu", 7)!;
    expect(item.value).toBe(520);
    const value = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "value", 1650, 520);
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    applyEconomyOverrides(value.overrides, true, memStore());
    expect(item.value).toBe(520);
    expect(effectiveItemDef("v_gpu", getEconomyOverrides(), true)?.value).toBe(1650);
    expect(saleValueOf(item, getEconomyOverrides(), true)).toBe(1650);
  });

  it("source filters only include types that exist", () => {
    const sources = lootSourceCatalog();
    expect(filterLootSources(sources, "CRATE", "").every((s) => s.type === "crate")).toBe(true);
    expect(filterLootSources(sources, "REWARD", "").every((s) => s.type === "reward")).toBe(true);
    expect(filterLootSources(sources, "SHOP", "").every((s) => s.type === "shop")).toBe(true);
    expect(filterLootSources(sources, "ALL", "pine").some((s) => s.groupLabel === "PINE CUT")).toBe(true);
  });
});
describe("item/source cross-reference", () => {
  it("selected item lists every canonical source containing it", () => {
    const rows = itemSourceRows("v_gpu", emptyEconomyOverrides(), true, 1);
    expect(rows.some((r) => r.sourceId === WOODS_CRATE && !r.shared)).toBe(true);
    expect(rows.some((r) => r.sourceId === WOODS_REWARD)).toBe(true);
    expect(rows.some((r) => r.label === "PINE CUT / SUPPLY CRATE")).toBe(true);
    expect(rows.some((r) => r.label === "THE WORKS / SUPPLY CRATE")).toBe(true);
    expect(rows.some((r) => r.label.includes("GRAIN GATE") && r.label.includes("CRATE"))).toBe(false);
    expect(rows.some((r) => r.label === "GRAIN GATE / WAVE REWARD")).toBe(true);
    expect(rows.some((r) => r.type === "shop")).toBe(false);
  });

  it("shop-only backpacks list hideout shop and not crates", () => {
    const rows = itemSourceRows("bp_scav", emptyEconomyOverrides(), true, 1);
    expect(rows.some((r) => r.type === "shop")).toBe(true);
    expect(rows.some((r) => r.type === "crate")).toBe(false);
  });

  it("source summary updates when draft weight changes", () => {
    const before = itemSourceRows("a_optic", emptyEconomyOverrides(), true, 1).find((r) => r.sourceId === WOODS_CRATE)!;
    const bumped = setSourceProfileField(emptyEconomyOverrides(), WOODS_CRATE, "a_optic", { weight: 6 });
    expect(bumped.ok).toBe(true);
    if (!bumped.ok) return;
    const after = itemSourceRows("a_optic", bumped.overrides, true, 1).find((r) => r.sourceId === WOODS_CRATE)!;
    expect(after.weight).toBe(6);
    expect(after.firstSlotChance).toBeGreaterThan(before.firstSlotChance);
    expect(after.poolShare).toBeGreaterThan(before.poolShare);
  });

  it("map/source representation is deterministic and independent", () => {
    const a = itemSourceRows("v_gpu", emptyEconomyOverrides(), true, 1).map((r) => r.label);
    const b = itemSourceRows("v_gpu", emptyEconomyOverrides(), true, 1).map((r) => r.label);
    expect(a).toEqual(b);
    const crate = lootSourceCatalog().find((s) => s.id === WOODS_CRATE)!;
    expect(crate.shared).toBe(false);
    expect(crate.mapIds).toEqual(["woods"]);
  });

  it("add/remove loot entries are deferred (no list mutation helpers)", () => {
    expect("addLootEntry" in globalThis).toBe(false);
    const rows = lootTableEntries(WOODS_CRATE, emptyEconomyOverrides(), true, 1);
    expect(rows.map((r) => r.itemId).sort()).toEqual(
      ITEMS.filter((i) => i.kind !== "backpack")
        .map((i) => i.id)
        .sort(),
    );
  });

  it("earliest loot ignores shop and uses first positive chance wave", () => {
    const base = earliestLootSummary("w_ak74", emptyEconomyOverrides(), true);
    expect(base.available).toBe(true);
    const gated = setSourceProfileField(emptyEconomyOverrides(), WOODS_CRATE, "w_ak74", { minWave: 5 });
    expect(gated.ok).toBe(true);
    if (!gated.ok) return;
    const next = earliestLootSummary("w_ak74", gated.overrides, true);
    expect(next.available).toBe(true);
    if (next.available && base.available) {
      expect(next.wave).toBeGreaterThanOrEqual(base.wave);
    }
    const disabled = ITEMS.filter((i) => i.kind !== "backpack").reduce((over, item) => {
      const r = setSourceProfileField(over, WOODS_CRATE, item.id, { enabled: false });
      return r.ok ? r.overrides : over;
    }, emptyEconomyOverrides());
    let allOff = disabled;
    for (const source of lootSourceCatalog().filter((s) => s.roll)) {
      for (const item of ITEMS.filter((i) => i.kind !== "backpack")) {
        const r = setSourceProfileField(allOff, source.id, item.id, { enabled: false });
        if (r.ok) allOff = r.overrides;
      }
    }
    expect(earliestLootSummary("w_ak74", allOff, true).available).toBe(false);
  });
});

describe("expected value", () => {
  it("simple weighted table EV is correct", () => {
    expect(
      weightedTableExpectedValue([
        { weight: 1, value: 100 },
        { weight: 3, value: 300 },
      ]),
    ).toBe(250);
  });

  it("EV updates with item value draft", () => {
    const base = sourceExpectedValue(WOODS_CRATE, emptyEconomyOverrides(), true, 1);
    expect(base.supported).toBe(true);
    const value = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "value", 5000, 520);
    expect(value.ok).toBe(true);
    if (!value.ok || !base.supported) return;
    const next = sourceExpectedValue(WOODS_CRATE, value.overrides, true, 1);
    expect(next.supported).toBe(true);
    if (next.supported) expect(next.value).toBeGreaterThan(base.value);
  });

  it("EV updates with loot-weight draft", () => {
    const base = sourceExpectedValue(WOODS_CRATE, emptyEconomyOverrides(), true, 1);
    expect(base.supported).toBe(true);
    let over = emptyEconomyOverrides();
    for (const item of ITEMS.filter((i) => i.kind !== "backpack")) {
      const r = setItemWeight(over, item.id, item.id === "v_btc" ? 50 : 0.01);
      expect(r.ok).toBe(true);
      if (r.ok) over = r.overrides;
    }
    const next = sourceExpectedValue(WOODS_CRATE, over, true, 1);
    expect(next.supported).toBe(true);
    if (next.supported && base.supported) expect(next.value).toBeGreaterThan(base.value);
  });

  it("EV uses the documented canonical sale/value basis", () => {
    const ev = sourceExpectedValue(WOODS_CRATE, emptyEconomyOverrides(), true, 1);
    expect(ev.supported).toBe(true);
    if (ev.supported) expect(ev.formula).toContain("item value (sell/stash)");
  });

  it("empty table EV handled safely", () => {
    expect(weightedTableExpectedValue([])).toBe(0);
  });

  it("shop EV is explicitly unsupported rather than fake math", () => {
    const ev = sourceExpectedValue("shop", emptyEconomyOverrides(), true, 1);
    expect(ev.supported).toBe(false);
    if (!ev.supported) expect(ev.reason).toContain("Shop");
  });
});

describe("patch/export", () => {
  it("only modified item fields appear in export", () => {
    const value = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "value", 1650, 520);
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    const text = formatEconomyPatch(value.overrides);
    expect(text).toContain("ECONOMY PATCH");
    expect(text).toContain("GRAPHICS CARD");
    expect(text).toContain("value: 520 -> 1650");
    expect(text).not.toContain("w_pm");
    expect(text).not.toContain("price:");
    expect(economyPatchLines(value.overrides)).toHaveLength(1);
  });

  it("only modified loot-table entries appear", () => {
    const w = setItemWeight(emptyEconomyOverrides(), "v_gpu", 2);
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    const text = formatEconomyPatch(w.overrides);
    expect(text).toContain("PINE CUT / SUPPLY CRATE");
    expect(text).toContain("GRAPHICS CARD");
    expect(text).toContain("weight: 1 -> 2");
    expect(text).not.toContain("4x SCOPE");
  });

  it("Reset removes corresponding patch entries", () => {
    let over = emptyEconomyOverrides();
    const a = setItemEconomyField(over, "v_gpu", "value", 1650, 520);
    expect(a.ok).toBe(true);
    if (a.ok) over = a.overrides;
    const b = setItemWeight(over, "a_optic", 4);
    expect(b.ok).toBe(true);
    if (b.ok) over = b.overrides;
    over = resetEconomyItem(over, "v_gpu");
    const text = formatEconomyPatch(over);
    expect(text).not.toContain("GRAPHICS CARD");
    expect(text).toContain("4x SCOPE");
    expect(text).toContain("weight: 1 -> 4");
    over = resetEconomySource(over, WOODS_CRATE);
    expect(formatEconomyPatch(over)).toContain("(no changes)");
  });

  it("Economy Lab export is independent from Balance Lab export state", () => {
    const eco = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "value", 1650, 520);
    expect(eco.ok).toBe(true);
    if (!eco.ok) return;
    const bal = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "damage", 1, 7);
    expect(formatEconomyPatch(eco.overrides)).not.toContain("damage");
    expect(formatBalancePatch(bal)).not.toContain("GRAPHICS CARD");
    expect(ECONOMY_STORAGE_KEY).not.toBe(BALANCE_STORAGE_KEY);
  });

  it("no source-file mutation path exists", () => {
    const eco = setItemEconomyField(emptyEconomyOverrides(), "v_gpu", "value", 1650, 520);
    expect(eco.ok).toBe(true);
    if (!eco.ok) return;
    applyEconomyOverrides(eco.overrides, true, memStore());
    expect(ITEM_BY_ID["v_gpu"]!.value).toBe(520);
    expect(CANONICAL_LOOT_RULES.crateExtraChance).toBe(0.4);
    expect(typeof rollCrate).toBe("function");
  });
});

describe("future source compatibility", () => {
  it("does not invent enemy or quest drop tables", () => {
    const sources = lootSourceCatalog();
    expect(sources.some((s) => s.type === "enemy" || s.type === "boss" || s.type === "quest")).toBe(false);
    expect(itemSourceRows("v_gpu").every((r) => r.implemented)).toBe(true);
  });
});

describe("counts", () => {
  it("modified count tracks item, weight, rule, and map overrides separately", () => {
    let over = emptyEconomyOverrides();
    const a = setItemEconomyField(over, "v_gpu", "value", 1, 520);
    if (a.ok) over = a.overrides;
    const b = setItemWeight(over, "v_gpu", 2);
    if (b.ok) over = b.overrides;
    expect(modifiedEconomyCount(over)).toBe(2);
  });
});

describe("first-slot chance helper still works under economy catalog", () => {
  it("canonical GPU first-slot chance is finite", () => {
    expect(firstSlotChance("v_gpu", 1, 1, ITEMS, CANONICAL_LOOT_RULES, {})).toBeGreaterThan(0);
  });
});

describe("profile persistence and DEV gate", () => {
  it("localStorage restores applied profile overrides", () => {
    const store = memStore();
    const set = setSourceProfileField(emptyEconomyOverrides(), WOODS_CRATE, "w_ak74", { minWave: 4, weight: 3 });
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    applyEconomyOverrides(set.overrides, true, store);
    applyEconomyOverrides(emptyEconomyOverrides(), false, null);
    const loaded = parseStoredEconomy(store.data[ECONOMY_STORAGE_KEY]!);
    expect(loaded.profiles[WOODS_CRATE]?.["w_ak74"]?.minWave).toBe(4);
    expect(loaded.profiles[WOODS_CRATE]?.["w_ak74"]?.weight).toBe(3);
    hydrateEconomyOverrides(true, store);
    expect(getEconomyOverrides().profiles[WOODS_CRATE]?.["w_ak74"]?.minWave).toBe(4);
  });

  it("DEV-off ignores profile overrides", () => {
    const set = setSourceProfileField(emptyEconomyOverrides(), WOODS_CRATE, "w_ak74", { enabled: false });
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    const live = lootTableEntries(WOODS_CRATE, set.overrides, true, 1).find((r) => r.itemId === "w_ak74")!;
    const off = lootTableEntries(WOODS_CRATE, set.overrides, false, 1).find((r) => r.itemId === "w_ak74")!;
    expect(live.enabled).toBe(false);
    expect(off.enabled).toBe(true);
  });

  it("RESET ITEM clears the item across sources", () => {
    let over = emptyEconomyOverrides();
    const a = setSourceProfileField(over, WOODS_CRATE, "w_ak74", { minWave: 6 });
    if (a.ok) over = a.overrides;
    const b = setSourceProfileField(over, FACTORY_CRATE, "w_ak74", { weight: 9 });
    if (b.ok) over = b.overrides;
    const c = setItemEconomyField(over, "v_gpu", "value", 1, 520);
    if (c.ok) over = c.overrides;
    const reset = resetEconomyItem(over, "w_ak74");
    expect(reset.profiles[WOODS_CRATE]?.["w_ak74"]).toBeUndefined();
    expect(reset.profiles[FACTORY_CRATE]?.["w_ak74"]).toBeUndefined();
    expect(reset.items["v_gpu"]?.value).toBe(1);
  });

  it("migrates legacy global weights onto every canonical source", () => {
    const loaded = parseStoredEconomy(JSON.stringify({ weights: { v_gpu: 4 } }));
    expect(loaded.profiles[WOODS_CRATE]?.["v_gpu"]?.weight).toBe(4);
    expect(loaded.profiles[FACTORY_CRATE]?.["v_gpu"]?.weight).toBe(4);
    expect(loaded.weights).toEqual({});
  });
});

describe("fitted weapons", () => {
  it("procedural loot does not attach installed mods to generated weapons", () => {
    const crate = rollEffectiveCrate(10, 1, 1.35, emptyEconomyOverrides(), true, () => 0.01, WOODS_CRATE);
    for (const item of crate) {
      if (item.kind === "weapon") expect(item.installed).toBeUndefined();
    }
  });
});

