import { describe, expect, it } from "bun:test";
import { makeItem } from "../gear";
import { freshMeta, stashItems } from "../meta";
import {
  applyOperatorEquipToMeta,
  equipWeaponOnOperator,
  stashEntriesFromItems,
  unequipOperatorSlot,
} from "./equipment";
import { candidateToOperator } from "./crew";
import { generateRecruitmentCandidates } from "./generation";
import { calculateRecruitmentCost } from "./recruitment";

describe("operator equipment", () => {
  it("equip weapon removes it from stash and returns old weapon", () => {
    const [cand] = generateRecruitmentCandidates(1, 0);
    const op = candidateToOperator({ ...cand!, cost: calculateRecruitmentCost(cand!) }, "op_eq_1");
    const stash = [makeItem("w_ak74", 1)!, makeItem("w_pm", 2)!];
    const result = equipWeaponOnOperator(op, stash, 3, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stash.some((i) => i.uid === 1)).toBe(false);
    expect(result.operator.equipment.weapon).toBe("ak74");
    expect(result.stash.some((i) => i.kind === "weapon" && i.ref === "pm")).toBe(true);
  });

  it("preserves installed attachments on unequip", () => {
    const [cand] = generateRecruitmentCandidates(2, 0);
    const op = candidateToOperator({ ...cand!, cost: 1 }, "op_eq_2");
    op.equipment = { weapon: "m4", attachments: ["optic", "grip"], armor: null };
    const result = unequipOperatorSlot(op, [], 9, "weapon");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gun = result.stash.find((i) => i.kind === "weapon");
    expect(gun?.installed).toEqual(["optic", "grip"]);
  });

  it("failed stash overflow does not apply", () => {
    const meta = freshMeta();
    const [cand] = generateRecruitmentCandidates(3, 0);
    const op = candidateToOperator({ ...cand!, cost: 1 }, "op_eq_3");
    meta.crew.operators.push(op);
    const bigStash = [
      makeItem("w_ak74", 1)!,
      ...Array.from({ length: 19 }, (_, i) => makeItem("m_ifak", i + 2)!),
    ];
    const result = equipWeaponOnOperator(op, bigStash, 99, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const applied = applyOperatorEquipToMeta(meta, op.id, result, 8);
    expect(applied.ok).toBe(false);
    expect(meta.crew.operators[0]!.equipment.weapon).toBe(op.equipment.weapon);
  });
});

describe("stash persistence with installed mods", () => {
  it("round-trips installed attachments through meta stash entries", () => {
    const gun = makeItem("w_m4", 1)!;
    gun.installed = ["optic", "grip"];
    const entries = stashEntriesFromItems([gun]);
    expect(entries[0]?.installed).toEqual(["optic", "grip"]);
    const meta = freshMeta();
    meta.stash = entries;
    const items = stashItems(meta, 10);
    expect(items[0]?.installed).toEqual(["optic", "grip"]);
  });
});
