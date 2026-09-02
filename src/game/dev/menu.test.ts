import { describe, expect, it } from "bun:test";
import { DEV_TOOL_ENTRIES, devToolEntries } from "./menu";
import { readDevToolsEnabled } from "./tools";

describe("DEV tools menu", () => {
  it("DEV menu unavailable when DEV tools disabled", () => {
    expect(readDevToolsEnabled({ DEV: false })).toBe(false);
    expect(devToolEntries(false)).toEqual([]);
  });

  it("DEV menu available when enabled", () => {
    expect(devToolEntries(true)).toEqual(DEV_TOOL_ENTRIES);
    expect(devToolEntries(true).length).toBeGreaterThan(0);
  });

  it("menu exposes existing UI Editor", () => {
    expect(devToolEntries(true).some((e) => e.id === "ui-editor" && e.label === "UI Editor")).toBe(true);
  });

  it("menu exposes Map Builder", () => {
    expect(devToolEntries(true).some((e) => e.id === "map-builder" && e.label === "Map Builder")).toBe(true);
  });

  it("menu exposes Balance Lab", () => {
    expect(devToolEntries(true).some((e) => e.id === "balance-lab" && e.label === "Balance Lab")).toBe(true);
  });

  it("menu exposes Economy Lab", () => {
    expect(devToolEntries(true).some((e) => e.id === "economy-lab" && e.label === "Economy Lab")).toBe(true);
  });

  it("menu exposes Wave Lab", () => {
    expect(devToolEntries(true).some((e) => e.id === "wave-lab" && e.label === "Wave Lab")).toBe(true);
  });

  it("menu exposes Recruitment Lab", () => {
    expect(devToolEntries(true).some((e) => e.id === "recruitment-lab" && e.label === "Recruitment Lab")).toBe(
      true,
    );
  });
});
