import { describe, expect, it } from "bun:test";
import { buildExtractHaul, recoveredLootFromSurvivingTowers } from "./extract";
import { makeItem } from "./gear";

describe("extraction ownership", () => {
  it("does not deposit the PMC equipped kit into recovered loot", () => {
    let uid = 100;
    const recovered = recoveredLootFromSurvivingTowers(
      [{ pmc: true, weapon: "m4", attachments: ["optic"], armor: "paca" }],
      () => uid++,
    );

    expect(recovered).toEqual([]);
    expect(uid).toBe(100);
  });

  it("does not deposit persistent crew equipped kit into recovered loot", () => {
    let uid = 200;
    const recovered = recoveredLootFromSurvivingTowers(
      [{ operatorId: "op_survivor", weapon: "m4", attachments: ["optic"], armor: "paca" }],
      () => uid++,
    );

    expect(recovered).toEqual([]);
    expect(uid).toBe(200);
  });

  it("recovers a surviving mid-raid hire kit and combines it with backpack loot once", () => {
    let uid = 300;
    const recovered = recoveredLootFromSurvivingTowers(
      [{ weapon: "m4", attachments: ["optic"], armor: "paca" }],
      () => uid++,
    );
    const backpackItem = makeItem("v_bolts", 42)!;
    const haul = buildExtractHaul([backpackItem], recovered);

    expect(recovered.map((item) => [item.kind, item.ref])).toEqual([
      ["weapon", "m4"],
      ["attachment", "optic"],
      ["armor", "paca"],
    ]);
    expect(haul.filter((item) => item.uid === backpackItem.uid)).toHaveLength(1);
    expect(new Set(haul.map((item) => item.uid)).size).toBe(haul.length);
  });

  it("does not recover the stock sawed-off issued to a mid-raid hire", () => {
    let uid = 400;
    const recovered = recoveredLootFromSurvivingTowers(
      [{ weapon: "toz", attachments: [], armor: null }],
      () => uid++,
    );

    expect(recovered).toEqual([]);
    expect(uid).toBe(400);
  });
});
