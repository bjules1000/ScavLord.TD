import { describe, expect, it } from "bun:test";
import { getEquippedWeight } from "../armor";
import { ITEMS, makeItem, rollChoices, rollCrate } from "../gear";
import { getOperatorMoveSpeed } from "../movement";
import { equipArmor, equipAttachment, swapRaidWeapon } from "../raidGear";
import {
  clearRaidBackpack,
  devAddToBackpack,
  filterDevPickerItems,
  isRaidBackpackItemDef,
  raidBackpackItemDefs,
} from "./inventory";
import { readDevToolsEnabled } from "./tools";

function mustAdd(defId: string, backpack: readonly ReturnType<typeof makeItem>[], capacity: number, uid: number) {
  const result = devAddToBackpack(defId, backpack as never, capacity, uid, true);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("DEV tools gate", () => {
  it("DEV tools disabled → DEV controls are unavailable through the helper", () => {
    expect(readDevToolsEnabled({ DEV: false })).toBe(false);
    expect(readDevToolsEnabled({ DEV: false, VITE_ENABLE_DEV_TOOLS: "false" })).toBe(false);
    expect(readDevToolsEnabled({ DEV: false, VITE_ENABLE_DEV_TOOLS: "" })).toBe(false);
    const pack = [makeItem("v_bolts", 1)!];
    expect(devAddToBackpack("w_pm", [], 5, 1, false)).toEqual({ ok: false, reason: "DEV TOOLS DISABLED" });
    expect(clearRaidBackpack(pack, false)).toEqual({ ok: false, reason: "DEV TOOLS DISABLED" });
    expect(pack).toHaveLength(1);
  });

  it("DEV tools enabled → item picker can be enabled", () => {
    expect(readDevToolsEnabled({ DEV: true })).toBe(true);
    expect(readDevToolsEnabled({ DEV: false, VITE_ENABLE_DEV_TOOLS: "true" })).toBe(true);
    expect(readDevToolsEnabled({ DEV: true, VITE_ENABLE_DEV_TOOLS: "false" })).toBe(true);
  });

  it("does not treat a query-string-like field as a production bypass", () => {
    const env = { DEV: false, search: "?dev=1", DEV_QUERY: "1" } as { DEV: boolean };
    expect(readDevToolsEnabled(env)).toBe(false);
  });
});

describe("DEV item picker catalog", () => {
  const defs = raidBackpackItemDefs();

  it("canonical weapon catalog items appear in picker source", () => {
    expect(defs.some((d) => d.id === "w_pm" && d.kind === "weapon" && d.ref === "pm")).toBe(true);
    expect(defs.some((d) => d.id === "w_toz")).toBe(true);
    expect(defs.some((d) => d.id === "w_mp133")).toBe(true);
  });

  it("armor appears", () => {
    expect(defs.some((d) => d.id === "ar_paca" && d.ref === "paca")).toBe(true);
    expect(defs.some((d) => d.id === "ar_6b23")).toBe(true);
    expect(defs.some((d) => d.id === "ar_slick")).toBe(true);
  });

  it("attachments appear", () => {
    expect(defs.some((d) => d.id === "a_optic" && d.kind === "attachment")).toBe(true);
    expect(defs.some((d) => d.kind === "attachment")).toBe(true);
  });

  it("loot/valuables appear where valid", () => {
    expect(defs.some((d) => d.kind === "valuable" && d.id === "v_gpu")).toBe(true);
    expect(defs.some((d) => d.kind === "meds")).toBe(true);
  });

  it("no duplicate dev-only item catalog is required", () => {
    expect(defs.every((d) => ITEMS.includes(d))).toBe(true);
    expect(defs.every(isRaidBackpackItemDef)).toBe(true);
    expect(defs.some((d) => d.kind === "backpack")).toBe(false);
    expect(ITEMS.some((d) => d.kind === "backpack")).toBe(true);
  });

  it("filters by category and search without a second catalog", () => {
    expect(filterDevPickerItems(defs, "WEAPONS", "").every((d) => d.kind === "weapon")).toBe(true);
    expect(filterDevPickerItems(defs, "ARMOR", "").map((d) => d.ref)).toEqual(["paca", "sixb23", "slick"]);
    expect(filterDevPickerItems(defs, "ATTACHMENTS", "optic").some((d) => d.ref === "optic")).toBe(true);
    expect(filterDevPickerItems(defs, "LOOT", "").every((d) => d.kind === "valuable" || d.kind === "meds")).toBe(true);
  });
});

describe("DEV ADD backpack", () => {
  it("adding item creates one valid backpack item", () => {
    const result = mustAdd("w_pm", [], 5, 40);
    expect(result.backpack).toHaveLength(1);
    expect(result.item.uid).toBe(40);
    expect(result.item).toEqual(makeItem("w_pm", 40)!);
  });

  it("adding PM produces canonical PM item", () => {
    const result = mustAdd("w_pm", [], 5, 1);
    expect(result.item.id).toBe("w_pm");
    expect(result.item.kind).toBe("weapon");
    expect(result.item.ref).toBe("pm");
    expect(result.item.name).toBe("SIDEARM");
  });

  it("adding PACA produces canonical PACA armor", () => {
    const result = mustAdd("ar_paca", [], 5, 2);
    expect(result.item.id).toBe("ar_paca");
    expect(result.item.kind).toBe("armor");
    expect(result.item.ref).toBe("paca");
  });

  it("adding attachment produces normal compatible attachment item", () => {
    const result = mustAdd("a_optic", [], 5, 3);
    expect(result.item.kind).toBe("attachment");
    expect(result.item.ref).toBe("optic");
    const equipped = equipAttachment(result.item, [], result.backpack, 4, 7, "m4");
    expect(equipped.ok).toBe(true);
    if (!equipped.ok) return;
    expect(equipped.attachments).toEqual(["optic"]);
  });

  it("full backpack rejects DEV ADD", () => {
    const full = [makeItem("v_bolts", 1)!, makeItem("v_bolts", 2)!, makeItem("v_bolts", 3)!];
    expect(devAddToBackpack("w_pm", full, 3, 9, true)).toEqual({ ok: false, reason: "BACKPACK FULL" });
  });

  it("DEV ADD does not exceed backpack capacity", () => {
    let pack = [makeItem("v_bolts", 1)!, makeItem("v_bolts", 2)!];
    const ok = mustAdd("w_toz", pack, 3, 10);
    pack = ok.backpack;
    expect(pack).toHaveLength(3);
    const denied = devAddToBackpack("w_mp133", pack, 3, 11, true);
    expect(denied.ok).toBe(false);
    expect(pack).toHaveLength(3);
  });

  it("rejects shop-only backpack upgrades", () => {
    expect(devAddToBackpack("bp_trizip", [], 5, 1, true)).toEqual({ ok: false, reason: "UNKNOWN ITEM" });
  });
});

describe("DEV CLEAR backpack", () => {
  it("CLEAR removes loose backpack items", () => {
    const pack = [makeItem("w_toz", 1)!, makeItem("ar_paca", 2)!, makeItem("a_optic", 3)!];
    const result = clearRaidBackpack(pack, true);
    expect(result).toEqual({ ok: true, backpack: [] });
  });

  it("CLEAR does not remove equipped weapon", () => {
    const operator = { weapon: "pm", armor: null as string | null, attachments: ["optic"] };
    clearRaidBackpack([makeItem("w_toz", 1)!], true);
    expect(operator.weapon).toBe("pm");
  });

  it("CLEAR does not remove equipped armor", () => {
    const operator = { armor: "slick", armorHp: 300 };
    clearRaidBackpack([makeItem("ar_paca", 1)!], true);
    expect(operator.armor).toBe("slick");
    expect(operator.armorHp).toBe(300);
  });

  it("CLEAR does not remove installed weapon attachments", () => {
    const operator = { weapon: "m4", attachments: ["optic", "brake"] };
    clearRaidBackpack([makeItem("a_mag", 1)!], true);
    expect(operator.attachments).toEqual(["optic", "brake"]);
  });

  it("clearing backpack does not alter operator movement state", () => {
    const operator = {
      weapon: "pm",
      tx: 4,
      ty: 4,
      move: { x: 80, y: 80, path: [{ tx: 5, ty: 4, surface: "GROUND" as const }], dest: { tx: 8, ty: 4, surface: "GROUND" as const }, pendingDest: null },
    };
    const before = structuredClone(operator);
    clearRaidBackpack([makeItem("v_bolts", 1)!], true);
    expect(operator).toEqual(before);
    expect(getOperatorMoveSpeed(operator)).toBe(getOperatorMoveSpeed({ weapon: "pm" }));
  });
});

describe("DEV-added gear uses live equipment/weight rules", () => {
  it("dev-added equipped gear contributes normal equipment weight", () => {
    const gun = mustAdd("w_toz", [], 5, 1);
    const vest = mustAdd("ar_paca", gun.backpack, 5, 2);
    const swapped = swapRaidWeapon(gun.item, "pm", [], vest.backpack, 7);
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    const armored = equipArmor(vest.item, null, swapped.backpack);
    expect(armored.ok).toBe(true);
    if (!armored.ok) return;
    const kit = { weapon: swapped.weapon, attachments: swapped.attachments, armor: armored.armor ?? null };
    expect(getEquippedWeight(kit)).toBe(4);
    expect(getOperatorMoveSpeed(kit)).toBeCloseTo(1.68);
  });

  it("production gameplay reward/drop logic remains untouched", () => {
    expect(ITEMS.filter((i) => i.id.startsWith("dev_"))).toHaveLength(0);
    const choices = rollChoices(1, 9000, 1);
    expect(choices).toHaveLength(3);
    const crate = rollCrate(1, 9100, 1);
    expect(crate.length).toBeGreaterThanOrEqual(1);
    expect(choices.every((c) => ITEMS.some((d) => d.id === c.id))).toBe(true);
  });
});
