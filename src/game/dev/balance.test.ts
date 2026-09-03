import { beforeEach, describe, expect, it } from "bun:test";
import { getEquippedWeight } from "../armor";
import { ARMORS, ATTACHMENTS, ITEMS, WEAPONS, rollChoices } from "../gear";
import { getOperatorMoveSpeed } from "../movement";
import { equippedMagSize } from "../raidGear";
import { weaponDef } from "../weapons";
import { clearRaidBackpack, devAddToBackpack, raidBackpackItemDefs } from "./inventory";
import {
  applyBalanceOverrides,
  balanceFieldTone,
  balanceLabCatalog,
  BALANCE_STORAGE_KEY,
  balanceToneBorderClass,
  balanceToneTextClass,
  clampLiveKit,
  effectiveArmor,
  effectiveAttachment,
  effectiveWeapon,
  emptyBalanceOverrides,
  filterLabCatalog,
  formatBalancePatch,
  formatLabDelta,
  getBalanceOverrides,
  hydrateBalanceOverrides,
  itemOverrideCount,
  loadBalanceOverrides,
  modifiedItemCount,
  overrideName,
  resetOverrideItem,
  setOverrideField,
  weaponDerivedRows,
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
    const over = setOverrideField(emptyBalanceOverrides(), "attachment", "optic", "rangeAdd", 20, 16);
    expect(effectiveAttachment("optic", over, true)?.rangeAdd).toBe(20);
    expect(ATTACHMENTS["optic"]!.rangeAdd).toBe(16);
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
    applyBalanceOverrides(setOverrideField(emptyBalanceOverrides(), "weapon", "pm", "damage", 20, 10), true, memStore());
    expect(weaponDef("pm").damage).toBe(20);
    applyBalanceOverrides(emptyBalanceOverrides(), true, memStore());
    expect(weaponDef("pm").damage).toBe(10);
  });

  it("DEV ADD/CLEAR still work", () => {
    const added = devAddToBackpack("w_toz", [], 5, 1, true);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(clearRaidBackpack(added.backpack, true)).toEqual({ ok: true, backpack: [] });
    expect(raidBackpackItemDefs().some((d) => d.id === "w_pm")).toBe(true);
  });

  it("editable name is a draft override and does not mutate source", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "name", "TEST TOZ", "SAWED-OFF");
    expect(overrideName(over, "weapon", "toz")).toBe("TEST TOZ");
    expect(effectiveWeapon("toz", over, true)?.name).toBe("TEST TOZ");
    expect(WEAPONS["toz"]!.name).toBe("SAWED-OFF");
    expect(modifiedItemCount(over)).toBe(1);
    expect(itemOverrideCount(over, "weapon", "toz")).toBe(1);
  });

  it("empty or canonical name resets the name draft", () => {
    let over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "name", "TEST TOZ", "SAWED-OFF");
    over = setOverrideField(over, "weapon", "toz", "name", "SAWED-OFF", "SAWED-OFF");
    expect(over.weapons["toz"]).toBeUndefined();
    over = setOverrideField(emptyBalanceOverrides(), "armor", "paca", "name", "SOFT TEST", "SOFT VEST");
    over = setOverrideField(over, "armor", "paca", "name", "   ", "SOFT VEST");
    expect(over.armors["paca"]).toBeUndefined();
  });

  it("RESET ITEM and RESET ALL restore canonical names", () => {
    let over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "name", "TEST TOZ", "SAWED-OFF");
    over = setOverrideField(over, "weapon", "toz", "damage", 6, 7);
    over = setOverrideField(over, "armor", "paca", "name", "SOFT TEST", "SOFT VEST");
    over = resetOverrideItem(over, "weapon", "toz");
    expect(overrideName(over, "weapon", "toz")).toBeUndefined();
    expect(over.weapons["toz"]).toBeUndefined();
    expect(overrideName(over, "armor", "paca")).toBe("SOFT TEST");
    over = emptyBalanceOverrides();
    expect(modifiedItemCount(over)).toBe(0);
  });

  it("name changes appear in the exported patch", () => {
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "name", "TEST TOZ", "SAWED-OFF");
    const text = formatBalancePatch(over);
    expect(text).toContain("name: SAWED-OFF -> TEST TOZ");
  });

  it("search finds draft display names", () => {
    const catalog = balanceLabCatalog();
    const over = setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "name", "TEST TOZ", "SAWED-OFF");
    expect(filterLabCatalog(catalog, "WEAPONS", "TEST TOZ", over).some((e) => e.id === "toz")).toBe(true);
    expect(filterLabCatalog(catalog, "WEAPONS", "SAWED", over).some((e) => e.id === "toz")).toBe(true);
  });
});

describe("Balance Lab buff/nerf tone", () => {
  it("higher-is-better stats color buffs green and nerfs red", () => {
    expect(balanceFieldTone("damage", 19, 20)).toBe("buff");
    expect(balanceFieldTone("damage", 19, 18)).toBe("nerf");
    expect(balanceFieldTone("range", 5, 6)).toBe("buff");
    expect(balanceFieldTone("accuracy", 0.7, 0.6)).toBe("nerf");
    expect(balanceFieldTone("magSize", 7, 9)).toBe("buff");
    expect(balanceFieldTone("reduction", 0.18, 0.25)).toBe("buff");
    expect(balanceFieldTone("durability", 110, 90)).toBe("nerf");
    expect(balanceToneTextClass("buff")).toBe("text-accent");
    expect(balanceToneTextClass("nerf")).toBe("text-destructive");
    expect(balanceToneBorderClass("buff")).toBe("border-accent");
    expect(balanceToneBorderClass("nerf")).toBe("border-destructive");
  });

  it("lower-is-better stats invert the colors", () => {
    expect(balanceFieldTone("weight", 3.5, 2.75)).toBe("buff");
    expect(balanceFieldTone("weight", 3.5, 4)).toBe("nerf");
    expect(balanceFieldTone("cooldown", 400, 350)).toBe("buff");
    expect(balanceFieldTone("reloadMs", 1800, 2200)).toBe("nerf");
    expect(balanceFieldTone("spread", 0.2, 0.1)).toBe("buff");
  });

  it("unchanged values stay neutral", () => {
    expect(balanceFieldTone("damage", 19, 19)).toBe("neutral");
    expect(balanceFieldTone("weight", 2, 2)).toBe("neutral");
    expect(balanceToneTextClass("neutral")).toBe("text-muted-foreground");
    expect(formatLabDelta("damage", 19, 20)).toBe("+1");
    expect(formatLabDelta("weight", 3.5, 2.75)).toBe("-0.75");
    expect(formatLabDelta("damage", 19, 19)).toBe("");
  });

  it("derived rows reflect draft edits and tone", () => {
    const base = WEAPONS["toz"]!;
    const current = { ...base, damage: base.damage + 1, cooldown: base.cooldown - 50, weight: base.weight + 1 };
    const rows = weaponDerivedRows(base, current);
    const blast = rows.find((r) => r.key === "blast")!;
    const rpm = rows.find((r) => r.key === "rpm")!;
    const weight = rows.find((r) => r.key === "weight")!;
    expect(blast.current).toBeGreaterThan(blast.base);
    expect(balanceFieldTone(blast.key, blast.base, blast.current)).toBe("buff");
    expect(rpm.current).toBeGreaterThan(rpm.base);
    expect(balanceFieldTone(rpm.key, rpm.base, rpm.current)).toBe("buff");
    expect(balanceFieldTone(weight.key, weight.base, weight.current)).toBe("nerf");
  });
});

describe("Balance Lab gameplay isolation", () => {
  it("normal gameplay catalogs/rewards remain unchanged", () => {
    applyBalanceOverrides(setOverrideField(emptyBalanceOverrides(), "weapon", "toz", "damage", 1, 7), true, memStore());
    expect(ITEMS.find((i) => i.ref === "toz")?.id).toBe("w_toz");
    expect(WEAPONS["toz"]!.damage).toBe(7);
    expect(rollChoices(1, 8000, 1)).toHaveLength(3);
  });
});
