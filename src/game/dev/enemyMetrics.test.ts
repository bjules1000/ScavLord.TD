import { describe, expect, it } from "bun:test";
import { ENEMIES } from "../data";
import { damageAfterArmor } from "../combat";
import { rankByValue } from "./compareMetrics";
import {
  EHP_REFERENCE_HIT,
  allCanonicalEnemies,
  composeEnemyCompare,
  enemyCategoryOf,
  enemyDerived,
  enemyFieldTone,
  enemyMetricValue,
  enemyRanks,
  filterEnemies,
  formatEnemyRank,
} from "./enemyMetrics";

describe("derived enemy stats", () => {
  const scav = ENEMIES.scav;

  it("attack rate calculation", () => {
    expect(enemyDerived(scav).attacksPerSec).toBeCloseTo(1000 / scav.fireCooldown);
  });

  it("DPS calculation", () => {
    expect(enemyDerived(scav).dps).toBeCloseTo(scav.towerDamage * (1000 / scav.fireCooldown));
  });

  it("armor/effective HP calculation against the documented 10-dmg 0-pen hit", () => {
    const pmc = ENEMIES.pmc;
    const per = damageAfterArmor(EHP_REFERENCE_HIT, pmc.armor, 0);
    expect(enemyDerived(pmc).ehpVs10).toBeCloseTo((pmc.hp * EHP_REFERENCE_HIT) / per);
    expect(enemyDerived(scav).ehpVs10).toBeCloseTo(scav.hp);
  });

  it("bounty ratio", () => {
    expect(enemyDerived(scav).bountyPerHp).toBeCloseTo(scav.bounty / scav.hp);
  });

  it("derived values update from draft before APPLY", () => {
    const draft = { ...scav, fireCooldown: 1000, towerDamage: 10 };
    expect(enemyDerived(draft).dps).toBe(10);
    expect(enemyDerived(scav).dps).not.toBe(10);
  });

  it("rank changes with draft", () => {
    const all = allCanonicalEnemies();
    const base = enemyRanks(all, "hp", (d) => d);
    const test = enemyRanks(all, "hp", (d) => (d.kind === "scav" ? { ...d, hp: 9999 } : d));
    expect(test.get("scav")).toBe(1);
    expect(base.get("scav")).toBeGreaterThan(1);
  });

  it("deterministic ranking ties", () => {
    const a = { ...ENEMIES.scav, kind: "scav" as const, hp: 50 };
    const b = { ...ENEMIES.raider, kind: "raider" as const, hp: 50 };
    const ranks = enemyRanks([a, b], "hp", (d) => d);
    expect(ranks.get("raider")).toBe(1);
    expect(ranks.get("scav")).toBe(2);
  });

  it("fireCooldown increase is a nerf; bounty stays neutral", () => {
    expect(enemyFieldTone("fireCooldown", 2100, 2500)).toBe("nerf");
    expect(enemyFieldTone("hp", 34, 50)).toBe("buff");
    expect(enemyFieldTone("bounty", 22, 40)).toBe("neutral");
  });
});

describe("enemy compare", () => {
  const all = allCanonicalEnemies();
  const identity = (d: (typeof all)[number]) => d;

  it("ALL contains canonical enemies", () => {
    const view = composeEnemyCompare(all, identity, "ALL", "hp", "", "desc", (d) => d.name);
    expect(view.defs.map((d) => d.kind as string).sort()).toEqual(Object.keys(ENEMIES).sort());
  });

  it("category filter works", () => {
    expect(filterEnemies(all, "UNARMORED", "").every((d) => d.armor === 0)).toBe(true);
    expect(filterEnemies(all, "ARMORED", "").every((d) => d.armor > 0)).toBe(true);
    expect(enemyCategoryOf(ENEMIES.scav)).toBe("UNARMORED");
    expect(enemyCategoryOf(ENEMIES.pmc)).toBe("ARMORED");
  });

  it("stat filter works", () => {
    const hp = composeEnemyCompare(all, identity, "ALL", "hp", "", "desc", (d) => d.name);
    const speed = composeEnemyCompare(all, identity, "ALL", "speed", "", "desc", (d) => d.name);
    expect(hp.order[0]).not.toBe(speed.order[0]);
    const top = hp.rows.find((r) => r.id === hp.order[0])!;
    expect(top.test).toBe(enemyMetricValue(ENEMIES[hp.order[0]!]!, "hp"));
  });

  it("category + stat compose", () => {
    const view = composeEnemyCompare(all, identity, "ARMORED", "speed", "", "desc", (d) => d.name);
    expect(view.defs.every((d) => d.armor > 0)).toBe(true);
    expect(view.rows.every((r) => r.test === enemyMetricValue(ENEMIES[r.id]!, "speed"))).toBe(true);
  });

  it("higher-is-better ranking where appropriate", () => {
    const view = composeEnemyCompare(all, identity, "ALL", "hp", "", "desc", (d) => d.name);
    expect(view.order[0]).toBe("boss");
    expect(view.ranksTest.get("boss")).toBe(1);
  });

  it("BASE/TEST comparison uses drafts", () => {
    const view = composeEnemyCompare(
      all,
      (d) => (d.kind === "scav" ? { ...d, hp: 500 } : d),
      "ALL",
      "hp",
      "",
      "desc",
      (d) => d.name,
    );
    const scav = view.rows.find((r) => r.id === "scav")!;
    expect(scav.base).toBe(ENEMIES.scav.hp);
    expect(scav.test).toBe(500);
    expect(scav.changed).toBe(true);
  });

  it("clicking/resolving enemy preserves draft state via formatEnemyRank", () => {
    expect(formatEnemyRank(2, 5)).toBe("#2 / 5");
    expect(formatEnemyRank(2, 5, 4)).toBe("#4 → #2 / 5");
  });

  it("lower-cycle ranking handled correctly", () => {
    const ranks = rankByValue(
      all.map((d) => ({ id: d.kind, value: d.fireCooldown })),
      true,
    );
    expect(ranks.get("boss")).toBe(1);
    expect(ranks.get("scav")).toBe(all.length);
    expect(enemyFieldTone("fireCooldown", 2100, 1100)).toBe("buff");
  });
});
