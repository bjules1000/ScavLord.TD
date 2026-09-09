import { describe, expect, it } from "bun:test";
import {
  HOTBAR_SIZE,
  autoPopulateHotbar,
  bindHotbarSlot,
  clearHotbarSlot,
  emptyHotbar,
  hotbarSlotCount,
  hotbarSlotFromItem,
  hotbarSlotItemId,
  hotbarSlotLabel,
} from "./hotbar";

function item(id: string, kind: "meds" | "throwable" | "weapon" | "valuable" = "throwable") {
  return { id, kind };
}

describe("hotbar auto-population", () => {
  it("fills grenades before meds, in canonical order, only what's carried", () => {
    const slots = autoPopulateHotbar([item("g_stun"), item("g_frag"), item("m_salewa", "meds"), item("v_bolts", "valuable")]);
    expect(slots.slice(0, 3)).toEqual([
      { kind: "grenade", grenade: "frag" },
      { kind: "grenade", grenade: "stun" },
      { kind: "meds", medId: "m_salewa" },
    ]);
    expect(slots.slice(3)).toEqual(emptyHotbar().slice(3));
  });

  it("returns all-empty for an empty backpack", () => {
    expect(autoPopulateHotbar([])).toEqual(emptyHotbar());
  });

  it("is always exactly HOTBAR_SIZE long, even with every kind carried", () => {
    const everything = [
      item("g_frag"),
      item("g_impact"),
      item("g_flash"),
      item("g_stun"),
      item("g_smoke"),
      item("m_ifak", "meds"),
      item("m_salewa", "meds"),
      item("m_grizzly", "meds"),
    ];
    expect(autoPopulateHotbar(everything)).toHaveLength(HOTBAR_SIZE);
    expect(autoPopulateHotbar(everything).every((s) => s !== null)).toBe(true);
  });
});

describe("hotbar slot binding", () => {
  it("binds and clears a slot by index without touching the others", () => {
    let hotbar = emptyHotbar();
    hotbar = bindHotbarSlot(hotbar, 2, { kind: "meds", medId: "m_ifak" });
    expect(hotbar[2]).toEqual({ kind: "meds", medId: "m_ifak" });
    expect(hotbar[0]).toBeNull();
    hotbar = clearHotbarSlot(hotbar, 2);
    expect(hotbar[2]).toBeNull();
  });

  it("ignores an out-of-range index", () => {
    const hotbar = emptyHotbar();
    expect(bindHotbarSlot(hotbar, 99, { kind: "meds", medId: "m_ifak" })).toEqual(hotbar);
  });

  it("moves an item rather than duplicating it across two slots", () => {
    let hotbar = emptyHotbar();
    hotbar = bindHotbarSlot(hotbar, 1, { kind: "grenade", grenade: "frag" });
    hotbar = bindHotbarSlot(hotbar, 4, { kind: "grenade", grenade: "frag" });
    expect(hotbar[1]).toBeNull();
    expect(hotbar[4]).toEqual({ kind: "grenade", grenade: "frag" });
    expect(hotbar.filter((s) => s?.kind === "grenade" && s.grenade === "frag")).toHaveLength(1);
  });

  it("does not let two empty slots collide with each other", () => {
    const hotbar = emptyHotbar();
    expect(bindHotbarSlot(hotbar, 3, null)).toEqual(hotbar);
  });

  it("resolves a dragged backpack item to its slot, or null for non-consumables", () => {
    expect(hotbarSlotFromItem(item("g_flash"))).toEqual({ kind: "grenade", grenade: "flash" });
    expect(hotbarSlotFromItem(item("m_grizzly", "meds"))).toEqual({ kind: "meds", medId: "m_grizzly" });
    expect(hotbarSlotFromItem(item("w_ak", "weapon"))).toBeNull();
    expect(hotbarSlotFromItem(item("v_gold", "valuable"))).toBeNull();
  });
});

describe("hotbar slot display", () => {
  it("counts remaining stock in the backpack, zero for an empty slot", () => {
    const backpack = [item("g_frag"), item("g_frag"), item("m_ifak", "meds")];
    expect(hotbarSlotCount({ kind: "grenade", grenade: "frag" }, backpack)).toBe(2);
    expect(hotbarSlotCount({ kind: "meds", medId: "m_ifak" }, backpack)).toBe(1);
    expect(hotbarSlotCount({ kind: "meds", medId: "m_salewa" }, backpack)).toBe(0);
    expect(hotbarSlotCount(null, backpack)).toBe(0);
  });

  it("resolves the backing item id for a bound slot", () => {
    expect(hotbarSlotItemId({ kind: "grenade", grenade: "smoke" })).toBe("g_smoke");
    expect(hotbarSlotItemId({ kind: "meds", medId: "m_grizzly" })).toBe("m_grizzly");
    expect(hotbarSlotItemId(null)).toBeNull();
  });

  it("labels grenades and meds readably", () => {
    expect(hotbarSlotLabel({ kind: "grenade", grenade: "frag" })).toBe("FRAG");
    expect(hotbarSlotLabel({ kind: "meds", medId: "m_ifak" })).toBe("POCKET KIT");
    expect(hotbarSlotLabel(null)).toBe("");
  });
});
