import { describe, expect, it } from "bun:test";
import {
  actionRequirementRows,
  actionShowsDestructiveWarning,
  clickableSlotsForWeapon,
  factoryMountForVisualSlot,
  GUN_BENCH_TITLE,
  gunBenchWorkspaceTitle,
  listBenchWeaponSwapCandidates,
  preferredWeaponScale,
  scavActionsForSelectedSlot,
  selectedPartHeading,
  visualSlotForFactoryMount,
} from "./gunBenchUi";
import { applyScavAction, listScavActionsForSlot, previewScavAction } from "./scavWeaponMods";
import { armoryStatRows, listArmoryCandidates } from "./armory";
import { makeItem } from "./gear";
import { resolveSlotHitAreas, defaultVisualState } from "./weaponVisuals";

describe("gun bench title", () => {
  it("Gun Bench title remains correct", () => {
    expect(GUN_BENCH_TITLE).toBe("GUN BENCH");
  });
});

describe("slot selection actions", () => {
  it("selecting stock shows stock actions only", () => {
    const state = defaultVisualState("ak74");
    const actions = scavActionsForSelectedSlot("ak74", state, "stock");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.slot === "stock")).toBe(true);
    expect(actions.some((a) => a.id === "tape_mags")).toBe(false);
  });

  it("selecting magazine shows magazine actions only", () => {
    const actions = scavActionsForSelectedSlot("ak74", defaultVisualState("ak74"), "magazine");
    expect(actions.map((a) => a.id)).toContain("tape_mags");
    expect(actions.every((a) => a.slot === "magazine")).toBe(true);
  });

  it("selecting optic shows optic scav options", () => {
    const actions = scavActionsForSelectedSlot("ak74", defaultVisualState("ak74"), "optic");
    expect(actions.map((a) => a.id)).toContain("add_beer_sight");
    expect(actions.every((a) => a.slot === "optic")).toBe(true);
  });

  it("selecting underbarrel shows grip options", () => {
    const actions = scavActionsForSelectedSlot("ak74", defaultVisualState("ak74"), "underbarrel");
    expect(actions.map((a) => a.id)).toContain("add_taped_grip");
  });

  it("selecting muzzle/barrel shows saw options", () => {
    const actions = scavActionsForSelectedSlot("ak74", defaultVisualState("ak74"), "muzzle");
    expect(actions.map((a) => a.id)).toContain("saw_barrel");
  });

  it("listScavActionsForSlot matches helper", () => {
    const state = defaultVisualState("ak74");
    expect(listScavActionsForSlot("ak74", state, "stock")).toEqual(
      scavActionsForSelectedSlot("ak74", state, "stock"),
    );
  });
});

describe("factory contextual bridging", () => {
  it("optic slot maps to factory optic mount", () => {
    expect(factoryMountForVisualSlot("optic")).toBe("optic");
    expect(factoryMountForVisualSlot("stock")).toBeNull();
    expect(visualSlotForFactoryMount("magazine")).toBe("magazine");
  });

  it("selecting optic still lists canonical factory candidates", () => {
    const stash = [makeItem("a_red_dot", 1)!].filter(Boolean);
    const candidates = listArmoryCandidates({
      weaponId: "ak74",
      mount: factoryMountForVisualSlot("optic")!,
      currentAttachments: [],
      stash,
      shopDefIds: ["a_optic_2x"],
      bank: 50_000,
      buyMult: 1,
      stashSlots: 40,
    });
    expect(candidates.some((c) => c.attachId === "red_dot" || c.attachId === "optic_2x")).toBe(true);
  });
});

describe("hotspot metadata", () => {
  it("hotspot metadata resolves per AK/SKS", () => {
    const ak = resolveSlotHitAreas("ak74");
    const sks = resolveSlotHitAreas("sks");
    expect(ak?.map((h) => h.slot)).toEqual([
      "stock",
      "magazine",
      "optic",
      "underbarrel",
      "muzzle",
    ]);
    expect(sks?.map((h) => h.slot)).toEqual(["stock", "optic", "muzzle"]);
    expect(ak?.find((h) => h.slot === "stock")?.hitbox.w).toBeGreaterThan(0);
    expect(sks?.find((h) => h.slot === "muzzle")?.hitbox.x).toBeGreaterThan(
      sks!.find((h) => h.slot === "stock")!.hitbox.x,
    );
  });

  it("unsupported platform slot has no clickable hotspot", () => {
    expect(clickableSlotsForWeapon("sks")).not.toContain("magazine");
    expect(clickableSlotsForWeapon("sks")).not.toContain("underbarrel");
    expect(clickableSlotsForWeapon("pm")).toEqual([]);
  });
});

describe("preview / apply", () => {
  it("action preview does not mutate weapon", () => {
    const start = defaultVisualState("ak74")!;
    const before = JSON.stringify(start);
    const preview = previewScavAction("ak74", start, "cut_stock");
    expect(preview?.parts.stock).toBe("ak_stock_cut");
    expect(JSON.stringify(start)).toBe(before);
  });

  it("apply still mutates correctly", () => {
    const start = defaultVisualState("ak74");
    const result = applyScavAction("ak74", start, "cut_stock");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.parts.stock).toBe("ak_stock_cut");
  });

  it("destructive warning flags saw/cut results", () => {
    expect(actionShowsDestructiveWarning("ak74", "saw_barrel")).toBe(true);
    expect(actionShowsDestructiveWarning("ak74", "cut_stock")).toBe(true);
    expect(actionShowsDestructiveWarning("ak74", "tape_mags")).toBe(false);
  });
});

describe("workspace framing", () => {
  it("preview title switches when action selected", () => {
    expect(gunBenchWorkspaceTitle(null).title).toBe("CURRENT BUILD");
    expect(gunBenchWorkspaceTitle("CUT STOCK")).toEqual({
      mode: "preview",
      title: "PREVIEW BUILD",
      subtitle: "CUT STOCK",
    });
  });

  it("preferred weapon scale is integer and bounded", () => {
    expect(preferredWeaponScale(160, 560)).toBeGreaterThanOrEqual(3);
    expect(Number.isInteger(preferredWeaponScale(160, 560))).toBe(true);
    expect(preferredWeaponScale(160, 100, 3, 6)).toBe(3);
  });

  it("selected part heading resolves labels", () => {
    const h = selectedPartHeading("ak74", defaultVisualState("ak74"), "stock");
    expect(h.slotLabel).toBe("STOCK");
    expect(h.partLabel).toBe("WOOD STOCK");
    expect(h.flavor.length).toBeGreaterThan(0);
  });
});

describe("weapon swap candidates", () => {
  it("weapon swap lists equipped and stash weapons", () => {
    const cut = applyScavAction("ak74", defaultVisualState("ak74"), "cut_stock");
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    const sks = makeItem("w_sks", 2)!;
    sks.scavMods = defaultVisualState("sks");
    const list = listBenchWeaponSwapCandidates("ak74", ["red_dot"], cut.state, [sks]);
    expect(list[0]?.kind).toBe("equipped");
    expect(list[0]?.attachmentCount).toBe(1);
    expect(list[0]?.scavSummary).toContain("CUT");
    expect(list.some((c) => c.kind === "stash" && c.weaponId === "sks")).toBe(true);
  });

  it("outgoing and incoming scav summaries stay independent", () => {
    const taped = applyScavAction("ak74", defaultVisualState("ak74"), "tape_mags");
    expect(taped.ok).toBe(true);
    if (!taped.ok) return;
    const ak = makeItem("w_ak74", 1)!;
    ak.scavMods = taped.state;
    const sks = makeItem("w_sks", 2)!;
    const list = listBenchWeaponSwapCandidates("pm", [], null, [ak, sks]);
    const akRow = list.find((c) => c.weaponId === "ak74");
    const sksRow = list.find((c) => c.weaponId === "sks");
    expect(akRow?.scavSummary).toContain("TAPED");
    expect(sksRow?.scavSummary).toBe("STOCK");
  });
});

describe("action requirement placeholder", () => {
  it("renders tool metadata without inventing costs", () => {
    const afterCut = applyScavAction("ak74", defaultVisualState("ak74"), "cut_stock");
    expect(afterCut.ok).toBe(true);
    if (!afterCut.ok) return;
    const wrapAction = scavActionsForSelectedSlot("ak74", afterCut.state, "stock").find(
      (a) => a.id === "wrap_stock",
    );
    expect(wrapAction).toBeTruthy();
    const rows = actionRequirementRows(wrapAction!);
    expect(rows.some((r) => r.label.includes("CLOTH"))).toBe(true);
  });
});

describe("preview stats remain canonical", () => {
  it("preview stat values unchanged from current canonical resolvers", () => {
    const start = defaultVisualState("ak74")!;
    const cut = applyScavAction("ak74", start, "cut_stock");
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    const rows = armoryStatRows("ak74", [], [], null, start, cut.state);
    const acc = rows.find((r) => r.key === "accuracy");
    expect(acc).toBeTruthy();
    expect(acc!.preview).toBeLessThan(acc!.current);
    expect(acc!.tone).toBe("bad");
  });
});
