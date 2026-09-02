import { describe, expect, it } from "bun:test";
import { makeItem } from "../gear";
import { freshMeta } from "../meta";
import { candidateToOperator, hireUniqueContact, markOperatorDead } from "./crew";
import { generateRecruitmentCandidates } from "./generation";
import { freshRadioProgression } from "./radioProgression";
import { UNIQUE_OPERATOR_BY_ID, uniqueToOperator } from "./uniqueOperators";
import {
  LEADER_EQUIPMENT_OWNER_ID,
  coerceEquipmentOwnerId,
  equipOnEquipmentOwner,
  getOperatorEquippedArmor,
  getOperatorEquippedWeapon,
  getOwnerEquipment,
  isEditableEquipmentOwner,
  listCrewEquipmentRows,
  operatorHasArmor,
  operatorWeaponDiffersFrom,
  ownerLoadSummary,
  resolveEquipmentOwnerId,
  unequipFromEquipmentOwner,
} from "./crewEquipment";
import type { Meta } from "../meta";

function metaWithWolf(): { meta: Meta; wolfId: string } {
  const meta = freshMeta();
  meta.bank = 50_000;
  meta.crew.radio = {
    ...freshRadioProgression(),
    radioState: "SIGNAL_RESTORED",
    uniqueContacts: { wolf: { lifecycle: "RECRUITABLE", distressHeard: true } },
  };
  meta.claimed = ["wolf_help"];
  meta.quests.wavesCompletedByMap = { woods: 5 };
  const hired = hireUniqueContact(meta, "wolf", "op_wolf_1");
  if (!hired.ok) throw new Error(hired.reason);
  return { meta, wolfId: hired.operator.id };
}

describe("crew equipment selector", () => {
  it("lists living operators by stable id including leader", () => {
    const meta = freshMeta();
    const [cand] = generateRecruitmentCandidates(1, 0);
    const op = candidateToOperator({ ...cand!, cost: 1 }, "op_stable_a");
    meta.crew.operators.push(op);
    const rows = listCrewEquipmentRows(meta);
    expect(rows[0]?.ownerId).toBe(LEADER_EQUIPMENT_OWNER_ID);
    expect(rows[0]?.name).toBe(meta.pmc.name);
    expect(rows[0]?.roleLabel).toBe("LEADER");
    expect(rows.some((r) => r.ownerId === "op_stable_a")).toBe(true);
  });

  it("includes Wolf after unique recruitment", () => {
    const { meta } = metaWithWolf();
    const rows = listCrewEquipmentRows(meta);
    expect(rows.some((r) => r.uniqueId === "wolf")).toBe(true);
    expect(rows.find((r) => r.uniqueId === "wolf")?.ownerId).toBe("op_wolf_1");
  });

  it("dead operators are not editable and are omitted from rows", () => {
    const meta = freshMeta();
    const [cand] = generateRecruitmentCandidates(2, 0);
    const op = candidateToOperator({ ...cand!, cost: 1 }, "op_dead");
    meta.crew.operators.push(op);
    markOperatorDead(meta, "op_dead");
    expect(isEditableEquipmentOwner(meta, "op_dead")).toBe(false);
    expect(listCrewEquipmentRows(meta).some((r) => r.ownerId === "op_dead")).toBe(false);
  });

  it("resolveEquipmentOwnerId prefers uniqueId then operatorId", () => {
    const { meta, wolfId } = metaWithWolf();
    expect(resolveEquipmentOwnerId(meta, { uniqueId: "wolf" })).toBe(wolfId);
    expect(resolveEquipmentOwnerId(meta, { operatorId: LEADER_EQUIPMENT_OWNER_ID })).toBe(
      LEADER_EQUIPMENT_OWNER_ID,
    );
  });
});

describe("crew equipment transactions", () => {
  it("equipping weapon on Wolf returns old gun to shared stash; Ash unchanged", () => {
    const { meta, wolfId } = metaWithWolf();
    const ashWeapon = meta.pmc.weapon;
    const baseline = UNIQUE_OPERATOR_BY_ID["wolf"]!.equipment.weapon;
    expect(getOperatorEquippedWeapon(meta, wolfId)).toBe(baseline);

    const stash = [makeItem("w_ak74", 1)!];
    const result = equipOnEquipmentOwner(meta, wolfId, stash, 10, 1, 40);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getOperatorEquippedWeapon(meta, wolfId)).toBe("ak74");
    expect(meta.pmc.weapon).toBe(ashWeapon);
    expect(result.stash.some((i) => i.kind === "weapon" && i.ref === baseline)).toBe(true);
    expect(result.change.type).toBe("OPERATOR_EQUIPMENT_CHANGED");
    expect(result.change.operatorId).toBe(wolfId);
    expect(result.change.slot).toBe("weapon");
  });

  it("armor swap is atomic and failed stash overflow loses nothing", () => {
    const { meta, wolfId } = metaWithWolf();
    const first = equipOnEquipmentOwner(meta, wolfId, [makeItem("ar_paca", 1)!], 50, 1, 40);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const before = structuredClone(meta.crew.operators.find((o) => o.id === wolfId)!.equipment);
    // Cap of 8 with 8 filler items — returning the old vest would exceed cap.
    const stash = [
      makeItem("ar_6b23", 2)!,
      ...Array.from({ length: 8 }, (_, i) => makeItem("m_ifak", i + 3)!),
    ];
    expect(stash.length).toBe(9);
    const result = equipOnEquipmentOwner(meta, wolfId, stash, 100, 2, 8);
    expect(result.ok).toBe(false);
    expect(getOwnerEquipment(meta, wolfId)).toEqual(before);
  });

  it("two operators keep independent kits", () => {
    const meta = freshMeta();
    const a = candidateToOperator({ ...generateRecruitmentCandidates(1, 0)[0]!, cost: 1 }, "op_a");
    const b = candidateToOperator({ ...generateRecruitmentCandidates(2, 0)[0]!, cost: 1 }, "op_b");
    a.equipment = { weapon: "pm", attachments: [], armor: null };
    b.equipment = { weapon: "toz", attachments: [], armor: null };
    meta.crew.operators.push(a, b);
    const stash = [makeItem("w_m4", 1)!, makeItem("ar_paca", 2)!];
    const r1 = equipOnEquipmentOwner(meta, "op_a", stash, 10, 1, 40);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = equipOnEquipmentOwner(meta, "op_b", r1.stash, 20, 2, 40);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(getOperatorEquippedWeapon(meta, "op_a")).toBe("m4");
    expect(getOperatorEquippedArmor(meta, "op_b")).toBe("paca");
    expect(getOperatorEquippedWeapon(meta, "op_b")).toBe("toz");
  });

  it("attachments install and unequip return to stash; compound persists across owner switch", () => {
    const { meta, wolfId } = metaWithWolf();
    let stash = [makeItem("w_m4", 1)!, makeItem("a_optic", 2)!];
    const gun = equipOnEquipmentOwner(meta, wolfId, stash, 10, 1, 40);
    expect(gun.ok).toBe(true);
    if (!gun.ok) return;
    stash = gun.stash;
    const att = equipOnEquipmentOwner(meta, wolfId, stash, 20, 2, 40);
    expect(att.ok).toBe(true);
    if (!att.ok) return;
    expect(getOwnerEquipment(meta, wolfId)?.attachments).toContain("optic");
    expect(getOwnerEquipment(meta, LEADER_EQUIPMENT_OWNER_ID)?.attachments).toEqual([]);

    const rem = unequipFromEquipmentOwner(meta, wolfId, att.stash, 30, 0, 40);
    expect(rem.ok).toBe(true);
    if (!rem.ok) return;
    expect(getOwnerEquipment(meta, wolfId)?.attachments).not.toContain("optic");
    expect(rem.stash.some((i) => i.kind === "attachment" && i.ref === "optic")).toBe(true);
  });

  it("rejects equip on dead operator", () => {
    const meta = freshMeta();
    const op = candidateToOperator({ ...generateRecruitmentCandidates(3, 0)[0]!, cost: 1 }, "op_x");
    meta.crew.operators.push(op);
    markOperatorDead(meta, "op_x");
    const stash = [makeItem("w_ak74", 1)!];
    const result = equipOnEquipmentOwner(meta, "op_x", stash, 5, 1, 40);
    expect(result.ok).toBe(false);
  });

  it("Wolf kit helpers detect weapon change and armor without Wolf hard-coding", () => {
    const { meta, wolfId } = metaWithWolf();
    const baseline = UNIQUE_OPERATOR_BY_ID["wolf"]!.equipment.weapon;
    expect(operatorWeaponDiffersFrom(meta, wolfId, baseline)).toBe(false);
    const stash = [makeItem("w_ak74", 1)!, makeItem("ar_paca", 2)!];
    const w = equipOnEquipmentOwner(meta, wolfId, stash, 10, 1, 40);
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    const a = equipOnEquipmentOwner(meta, wolfId, w.stash, 20, 2, 40);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(operatorHasArmor(meta, wolfId)).toBe(true);
    expect(operatorWeaponDiffersFrom(meta, wolfId, baseline)).toBe(true);
    // uniqueId resolver works for future quests
    expect(resolveEquipmentOwnerId(meta, { uniqueId: "wolf" })).toBe(wolfId);
  });

  it("unequip returns compound weapon with installed mods once", () => {
    const meta = freshMeta();
    const op = uniqueToOperator(UNIQUE_OPERATOR_BY_ID["wolf"]!, "op_compound");
    op.equipment = { weapon: "m4", attachments: ["optic", "grip"], armor: null };
    meta.crew.operators.push(op);
    const result = unequipFromEquipmentOwner(meta, "op_compound", [], 5, "weapon", 40);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const guns = result.stash.filter((i) => i.kind === "weapon");
    expect(guns).toHaveLength(1);
    expect(guns[0]?.installed).toEqual(["optic", "grip"]);
  });
});

describe("crew equipment helpers", () => {
  it("derived load recalculates per owner", () => {
    const meta = freshMeta();
    meta.pmc.weapon = "pm";
    meta.pmc.armor = null;
    meta.pmc.attachments = [];
    const light = ownerLoadSummary(meta, LEADER_EQUIPMENT_OWNER_ID);
    meta.pmc.weapon = "pkm";
    meta.pmc.armor = "slick";
    const heavy = ownerLoadSummary(meta, LEADER_EQUIPMENT_OWNER_ID);
    expect(heavy.weight).toBeGreaterThan(light.weight);
    expect(heavy.moveTilesPerSec).toBeLessThan(light.moveTilesPerSec);
  });

  it("coerce falls back to leader", () => {
    const meta = freshMeta();
    expect(coerceEquipmentOwnerId(meta, "missing")).toBe(LEADER_EQUIPMENT_OWNER_ID);
  });

  it("UI terminology helpers expose operator identity not ScavLord kit", () => {
    const meta = freshMeta();
    const row = listCrewEquipmentRows(meta)[0]!;
    expect(row.name).toBe("ASH-01");
    expect(`${row.name} · KIT`).not.toContain("SCAVLORD");
  });
});
