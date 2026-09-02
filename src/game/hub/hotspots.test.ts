import { describe, expect, it } from "bun:test";
import { HUB_HOTSPOTS } from "./hotspots";

describe("camp hub hotspots", () => {
  it("covers the five M2A objects with in-image percentage boxes", () => {
    const ids = HUB_HOTSPOTS.map((h) => h.id).sort();
    expect(ids).toEqual(["gear", "radio", "region", "skills", "supplies"]);
    for (const h of HUB_HOTSPOTS) {
      expect(h.xPercent).toBeGreaterThanOrEqual(0);
      expect(h.yPercent).toBeGreaterThanOrEqual(0);
      expect(h.xPercent + h.widthPercent).toBeLessThanOrEqual(100);
      expect(h.yPercent + h.heightPercent).toBeLessThanOrEqual(100);
      expect(h.widthPercent).toBeGreaterThan(4);
      expect(h.heightPercent).toBeGreaterThan(4);
    }
  });

  it("activates radio for recruitment", () => {
    const radio = HUB_HOTSPOTS.find((h) => h.id === "radio");
    expect(radio?.enabled).toBe(true);
    expect(radio?.action).toBe("radio");
    expect(radio?.label).toBe("RADIO");
  });

  it("maps enabled stations to their overlays", () => {
    const enabled = HUB_HOTSPOTS.filter((h) => h.enabled);
    expect(enabled.map((h) => h.action).sort()).toEqual(["gear", "radio", "region", "skills", "supplies"]);
    for (const h of enabled) {
      expect(h.action).toBeDefined();
      expect(h.action as string).toBe(h.id);
    }
  });

  it("keeps presentation cues inside the interaction box", () => {
    const enabled = HUB_HOTSPOTS.filter((h) => h.enabled);
    for (const h of enabled) {
      expect(h.cue).toBeDefined();
      expect(h.labelPos).toBeDefined();
      const c = h.cue!;
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(100);
      expect(c.y + c.h).toBeLessThanOrEqual(100);
      expect(c.w).toBeLessThanOrEqual(80);
      expect(c.h).toBeLessThanOrEqual(85);
      expect(h.labelPos!.x).toBeGreaterThanOrEqual(0);
      expect(h.labelPos!.x).toBeLessThanOrEqual(100);
    }
  });

  it("gives the radio a normal hover cue", () => {
    const radio = HUB_HOTSPOTS.find((h) => h.id === "radio");
    expect(radio?.cue).toBeDefined();
    expect(radio?.labelPos).toBeDefined();
  });
});
