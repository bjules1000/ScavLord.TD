import { describe, expect, it } from "bun:test";
import { createBlankCampMap } from "./campDocument";
import { paintZoneCells, placeProp } from "./paint";
import { setPropHubAction } from "./campPaint";
import { lockDoc } from "./document";
import {
  importedToCampDoc,
  parseCampImport,
  stringifyCampExport,
  toCampExport,
} from "./campExport";

function sampleDoc() {
  let doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
  doc = placeProp(doc, 2, 2, "crate");
  doc = setPropHubAction(doc, doc.props[0]!.id, "supplies");
  doc = placeProp(doc, 5, 5, "tent");
  doc = paintZoneCells(doc, [[6, 6], [6, 7]], null, "SHOOTING_RANGE");
  doc = lockDoc(doc);
  return doc;
}

describe("toCampExport / stringifyCampExport", () => {
  it("is deterministic: the same locked doc exports identical JSON", () => {
    const doc = sampleDoc();
    expect(stringifyCampExport(doc)).toBe(stringifyCampExport(doc));
  });

  it("omits hubAction for decorative props and includes it for assigned ones", () => {
    const exported = toCampExport(sampleDoc());
    const crate = exported.props.find((p) => p.type === "crate")!;
    const tent = exported.props.find((p) => p.type === "tent")!;
    expect(crate.hubAction).toBe("supplies");
    expect(tent.hubAction).toBeUndefined();
  });

  it("includes painted zones", () => {
    const exported = toCampExport(sampleDoc());
    expect(exported.zones).toHaveLength(1);
    expect(exported.zones[0]!.type).toBe("SHOOTING_RANGE");
    expect(exported.zones[0]!.cells).toEqual([
      [6, 6],
      [6, 7],
    ]);
  });
});

describe("parseCampImport / importedToCampDoc round trip", () => {
  it("round-trips terrain, props, and hubActions losslessly", () => {
    const original = sampleDoc();
    const json = stringifyCampExport(original);
    const parsed = parseCampImport(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = importedToCampDoc(parsed.payload, "draft-main-camp");
    expect(toCampExport(restored)).toEqual(toCampExport(original));
  });

  it("rejects a non-camp payload", () => {
    const raidJson = JSON.stringify({ schemaVersion: 1, mapType: "raid", id: "x", displayName: "X", width: 8, height: 8, terrain: [], props: [] });
    const parsed = parseCampImport(raidJson);
    expect(parsed.ok).toBe(false);
  });

  it("rejects malformed JSON", () => {
    const parsed = parseCampImport("{not json");
    expect(parsed.ok).toBe(false);
  });
});
