import { describe, expect, it } from "bun:test";
import { HUB_HOTSPOTS } from "./hotspots";

describe("camp hub hotspots", () => {
  it("covers the five M2A objects with in-image percentage boxes", () => {
    const ids = HUB_HOTSPOTS.map((h) => h.id).sort();
    expect(ids).toEqual(["gear", "market", "region", "skills", "stash"]);
    for (const h of HUB_HOTSPOTS) {
      expect(h.xPercent).toBeGreaterThanOrEqual(0);
      expect(h.yPercent).toBeGreaterThanOrEqual(0);
      expect(h.xPercent + h.widthPercent).toBeLessThanOrEqual(100);
      expect(h.yPercent + h.heightPercent).toBeLessThanOrEqual(100);
      expect(h.widthPercent).toBeGreaterThan(4);
      expect(h.heightPercent).toBeGreaterThan(4);
      expect(h.action).toBe(h.id);
    }
  });
});
