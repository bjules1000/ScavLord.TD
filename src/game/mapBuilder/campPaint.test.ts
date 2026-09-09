import { describe, expect, it } from "bun:test";
import { createBlankCampMap } from "./campDocument";
import { placeProp } from "./paint";
import { setPropHubAction } from "./campPaint";
import { lockDoc } from "./document";

describe("setPropHubAction", () => {
  it("assigns a hub action to an existing prop", () => {
    let doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
    doc = placeProp(doc, 2, 2, "crate");
    const propId = doc.props[0]!.id;
    doc = setPropHubAction(doc, propId, "supplies");
    expect(doc.props[0]!.hubAction).toBe("supplies");
  });

  it("clears a hub action when passed null", () => {
    let doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
    doc = placeProp(doc, 2, 2, "crate");
    const propId = doc.props[0]!.id;
    doc = setPropHubAction(doc, propId, "supplies");
    doc = setPropHubAction(doc, propId, null);
    expect(doc.props[0]!.hubAction).toBeUndefined();
  });

  it("is a no-op on a locked doc", () => {
    let doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
    doc = placeProp(doc, 2, 2, "crate");
    const propId = doc.props[0]!.id;
    const locked = lockDoc(doc);
    const next = setPropHubAction(locked, propId, "supplies");
    expect(next).toBe(locked);
  });

  it("is a no-op for an unknown prop id", () => {
    const doc = createBlankCampMap({ displayName: "Main Camp", id: "main-camp" });
    const next = setPropHubAction(doc, "prop-999", "supplies");
    expect(next).toBe(doc);
  });
});
