import { describe, expect, it } from "bun:test";
import {
  armoryMountRows,
  armoryStatRows,
  listArmoryCandidates,
  mountIndexForUnequip,
  previewAttachmentsForCandidate,
  weaponBuildSummary,
} from "./armory";
import { makeItem } from "./gear";
import { freshMeta } from "./meta";
import {
  equipOnEquipmentOwner,
  LEADER_EQUIPMENT_OWNER_ID,
  unequipFromEquipmentOwner,
} from "./operators/crewEquipment";
import { stashEntriesFromItems } from "./operators/equipment";

function mustItem(id: string, uid: number) {
  const item = makeItem(id, uid);
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

describe("armory mounts", () => {
  it("lists only supported mounts for the weapon", () => {
    const m4 = armoryMountRows("m4", []);
    expect(m4.map((r) => r.mount)).toEqual(["optic", "muzzle", "magazine", "underbarrel"]);
    const toz = armoryMountRows("toz", []);
    expect(toz.map((r) => r.mount)).toEqual(["muzzle"]);
    expect(toz.some((r) => r.mount === "underbarrel")).toBe(false);
  });

  it("shows equipped attachment on the mount row", () => {
    const rows = armoryMountRows("m4", ["optic", "ar_drum"]);
    expect(rows.find((r) => r.mount === "optic")?.attachmentId).toBe("optic");
    expect(rows.find((r) => r.mount === "magazine")?.attachmentId).toBe("ar_drum");
    expect(rows.find((r) => r.mount === "muzzle")?.attachmentId).toBeNull();
  });
});

describe("armory candidates", () => {
  it("uses canonical compatibility for stash and shop lists", () => {
    const stash = [mustItem("a_ar_drum", 1), mustItem("a_pistol_ext", 2)];
    const m4 = listArmoryCandidates({
      weaponId: "m4",
      mount: "magazine",
      currentAttachments: [],
      stash,
      shopDefIds: ["a_ak_drum", "a_stanag_ext"],
      bank: 5000,
      buyMult: 1,
      stashSlots: 40,
    });
    expect(m4.some((c) => c.attachId === "ar_drum" && c.source === "stash")).toBe(true);
    expect(m4.some((c) => c.attachId === "stanag_ext" && c.source === "shop")).toBe(true);
    expect(m4.some((c) => c.attachId === "pistol_ext")).toBe(false);
    expect(m4.some((c) => c.attachId === "ak_drum")).toBe(false);

    const pm = listArmoryCandidates({
      weaponId: "pm",
      mount: "magazine",
      currentAttachments: [],
      stash,
      shopDefIds: ["a_ar_drum"],
      bank: 5000,
      buyMult: 1,
      stashSlots: 40,
    });
    expect(pm.some((c) => c.attachId === "pistol_ext")).toBe(true);
    expect(pm.some((c) => c.attachId === "ar_drum")).toBe(false);
  });

  it("blocks shop buy when bank is too low", () => {
    const rows = listArmoryCandidates({
      weaponId: "m4",
      mount: "magazine",
      currentAttachments: [],
      stash: [],
      shopDefIds: ["a_stanag_ext"],
      bank: 1,
      buyMult: 1,
      stashSlots: 40,
    });
    const shop = rows.find((c) => c.source === "shop");
    expect(shop?.blockedReason).toBe("NOT ENOUGH ₽");
  });
});

describe("armory preview stats", () => {
  it("matches canonical fitted mag / weight deltas for STANAG drum", () => {
    const rows = armoryStatRows("m4", [], ["ar_drum"]);
    const mag = rows.find((r) => r.key === "magSize")!;
    expect(mag.base).toBe(30);
    expect(mag.preview).toBe(60);
    expect(mag.tone).toBe("good");
    const weight = rows.find((r) => r.key === "weight")!;
    expect(weight.preview).toBeGreaterThan(weight.current);
    expect(weight.tone).toBe("bad");
  });

  it("treats faster reload as good", () => {
    const rows = armoryStatRows("m4", [], ["quick_mag"]);
    const reload = rows.find((r) => r.key === "reloadMs")!;
    expect(reload.preview).toBeLessThan(reload.current);
    expect(reload.tone).toBe("good");
  });

  it("preview remove restores base magazine", () => {
    const preview = previewAttachmentsForCandidate("m4", ["ar_drum"], "magazine", null, true);
    expect(preview).toEqual([]);
    const rows = armoryStatRows("m4", ["ar_drum"], preview);
    expect(rows.find((r) => r.key === "magSize")!.preview).toBe(30);
  });
});

describe("armory build summary", () => {
  it("labels heavy drum builds and stock configs", () => {
    expect(weaponBuildSummary("m4", [])).toBe("STOCK CONFIGURATION");
    expect(weaponBuildSummary("m4", ["ar_drum", "heavy_grip"])).toBe("HEAVY LANE HOLDER");
  });
});

describe("armory install / detach persistence", () => {
  it("install and remove update the real operator kit", () => {
    const meta = freshMeta();
    meta.pmc.weapon = "m4";
    meta.pmc.attachments = [];
    let stash = [mustItem("a_optic", 1)];
    const install = equipOnEquipmentOwner(
      meta,
      LEADER_EQUIPMENT_OWNER_ID,
      stash,
      10,
      1,
      40,
    );
    expect(install.ok).toBe(true);
    if (!install.ok) return;
    stash = install.stash;
    expect(meta.pmc.attachments).toContain("optic");

    const idx = mountIndexForUnequip("m4", meta.pmc.attachments, "optic");
    expect(idx).toBe(0);
    const detach = unequipFromEquipmentOwner(
      meta,
      LEADER_EQUIPMENT_OWNER_ID,
      stash,
      11,
      idx!,
      40,
    );
    expect(detach.ok).toBe(true);
    if (!detach.ok) return;
    expect(meta.pmc.attachments).not.toContain("optic");
    expect(detach.stash.some((i) => i.ref === "optic")).toBe(true);
    meta.stash = stashEntriesFromItems(detach.stash);
  });
});
