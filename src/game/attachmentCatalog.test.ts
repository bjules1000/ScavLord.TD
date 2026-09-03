import { describe, expect, it } from "bun:test";
import { applyAttachmentMods, ATTACHMENTS, ITEMS, WEAPONS } from "./gear";
import { getEquippedWeight } from "./armor";
import { getOperatorMoveSpeed } from "./movement";
import { equippedMagSize } from "./raidGear";
import { pelletAngles } from "./shotgun";
import { attachmentDef } from "./weapons";
import {
  ATTACH_MOUNTS,
  canInstallAttachmentOnWeapon,
  fittedWeaponStats,
  getEffectiveMagazineCapacity,
  slotOf,
} from "./weaponAttachments";
import { tickReload } from "./weapons";

const CATALOG_IDS = [
  "red_dot",
  "optic_2x",
  "optic",
  "marksman_scope",
  "light_comp",
  "brake",
  "tight_choke",
  "wide_choke",
  "ar_drum",
  "ak_drum",
  "pistol_ext",
  "pistol_drum",
  "stanag_ext",
  "quick_mag",
  "dvl_ext",
  "grip",
  "angled_grip",
  "heavy_grip",
] as const;

describe("attachment catalog integrity", () => {
  it("every catalog attachment has slot, weight, and item def", () => {
    for (const id of CATALOG_IDS) {
      const att = ATTACHMENTS[id];
      expect(att).toBeTruthy();
      expect(att!.slot).toBeTruthy();
      expect(ATTACH_MOUNTS).toContain(att!.slot!);
      expect(att!.weight).toBeGreaterThan(0);
      expect(ITEMS.some((i) => i.ref === id && i.kind === "attachment")).toBe(true);
    }
    expect(new Set(CATALOG_IDS).size).toBe(CATALOG_IDS.length);
  });
});

describe("optics", () => {
  it("red dot fits pistol and rejects sniper without optic mount issues", () => {
    expect(canInstallAttachmentOnWeapon("pm", "red_dot").ok).toBe(true);
    expect(canInstallAttachmentOnWeapon("sv98", "red_dot").ok).toBe(false);
  });

  it("4x scope resolves additive range and accuracy", () => {
    const base = applyAttachmentMods(WEAPONS["m4"]!, []);
    const scoped = applyAttachmentMods(WEAPONS["m4"]!, ["optic"]);
    expect(scoped.range).toBe(base.range + 16);
    expect(scoped.accuracy).toBeCloseTo(base.accuracy + 0.05);
  });

  it("marksman scope is sniper-only", () => {
    expect(canInstallAttachmentOnWeapon("sv98", "marksman_scope").ok).toBe(true);
    expect(canInstallAttachmentOnWeapon("m4", "marksman_scope").ok).toBe(false);
  });
});

describe("magazines", () => {
  it("STANAG drum fits ADAR/M4 only", () => {
    expect(canInstallAttachmentOnWeapon("m4", "ar_drum").ok).toBe(true);
    expect(canInstallAttachmentOnWeapon("adar", "ar_drum").ok).toBe(true);
    expect(canInstallAttachmentOnWeapon("ak74", "ar_drum").ok).toBe(false);
  });

  it("AK drum fits AK74 only", () => {
    expect(canInstallAttachmentOnWeapon("ak74", "ak_drum").ok).toBe(true);
    expect(canInstallAttachmentOnWeapon("m4", "ak_drum").ok).toBe(false);
  });

  it("pistol extended mag fits pistol not AR", () => {
    expect(getEffectiveMagazineCapacity("pm", ["pistol_ext"])).toBe(15);
    expect(canInstallAttachmentOnWeapon("m4", "pistol_ext").ok).toBe(false);
  });

  it("pistol drum is PM-only", () => {
    expect(canInstallAttachmentOnWeapon("pm", "pistol_drum").ok).toBe(true);
    expect(getEffectiveMagazineCapacity("pm", ["pistol_drum"])).toBe(27);
    expect(canInstallAttachmentOnWeapon("adar", "pistol_drum").ok).toBe(false);
  });

  it("DVL extended mag is proprietary", () => {
    expect(canInstallAttachmentOnWeapon("dvl10", "dvl_ext").ok).toBe(true);
    expect(canInstallAttachmentOnWeapon("m700", "dvl_ext").ok).toBe(false);
    expect(getEffectiveMagazineCapacity("dvl10", ["dvl_ext"])).toBe(10);
  });

  it("quick mag changes reload not capacity", () => {
    const stock = applyAttachmentMods(WEAPONS["m4"]!, []);
    const quick = applyAttachmentMods(WEAPONS["m4"]!, ["quick_mag"]);
    expect(quick.magSize).toBe(stock.magSize);
    expect(quick.reloadMs).toBeLessThan(stock.reloadMs);
  });

  it("drum build is heavier than extended mag build", () => {
    const ext = getEquippedWeight({ weapon: "m4", attachments: ["stanag_ext"] });
    const drum = getEquippedWeight({ weapon: "m4", attachments: ["ar_drum"] });
    expect(drum).toBeGreaterThan(ext);
  });

  it("quick mag reduces real reload tick duration", () => {
    const stock = applyAttachmentMods(WEAPONS["m4"]!, []);
    const quick = applyAttachmentMods(WEAPONS["m4"]!, ["quick_mag"]);
    const stockDone = tickReload(0, stock.reloadMs, stock.reloadMs, stock.magSize, stock.reloadMs, "MAGAZINE", false);
    const quickDone = tickReload(0, quick.reloadMs, quick.reloadMs, quick.magSize, quick.reloadMs, "MAGAZINE", false);
    expect(quickDone.ammo).toBe(stockDone.ammo);
    expect(quick.reloadMs).toBeLessThan(stock.reloadMs);
  });
});

describe("underbarrel grips", () => {
  it("vertical grip improves accuracy", () => {
    const base = applyAttachmentMods(WEAPONS["m4"]!, []);
    const gripped = applyAttachmentMods(WEAPONS["m4"]!, ["grip"]);
    expect(gripped.accuracy).toBeGreaterThan(base.accuracy);
  });

  it("heavy foregrip is heavier and more accurate than vertical grip", () => {
    const vert = ATTACHMENTS["grip"]!;
    const heavy = ATTACHMENTS["heavy_grip"]!;
    expect(heavy.weight).toBeGreaterThan(vert.weight);
    const vertAcc = applyAttachmentMods(WEAPONS["m4"]!, ["grip"]).accuracy;
    const heavyAcc = applyAttachmentMods(WEAPONS["m4"]!, ["heavy_grip"]).accuracy;
    expect(heavyAcc).toBeGreaterThan(vertAcc);
  });

  it("angled grip improves reload through canonical resolver", () => {
    const stock = applyAttachmentMods(WEAPONS["m4"]!, []);
    const angled = applyAttachmentMods(WEAPONS["m4"]!, ["angled_grip"]);
    expect(angled.reloadMs).toBeLessThan(stock.reloadMs);
  });

  it("rejects grips on pistol", () => {
    expect(canInstallAttachmentOnWeapon("pm", "grip").ok).toBe(false);
  });
});

describe("shotgun chokes", () => {
  const mp = WEAPONS["mp133"]!;

  it("tight choke tightens spread and extends range", () => {
    const stock = applyAttachmentMods(mp, []);
    const tight = applyAttachmentMods(mp, ["tight_choke"]);
    expect(tight.spread!).toBeLessThan(stock.spread!);
    expect(tight.range).toBeGreaterThan(stock.range);
  });

  it("wide choke widens spread and shortens range", () => {
    const stock = applyAttachmentMods(mp, []);
    const wide = applyAttachmentMods(mp, ["wide_choke"]);
    expect(wide.spread!).toBeGreaterThan(stock.spread!);
    expect(wide.range).toBeLessThan(stock.range);
  });

  it("pellet generation uses resolved spread", () => {
    const tight = applyAttachmentMods(mp, ["tight_choke"]);
    const wide = applyAttachmentMods(mp, ["wide_choke"]);
    const tightAngles = pelletAngles(0, 7, tight.spread!);
    const wideAngles = pelletAngles(0, 7, wide.spread!);
    const tightSpan = Math.max(...tightAngles) - Math.min(...tightAngles);
    const wideSpan = Math.max(...wideAngles) - Math.min(...wideAngles);
    expect(tightSpan).toBeLessThan(wideSpan);
  });

  it("shotgun per-round reload model unchanged", () => {
    const toz = applyAttachmentMods(WEAPONS["toz"]!, ["wide_choke"]);
    expect(toz.reloadType).toBe("PER_ROUND");
  });
});

describe("M4 build behavior", () => {
  const heavyLane = ["optic", "brake", "ar_drum", "heavy_grip"] as const;
  const mobile = ["red_dot", "light_comp", "stanag_ext", "angled_grip"] as const;

  it("heavy lane build reaches 60-round mag on M4", () => {
    expect(equippedMagSize("m4", heavyLane)).toBe(60);
  });

  it("heavy lane build slows movement through weight", () => {
    const stock = getOperatorMoveSpeed({ weapon: "m4", attachments: [] });
    const heavy = getOperatorMoveSpeed({ weapon: "m4", attachments: heavyLane });
    const mobileSpeed = getOperatorMoveSpeed({ weapon: "m4", attachments: mobile });
    expect(heavy).toBeLessThan(stock);
    expect(mobileSpeed).toBeGreaterThan(heavy);
  });

  it("fitted stats include spread only for shotguns", () => {
    const m4 = fittedWeaponStats("m4", heavyLane);
    expect(m4.spread).toBeUndefined();
  });
});

describe("slot mapping", () => {
  it("maps every attachment id to a mount", () => {
    for (const id of Object.keys(ATTACHMENTS)) {
      expect(slotOf(id, attachmentDef)).toBeTruthy();
    }
  });
});
