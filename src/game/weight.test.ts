import { describe, expect, it } from "bun:test";
import { getEquippedWeight } from "./armor";
import { ATTACHMENTS, ARMORS, WEAPONS, makeItem } from "./gear";
import {
  OPERATOR_MOVE_SPEED_TILES,
  WEIGHT_SPEED_MAX_MULT,
  WEIGHT_SPEED_MIN_MULT,
  WEIGHT_SPEED_PENALTY,
  getOperatorMoveSpeed,
  operatorSpeedMultiplier,
} from "./movement";

const naked = { weapon: "", armor: null as string | null, attachments: [] as string[] };

describe("equipped weight", () => {
  it("naked/no authored gear weight returns 0", () => {
    expect(getEquippedWeight(naked)).toBe(0);
    expect(getEquippedWeight({})).toBe(0);
  });

  it("PM contributes 1", () => {
    expect(WEAPONS["pm"]!.weight).toBe(1);
    expect(getEquippedWeight({ weapon: "pm" })).toBe(1);
  });

  it("TOZ contributes 2", () => {
    expect(WEAPONS["toz"]!.weight).toBe(2);
    expect(getEquippedWeight({ weapon: "toz" })).toBe(2);
  });

  it("MP133 contributes 3", () => {
    expect(WEAPONS["mp133"]!.weight).toBe(3);
    expect(getEquippedWeight({ weapon: "mp133" })).toBe(3);
  });

  it("PACA contributes 2", () => {
    expect(ARMORS["paca"]!.weight).toBe(2);
    expect(getEquippedWeight({ armor: "paca" })).toBe(2);
  });

  it("6B23 contributes 4", () => {
    expect(ARMORS["sixb23"]!.weight).toBe(4);
    expect(getEquippedWeight({ armor: "sixb23" })).toBe(4);
  });

  it("Slick contributes 6", () => {
    expect(ARMORS["slick"]!.weight).toBe(6);
    expect(getEquippedWeight({ armor: "slick" })).toBe(6);
  });

  it("weapon + armor weights sum", () => {
    expect(getEquippedWeight({ weapon: "toz", armor: "paca" })).toBe(4);
    expect(getEquippedWeight({ weapon: "mp133", armor: "sixb23" })).toBe(7);
  });

  it("installed attachment weight is included", () => {
    expect(ATTACHMENTS["optic"]!.weight).toBe(0.25);
    expect(getEquippedWeight({ weapon: "m4", attachments: ["optic"] })).toBeCloseTo(3.75);
  });

  it("multiple installed attachments sum correctly", () => {
    expect(getEquippedWeight({ weapon: "m4", attachments: ["optic", "brake", "mag"] })).toBeCloseTo(4.75);
  });

  it("detached backpack attachment is not included", () => {
    const kit = {
      weapon: "pm",
      attachments: [] as string[],
      armor: null as string | null,
      backpack: [makeItem("a_optic", 1)!],
    };
    expect(getEquippedWeight(kit)).toBe(1);
  });

  it("unrelated backpack loot is not included", () => {
    const kit = {
      weapon: "pm",
      attachments: [] as string[],
      armor: null as string | null,
      backpack: [makeItem("v_gpu", 1)!, makeItem("m_ifak", 2)!, makeItem("w_pkm", 3)!],
    };
    expect(getEquippedWeight(kit)).toBe(1);
  });
});

describe("operator movement speed", () => {
  it("weight 0 = 2.0 tiles/sec", () => {
    expect(getOperatorMoveSpeed(naked)).toBe(2);
    expect(getOperatorMoveSpeed({})).toBe(OPERATOR_MOVE_SPEED_TILES);
  });

  it("speed decreases with increasing weight", () => {
    expect(getOperatorMoveSpeed({ weapon: "toz" })).toBeLessThan(getOperatorMoveSpeed({ weapon: "pm" }));
    expect(getOperatorMoveSpeed({ weapon: "mp133", armor: "sixb23" })).toBeLessThan(
      getOperatorMoveSpeed({ weapon: "toz", armor: "paca" }),
    );
  });

  it("formula uses 4% reduction per weight unit", () => {
    expect(WEIGHT_SPEED_PENALTY).toBe(0.04);
    expect(operatorSpeedMultiplier(2)).toBeCloseTo(1 - 2 * 0.04);
    expect(getOperatorMoveSpeed({ weapon: "toz" })).toBeCloseTo(2 * (1 - 2 * 0.04));
    expect(getOperatorMoveSpeed({ weapon: "toz", armor: "paca" })).toBeCloseTo(1.68);
  });

  it("speed multiplier clamps at 0.60", () => {
    expect(WEIGHT_SPEED_MIN_MULT).toBe(0.6);
    expect(operatorSpeedMultiplier(10)).toBe(0.6);
    expect(operatorSpeedMultiplier(25)).toBe(0.6);
    expect(getOperatorMoveSpeed({ weapon: "pkm", armor: "slick", attachments: ["mag", "supp"] })).toBe(1.2);
  });

  it("speed never exceeds base speed", () => {
    expect(WEIGHT_SPEED_MAX_MULT).toBe(1);
    expect(operatorSpeedMultiplier(0)).toBe(1);
    expect(getOperatorMoveSpeed(naked)).toBeLessThanOrEqual(OPERATOR_MOVE_SPEED_TILES);
    expect(getOperatorMoveSpeed({ weapon: "pm" })).toBeLessThanOrEqual(OPERATOR_MOVE_SPEED_TILES);
  });

  it("PM-only operator moves faster than TOZ + PACA", () => {
    expect(getOperatorMoveSpeed({ weapon: "pm" })).toBeGreaterThan(
      getOperatorMoveSpeed({ weapon: "toz", armor: "paca" }),
    );
  });

  it("TOZ + PACA moves faster than MP133 + 6B23", () => {
    expect(getOperatorMoveSpeed({ weapon: "toz", armor: "paca" })).toBeGreaterThan(
      getOperatorMoveSpeed({ weapon: "mp133", armor: "sixb23" }),
    );
  });

  it("heavy equipped operator still moves at or above minimum speed", () => {
    const heavy = getOperatorMoveSpeed({
      weapon: "pkm",
      armor: "slick",
      attachments: ["optic", "mag", "supp", "thermal"],
    });
    expect(heavy).toBeGreaterThanOrEqual(OPERATOR_MOVE_SPEED_TILES * WEIGHT_SPEED_MIN_MULT);
    expect(heavy).toBe(1.2);
  });

  it("changing equipped gear changes calculated speed", () => {
    const kit = { weapon: "pm", armor: null as string | null, attachments: [] as string[] };
    const light = getOperatorMoveSpeed(kit);
    kit.weapon = "mp133";
    kit.armor = "sixb23";
    kit.attachments = ["optic"];
    expect(getOperatorMoveSpeed(kit)).toBeLessThan(light);
    kit.weapon = "pm";
    kit.armor = null;
    kit.attachments = [];
    expect(getOperatorMoveSpeed(kit)).toBe(light);
  });
});
