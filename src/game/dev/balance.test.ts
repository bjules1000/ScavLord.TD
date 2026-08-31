import { beforeEach, describe, expect, it } from "bun:test";
import { getEquippedWeight } from "../armor";
import { ARMORS, ATTACHMENTS, ITEMS, WEAPONS, rollChoices } from "../gear";
import { getOperatorMoveSpeed } from "../movement";
import { equippedMagSize } from "../raidGear";
import { weaponDef } from "../weapons";
import { clearRaidBackpack, devAddToBackpack, raidBackpackItemDefs } from "./inventory";
import {
  applyBalanceOverrides,
  balanceLabCatalog,
  BALANCE_STORAGE_KEY,
  clampLiveKit,
  effectiveArmor,
  effectiveAttachment,
  effectiveWeapon,
  emptyBalanceOverrides,
  filterLabCatalog,
  formatBalancePatch,
  getBalanceOverrides,
  hydrateBalanceOverrides,
  loadBalanceOverrides,
  modifiedItemCount,
  resetOverrideItem,
  setOverrideField,
  type StorageLike,
} from "./balance";

function memStore(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

beforeEach(() => {
  applyBalanceOverrides(emptyBalanceOverrides(), false, null);
});

describe("Balance Lab catalog", () => {
  const catalog = balanceLabCatalog();

  it("canonical item catalog populates Balance Lab", () => {
    expect(catalog.some((e) => e.kind === "weapon" && e.id === "toz")).toBe(true);
    expect(catalog.length).toBe(Object.keys(WEAPONS).length + Object.keys(ARMORS).length + Object.keys(ATTACHMENTS).length);
  });

  it("weapons filter works", () => {
    expect(filterLabCatalog(catalog, "WEAPONS", "").every((e) => e.kind === "weapon")).toBe(true);
  });

  it("armor filter works", () => {
    expect(filterLabCatalog(catalog, "ARMOR", "").map((e) => e.id).sort()).toEqual(["paca", "sixb23", "slick"].sort());
  });

  it("attachments filter works", () => {
    expect(filterLabCatalog(catalog, "ATTACHMENTS", "").every((e) => e.kind === "attachment")).toBe(true);
    expect(filterLabCatalog(catalog, "ATTACHMENTS", "optic").some((e) => e.id === "optic")).toBe(true);
  });
});

describe("Balance Lab runtime overrides", () => {
  it("runtime override changes effective weapon value", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "damage", 6, 7);
    expect(effectiveWeapon("toz", over, true)?.damage).toBe(6);
  });

  it("canonical source value remains unchanged", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "damage", 6, 7);
    expect(WEAPONS["toz"]!.damage).toBe(7);
    expect(effectiveWeapon("toz", over, true)?.damage).toBe(6);
  });

  it("armor override changes effective armor value", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "armor", "slick", "reduction", 0.5, 0.45);
    expect(effectiveArmor("slick", over, true)?.reduction).toBe(0.5);
    expect(ARMORS["slick"]!.reduction).toBe(0.45);
  });

  it("attachment override changes effective modifier", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "attachment", "optic", "rangeMult", 1.4, 1.18);
    expect(effectiveAttachment("optic", over, true)?.rangeMult).toBe(1.4);
    expect(ATTACHMENTS["optic"]!.rangeMult).toBe(1.18);
  });

  it("weight override changes equipped weight", () => {
    applyBalanceOverrides(setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "weight", 3, 2), true, memStore());
    expect(getEquippedWeight({ weapon: "toz" })).toBe(3);
    expect(WEAPONS["toz"]!.weight).toBe(2);
  });

  it("weight override changes operator movement speed", () => {
    applyBalanceOverrides(setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "weight", 3, 2), true, memStore());
    expect(getOperatorMoveSpeed({ weapon: "toz" })).toBeCloseTo(2 * (1 - 3 * 0.04));
  });

  it("RESET ITEM removes selected overrides", () => {
    let over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "weight", 3, 2);
    over = setOverrideField(over, "armor", "paca", "weight", 9, 2);
    over = resetOverrideItem(over, "weapon", "toz");
    expect(over.weapons["toz"]).toBeUndefined();
    expect(over.armors["paca"]?.weight).toBe(9);
  });

  it("RESET ALL removes all overrides", () => {
    const store = memStore();
    applyBalanceOverrides(setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "weight", 3, 2), true, store);
    applyBalanceOverrides(emptyBalanceOverrides(), true, store);
    expect(modifiedItemCount(getBalanceOverrides())).toBe(0);
    expect(effectiveWeapon("toz")?.weight).toBe(2);
  });

  it("only modified fields appear in exported patch", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "damage", 6, 7);
    const text = formatBalancePatch(over);
    expect(text).toContain("BALANCE PATCH");
    expect(text).toContain("damage: 7 -> 6");
    expect(text).not.toContain("weight:");
    expect(text).not.toContain("pm");
  });

  it("localStorage restores overrides when DEV tools enabled", () => {
    const store = memStore();
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "weight", 3, 2);
    applyBalanceOverrides(over, true, store);
    applyBalanceOverrides(emptyBalanceOverrides(), false, null);
    hydrateBalanceOverrides(true, store);
    expect(effectiveWeapon("toz")?.weight).toBe(3);
    expect(store.getItem(BALANCE_STORAGE_KEY)).toContain("toz");
  });

  it("overrides are ignored when DEV tools disabled", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "weight", 3, 2);
    expect(effectiveWeapon("toz", over, false)?.weight).toBe(2);
    expect(loadBalanceOverrides(false, memStore({ [BALANCE_STORAGE_KEY]: JSON.stringify(over) }))).toEqual(
      emptyBalanceOverrides(),
    );
  });

  it("changing magazine capacity does not duplicate ammo", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "pm", "magSize", 4, 7);
    applyBalanceOverrides(over, true, memStore());
    const next = clampLiveKit(
      { weapon: "pm", attachments: [], ammo: 7 },
      over,
      true,
      equippedMagSize,
    );
    expect(next.ammo).toBe(4);
    expect(next.ammo).toBeLessThanOrEqual(equippedMagSize("pm", []));
  });

  it("changing armor max durability does not heal armor", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "armor", "slick", "durability", 250, 300);
    const lowered = clampLiveKit(
      { weapon: "pm", attachments: [], ammo: 7, armor: "slick", armorHp: 300 },
      over,
      true,
      equippedMagSize,
    );
    expect(lowered.armorHp).toBe(250);
    const worn = clampLiveKit(
      { weapon: "pm", attachments: [], ammo: 7, armor: "slick", armorHp: 80 },
      over,
      true,
      equippedMagSize,
    );
    expect(worn.armorHp).toBe(80);
  });

  it("current equipped item can consume updated effective stats", () => {
    applyBalanceOverrides(setOverrideField(emptyBalanceOverrides(), "weapon", "pm", "damage", 20, 15), true, memStore());
    expect(weaponDef("pm").damage).toBe(20);
    applyBalanceOverrides(emptyBalanceOverrides(), true, memStore());
    expect(weaponDef("pm").damage).toBe(15);
  });

  it("DEV ADD/CLEAR still work", () => {
    const added = devAddToBackpack("w_toz", [], 5, 1, true);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(clearRaidBackpack(added.backpack, true)).toEqual({ ok: true, backpack: [] });
    expect(raidBackpackItemDefs().some((d) => d.id === "w_pm")).toBe(true);
  });

  it("normal gameplay catalogs/rewards remain unchanged", () => {
    applyBalanceOverrides(setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "damage", 1, 7), true, memStore());
    expect(ITEMS.find((i) => i.ref === "toz")?.id).toBe("w_toz");
    expect(WEAPONS["toz"]!.damage).toBe(7);
    expect(rollChoices(1, 8000, 1)).toHaveLength(3);
  });
});
