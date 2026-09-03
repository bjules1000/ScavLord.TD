import { describe, expect, it } from "bun:test";
import type { Item } from "../gear";
import { raidPrepActions } from "./prep";

function item(partial: Partial<Item> & Pick<Item, "kind" | "name">): Item {
  return {
    id: "x",
    uid: 1,
    rarity: "common",
    value: 1,
    desc: "",
    ...partial,
  };
}

const openKit = { attachments: [] as string[], attachmentSlots: 2, weaponId: "pm" };

describe("raid prep item actions", () => {
  it("lets a weapon equip or pack", () => {
    expect(raidPrepActions(item({ kind: "weapon", name: "BREAK-ACTION", ref: "toz" }), openKit)).toEqual([
      "equip",
      "pack",
    ]);
  });

  it("lets armor equip or pack", () => {
    expect(raidPrepActions(item({ kind: "armor", name: "SOFT VEST", ref: "vest" }), openKit)).toEqual([
      "equip",
      "pack",
    ]);
  });

  it("packs meds without offering equip", () => {
    expect(raidPrepActions(item({ kind: "meds", name: "POCKET KIT" }), openKit)).toEqual(["pack"]);
  });

  it("hides equip when incompatible with weapon", () => {
    const full = { attachments: ["optic", "pistol_ext"], attachmentSlots: 2, weaponId: "pm" };
    expect(raidPrepActions(item({ kind: "attachment", name: "AR DRUM", ref: "ar_drum" }), full)).toEqual(["pack"]);
  });

  it("hides equip when that mod is already fitted", () => {
    const fitted = { attachments: ["supp"], attachmentSlots: 2, weaponId: "pm" };
    expect(raidPrepActions(item({ kind: "attachment", name: "SUPPRESSOR", ref: "supp" }), fitted)).toEqual(["pack"]);
  });

  it("offers replace when mount is occupied", () => {
    const fitted = { attachments: ["optic"], attachmentSlots: 2, weaponId: "pm" };
    expect(raidPrepActions(item({ kind: "attachment", name: "THERMAL", ref: "thermal" }), fitted)).toEqual([
      "replace",
      "pack",
    ]);
  });
});
