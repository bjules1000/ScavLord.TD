import { describe, expect, it } from "bun:test";
import {
  ATMOSPHERE_LAYERS,
  FIRE_LAYER,
  LANTERN_LEFT_LAYER,
  LANTERN_RIGHT_LAYER,
  SCAVLORD_LAYER,
  atmosphereFrameIndex,
  boxIsInImage,
} from "./animate";

describe("camp atmosphere layers", () => {
  it("keeps every animation box inside the camp image", () => {
    for (const layer of ATMOSPHERE_LAYERS) {
      expect(boxIsInImage(layer.box)).toBe(true);
    }
  });

  it("uses irregular fire playback within the 120–180ms window", () => {
    expect(FIRE_LAYER.frames).toHaveLength(4);
    expect(FIRE_LAYER.sequence).toEqual([0, 1, 2, 1, 3, 1]);
    expect(FIRE_LAYER.intervalMs).toBeGreaterThanOrEqual(120);
    expect(FIRE_LAYER.intervalMs).toBeLessThanOrEqual(180);
    for (const i of FIRE_LAYER.sequence) expect(i).toBeGreaterThanOrEqual(0);
    for (const i of FIRE_LAYER.sequence) expect(i).toBeLessThan(FIRE_LAYER.frames.length);
  });

  it("uses a pause-heavy scavlord idle within 500–800ms", () => {
    expect(SCAVLORD_LAYER.frames).toHaveLength(3);
    expect(SCAVLORD_LAYER.sequence).toEqual([0, 0, 1, 0, 2, 0]);
    expect(SCAVLORD_LAYER.intervalMs).toBeGreaterThanOrEqual(500);
    expect(SCAVLORD_LAYER.intervalMs).toBeLessThanOrEqual(800);
    const rest = SCAVLORD_LAYER.sequence.filter((i) => i === 0).length;
    expect(rest).toBeGreaterThan(SCAVLORD_LAYER.sequence.length / 2);
  });

  it("keeps lanterns unsynchronized inside 250–500ms", () => {
    expect(LANTERN_LEFT_LAYER.intervalMs).toBeGreaterThanOrEqual(250);
    expect(LANTERN_RIGHT_LAYER.intervalMs).toBeGreaterThanOrEqual(250);
    expect(LANTERN_LEFT_LAYER.intervalMs).toBeLessThanOrEqual(500);
    expect(LANTERN_RIGHT_LAYER.intervalMs).toBeLessThanOrEqual(500);
    expect(LANTERN_LEFT_LAYER.intervalMs).not.toBe(LANTERN_RIGHT_LAYER.intervalMs);
    expect(LANTERN_LEFT_LAYER.sequence).not.toEqual(LANTERN_RIGHT_LAYER.sequence);
  });

  it("returns a stable frame when reduced motion is on", () => {
    expect(atmosphereFrameIndex(FIRE_LAYER.sequence, 7, true)).toBe(0);
    expect(atmosphereFrameIndex(SCAVLORD_LAYER.sequence, 4, true)).toBe(0);
    expect(atmosphereFrameIndex(FIRE_LAYER.sequence, 4, false)).toBe(3);
  });
});
