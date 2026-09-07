import { describe, expect, it } from "bun:test";
import {
  FRAG_DAMAGE,
  FRAG_FUSE_SECONDS,
  FRAG_RADIUS,
  FRAG_RANGE,
  clampFragTarget,
  clampGrenadeTarget,
  consumeFragItem,
  consumeGrenadeItem,
  carriedGrenadeKinds,
  fragDamageAt,
  nextGrenadeKind,
  spawnFragGrenade,
  smokeBlocksSight,
  tickFragGrenade,
} from "./grenades";

describe("frag grenades", () => {
  it("consumes exactly one frag and leaves other backpack items untouched", () => {
    const items = [{ id: "v_bolts" }, { id: "g_frag" }, { id: "g_frag" }];
    expect(consumeFragItem(items)?.id).toBe("g_frag");
    expect(items.map((item) => item.id)).toEqual(["v_bolts", "g_frag"]);
  });
  it("clamps targets to throw range", () => {
    expect(clampFragTarget({ x: 0, y: 0 }, { x: 1000, y: 0 })).toEqual({ x: FRAG_RANGE, y: 0 });
  });

  it("travels to its target and detonates after the fuse", () => {
    const frag = spawnFragGrenade(1, 7, { x: 10, y: 20 }, { x: 100, y: 120 });
    expect(tickFragGrenade(frag, FRAG_FUSE_SECONDS / 2)).toBe(false);
    expect(tickFragGrenade(frag, FRAG_FUSE_SECONDS / 2)).toBe(true);
    expect({ x: frag.x, y: frag.y }).toEqual({ x: 100, y: 120 });
  });

  it("applies radial falloff and no damage outside the blast", () => {
    expect(fragDamageAt(0)).toBe(FRAG_DAMAGE);
    expect(fragDamageAt(FRAG_RADIUS)).toBe(FRAG_DAMAGE * 0.5);
    expect(fragDamageAt(FRAG_RADIUS + 1)).toBe(0);
  });

  it("consumes each grenade type independently", () => {
    const items = [{ id: "g_smoke" }, { id: "g_flash" }, { id: "g_stun" }, { id: "g_impact" }];
    expect(consumeGrenadeItem(items, "flash")?.id).toBe("g_flash");
    expect(items.map((item) => item.id)).toEqual(["g_smoke", "g_stun", "g_impact"]);
  });

  it("uses the shorter impact throw range", () => {
    expect(clampGrenadeTarget("impact", { x: 0, y: 0 }, { x: 1000, y: 0 }).x).toBe(190);
  });

  it("smoke blocks a sight line crossing its cloud", () => {
    const cloud = [{ id: 1, kind: "smoke" as const, x: 50, y: 0, radius: 20, left: 5 }];
    expect(smokeBlocksSight(cloud, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true);
    expect(smokeBlocksSight(cloud, { x: 0, y: 50 }, { x: 100, y: 50 })).toBe(false);
  });
});

describe("direct-control grenade quick-select", () => {
  it("lists only carried kinds, in fixed cycle order regardless of backpack order", () => {
    const backpack = [{ id: "g_stun" }, { id: "g_frag" }, { id: "v_bolts" }];
    expect(carriedGrenadeKinds(backpack)).toEqual(["frag", "stun"]);
  });

  it("returns nothing carried as an empty list", () => {
    expect(carriedGrenadeKinds([{ id: "v_bolts" }])).toEqual([]);
  });

  it("advances to the next carried kind and wraps around", () => {
    const backpack = [{ id: "g_frag" }, { id: "g_flash" }, { id: "g_stun" }];
    expect(nextGrenadeKind(backpack, null)).toBe("frag");
    expect(nextGrenadeKind(backpack, "frag")).toBe("flash");
    expect(nextGrenadeKind(backpack, "stun")).toBe("frag");
  });

  it("falls back to the first carried kind if the current one ran out", () => {
    const backpack = [{ id: "g_smoke" }];
    expect(nextGrenadeKind(backpack, "frag")).toBe("smoke");
  });

  it("returns null when nothing is carried", () => {
    expect(nextGrenadeKind([], "frag")).toBeNull();
  });
});
