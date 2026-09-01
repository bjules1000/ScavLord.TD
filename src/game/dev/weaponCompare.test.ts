import { describe, expect, it } from "bun:test";
import { WEAPONS } from "../gear";
import {
  emptyBalanceOverrides,
  resetOverrideItem,
  setOverrideField,
} from "./balance";
import {
  COMPARE_CATEGORIES,
  allCanonicalWeapons,
  benchmarkScopeCategory,
  buildCompareRows,
  burstDps,
  compareClassOf,
  compareMetricTone,
  damagePerShot,
  defaultSortDir,
  emptyCompareSession,
  filterCompareWeapons,
  magazineSustainedCycleMs,
  medianValue,
  mergeWeaponDef,
  metricPairForWeapon,
  perRoundSustainedCycleMs,
  rankByValue,
  scaleDomain,
  scalePosition,
  selectCompareWeapon,
  setBenchmarkScope,
  setCompareCategory,
  sortWeaponIds,
  sustainedDps,
  switchLabView,
  weaponCombatMetrics,
  weaponRpm,
  weaponsInCategory,
} from "./compareMetrics";

const pm = WEAPONS["pm"]!;
const toz = WEAPONS["toz"]!;
const mp133 = WEAPONS["mp133"]!;
const ak74 = WEAPONS["ak74"]!;

describe("weapon compare categories", () => {
  it("maps every canonical weapon to a comparison category", () => {
    for (const w of allCanonicalWeapons()) {
      expect(COMPARE_CATEGORIES).toContain(compareClassOf(w));
      expect(compareClassOf(w)).not.toBe("ALL");
    }
    expect(allCanonicalWeapons()).toHaveLength(Object.keys(WEAPONS).length);
  });

  it("ALL includes all weapons", () => {
    expect(weaponsInCategory("ALL").map((w) => w.id).sort()).toEqual(Object.keys(WEAPONS).sort());
  });

  it("category filtering returns only matching weapons", () => {
    expect(weaponsInCategory("SHOTGUNS").map((w) => w.id).sort()).toEqual(["mp133", "toz"]);
    expect(weaponsInCategory("SIDEARMS").map((w) => w.id)).toEqual(["pm"]);
    expect(weaponsInCategory("LMG").map((w) => w.id)).toEqual(["pkm"]);
    expect(weaponsInCategory("SPECIAL").map((w) => w.id)).toEqual(["m32"]);
    expect(weaponsInCategory("BOLT").every((w) => w.cls === "sniper")).toBe(true);
    expect(weaponsInCategory("RIFLES").every((w) => w.cls === "rifle")).toBe(true);
  });

  it("search composes with category filter", () => {
    const rifles = weaponsInCategory("RIFLES");
    expect(filterCompareWeapons(rifles, "RIFLES", "long").map((w) => w.id)).toEqual([]);
    expect(filterCompareWeapons(allCanonicalWeapons(), "BOLT", "long").map((w) => w.id)).toEqual(["dvl10"]);
    expect(filterCompareWeapons(allCanonicalWeapons(), "SHOTGUNS", "pump").map((w) => w.id)).toEqual(["mp133"]);
  });

  it("selected category persists when switching Balance Lab views", () => {
    let session = emptyCompareSession();
    session = setCompareCategory(session, "SHOTGUNS");
    session = switchLabView(session, "compare");
    expect(session.compareCategory).toBe("SHOTGUNS");
    session = switchLabView(session, "editor");
    expect(session.compareCategory).toBe("SHOTGUNS");
    expect(session.view).toBe("editor");
  });

  it("category ranking denominator uses filtered weapon count", () => {
    const shotguns = weaponsInCategory("SHOTGUNS");
    const { ranksTest } = buildCompareRows(shotguns, (w) => w, "damage");
    expect(shotguns).toHaveLength(2);
    expect([...ranksTest.values()].sort()).toEqual([1, 2]);
  });
});

describe("weapon compare derived combat metrics", () => {
  it("conventional damage/shot is the authored damage", () => {
    expect(damagePerShot(pm)).toBe(15);
    expect(damagePerShot(ak74)).toBe(19);
    expect(weaponCombatMetrics(pm).pelletDamage).toBeNull();
  });

  it("shotgun blast damage is pellets × pellet damage", () => {
    expect(damagePerShot(toz)).toBe(7 * 9);
    expect(damagePerShot(mp133)).toBe(11 * 7);
    expect(weaponCombatMetrics(toz).pelletDamage).toBe(7);
    expect(weaponCombatMetrics(toz).pelletCount).toBe(9);
  });

  it("RPM is 60000 / cycle ms", () => {
    expect(weaponRpm(pm)).toBeCloseTo(60000 / 400);
    expect(weaponRpm(ak74)).toBeCloseTo(60000 / 380);
    expect(weaponRpm(toz)).toBeCloseTo(60000 / 720);
  });

  it("burst DPS is raw-per-shot / cycle seconds", () => {
    expect(burstDps(pm)).toBeCloseTo(15 * 1000 / 400);
    expect(burstDps(toz)).toBeCloseTo(63 * 1000 / 720);
    expect(burstDps(ak74)).toBeCloseTo(19 * 1000 / 380);
  });

  it("magazine weapon sustained DPS includes overlapping reload", () => {
    const cycle = magazineSustainedCycleMs(pm);
    expect(cycle).toBe((7 - 1) * 400 + 1500);
    expect(sustainedDps(pm)).toBeCloseTo((7 * 15 * 1000) / cycle);
    const akCycle = magazineSustainedCycleMs(ak74);
    expect(akCycle).toBe(29 * 380 + 2400);
    expect(sustainedDps(ak74)).toBeCloseTo((30 * 19 * 1000) / akCycle);
  });

  it("per-round shotgun sustained DPS follows combat one-shell reload", () => {
    expect(perRoundSustainedCycleMs(toz)).toBe(950);
    expect(sustainedDps(toz)).toBeCloseTo((63 * 1000) / 950);
    expect(perRoundSustainedCycleMs(mp133)).toBe(800);
    expect(sustainedDps(mp133)).toBeCloseTo((77 * 1000) / 800);
    expect(sustainedDps(toz)).not.toBeCloseTo((2 * 63 * 1000) / (720 + 950));
  });

  it("runtime/test overrides affect derived metrics", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 21, 19);
    const test = mergeWeaponDef(ak74, over.weapons["ak74"]);
    expect(damagePerShot(test)).toBe(21);
    expect(burstDps(test)).toBeCloseTo(21 * 1000 / 380);
    expect(damagePerShot(ak74)).toBe(19);
  });

  it("canonical source values remain unchanged", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "damage", 9, 7);
    mergeWeaponDef(toz, over.weapons["toz"]);
    expect(WEAPONS["toz"]!.damage).toBe(7);
    expect(WEAPONS["toz"]!.pellets).toBe(9);
  });
});

describe("weapon compare ranking and scales", () => {
  const all = allCanonicalWeapons();

  it("higher damage ranks higher", () => {
    const { ranksTest } = buildCompareRows(all, (w) => w, "damage");
    expect(ranksTest.get("dvl10")).toBe(1);
    expect((ranksTest.get("pm") ?? 99) > (ranksTest.get("ak74") ?? 0)).toBe(true);
  });

  it("higher sustained DPS ranks higher", () => {
    const { ranksTest } = buildCompareRows(all, (w) => w, "sustainedDps");
    const pkmRank = ranksTest.get("pkm")!;
    const sv98Rank = ranksTest.get("sv98")!;
    expect(pkmRank).toBeLessThan(sv98Rank);
  });

  it("higher accuracy and range and RPM rank higher", () => {
    const acc = buildCompareRows(all, (w) => w, "accuracy").ranksTest;
    const range = buildCompareRows(all, (w) => w, "range").ranksTest;
    const rpm = buildCompareRows(all, (w) => w, "rpm").ranksTest;
    expect(acc.get("dvl10")!).toBeLessThan(acc.get("pkm")!);
    expect(range.get("dvl10")).toBe(1);
    expect(rpm.get("pkm")).toBe(1);
  });

  it("lower reload and weight rank better", () => {
    const reload = buildCompareRows(all, (w) => w, "reload").ranksTest;
    const weight = buildCompareRows(all, (w) => w, "weight").ranksTest;
    expect(weight.get("pm")).toBe(1);
    expect(weight.get("pkm")!).toBeGreaterThan(weight.get("pm")!);
    expect(reload.get("mp133")!).toBeLessThan(reload.get("pkm")!);
  });

  it("median is correct and changes with category filter", () => {
    expect(medianValue([1, 2, 3])).toBe(2);
    expect(medianValue([1, 2, 3, 4])).toBe(2.5);
    const allWeights = all.map((w) => w.weight).sort((a, b) => a - b);
    expect(medianValue(all.map((w) => w.weight))).toBe(medianValue(allWeights));
    const shotgunW = weaponsInCategory("SHOTGUNS").map((w) => w.weight);
    expect(medianValue(shotgunW)).toBe(2.5);
    expect(medianValue(shotgunW)).not.toBe(medianValue(all.map((w) => w.weight)));
  });

  it("shared scale uses the same domain for all visible weapons", () => {
    const { rows, domain } = buildCompareRows(all, (w) => w, "damage");
    expect(domain.min).toBe(Math.min(...rows.map((r) => r.test)));
    expect(domain.max).toBe(Math.max(...rows.map((r) => r.test)));
    const lo = scalePosition(domain.min, domain.min, domain.max);
    const hi = scalePosition(domain.max, domain.min, domain.max);
    expect(lo).toBe(0);
    expect(hi).toBe(1);
    const { min, max } = scaleDomain([10, 10]);
    expect(scalePosition(10, min, max)).toBe(0.5);
  });

  it("identical values produce deterministic ranking by id", () => {
    const ranks = rankByValue(
      [
        { id: "zeta", value: 10 },
        { id: "alpha", value: 10 },
        { id: "mid", value: 20 },
      ],
      false,
    );
    expect(ranks.get("mid")).toBe(1);
    expect(ranks.get("alpha")).toBe(2);
    expect(ranks.get("zeta")).toBe(3);
    const order = sortWeaponIds(
      [
        { id: "zeta", value: 10, name: "Z" },
        { id: "alpha", value: 10, name: "A" },
      ],
      "desc",
    );
    expect(order).toEqual(["alpha", "zeta"]);
  });

  it("default sort is high-to-low except reload and weight", () => {
    expect(defaultSortDir("damage")).toBe("desc");
    expect(defaultSortDir("sustainedDps")).toBe("desc");
    expect(defaultSortDir("reload")).toBe("asc");
    expect(defaultSortDir("weight")).toBe("asc");
  });
});

describe("weapon compare BASE vs TEST", () => {
  it("unchanged weapon has one effective marker", () => {
    const pair = metricPairForWeapon(ak74, ak74, "damage");
    expect(pair.changed).toBe(false);
    expect(pair.base).toBe(pair.test);
  });

  it("drafted stat change exposes BASE and TEST values", () => {
    const test = mergeWeaponDef(ak74, { damage: 21 });
    const pair = metricPairForWeapon(ak74, test, "damage");
    expect(pair.base).toBe(19);
    expect(pair.test).toBe(21);
    expect(pair.changed).toBe(true);
  });

  it("unapplied draft affects Compare", () => {
    const draft = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 21, 19);
    const applied = emptyBalanceOverrides();
    const fromDraft = mergeWeaponDef(ak74, draft.weapons["ak74"]);
    const fromApplied = mergeWeaponDef(ak74, applied.weapons["ak74"]);
    expect(damagePerShot(fromDraft)).toBe(21);
    expect(damagePerShot(fromApplied)).toBe(19);
  });

  it("APPLY keeps effective comparison consistent", () => {
    const applied = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 21, 19);
    const pair = metricPairForWeapon(ak74, mergeWeaponDef(ak74, applied.weapons["ak74"]), "damage");
    expect(pair.test).toBe(21);
    expect(pair.base).toBe(19);
  });

  it("RESET ITEM restores canonical comparison", () => {
    let over = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 21, 19);
    over = resetOverrideItem(over, "weapon", "ak74");
    const pair = metricPairForWeapon(ak74, mergeWeaponDef(ak74, over.weapons["ak74"]), "damage");
    expect(pair.changed).toBe(false);
    expect(pair.test).toBe(19);
  });

  it("RESET ALL restores all canonical comparisons", () => {
    let over = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 21, 19);
    over = setOverrideField(over, "weapon", "toz", "weight", 4, 2);
    over = emptyBalanceOverrides();
    const ak = metricPairForWeapon(ak74, mergeWeaponDef(ak74, over.weapons["ak74"]), "damage");
    const saw = metricPairForWeapon(toz, mergeWeaponDef(toz, over.weapons["toz"]), "weight");
    expect(ak.changed).toBe(false);
    expect(saw.changed).toBe(false);
  });

  it("beneficial and harmful deltas use buff/nerf semantics", () => {
    expect(compareMetricTone("damage", 19, 21)).toBe("buff");
    expect(compareMetricTone("damage", 19, 17)).toBe("nerf");
    expect(compareMetricTone("sustainedDps", 40, 50)).toBe("buff");
    expect(compareMetricTone("accuracy", 0.7, 0.6)).toBe("nerf");
  });

  it("lower-is-better metrics invert semantic correctly", () => {
    expect(compareMetricTone("weight", 3.5, 3)).toBe("buff");
    expect(compareMetricTone("weight", 3.5, 4)).toBe("nerf");
    expect(compareMetricTone("reload", 2400, 2000)).toBe("buff");
    expect(compareMetricTone("reload", 2400, 3000)).toBe("nerf");
    expect(compareMetricTone("damage", 19, 19)).toBe("neutral");
  });
});

describe("weapon editor arsenal benchmark", () => {
  it("weapon editor benchmark uses the selected weapon", () => {
    const { rows } = buildCompareRows(allCanonicalWeapons(), (w) => w, "damage");
    expect(rows.some((r) => r.id === "ak74")).toBe(true);
    const ak = rows.find((r) => r.id === "ak74")!;
    expect(ak.test).toBe(damagePerShot(ak74));
  });

  it("CATEGORY comparison scopes correctly", () => {
    expect(benchmarkScopeCategory(toz, "category")).toBe("SHOTGUNS");
    expect(benchmarkScopeCategory(ak74, "category")).toBe("RIFLES");
    const group = filterCompareWeapons(allCanonicalWeapons(), "SHOTGUNS", "");
    expect(group).toHaveLength(2);
    expect(buildCompareRows(group, (w) => w, "damage").ranksTest.size).toBe(2);
  });

  it("ALL comparison scopes correctly", () => {
    expect(benchmarkScopeCategory(toz, "all")).toBe("ALL");
    expect(setBenchmarkScope(emptyCompareSession(), "all").benchmarkScope).toBe("all");
    const { ranksTest } = buildCompareRows(allCanonicalWeapons(), (w) => w, "damage");
    expect(ranksTest.size).toBe(allCanonicalWeapons().length);
  });

  it("rank updates immediately when draft changes", () => {
    const before = buildCompareRows(allCanonicalWeapons(), (w) => w, "damage");
    const after = buildCompareRows(
      allCanonicalWeapons(),
      (w) => (w.id === "ak74" ? mergeWeaponDef(w, { damage: 200 }) : w),
      "damage",
    );
    expect(after.ranksTest.get("ak74")).toBe(1);
    expect(after.ranksTest.get("ak74")).not.toBe(before.ranksTest.get("ak74"));
  });

  it("benchmark uses the same derived helpers as full Compare", () => {
    const { rows } = buildCompareRows([pm, toz, ak74], (w) => w, "burstDps");
    expect(rows.find((r) => r.id === "toz")?.test).toBeCloseTo(burstDps(toz));
    expect(rows.find((r) => r.id === "pm")?.test).toBeCloseTo(burstDps(pm));
  });

  it("clicking a Compare weapon selects it without losing draft state", () => {
    let session = emptyCompareSession();
    session = setCompareCategory(session, "RIFLES");
    session = switchLabView(session, "compare");
    session = { ...session, query: "kalash" };
    const draft = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 21, 19);
    session = selectCompareWeapon(session, "ak74");
    expect(session.view).toBe("editor");
    expect(session.selectedId).toBe("ak74");
    expect(session.selectedKind).toBe("weapon");
    expect(session.compareCategory).toBe("RIFLES");
    expect(session.query).toBe("kalash");
    expect(draft.weapons["ak74"]?.damage).toBe(21);
  });
});
