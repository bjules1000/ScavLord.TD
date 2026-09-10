import { describe, expect, it } from "bun:test";
import { effectiveUniqueCosmetics, emptyRecruitmentLabOverrides } from "./recruitmentLabCore";
import { UNIQUE_OPERATOR_BY_ID } from "./uniqueOperators";
import { COSMETIC_CATALOG, resolvePaintSwatchId } from "../cosmetics";

describe("effectiveUniqueCosmetics", () => {
  it("returns the canonical cosmetics unchanged when there's no override", () => {
    const canonical = UNIQUE_OPERATOR_BY_ID["wolf"]!.cosmetics;
    expect(effectiveUniqueCosmetics("wolf", emptyRecruitmentLabOverrides())).toEqual(canonical);
  });

  it("applies a slot override on top of the canonical loadout, leaving other slots untouched", () => {
    const canonical = UNIQUE_OPERATOR_BY_ID["wolf"]!.cosmetics;
    const altHat = COSMETIC_CATALOG.hat.find((o) => o.id !== canonical.hat)!.id;
    const overrides = {
      ...emptyRecruitmentLabOverrides(),
      uniqueCosmetics: { wolf: { hat: altHat } },
    };
    const effective = effectiveUniqueCosmetics("wolf", overrides);
    expect(effective.hat).toBe(altHat);
    expect(effective.torso).toBe(canonical.torso);
    expect(effective.legs).toBe(canonical.legs);
  });

  it("ignores an invalid option id for a slot", () => {
    const canonical = UNIQUE_OPERATOR_BY_ID["wolf"]!.cosmetics;
    const overrides = {
      ...emptyRecruitmentLabOverrides(),
      uniqueCosmetics: { wolf: { hat: "not-a-real-id" } },
    };
    expect(effectiveUniqueCosmetics("wolf", overrides).hat).toBe(canonical.hat);
  });

  it("applies a global paint override (e.g. hair) shared across slots", () => {
    const overrides = {
      ...emptyRecruitmentLabOverrides(),
      uniqueCosmetics: { wolf: { globalPaint: { hair: "hair-blonde" } } },
    };
    const effective = effectiveUniqueCosmetics("wolf", overrides);
    expect(resolvePaintSwatchId(effective, "head", "hair")).toBe("hair-blonde");
    expect(resolvePaintSwatchId(effective, "hat", "hair")).toBe("hair-blonde");
  });

  it("applies a per-slot paint override without affecting other slots' same region", () => {
    const overrides = {
      ...emptyRecruitmentLabOverrides(),
      uniqueCosmetics: { wolf: { slotPaint: { torso: { fabric: "fabric-navy" } } } },
    };
    const effective = effectiveUniqueCosmetics("wolf", overrides);
    expect(resolvePaintSwatchId(effective, "torso", "fabric")).toBe("fabric-navy");
  });

  it("does not affect a different unique's cosmetics", () => {
    const canonicalWolf = UNIQUE_OPERATOR_BY_ID["wolf"]!.cosmetics;
    const overrides = {
      ...emptyRecruitmentLabOverrides(),
      uniqueCosmetics: { someOtherUnique: { hat: "hat-ushanka" } },
    };
    expect(effectiveUniqueCosmetics("wolf", overrides)).toEqual(canonicalWolf);
  });
});
