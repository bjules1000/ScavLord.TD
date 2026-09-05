import { describe, expect, it } from "bun:test";
import {
  FRAG_DAMAGE,
  FRAG_FUSE_SECONDS,
  FRAG_RADIUS,
  FRAG_RANGE,
  clampFragTarget,
  consumeFragItem,
  fragDamageAt,
  spawnFragGrenade,
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
});
