import { describe, expect, it } from "bun:test";
import { editorOffset } from "../dev/placement";
import { CAMP_IMAGE_SRC } from "./hotspots";
import {
  ATMOSPHERE_LAYERS,
  CAMP_ATMOSPHERE_READY,
  CAMP_CLEAN_SRC,
  CAMP_EDITABLES,
  CAMP_FIRE_2_SRC,
  CAMP_FIRE_PREVIEW_FRAME,
  CAMP_FIRE_TEST,
  CAMP_FIRE_TEST_SRC,
  FIRE_1_OBJECT,
  FIRE_2_OBJECT,
  FIRE_LAYER,
  LANTERN_LEFT_LAYER,
  LANTERN_RIGHT_LAYER,
  SCAVLORD_LAYER,
  atmosphereFrameIndex,
  atmosphereLayersToRender,
  boxIsInImage,
  campPlateSrc,
  firePreviewObjects,
  sequenceFitsFrames,
  shouldRenderAtmosphere,
} from "./animate";

describe("camp atmosphere contract", () => {
  it("keeps every animation box inside the camp image", () => {
    for (const layer of ATMOSPHERE_LAYERS) {
      expect(boxIsInImage(layer.box)).toBe(true);
    }
  });

  it("gives each layer one stable box shared by every frame", () => {
    for (const layer of ATMOSPHERE_LAYERS) {
      expect(layer.frames.length).toBeGreaterThan(1);
      expect(sequenceFitsFrames(layer)).toBe(true);
    }
    expect(FIRE_LAYER.frames).toHaveLength(4);
    expect(SCAVLORD_LAYER.frames).toHaveLength(3);
    expect(LANTERN_LEFT_LAYER.frames).toHaveLength(3);
    expect(LANTERN_RIGHT_LAYER.frames).toHaveLength(3);
  });

  it("points at authored sprite paths, not mutated extracts", () => {
    expect(FIRE_LAYER.frames).toEqual([
      "/game/hub/animated/fire/fire-01.png",
      "/game/hub/animated/fire/fire-02.png",
      "/game/hub/animated/fire/fire-03.png",
      "/game/hub/animated/fire/fire-04.png",
    ]);
    expect(SCAVLORD_LAYER.frames).toEqual([
      "/game/hub/animated/scavlord/scavlord-idle-01.png",
      "/game/hub/animated/scavlord/scavlord-idle-02.png",
      "/game/hub/animated/scavlord/scavlord-idle-03.png",
    ]);
    expect(LANTERN_LEFT_LAYER.frames[0]).toBe("/game/hub/animated/lantern/left-01.png");
    expect(LANTERN_RIGHT_LAYER.frames[0]).toBe("/game/hub/animated/lantern/right-01.png");
    for (const layer of ATMOSPHERE_LAYERS) {
      for (const src of layer.frames) {
        expect(src).not.toMatch(/\/f\d\.png$/);
        expect(src).not.toMatch(/\/s\d\.png$/);
      }
    }
  });

  it("keeps provisional fire / idle / lantern timing", () => {
    expect(FIRE_LAYER.intervalMs).toBeGreaterThanOrEqual(120);
    expect(FIRE_LAYER.intervalMs).toBeLessThanOrEqual(180);
    expect(SCAVLORD_LAYER.intervalMs).toBeGreaterThanOrEqual(500);
    expect(SCAVLORD_LAYER.intervalMs).toBeLessThanOrEqual(800);
    expect(SCAVLORD_LAYER.sequence.filter((i) => i === 0).length).toBeGreaterThan(
      SCAVLORD_LAYER.sequence.length / 2,
    );
    expect(LANTERN_LEFT_LAYER.intervalMs).toBeGreaterThanOrEqual(250);
    expect(LANTERN_RIGHT_LAYER.intervalMs).toBeGreaterThanOrEqual(250);
    expect(LANTERN_LEFT_LAYER.intervalMs).toBeLessThanOrEqual(500);
    expect(LANTERN_RIGHT_LAYER.intervalMs).toBeLessThanOrEqual(500);
    expect(LANTERN_LEFT_LAYER.intervalMs).not.toBe(LANTERN_RIGHT_LAYER.intervalMs);
    expect(LANTERN_LEFT_LAYER.sequence).not.toEqual(LANTERN_RIGHT_LAYER.sequence);
  });

  it("falls back to the approved static camp until authored assets are ready", () => {
    expect(CAMP_ATMOSPHERE_READY).toBe(false);
    expect(shouldRenderAtmosphere(false)).toBe(false);
    expect(shouldRenderAtmosphere(true)).toBe(false);
    expect(atmosphereLayersToRender(false)).toEqual([]);
    if (!CAMP_FIRE_TEST) {
      expect(campPlateSrc(false)).toBe(CAMP_IMAGE_SRC);
      expect(campPlateSrc(true)).toBe(CAMP_IMAGE_SRC);
      expect(campPlateSrc(false)).not.toBe(CAMP_CLEAN_SRC);
    }
  });

  it("registers Fire 1 as a full-canvas overlay at authored 0,0", () => {
    expect(FIRE_1_OBJECT.id).toBe("fire-1");
    expect(FIRE_1_OBJECT.label).toBe("FIRE-1");
    expect(FIRE_1_OBJECT.fullCanvas).toBe(true);
    expect(FIRE_1_OBJECT.src).toBe(CAMP_FIRE_TEST_SRC);
    expect(FIRE_1_OBJECT.bounds).toEqual({ x: 659, y: 575, width: 90, height: 161 });
    expect(editorOffset(true, undefined)).toEqual({ offsetX: 0, offsetY: 0 });
    expect(CAMP_FIRE_TEST).toBe(true);
    expect(campPlateSrc(false)).toBe(CAMP_CLEAN_SRC);
    expect(shouldRenderAtmosphere(false)).toBe(false);
  });

  it("keeps Fire 1 locked while previewing Fire 2 alone", () => {
    expect(FIRE_1_OBJECT.bounds).toEqual({ x: 659, y: 575, width: 90, height: 161 });
    expect(FIRE_1_OBJECT.src).toBe("/game/hub/animated/fire/fire-1.png");
    expect(FIRE_2_OBJECT.id).toBe("fire-2");
    expect(FIRE_2_OBJECT.label).toBe("FIRE-2");
    expect(FIRE_2_OBJECT.fullCanvas).toBe(true);
    expect(FIRE_2_OBJECT.src).toBe(CAMP_FIRE_2_SRC);
    expect(FIRE_2_OBJECT.bounds).toEqual({ x: 662, y: 591, width: 80, height: 146 });
    expect(FIRE_2_OBJECT.bounds).not.toEqual(FIRE_1_OBJECT.bounds);
    expect(FIRE_2_OBJECT.zIndex).toBe(FIRE_1_OBJECT.zIndex);
    expect(editorOffset(true, undefined)).toEqual({ offsetX: 0, offsetY: 0 });
    expect(CAMP_FIRE_PREVIEW_FRAME).toBe("fire-2");
    expect(CAMP_EDITABLES).toEqual([FIRE_2_OBJECT]);
    expect(CAMP_EDITABLES).toHaveLength(1);
    expect(CAMP_EDITABLES.some((obj) => obj.id === "fire-1")).toBe(false);
    expect(firePreviewObjects("fire-1")).toEqual([FIRE_1_OBJECT]);
    expect(firePreviewObjects("fire-2")).toEqual([FIRE_2_OBJECT]);
  });

  it("returns a stable frame when reduced motion is on", () => {
    expect(atmosphereFrameIndex(FIRE_LAYER.sequence, 7, true)).toBe(0);
    expect(atmosphereFrameIndex(SCAVLORD_LAYER.sequence, 4, true)).toBe(0);
    expect(atmosphereFrameIndex(FIRE_LAYER.sequence, 4, false)).toBe(3);
  });

  it("keeps scavlord above environmental layers", () => {
    expect(SCAVLORD_LAYER.zIndex).toBeGreaterThan(FIRE_LAYER.zIndex);
    expect(SCAVLORD_LAYER.zIndex).toBeGreaterThan(LANTERN_LEFT_LAYER.zIndex);
  });
});
