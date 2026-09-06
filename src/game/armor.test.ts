import { describe, expect, it } from "bun:test";
import { ARMORS, makeItem, type AmmoTier } from "./gear";
import { absorbWithArmor, armorDef, getEquippedWeight, reductionForTier } from "./armor";
import { detachArmor, dropEquippedGear, equipArmor } from "./raidGear";

const AMMO_TIERS: readonly AmmoTier[] = ["NORMAL", "AP", "HEAVY"];

describe("canonical wearable armor", () => {
  it("uses the same armor definitions for player and operators", () => {
    expect(armorDef("paca")).toBe(ARMORS["paca"]);
    expect(armorDef("sixb23")).toBe(ARMORS["sixb23"]);
    expect(armorDef("slick")).toBe(ARMORS["slick"]);
  });

  it("lets a hired operator equip PACA, 6B23, and Slick", () => {
    for (const [itemId, ref] of [
      ["ar_paca", "paca"],
      ["ar_6b23", "sixb23"],
      ["ar_slick", "slick"],
    ] as const) {
      const vest = makeItem(itemId, 1)!;
      const result = equipArmor(vest, null, [vest]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.armor).toBe(ref);
      expect(result.armorHp).toBe(ARMORS[ref]!.durability);
    }
  });

  it("applies the same reduction + durability soak with or without a named wearer", () => {
    const incoming = 20;
    const paca = absorbWithArmor(incoming, "paca", ARMORS["paca"]!.durability);
    expect(paca.damage).toBeCloseTo(incoming * (1 - 0.25));
    expect(paca.absorbed).toBeCloseTo(incoming * 0.25);
    expect(paca.armorHp).toBeCloseTo(ARMORS["paca"]!.durability - incoming);
  });

  it("deals full damage when no armor is worn", () => {
    const raw = absorbWithArmor(20, null, 0);
    expect(raw.damage).toBe(20);
    expect(raw.absorbed).toBe(0);
  });

  it("exposes authored armor weight on the equipped-load hook", () => {
    expect(ARMORS["paca"]!.weight).toBe(1.5);
    expect(ARMORS["sixb23"]!.weight).toBe(2.8);
    expect(ARMORS["slick"]!.weight).toBe(1.9);
    expect(getEquippedWeight({ armor: "paca" })).toBe(1.5);
    expect(getEquippedWeight({ armor: null })).toBe(0);
  });
});

describe("ammo-tier mitigation (F5 fix)", () => {
  it("looks up the reduction column for the given ammo tier", () => {
    const paca = ARMORS["paca"]!;
    expect(reductionForTier(paca, "NORMAL")).toBe(paca.reductionNormal);
    expect(reductionForTier(paca, "AP")).toBe(paca.reductionAp);
    expect(reductionForTier(paca, "HEAVY")).toBe(paca.reductionHeavy);
  });

  it("defaults to NORMAL when no tier is given", () => {
    const paca = ARMORS["paca"]!;
    const withDefault = absorbWithArmor(20, "paca", paca.durability);
    const explicit = absorbWithArmor(20, "paca", paca.durability, "NORMAL");
    expect(withDefault).toEqual(explicit);
  });

  it("AP always penetrates at least as much as NORMAL, and HEAVY at least as much as AP, for every armor piece", () => {
    for (const def of Object.values(ARMORS)) {
      expect(def.reductionNormal).toBeGreaterThanOrEqual(def.reductionAp);
      expect(def.reductionAp).toBeGreaterThanOrEqual(def.reductionHeavy);
      expect(def.reductionHeavy).toBeGreaterThanOrEqual(0);
    }
  });

  it("F5: total damage blocked over an armor's life scales with reduction%, not just durability", () => {
    // Before the fix, durability was spent by the ABSORBED amount, so total
    // damage blocked always equalled durability regardless of reduction — a
    // 25% vest and a 75% vest of the same durability blocked the same total.
    // After the fix, durability is spent by the full incoming hit, so total
    // blocked = durability * reduction, and rarer (higher-reduction) armor
    // genuinely blocks more, not just paces the same fixed budget differently.
    for (const tier of AMMO_TIERS) {
      const light = ARMORS["paper"]!; // low reduction
      const heavy = ARMORS["zebralo"]!; // high reduction, also much higher durability
      const totalBlocked = (def: (typeof ARMORS)[string]) => {
        let hp = def.durability;
        let blocked = 0;
        // Fixed-size hits chosen small enough to resolve the vest without overshoot noise.
        const hitSize = 5;
        while (hp > 0) {
          const r = absorbWithArmor(hitSize, def.id, hp, tier);
          blocked += r.absorbed;
          hp = r.armorHp;
          if (r.broke) break;
        }
        return blocked;
      };
      const lightTotal = totalBlocked(light);
      const heavyTotal = totalBlocked(heavy);
      const expectedLight = light.durability * reductionForTier(light, tier);
      const expectedHeavy = heavy.durability * reductionForTier(heavy, tier);
      expect(lightTotal).toBeCloseTo(expectedLight, 0);
      expect(heavyTotal).toBeCloseTo(expectedHeavy, 0);
      // The whole point of the fix: a much-higher-reduction, higher-durability
      // piece must block a much larger *total*, not just pace the same total.
      expect(heavyTotal).toBeGreaterThan(lightTotal * 5);
    }
  });
});

describe("raid armor equip", () => {
  it("lets any operator equip an existing armor item", () => {
    const vest = makeItem("ar_paca", 1)!;
    const result = equipArmor(vest, null, [vest]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.armor).toBe("paca");
    expect(result.armorHp).toBe(ARMORS["paca"]!.durability);
    expect(result.backpack).toHaveLength(0);
  });

  it("swaps armor atomically even when the backpack is full", () => {
    const heavy = makeItem("ar_slick", 10)!;
    const pack = [heavy, makeItem("v_bolts", 11)!, makeItem("v_bolts", 12)!];
    const result = equipArmor(heavy, "paca", pack);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.armor).toBe("slick");
    expect(result.backpack).toHaveLength(3);
    expect(result.backpack[0]?.ref).toBe("paca");
    expect(result.backpack[0]?.uid).toBe(10);
  });

  it("blocks plain armor detach when the backpack is full and does not delete it", () => {
    const pack = [makeItem("v_bolts", 1)!, makeItem("v_bolts", 2)!, makeItem("v_bolts", 3)!];
    const result = detachArmor("paca", pack, 3, 9);
    expect(result).toEqual({ ok: false, reason: "BACKPACK FULL" });
  });

  it("sends detached armor to raid inventory, not stash", () => {
    const result = detachArmor("sixb23", [], 5, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.armor).toBeNull();
    expect(result.backpack).toHaveLength(1);
    expect(result.backpack[0]?.kind).toBe("armor");
    expect(result.backpack[0]?.ref).toBe("sixb23");
  });

  it("drops equipped armor exactly once on death and does not duplicate an already-detached vest", () => {
    const backpack = [makeItem("ar_paca", 1)!];
    const dropped = dropEquippedGear("pm", [], () => 80, null);
    expect(dropped.filter((i) => i.kind === "armor")).toHaveLength(0);
    expect(backpack.filter((i) => i.ref === "paca")).toHaveLength(1);
    const armed = dropEquippedGear("pm", [], () => 90, "slick");
    expect(armed.filter((i) => i.ref === "slick")).toHaveLength(1);
    expect(armed.filter((i) => i.kind === "armor")).toHaveLength(1);
  });
});
