import { describe, expect, it } from "bun:test";
import { applyAttachmentMods, makeItem, WEAPONS } from "./gear";
import {
  canEquipAttachment,
  detachAttachment,
  dropEquippedGear,
  equippedMagSize,
  equipAttachment,
  expandPackedWeapon,
  packWeaponItem,
  swapRaidWeapon,
} from "./raidGear";
import { clampAmmo } from "./weapons";

function mustItem(id: string, uid: number) {
  const item = makeItem(id, uid);
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

describe("manual detach", () => {
  it("moves an equipped attachment into raid inventory, not stash", () => {
    const result = detachAttachment("optic", ["optic"], [], 5, 40, 7, "pm");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toEqual([]);
    expect(result.backpack).toHaveLength(1);
    expect(result.backpack[0]?.ref).toBe("optic");
    expect(result.backpack[0]?.kind).toBe("attachment");
  });

  it("blocks removal when the backpack is full and does not delete the attachment", () => {
    const pack = [mustItem("v_bolts", 1), mustItem("v_bolts", 2), mustItem("v_bolts", 3)];
    const result = detachAttachment("optic", ["optic"], pack, 3, 40, 7, "pm");
    expect(result).toEqual({ ok: false, reason: "BACKPACK FULL" });
  });
});

describe("direct attachment swap", () => {
  it("swaps compatible optics atomically even when the backpack is full", () => {
    const incoming = mustItem("a_thermal", 10);
    const pack = [incoming, mustItem("v_bolts", 11), mustItem("v_bolts", 12)];
    const result = equipAttachment(incoming, ["optic"], pack, 2, 7, "pm");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toEqual(["thermal"]);
    expect(result.backpack).toHaveLength(3);
    expect(result.backpack[0]?.ref).toBe("optic");
    expect(result.backpack[0]?.uid).toBe(10);
    expect(result.backpack[1]?.id).toBe("v_bolts");
  });

  it("rejects incompatible attachments", () => {
    expect(canEquipAttachment("pm")).toBe(false);
    expect(canEquipAttachment("optic", "pm")).toBe(true);
    expect(canEquipAttachment("ar_drum", "pm")).toBe(false);
    const gun = mustItem("w_pm", 1);
    const result = equipAttachment(gun, [], [gun], 2, 7, "pm");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("Not an attachment.");
  });
});

describe("attachment combat stats", () => {
  it("updates canonical weapon stats used by combat and the operator sidebar", () => {
    const stock = applyAttachmentMods(WEAPONS["pm"]!, []);
    const scoped = applyAttachmentMods(WEAPONS["pm"]!, ["optic"]);
    expect(scoped.range).toBeCloseTo(stock.range * 1.18);
    expect(scoped.accuracy).toBeGreaterThan(stock.accuracy);
    expect(scoped.magSize).toBe(stock.magSize);
    const drummed = applyAttachmentMods(WEAPONS["pm"]!, ["mag"]);
    expect(drummed.magSize).toBe(11);
    expect(drummed.cooldown).toBeLessThan(stock.cooldown);
  });
});

describe("weapon swap", () => {
  it("keeps installed attachments on their respective weapons", () => {
    const incoming = packWeaponItem("ak74", ["optic", "grip"], 5)!;
    const result = swapRaidWeapon(incoming, "pm", ["laser"], [incoming], 7);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weapon).toBe("ak74");
    expect(result.attachments).toEqual(["optic", "grip"]);
    expect(result.backpack).toHaveLength(1);
    expect(result.backpack[0]?.ref).toBe("pm");
    expect(result.backpack[0]?.installed).toEqual(["laser"]);
  });
});

describe("death drop identity", () => {
  it("does not duplicate an attachment that was already detached into the backpack", () => {
    const backpack = [mustItem("a_optic", 1)];
    const dropped = dropEquippedGear("pm", [], () => 50);
    const opticOnBody = dropped.filter((i) => i.ref === "optic");
    const opticInPack = backpack.filter((i) => i.ref === "optic");
    expect(opticOnBody).toHaveLength(0);
    expect(opticInPack).toHaveLength(1);
    expect(dropped.some((i) => i.kind === "weapon" && i.ref === "pm")).toBe(true);
  });
});

describe("magazine capacity clamp", () => {
  it("does not create ammo when a larger magazine is installed", () => {
    const mag = mustItem("a_mag", 3);
    const result = equipAttachment(mag, [], [mag], 2, 7, "pm");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(equippedMagSize("pm", result.attachments)).toBe(11);
    expect(result.ammo).toBe(7);
  });

  it("clamps loaded rounds when magazine capacity shrinks", () => {
    expect(clampAmmo(11, 7)).toBe(7);
    const result = detachAttachment("mag", ["mag"], [], 5, 8, 11, "pm");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ammo).toBe(7);
    expect(result.attachments).toEqual([]);
  });
});

describe("extract unpack", () => {
  it("expands packed weapons so stash persistence cannot drop installed mods", () => {
    const packed = packWeaponItem("m4", ["optic", "supp"], 9)!;
    let uid = 100;
    const expanded = expandPackedWeapon(packed, () => uid++);
    expect(expanded.map((i) => i.ref)).toEqual(["m4", "optic", "supp"]);
    expect(expanded[0]?.installed).toBeUndefined();
  });
});
