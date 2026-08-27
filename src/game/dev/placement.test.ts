import { describe, expect, it } from "bun:test";
import {
  ZERO_OFFSET,
  clientToImagePixel,
  editorOffset,
  formatSigned,
  hitTestEditable,
  integerOffset,
  isTypingTarget,
  nudgeOffset,
  placedBounds,
  pointInBox,
  type EditableObject,
} from "./placement";

const fire: EditableObject = {
  id: "fire-1",
  label: "FIRE-1",
  bounds: { x: 634, y: 559, width: 90, height: 161 },
  fullCanvas: true,
  zIndex: 1,
};

const lantern: EditableObject = {
  id: "lantern-left-1",
  label: "LANTERN-LEFT-1",
  bounds: { x: 548, y: 512, width: 44, height: 48 },
  zIndex: 2,
};

describe("placement editor", () => {
  it("keeps offsets as integers and applies +X right / +Y down", () => {
    expect(integerOffset(6.4, -3.6)).toEqual({ offsetX: 6, offsetY: -4 });
    expect(placedBounds(fire.bounds, { offsetX: 6, offsetY: 3 })).toEqual({
      x: 640,
      y: 562,
      width: 90,
      height: 161,
    });
    expect(nudgeOffset(ZERO_OFFSET, 1, 0)).toEqual({ offsetX: 1, offsetY: 0 });
    expect(nudgeOffset(ZERO_OFFSET, 0, -1)).toEqual({ offsetX: 0, offsetY: -1 });
    expect(nudgeOffset({ offsetX: 1, offsetY: 1 }, 10, 10)).toEqual({ offsetX: 11, offsetY: 11 });
  });

  it("ignores offsets when EDIT is off", () => {
    const moved = { offsetX: 20, offsetY: -8 };
    expect(editorOffset(false, moved)).toEqual(ZERO_OFFSET);
    expect(editorOffset(true, moved)).toEqual(moved);
    expect(editorOffset(true, undefined)).toEqual(ZERO_OFFSET);
  });

  it("ignores stored offsets for hit-testing when EDIT is off", () => {
    const objects = [fire];
    const offsets = { "fire-1": { offsetX: 80, offsetY: 0 } };
    expect(hitTestEditable(objects, offsets, true, 750, 600)).toBe("fire-1");
    expect(hitTestEditable(objects, offsets, false, 750, 600)).toBeNull();
    expect(hitTestEditable(objects, offsets, false, 680, 600)).toBe("fire-1");
  });

  it("hits content bounds instead of the full transparent canvas", () => {
    const objects = [fire];
    const offsets = { "fire-1": { offsetX: 0, offsetY: 0 } };
    expect(hitTestEditable(objects, offsets, true, 10, 10)).toBeNull();
    expect(hitTestEditable(objects, offsets, true, 680, 600)).toBe("fire-1");
    expect(pointInBox(0, 0, fire.bounds)).toBe(false);
    expect(pointInBox(634, 559, fire.bounds)).toBe(true);
  });

  it("picks the higher z-index object on overlap", () => {
    const objects = [fire, lantern];
    const offsets = {};
    expect(hitTestEditable(objects, offsets, true, 560, 520)).toBe("lantern-left-1");
  });

  it("maps contain-fitted clicks onto image pixels and rejects letterbox", () => {
    const box = { left: 0, top: 0, width: 1448, height: 1086 };
    expect(clientToImagePixel(100, 200, box, 1448, 1086)).toEqual({ x: 100, y: 200 });
    const letterboxed = { left: 0, top: 0, width: 200, height: 200 };
    expect(clientToImagePixel(0, 0, letterboxed, 1448, 1086)).toBeNull();
    const hit = clientToImagePixel(100, 100, letterboxed, 1448, 1086);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeGreaterThanOrEqual(0);
    expect(hit!.x).toBeLessThan(1448);
  });

  it("formats popup coordinates with a sign", () => {
    expect(formatSigned(6)).toBe("+6");
    expect(formatSigned(0)).toBe("0");
    expect(formatSigned(-3)).toBe("-3");
  });

  it("treats form fields as typing targets", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
  });

  it("has nothing to select when no objects are registered", () => {
    expect(hitTestEditable([], {}, true, 720, 520)).toBeNull();
  });
});
