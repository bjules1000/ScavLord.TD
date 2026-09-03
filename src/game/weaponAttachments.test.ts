import { describe, expect, it } from "bun:test";
import { ATTACHMENTS, WEAPONS, type AttachmentDef, type WeaponCategory } from "./gear";
import { getEquippedWeight } from "./armor";
import { getOperatorMoveSpeed } from "./movement";
import { equippedMagSize } from "./raidGear";
import {
  canInstallAttachment,
  canInstallAttachmentOnWeapon,
  defaultMountsForWeapon,
  getEffectiveMagazineCapacity,
  installAttachmentInMounts,
  mountRowsForWeapon,
  normalizeInstalledAttachments,
  weaponMounts,
} from "./weaponAttachments";

describe("weapon mounts", () => {
  it("exposes configured slots per weapon", () => {
    expect(weaponMounts(WEAPONS["m4"]!)).toEqual(["optic", "muzzle", "magazine", "underbarrel"]);
    expect(weaponMounts(WEAPONS["pm"]!)).toEqual(["optic", "magazine"]);
    expect(weaponMounts(WEAPONS["toz"]!)).toEqual(["muzzle"]);
  });

  it("defaults legacy weapons without attachmentSlots", () => {
    const { attachmentSlots: _omit, ...legacy } = WEAPONS["ak74"]!;
    expect(defaultMountsForWeapon(legacy)).toEqual(["optic", "muzzle", "underbarrel"]);
  });

  it("rejects attachments for unsupported mounts", () => {
    expect(canInstallAttachmentOnWeapon("toz", "optic").ok).toBe(false);
    expect(canInstallAttachmentOnWeapon("pm", "ar_drum").ok).toBe(false);
  });
});

describe("compatibility", () => {
  it("allows category-compatible magazine attachments", () => {
    expect(canInstallAttachmentOnWeapon("adar", "ar_drum").ok).toBe(true);
    expect(canInstallAttachmentOnWeapon("m4", "ar_drum").ok).toBe(true);
    expect(canInstallAttachmentOnWeapon("pm", "pistol_ext").ok).toBe(true);
  });

  it("rejects wrong category or weapon magazines", () => {
    expect(canInstallAttachmentOnWeapon("pm", "ar_drum").ok).toBe(false);
    expect(canInstallAttachmentOnWeapon("ak74", "ar_drum").ok).toBe(false);
    expect(canInstallAttachmentOnWeapon("adar", "pistol_ext").ok).toBe(false);
    expect(canInstallAttachmentOnWeapon("m4", "ak_drum").ok).toBe(false);
  });

  it("supports explicit weapon ID restrictions", () => {
    const restricted = {
      ...ATTACHMENTS["optic"]!,
      compatibility: { weaponIds: ["pm"] },
    };
    expect(canInstallAttachment(WEAPONS["pm"]!, restricted).ok).toBe(true);
    expect(canInstallAttachment(WEAPONS["adar"]!, restricted).ok).toBe(false);
  });

  it("excluded weapon IDs override category match", () => {
    const excluded: AttachmentDef = {
      ...ATTACHMENTS["ar_drum"]!,
      compatibility: { weaponCategories: ["ar"] satisfies WeaponCategory[], excludedWeaponIds: ["adar"] },
    };
    expect(canInstallAttachment(WEAPONS["m4"]!, excluded).ok).toBe(true);
    expect(canInstallAttachment(WEAPONS["adar"]!, excluded).ok).toBe(false);
  });
});

describe("atomic installation", () => {
  it("installs into empty mount", () => {
    const result = installAttachmentInMounts("pm", [], "red_dot");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toEqual(["red_dot"]);
    expect(result.replaced).toBeNull();
  });

  it("replaces occupied mount", () => {
    const result = installAttachmentInMounts("m4", ["optic"], "optic_2x");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toEqual(["optic_2x"]);
    expect(result.replaced).toBe("optic");
  });
});

describe("magazine capacity", () => {
  it("keeps base weapon mag unchanged", () => {
    expect(WEAPONS["adar"]!.magSize).toBe(20);
  });

  it("resolves AR drum +30", () => {
    expect(getEffectiveMagazineCapacity("adar", ["ar_drum"])).toBe(50);
    expect(getEffectiveMagazineCapacity("m4", ["ar_drum"])).toBe(60);
  });

  it("resolves pistol extended +8", () => {
    expect(getEffectiveMagazineCapacity("pm", ["pistol_ext"])).toBe(15);
  });

  it("unrelated attachments do not alter mag", () => {
    expect(getEffectiveMagazineCapacity("pm", ["optic"])).toBe(7);
  });

  it("raid helper uses effective capacity", () => {
    expect(equippedMagSize("m4", ["ar_drum"])).toBe(60);
  });
});

describe("weight", () => {
  it("includes drum weight in equipped load", () => {
    const stock = getEquippedWeight({ weapon: "m4", attachments: [] });
    const drummed = getEquippedWeight({ weapon: "m4", attachments: ["ar_drum"] });
    expect(drummed).toBeGreaterThan(stock);
    expect(drummed - stock).toBeCloseTo(2.2);
  });

  it("drum slows movement through weight system", () => {
    const stock = getOperatorMoveSpeed({ weapon: "m4", attachments: [] });
    const drummed = getOperatorMoveSpeed({ weapon: "m4", attachments: ["ar_drum"] });
    expect(drummed).toBeLessThan(stock);
  });
});

describe("migration", () => {
  it("preserves legacy installed attachments", () => {
    const normalized = normalizeInstalledAttachments("pm", ["optic", "grip", "optic"]);
    expect(normalized).toContain("optic");
    expect(normalized).toContain("grip");
    expect(normalized.filter((id) => id === "optic")).toHaveLength(1);
  });
});

describe("mount rows UI helper", () => {
  it("lists only supported mounts", () => {
    const rows = mountRowsForWeapon("pm", ["optic"]);
    expect(rows.map((r) => r.mount)).toEqual(["optic", "magazine"]);
    expect(rows[0]?.attachmentId).toBe("optic");
    expect(rows[1]?.attachmentId).toBeNull();
  });
});
