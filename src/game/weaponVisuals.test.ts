import { describe, expect, it } from "bun:test";
import {
  applyScavAction,
  canApplyScavAction,
  listScavActionsForWeapon,
  previewScavAction,
} from "./scavWeaponMods";
import {
  composeWeaponLayers,
  defaultVisualState,
  platformForWeaponId,
  resolveVisualState,
  scavVisualMods,
  setPartInState,
  visualPart,
  type WeaponVisualState,
} from "./weaponVisuals";
import { fittedWeaponStats } from "./weaponAttachments";
import { WEAPONS } from "./gear";

describe("weapon visual platforms", () => {
  it("AK defaults resolve correctly", () => {
    const state = defaultVisualState("ak74");
    expect(state?.platformId).toBe("ak");
    expect(state?.parts.stock).toBe("ak_stock_default");
    expect(state?.parts.magazine).toBe("ak_mag_default");
    expect(state?.parts.muzzle).toBe("ak_muzzle_default");
    expect(state?.parts.optic).toBeUndefined();
  });

  it("SKS defaults resolve correctly", () => {
    const state = defaultVisualState("sks");
    expect(state?.platformId).toBe("sks");
    expect(state?.parts.stock).toBe("sks_stock_default");
    expect(state?.parts.muzzle).toBe("sks_muzzle_default");
    expect(platformForWeaponId("sks")?.supportedSlots).toEqual(["stock", "optic", "muzzle"]);
  });

  it("two individual AK instances can have different visual states", () => {
    const a = defaultVisualState("ak74")!;
    const b = defaultVisualState("ak74")!;
    const aCut = setPartInState(a, "stock", "ak_stock_cut");
    expect(aCut.parts.stock).toBe("ak_stock_cut");
    expect(b.parts.stock).toBe("ak_stock_default");
  });

  it("missing optional slot resolves cleanly", () => {
    const state = resolveVisualState("ak74", {
      platformId: "ak",
      parts: { stock: "ak_stock_default", magazine: "ak_mag_default", muzzle: "ak_muzzle_default" },
    });
    expect(state?.parts.optic).toBeUndefined();
    expect(state?.parts.underbarrel).toBeUndefined();
  });

  it("unknown part has safe fallback", () => {
    const state = resolveVisualState("ak74", {
      platformId: "ak",
      parts: { stock: "not_a_real_part", magazine: "ak_mag_default", muzzle: "ak_muzzle_default" },
    });
    expect(state?.parts.stock).toBe("ak_stock_default");
    expect(visualPart("not_a_real_part")).toBeNull();
  });

  it("unsupported weapons have no platform", () => {
    expect(defaultVisualState("pm")).toBeNull();
    expect(platformForWeaponId("m4")).toBeNull();
  });
});

describe("scav bench actions", () => {
  it("remove stock transforms stock state", () => {
    const start = defaultVisualState("ak74")!;
    const result = applyScavAction("ak74", start, "remove_stock");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.parts.stock).toBe("ak_stock_none");
  });

  it("cut stock valid only from appropriate states", () => {
    const start = defaultVisualState("ak74")!;
    expect(canApplyScavAction("ak74", start, "cut_stock").ok).toBe(true);
    const cut = applyScavAction("ak74", start, "cut_stock");
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    expect(cut.state.parts.stock).toBe("ak_stock_cut");
    expect(canApplyScavAction("ak74", cut.state, "cut_stock").ok).toBe(false);
  });

  it("wrap stock requires cut stock", () => {
    const start = defaultVisualState("ak74")!;
    expect(canApplyScavAction("ak74", start, "wrap_stock").ok).toBe(false);
    const cut = applyScavAction("ak74", start, "cut_stock");
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    const wrap = applyScavAction("ak74", cut.state, "wrap_stock");
    expect(wrap.ok).toBe(true);
    if (!wrap.ok) return;
    expect(wrap.state.parts.stock).toBe("ak_stock_cut_wrapped");
  });

  it("welded stock transformation works", () => {
    const none = applyScavAction("ak74", defaultVisualState("ak74"), "remove_stock");
    expect(none.ok).toBe(true);
    if (!none.ok) return;
    const weld = applyScavAction("ak74", none.state, "weld_stock");
    expect(weld.ok).toBe(true);
    if (!weld.ok) return;
    expect(weld.state.parts.stock).toBe("ak_stock_welded");
  });

  it("tape mags changes magazine visual state", () => {
    const result = applyScavAction("ak74", defaultVisualState("ak74"), "tape_mags");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.parts.magazine).toBe("ak_mag_taped");
  });

  it("taped foregrip changes underbarrel visual state", () => {
    const result = applyScavAction("ak74", defaultVisualState("ak74"), "add_taped_grip");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.parts.underbarrel).toBe("ak_grip_taped");
  });

  it("beer sight changes sight state", () => {
    const ak = applyScavAction("ak74", defaultVisualState("ak74"), "add_beer_sight");
    expect(ak.ok).toBe(true);
    if (!ak.ok) return;
    expect(ak.state.parts.optic).toBe("ak_optic_beer_bottle");
    const sks = applyScavAction("sks", defaultVisualState("sks"), "add_beer_sight");
    expect(sks.ok).toBe(true);
    if (!sks.ok) return;
    expect(sks.state.parts.optic).toBe("sks_optic_beer_bottle");
  });

  it("saw barrel changes barrel state", () => {
    const result = applyScavAction("ak74", defaultVisualState("ak74"), "saw_barrel");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.parts.muzzle).toBe("ak_muzzle_sawed");
  });

  it("invalid platform action blocked", () => {
    expect(canApplyScavAction("pm", null, "remove_stock").ok).toBe(false);
    expect(canApplyScavAction("sks", defaultVisualState("sks"), "tape_mags").ok).toBe(false);
    expect(canApplyScavAction("sks", defaultVisualState("sks"), "remove_stock").ok).toBe(false);
  });

  it("preview does not mutate current weapon", () => {
    const start = defaultVisualState("ak74")!;
    const before = JSON.stringify(start);
    const preview = previewScavAction("ak74", start, "remove_stock");
    expect(preview?.parts.stock).toBe("ak_stock_none");
    expect(JSON.stringify(start)).toBe(before);
  });

  it("lists available actions for stock AK", () => {
    const ids = listScavActionsForWeapon("ak74", defaultVisualState("ak74")).map((a) => a.id);
    expect(ids).toContain("remove_stock");
    expect(ids).toContain("cut_stock");
    expect(ids).toContain("tape_mags");
    expect(ids).toContain("add_taped_grip");
    expect(ids).toContain("add_beer_sight");
    expect(ids).toContain("saw_barrel");
    expect(ids).not.toContain("wrap_stock");
  });
});

describe("scav mod stats", () => {
  it("cut stock changes effective stats", () => {
    const stock = fittedWeaponStats("ak74", []);
    const cutState = applyScavAction("ak74", defaultVisualState("ak74"), "cut_stock");
    expect(cutState.ok).toBe(true);
    if (!cutState.ok) return;
    const cut = fittedWeaponStats("ak74", [], cutState.state);
    expect(cut.weight).toBeLessThan(stock.weight);
    expect(cut.accuracy).toBeLessThan(stock.accuracy);
  });

  it("wrapped cut stock partially offsets cut-stock downside", () => {
    const cut = applyScavAction("ak74", defaultVisualState("ak74"), "cut_stock");
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    const wrap = applyScavAction("ak74", cut.state, "wrap_stock");
    expect(wrap.ok).toBe(true);
    if (!wrap.ok) return;
    const cutStats = fittedWeaponStats("ak74", [], cut.state);
    const wrapStats = fittedWeaponStats("ak74", [], wrap.state);
    expect(wrapStats.accuracy).toBeGreaterThan(cutStats.accuracy);
    expect(wrapStats.weight).toBeGreaterThan(cutStats.weight);
  });

  it("taped mags improve reload and add weight", () => {
    const stock = fittedWeaponStats("ak74", []);
    const taped = applyScavAction("ak74", defaultVisualState("ak74"), "tape_mags");
    expect(taped.ok).toBe(true);
    if (!taped.ok) return;
    const stats = fittedWeaponStats("ak74", [], taped.state);
    expect(stats.reloadMs).toBeLessThan(stock.reloadMs);
    expect(stats.weight).toBeGreaterThan(stock.weight);
  });

  it("grip modifies accuracy", () => {
    const stock = fittedWeaponStats("ak74", []);
    const grip = applyScavAction("ak74", defaultVisualState("ak74"), "add_taped_grip");
    expect(grip.ok).toBe(true);
    if (!grip.ok) return;
    expect(fittedWeaponStats("ak74", [], grip.state).accuracy).toBeGreaterThan(stock.accuracy);
  });

  it("bottle sight modestly changes accuracy/range", () => {
    const stock = fittedWeaponStats("ak74", []);
    const beer = applyScavAction("ak74", defaultVisualState("ak74"), "add_beer_sight");
    expect(beer.ok).toBe(true);
    if (!beer.ok) return;
    const stats = fittedWeaponStats("ak74", [], beer.state);
    expect(stats.accuracy).toBeGreaterThan(stock.accuracy);
    expect(stats.range).toBeGreaterThan(stock.range);
    expect(stats.accuracy - stock.accuracy).toBeLessThan(0.06);
  });

  it("sawed barrel changes range/accuracy/weight", () => {
    const stock = fittedWeaponStats("ak74", []);
    const saw = applyScavAction("ak74", defaultVisualState("ak74"), "saw_barrel");
    expect(saw.ok).toBe(true);
    if (!saw.ok) return;
    const stats = fittedWeaponStats("ak74", [], saw.state);
    expect(stats.range).toBeLessThan(stock.range);
    expect(stats.accuracy).toBeLessThan(stock.accuracy);
    expect(stats.weight).toBeLessThan(stock.weight);
  });

  it("scavVisualMods aggregates moveMult", () => {
    const none = applyScavAction("ak74", defaultVisualState("ak74"), "remove_stock");
    expect(none.ok).toBe(true);
    if (!none.ok) return;
    const mods = scavVisualMods("ak74", none.state);
    expect(mods.moveMult).toBeGreaterThan(1);
  });
});

describe("composition metadata", () => {
  it("correct platform base sprite resolves", () => {
    const layers = composeWeaponLayers("ak74", defaultVisualState("ak74"));
    expect(layers?.[0]?.kind === "stock" || layers?.some((l) => l.kind === "base")).toBe(true);
    expect(layers?.some((l) => l.kind === "base" && l.spriteKey.includes("/ak/base.png"))).toBe(true);
  });

  it("correct per-slot sprite resolves", () => {
    const layers = composeWeaponLayers("ak74", defaultVisualState("ak74"));
    const mag = layers?.find((l) => l.kind === "magazine");
    expect(mag?.spriteKey).toContain("magazine/default.png");
  });

  it("anchor data resolves", () => {
    const p = platformForWeaponId("ak74")!;
    expect(p.anchors.stock.x).toBeLessThan(p.anchors.muzzle.x);
    expect(p.anchors.optic.y).toBeLessThan(p.anchors.magazine.y);
  });

  it("layer ordering deterministic", () => {
    const a = composeWeaponLayers("ak74", defaultVisualState("ak74"))!.map((l) => l.key);
    const b = composeWeaponLayers("ak74", defaultVisualState("ak74"))!.map((l) => l.key);
    expect(a).toEqual(b);
  });
});

describe("SKS catalog", () => {
  it("SKS weapon exists with expected mounts", () => {
    expect(WEAPONS["sks"]).toBeTruthy();
    expect(WEAPONS["sks"]!.attachmentSlots).toEqual(["optic", "muzzle"]);
  });

  it("SKS cut + wrap + beer + saw works", () => {
    let state: WeaponVisualState | null = defaultVisualState("sks");
    for (const id of ["cut_stock", "wrap_stock", "add_beer_sight", "saw_barrel"]) {
      const r = applyScavAction("sks", state, id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      state = r.state;
    }
    expect(state?.parts.stock).toBe("sks_stock_cut_wrapped");
    expect(state?.parts.optic).toBe("sks_optic_beer_bottle");
    expect(state?.parts.muzzle).toBe("sks_muzzle_sawed");
  });
});
