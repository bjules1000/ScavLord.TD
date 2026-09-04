import { describe, expect, it } from "bun:test";
import { WEAPONS } from "../gear";
import {
  emptyBalanceOverrides,
  resetOverrideItem,
  setOverrideField,
} from "./balance";
import {
  COMPARE_CATEGORIES,
  STACK_METRICS,
  allCanonicalWeapons,
  axisTicks,
  benchmarkScopeCategory,
  buildCompareRows,
  burstDps,
  compareClassOf,
  compareMetricTone,
  composeStackedCompare,
  damagePerShot,
  defaultSortDir,
  editorFieldBenchmark,
  editorFieldToBenchmarkKey,
  emptyCompareSession,
  filterCompareWeapons,
  formatEditorRank,
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
  valueTone,
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
    expect(damagePerShot(pm)).toBe(10);
    expect(damagePerShot(ak74)).toBe(21);
    expect(weaponCombatMetrics(pm).pelletDamage).toBeNull();
  });

  it("shotgun blast damage is pellets × pellet damage", () => {
    expect(damagePerShot(toz)).toBe(7 * 8);
    expect(damagePerShot(mp133)).toBe(11 * 7);
    expect(weaponCombatMetrics(toz).pelletDamage).toBe(7);
    expect(weaponCombatMetrics(toz).pelletCount).toBe(8);
  });

  it("RPM is 60000 / cycle ms", () => {
    expect(weaponRpm(pm)).toBeCloseTo(60000 / 550);
    expect(weaponRpm(ak74)).toBeCloseTo(60000 / 420);
    expect(weaponRpm(toz)).toBeCloseTo(60000 / 810);
  });

  it("burst DPS is raw-per-shot / cycle seconds", () => {
    expect(burstDps(pm)).toBeCloseTo(10 * 1000 / 550);
    expect(burstDps(toz)).toBeCloseTo(56 * 1000 / 810);
    expect(burstDps(ak74)).toBeCloseTo(21 * 1000 / 420);
  });

  it("magazine weapon sustained DPS includes overlapping reload", () => {
    const cycle = magazineSustainedCycleMs(pm);
    expect(cycle).toBe((7 - 1) * 550 + 1700);
    expect(sustainedDps(pm)).toBeCloseTo((7 * 10 * 1000) / cycle);
    const akCycle = magazineSustainedCycleMs(ak74);
    expect(akCycle).toBe(29 * 420 + 2500);
    expect(sustainedDps(ak74)).toBeCloseTo((30 * 21 * 1000) / akCycle);
  });

  it("per-round shotgun sustained DPS follows combat one-shell reload", () => {
    expect(perRoundSustainedCycleMs(toz)).toBe(1150);
    expect(sustainedDps(toz)).toBeCloseTo((56 * 1000) / 1150);
    expect(perRoundSustainedCycleMs(mp133)).toBe(800);
    expect(sustainedDps(mp133)).toBeCloseTo((77 * 1000) / 800);
    expect(sustainedDps(toz)).not.toBeCloseTo((2 * 56 * 1000) / (810 + 1150));
  });

  it("runtime/test overrides affect derived metrics", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 24, 21);
    const test = mergeWeaponDef(ak74, over.weapons["ak74"]);
    expect(damagePerShot(test)).toBe(24);
    expect(burstDps(test)).toBeCloseTo(24 * 1000 / 420);
    expect(damagePerShot(ak74)).toBe(21);
  });

  it("canonical source values remain unchanged", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "damage", 9, 7);
    mergeWeaponDef(toz, over.weapons["toz"]);
    expect(WEAPONS["toz"]!.damage).toBe(7);
    expect(WEAPONS["toz"]!.pellets).toBe(8);
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
    const test = mergeWeaponDef(ak74, { damage: 24 });
    const pair = metricPairForWeapon(ak74, test, "damage");
    expect(pair.base).toBe(21);
    expect(pair.test).toBe(24);
    expect(pair.changed).toBe(true);
  });

  it("unapplied draft affects Compare", () => {
    const draft = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 24, 21);
    const applied = emptyBalanceOverrides();
    const fromDraft = mergeWeaponDef(ak74, draft.weapons["ak74"]);
    const fromApplied = mergeWeaponDef(ak74, applied.weapons["ak74"]);
    expect(damagePerShot(fromDraft)).toBe(24);
    expect(damagePerShot(fromApplied)).toBe(21);
  });

  it("APPLY keeps effective comparison consistent", () => {
    const applied = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 24, 21);
    const pair = metricPairForWeapon(ak74, mergeWeaponDef(ak74, applied.weapons["ak74"]), "damage");
    expect(pair.test).toBe(24);
    expect(pair.base).toBe(21);
  });

  it("RESET ITEM restores canonical comparison", () => {
    let over = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 24, 21);
    over = resetOverrideItem(over, "weapon", "ak74");
    const pair = metricPairForWeapon(ak74, mergeWeaponDef(ak74, over.weapons["ak74"]), "damage");
    expect(pair.changed).toBe(false);
    expect(pair.test).toBe(21);
  });

  it("RESET ALL restores all canonical comparisons", () => {
    let over = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 24, 21);
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
    const draft = setOverrideField(emptyBalanceOverrides(), "weapon", "ak74", "damage", 24, 21);
    session = selectCompareWeapon(session, "ak74");
    expect(session.view).toBe("editor");
    expect(session.selectedId).toBe("ak74");
    expect(session.selectedKind).toBe("weapon");
    expect(session.compareCategory).toBe("RIFLES");
    expect(session.query).toBe("kalash");
    expect(draft.weapons["ak74"]?.damage).toBe(24);
  });
});

describe("Item Editor stat benchmarks", () => {
  const all = allCanonicalWeapons();
  const identity = <T,>(w: T) => w;

  it("weapon editor defaults benchmark scope to CATEGORY", () => {
    expect(emptyCompareSession().benchmarkScope).toBe("category");
  });

  it("CATEGORY uses canonical weapon category", () => {
    expect(editorFieldToBenchmarkKey("range", mp133)).toBe("range");
    const bench = editorFieldBenchmark(mp133, identity, all, "category", "range")!;
    expect(bench.category).toBe("SHOTGUNS");
    expect(bench.total).toBe(2);
    expect(bench.forcedCategory).toBe(false);
  });

  it("ALL uses full weapon arsenal", () => {
    const bench = editorFieldBenchmark(mp133, identity, all, "all", "range")!;
    expect(bench.category).toBe("ALL");
    expect(bench.total).toBe(all.length);
  });

  it("rank denominator changes with scope", () => {
    const cat = editorFieldBenchmark(mp133, identity, all, "category", "weight")!;
    const allScope = editorFieldBenchmark(mp133, identity, all, "all", "weight")!;
    expect(cat.total).toBe(2);
    expect(allScope.total).toBe(all.length);
    expect(cat.total).not.toBe(allScope.total);
  });

  it("higher-is-better rank logic: damage highest is #1", () => {
    const bench = editorFieldBenchmark(WEAPONS["dvl10"]!, identity, all, "all", "damage")!;
    expect(bench.testRank).toBe(1);
  });

  it("lower-is-better: weight lowest is rank #1", () => {
    const bench = editorFieldBenchmark(pm, identity, all, "all", "weight")!;
    expect(bench.testRank).toBe(1);
  });

  it("lower-is-better: reload lowest is rank #1", () => {
    const bench = editorFieldBenchmark(mp133, identity, all, "all", "reload")!;
    expect(bench.testRank).toBe(1);
  });

  it("unmodified stat shows current marker/rank without BASE→TEST", () => {
    const bench = editorFieldBenchmark(mp133, identity, all, "category", "range")!;
    expect(bench.changed).toBe(false);
    expect(bench.rankChanged).toBe(false);
    expect(formatEditorRank(bench)).toBe(`#${bench.testRank} / 2`);
    expect(formatEditorRank(bench)).not.toContain("→");
  });

  it("modified stat exposes BASE and TEST positions and rank change", () => {
    const testOf = (w: typeof mp133) => (w.id === "mp133" ? mergeWeaponDef(w, { range: 400 }) : w);
    const bench = editorFieldBenchmark(mp133, testOf, all, "all", "range")!;
    expect(bench.changed).toBe(true);
    expect(bench.base).toBe(105);
    expect(bench.test).toBe(400);
    expect(bench.testRank).toBe(1);
    expect(bench.rankChanged).toBe(true);
    expect(formatEditorRank(bench)).toContain("→");
    expect(bench.tone).toBe("buff");
  });

  it("live draft updates rank before APPLY", () => {
    const draft = setOverrideField(emptyBalanceOverrides(), "weapon", "mp133", "damage", 13, 11);
    const testOf = (w: typeof mp133) => mergeWeaponDef(w, draft.weapons[w.id]);
    const pellet = editorFieldBenchmark(mp133, testOf, all, "all", "pelletDamage")!;
    expect(pellet.test).toBe(13);
    expect(pellet.base).toBe(11);
    const dps = editorFieldBenchmark(mp133, testOf, all, "all", "sustainedDps")!;
    expect(dps.test).toBeGreaterThan(dps.base);
    expect(dps.changed).toBe(true);
  });

  it("RESET ITEM restores original rank", () => {
    let over = setOverrideField(emptyBalanceOverrides(), "weapon", "mp133", "damage", 13, 11);
    over = resetOverrideItem(over, "weapon", "mp133");
    const bench = editorFieldBenchmark(mp133, (w) => mergeWeaponDef(w, over.weapons[w.id]), all, "category", "pelletDamage")!;
    expect(bench.changed).toBe(false);
    expect(bench.test).toBe(11);
  });

  it("RESET ALL restores original rankings", () => {
    let over = setOverrideField(emptyBalanceOverrides(), "weapon", "mp133", "weight", 5, 3);
    over = setOverrideField(over, "weapon", "ak74", "damage", 40, 21);
    over = emptyBalanceOverrides();
    const pump = editorFieldBenchmark(mp133, (w) => mergeWeaponDef(w, over.weapons[w.id]), all, "all", "weight")!;
    const ak = editorFieldBenchmark(ak74, (w) => mergeWeaponDef(w, over.weapons[w.id]), all, "all", "damage")!;
    expect(pump.changed).toBe(false);
    expect(ak.changed).toBe(false);
  });

  it("shotgun pellet count uses shotgun-only comparison", () => {
    const bench = editorFieldBenchmark(mp133, identity, all, "all", "pellets")!;
    expect(bench.forcedCategory).toBe(true);
    expect(bench.category).toBe("SHOTGUNS");
    expect(bench.total).toBe(2);
    expect(bench.testRank).toBe(2);
    expect(formatEditorRank(bench)).toContain("SHOTGUNS");
    expect(editorFieldBenchmark(toz, identity, all, "all", "pellets")!.testRank).toBe(1);
  });

  it("shotgun damage/pellet uses shotgun-only comparison", () => {
    expect(editorFieldToBenchmarkKey("damage", mp133)).toBe("pelletDamage");
    const bench = editorFieldBenchmark(mp133, identity, all, "all", "pelletDamage")!;
    expect(bench.forcedCategory).toBe(true);
    expect(bench.total).toBe(2);
    expect(bench.testRank).toBe(1);
  });

  it("universal shotgun range can compare CATEGORY or ALL", () => {
    const cat = editorFieldBenchmark(mp133, identity, all, "category", "range")!;
    const allScope = editorFieldBenchmark(mp133, identity, all, "all", "range")!;
    expect(cat.total).toBe(2);
    expect(allScope.total).toBe(all.length);
    expect(cat.forcedCategory).toBe(false);
  });

  it("Item Editor rank matches WEAPON COMPARE rank for the same metric/scope", () => {
    const editor = editorFieldBenchmark(ak74, identity, all, "all", "damage")!;
    const compare = buildCompareRows(all, identity, "damage");
    expect(editor.testRank).toBe(compare.ranksTest.get("ak74")!);
    const group = weaponsInCategory("RIFLES");
    const editorCat = editorFieldBenchmark(ak74, identity, all, "category", "sustainedDps")!;
    const compareCat = buildCompareRows(group, identity, "sustainedDps");
    expect(editorCat.testRank).toBe(compareCat.ranksTest.get("ak74")!);
    expect(editorCat.total).toBe(group.length);
  });

  it("derived DPS rank updates when underlying draft changes", () => {
    const testOf = (w: typeof mp133) => (w.id === "mp133" ? mergeWeaponDef(w, { damage: 20 }) : w);
    const before = editorFieldBenchmark(mp133, identity, all, "all", "burstDps")!;
    const after = editorFieldBenchmark(mp133, testOf, all, "all", "burstDps")!;
    expect(after.test).toBeGreaterThan(before.test);
    expect(after.testRank).toBeLessThanOrEqual(before.testRank);
    expect(after.changed).toBe(true);
  });

  it("buff/nerf semantic works for rank marker changes", () => {
    const buff = editorFieldBenchmark(mp133, (w) => mergeWeaponDef(w, { damage: 13 }), all, "category", "pelletDamage")!;
    expect(buff.tone).toBe("buff");
    expect(valueTone(11, 13, false)).toBe("buff");
    expect(compareMetricTone("damage", 19, 21)).toBe("buff");
  });

  it("lower-is-better semantic colors remain correct", () => {
    const nerf = editorFieldBenchmark(mp133, (w) => mergeWeaponDef(w, { weight: 5 }), all, "all", "weight")!;
    expect(nerf.tone).toBe("nerf");
    expect(nerf.testRank).toBeGreaterThan(nerf.baseRank);
    expect(valueTone(3, 5, true)).toBe("nerf");
    expect(valueTone(3, 2.5, true)).toBe("buff");
    const reloadNerf = editorFieldBenchmark(mp133, (w) => mergeWeaponDef(w, { reloadMs: 900 }), all, "all", "reload")!;
    expect(reloadNerf.tone).toBe("nerf");
  });
});

describe("stacked Weapon Compare pipeline", () => {
  const all = allCanonicalWeapons();
  const identity = <T,>(w: T) => w;

  it("category filtering returns only that class", () => {
    const view = composeStackedCompare(all, identity, "SHOTGUNS", "damage", "", "desc");
    expect(view.weapons.map((w) => w.id).sort()).toEqual(["mp133", "toz"]);
    expect(view.category).toBe("SHOTGUNS");
    expect(view.order).toHaveLength(2);
  });

  it("stat filtering changes the displayed metric values", () => {
    const dmg = composeStackedCompare(all, identity, "ALL", "damage", "", "desc");
    const range = composeStackedCompare(all, identity, "ALL", "range", "", "desc");
    expect(dmg.metric).toBe("damage");
    expect(range.metric).toBe("range");
    expect(dmg.rows.find((r) => r.id === "toz")?.test).toBe(damagePerShot(toz));
    expect(range.rows.find((r) => r.id === "toz")?.test).toBe(toz.range);
  });

  it("category and stat filters compose", () => {
    const view = composeStackedCompare(all, identity, "RIFLES", "range", "", "desc");
    expect(view.weapons.every((w) => w.cls === "rifle")).toBe(true);
    expect(view.metric).toBe("range");
    expect(view.order[0]).toBe("sks");
  });

  it("search composes with category and stat", () => {
    const view = composeStackedCompare(all, identity, "BOLT", "damage", "long", "desc");
    expect(view.weapons.map((w) => w.id)).toEqual(["dvl10"]);
    expect(view.rows[0]?.test).toBe(damagePerShot(WEAPONS["dvl10"]!));
    const miss = composeStackedCompare(all, identity, "SHOTGUNS", "damage", "kalash", "desc");
    expect(miss.weapons).toHaveLength(0);
  });

  it("sorts high → low and low → high on the selected stat", () => {
    const hi = composeStackedCompare(all, identity, "ALL", "weight", "", "desc");
    const lo = composeStackedCompare(all, identity, "ALL", "weight", "", "asc");
    expect(hi.order[0]).toBe("pkm");
    expect(lo.order[0]).toBe("pm");
    expect(hi.order[hi.order.length - 1]).toBe("pm");
    expect(lo.order[lo.order.length - 1]).toBe("pkm");
  });

  it("compare uses the current test/draft displayed values", () => {
    const testOf = (w: typeof ak74) => (w.id === "ak74" ? mergeWeaponDef(w, { damage: 40 }) : w);
    const view = composeStackedCompare(all, testOf, "RIFLES", "damage", "", "desc");
    const ak = view.rows.find((r) => r.id === "ak74")!;
    expect(ak.base).toBe(21);
    expect(ak.test).toBe(40);
    expect(ak.changed).toBe(true);
    expect(view.order[0]).toBe("ak74");
    expect(WEAPONS["ak74"]!.damage).toBe(21);
  });

  it("shared domain covers every visible weapon", () => {
    const view = composeStackedCompare(all, identity, "ALL", "range", "", "desc");
    const values = view.rows.map((r) => r.test);
    expect(view.domain.min).toBe(Math.min(...values));
    expect(view.domain.max).toBe(Math.max(...values));
    expect(axisTicks(view.domain.min, view.domain.max)).toHaveLength(5);
    expect(axisTicks(view.domain.min, view.domain.max)[0]).toBe(view.domain.min);
  });

  it("STACK_METRICS has no overview clutter axis", () => {
    expect(STACK_METRICS).not.toContain("overview");
    expect(STACK_METRICS).toContain("damage");
    expect(STACK_METRICS).toContain("sustainedDps");
  });

  it("switching stat keeps category and switching category keeps search", () => {
    const riflesDmg = composeStackedCompare(all, identity, "RIFLES", "damage", "", "desc");
    const riflesRange = composeStackedCompare(all, identity, "RIFLES", "range", "", "desc");
    expect(riflesDmg.weapons.map((w) => w.id).sort()).toEqual(riflesRange.weapons.map((w) => w.id).sort());
    const searched = composeStackedCompare(all, identity, "ALL", "weight", "kalash", "desc");
    expect(searched.weapons.map((w) => w.id)).toEqual(["ak74"]);
  });
});
