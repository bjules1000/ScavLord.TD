import { describe, expect, it } from "bun:test";
import { editorOffset } from "../dev/placement";
import { CAMP_IMAGE_SRC } from "./hotspots";
import {
  ATMOSPHERE_LAYERS,
  CAMP_ATMOSPHERE_READY,
  CAMP_CLEAN_SRC,
  CAMP_EDITABLES,
  CAMP_FIRE_2_SRC,
  CAMP_FIRE_3_SRC,
  CAMP_FIRE_4_SRC,
  CAMP_FIRE_READY,
  CAMP_FIRE_TEST,
  CAMP_FIRE_TEST_SRC,
  FIRE_1_OBJECT,
  FIRE_2_OBJECT,
  FIRE_3_OBJECT,
  FIRE_4_OBJECT,
  FIRE_ANIMATION_FRAMES,
  FIRE_FRAME_MS,
  FIRE_LAYER,
  FIRE_SEQUENCE,
  LANTERN_LEFT_LAYER,
  LANTERN_RIGHT_LAYER,
  SCAVLORD_LAYER,
  atmosphereFrameIndex,
  atmosphereLayersToRender,
  boxIsInImage,
  campPlateSrc,
  fireSequenceIndex,
  fireVisibleFrame,
  fireVisibleObjects,
  sequenceFitsFrames,
  shouldAnimateFire,
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

  it("keeps Fire 1–4 independently registered at authored 0,0", () => {
    expect(FIRE_ANIMATION_FRAMES).toEqual([FIRE_1_OBJECT, FIRE_2_OBJECT, FIRE_3_OBJECT, FIRE_4_OBJECT]);
    expect(CAMP_EDITABLES).toEqual(FIRE_ANIMATION_FRAMES);
    expect(FIRE_1_OBJECT.fullCanvas).toBe(true);
    expect(FIRE_2_OBJECT.fullCanvas).toBe(true);
    expect(FIRE_3_OBJECT.fullCanvas).toBe(true);
    expect(FIRE_4_OBJECT.fullCanvas).toBe(true);
    expect(FIRE_1_OBJECT.src).toBe(CAMP_FIRE_TEST_SRC);
    expect(FIRE_2_OBJECT.src).toBe(CAMP_FIRE_2_SRC);
    expect(FIRE_3_OBJECT.src).toBe(CAMP_FIRE_3_SRC);
    expect(FIRE_4_OBJECT.src).toBe(CAMP_FIRE_4_SRC);
    expect(FIRE_1_OBJECT.bounds).toEqual({ x: 659, y: 575, width: 90, height: 161 });
    expect(FIRE_2_OBJECT.bounds).toEqual({ x: 662, y: 591, width: 80, height: 146 });
    expect(FIRE_3_OBJECT.bounds).toEqual({ x: 659, y: 588, width: 88, height: 149 });
    expect(FIRE_4_OBJECT.bounds).toEqual({ x: 651, y: 554, width: 98, height: 182 });
    expect(FIRE_2_OBJECT.bounds).not.toEqual(FIRE_1_OBJECT.bounds);
    expect(FIRE_3_OBJECT.bounds).not.toEqual(FIRE_1_OBJECT.bounds);
    expect(FIRE_4_OBJECT.bounds).not.toEqual(FIRE_1_OBJECT.bounds);
    expect(editorOffset(true, undefined)).toEqual({ offsetX: 0, offsetY: 0 });
    expect(editorOffset(false, { offsetX: 17, offsetY: 20 })).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it("plays the authored fire loop as a single full-canvas frame", () => {
    expect(CAMP_FIRE_READY).toBe(true);
    expect(CAMP_ATMOSPHERE_READY).toBe(false);
    expect(shouldRenderAtmosphere(false)).toBe(false);
    expect(atmosphereLayersToRender(false)).toEqual([]);
    expect(FIRE_SEQUENCE).toEqual([1, 0, 2, 1, 3, 2, 0, 3, 1, 2]);
    expect(FIRE_FRAME_MS).toBe(180);
    expect(FIRE_SEQUENCE.map((i) => FIRE_ANIMATION_FRAMES[i]?.id)).toEqual([
      "fire-2",
      "fire-1",
      "fire-3",
      "fire-2",
      "fire-4",
      "fire-3",
      "fire-1",
      "fire-4",
      "fire-2",
      "fire-3",
    ]);
    expect(fireSequenceIndex(0, false)).toBe(1);
    expect(fireSequenceIndex(4, false)).toBe(3);
    expect(fireSequenceIndex(9, false)).toBe(2);
    expect(fireSequenceIndex(10, false)).toBe(1);
    expect(fireVisibleFrame(0, false)).toBe(FIRE_2_OBJECT);
    expect(fireVisibleFrame(4, false)).toBe(FIRE_4_OBJECT);
    expect(fireVisibleObjects(1, false)).toEqual([FIRE_1_OBJECT]);
    expect(fireVisibleObjects(1, false)).toHaveLength(1);
  });

  it("pauses fire animation in EDIT and uses static Fire 1 for reduced motion", () => {
    expect(shouldAnimateFire(false, false)).toBe(true);
    expect(shouldAnimateFire(false, true)).toBe(false);
    expect(shouldAnimateFire(true, false)).toBe(false);
    expect(shouldAnimateFire(true, true)).toBe(false);
    expect(fireSequenceIndex(7, true)).toBe(0);
    expect(fireVisibleFrame(7, true)).toBe(FIRE_1_OBJECT);
    expect(fireVisibleObjects(7, true)).toEqual([FIRE_1_OBJECT]);
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
