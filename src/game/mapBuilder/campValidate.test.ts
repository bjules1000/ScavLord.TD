import { describe, expect, it } from "bun:test";
import { createBlankCampMap } from "./campDocument";
import { placeProp } from "./paint";
import { setPropHubAction } from "./campPaint";
import { canLockCamp, validateCampMap } from "./campValidate";
import type { HubAction } from "../campActions";
import type { EditorMapDoc } from "./schema";

function withAllStations(): EditorMapDoc {
  let doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
  const placements: Array<[number, number, HubAction]> = [
    [2, 2, "supplies"],
    [4, 2, "gear"],
    [6, 2, "skills"],
    [8, 2, "region"],
    [10, 2, "radio"],
  ];
  for (const [tx, ty, action] of placements) {
    doc = placeProp(doc, tx, ty, "crate");
    const id = doc.props[doc.props.length - 1]!.id;
    doc = setPropHubAction(doc, id, action);
  }
  return doc;
}

describe("validateCampMap", () => {
  it("fails a blank camp map for missing required stations", () => {
    const doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
    const result = validateCampMap(doc);
    expect(result.ok).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes.filter((c) => c === "STATION").length).toBe(4);
  });

  it("passes once supplies/gear/skills/region are all assigned", () => {
    const doc = withAllStations();
    const result = validateCampMap(doc);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("warns (not errors) when radio is unassigned", () => {
    let doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
    const placements: Array<[number, number, HubAction]> = [
      [2, 2, "supplies"],
      [4, 2, "gear"],
      [6, 2, "skills"],
      [8, 2, "region"],
    ];
    for (const [tx, ty, action] of placements) {
      doc = placeProp(doc, tx, ty, "crate");
      const id = doc.props[doc.props.length - 1]!.id;
      doc = setPropHubAction(doc, id, action);
    }
    const result = validateCampMap(doc);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.code === "STATION")).toBe(true);
  });

  it("flags an out-of-bounds prop", () => {
    const doc: EditorMapDoc = {
      ...withAllStations(),
    };
    doc.props.push({ id: "prop-oob", type: "tent", tx: 999, ty: 999 });
    const result = validateCampMap(doc);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "BOUNDS")).toBe(true);
  });

  it("flags two props sharing the same tile", () => {
    const doc = withAllStations();
    doc.props.push({ id: "prop-dup", type: "tent", tx: 2, ty: 2 });
    const result = validateCampMap(doc);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "PROP")).toBe(true);
  });
});

describe("canLockCamp", () => {
  it("allows locking a fully-assigned draft", () => {
    expect(canLockCamp(withAllStations())).toBe(true);
  });

  it("refuses to lock an incomplete draft", () => {
    const doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
    expect(canLockCamp(doc)).toBe(false);
  });
});
