import type { EditableObject } from "../dev/placement";
import { CAMP_IMAGE_SRC } from "./hotspots";

/** Percent boxes relative to the camp image (1448×1086). Same model as hotspots. */
export interface AtmosphereBox {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface AtmosphereLayer {
  id: string;
  box: AtmosphereBox;
  /** Transparent authored PNGs of the animated object only — not a full camp plate. */
  frames: readonly string[];
  /** Playback order into `frames` (may repeat indices). */
  sequence: readonly number[];
  intervalMs: number;
  zIndex: number;
}

/**
 * Atomic switch for the full sprite system. Stay false during the fire alignment test.
 */
export const CAMP_ATMOSPHERE_READY = false;

/**
 * Temporary alignment pass: clean plate + a single full-canvas fire overlay.
 * No timers, no extra frames. Flip to false to hide the overlay.
 */
export const CAMP_FIRE_TEST = true;

/** Authored clean plate. Do not overwrite camp-base.png. */
export const CAMP_CLEAN_SRC = "/game/hub/camp-base-clean.png";

/** Full-canvas transparent fire frame, stacked with inset-0 over the clean plate. */
export const CAMP_FIRE_TEST_SRC = "/game/hub/animated/fire/fire-1.png";
export const CAMP_FIRE_2_SRC = "/game/hub/animated/fire/fire-2.png";
export const CAMP_FIRE_3_SRC = "/game/hub/animated/fire/fire-3.png";
export const CAMP_FIRE_4_SRC = "/game/hub/animated/fire/fire-4.png";

/** Measured opaque content of fire-1.png (1448×1086). Authoring offset starts at 0,0. LOCKED. */
export const FIRE_1_OBJECT: EditableObject = {
  id: "fire-1",
  label: "FIRE-1",
  bounds: { x: 659, y: 575, width: 90, height: 161 },
  src: CAMP_FIRE_TEST_SRC,
  fullCanvas: true,
  zIndex: 1,
};

/** Measured opaque content of fire-2.png (1448×1086). Authoring offset starts at 0,0. LOCKED. */
export const FIRE_2_OBJECT: EditableObject = {
  id: "fire-2",
  label: "FIRE-2",
  bounds: { x: 662, y: 591, width: 80, height: 146 },
  src: CAMP_FIRE_2_SRC,
  fullCanvas: true,
  zIndex: 1,
};

/** Measured opaque content of fire-3.png (1448×1086). Authoring offset starts at 0,0. LOCKED. */
export const FIRE_3_OBJECT: EditableObject = {
  id: "fire-3",
  label: "FIRE-3",
  bounds: { x: 659, y: 588, width: 88, height: 149 },
  src: CAMP_FIRE_3_SRC,
  fullCanvas: true,
  zIndex: 1,
};

/** Measured opaque content of fire-4.png (1448×1086). Authoring offset starts at 0,0. LOCKED. */
export const FIRE_4_OBJECT: EditableObject = {
  id: "fire-4",
  label: "FIRE-4",
  bounds: { x: 651, y: 554, width: 98, height: 182 },
  src: CAMP_FIRE_4_SRC,
  fullCanvas: true,
  zIndex: 1,
};

export const CAMP_FIRE_FRAMES = {
  "fire-1": FIRE_1_OBJECT,
  "fire-2": FIRE_2_OBJECT,
  "fire-3": FIRE_3_OBJECT,
  "fire-4": FIRE_4_OBJECT,
} as const;

export const FIRE_ANIMATION_FRAMES: readonly EditableObject[] = [
  FIRE_1_OBJECT,
  FIRE_2_OBJECT,
  FIRE_3_OBJECT,
  FIRE_4_OBJECT,
];

/** 2 → 1 → 3 → 2 → 4 → 3 → 1 → 4 → 2 → 3 */
export const FIRE_SEQUENCE: readonly number[] = [1, 0, 2, 1, 3, 2, 0, 3, 1, 2];
export const FIRE_FRAME_MS = 150;

/**
 * Authored fire loop only. Do not flip CAMP_ATMOSPHERE_READY — that would
 * enable rejected scavlord/lantern/fern layers.
 */
export const CAMP_FIRE_READY = true;

export function shouldAnimateFire(reducedMotion: boolean, editMode: boolean): boolean {
  return CAMP_FIRE_READY && !reducedMotion && !editMode;
}

export function fireSequenceIndex(step: number, reducedMotion = false): number {
  if (reducedMotion || FIRE_SEQUENCE.length === 0) return 0;
  return FIRE_SEQUENCE[step % FIRE_SEQUENCE.length] ?? 0;
}

export function fireVisibleFrame(step: number, reducedMotion = false): EditableObject {
  return FIRE_ANIMATION_FRAMES[fireSequenceIndex(step, reducedMotion)] ?? FIRE_1_OBJECT;
}

export function fireVisibleObjects(step: number, reducedMotion = false): readonly EditableObject[] {
  return [fireVisibleFrame(step, reducedMotion)];
}

/** All fire frames stay registered for the editor; rendering uses `fireVisibleObjects`. */
export const CAMP_EDITABLES: readonly EditableObject[] = FIRE_ANIMATION_FRAMES;

function box(
  xPercent: number,
  yPercent: number,
  widthPercent: number,
  heightPercent: number,
): AtmosphereBox {
  return { xPercent, yPercent, widthPercent, heightPercent };
}

/**
 * Authored sprite contract. Frames are not in the repo yet.
 * Each PNG is a transparent crop that fills the layer's single stable box.
 */
export const FIRE_LAYER: AtmosphereLayer = {
  id: "fire",
  box: box(43.508, 55.064, 8.84, 16.575),
  frames: [
    "/game/hub/animated/fire/fire-01.png",
    "/game/hub/animated/fire/fire-02.png",
    "/game/hub/animated/fire/fire-03.png",
    "/game/hub/animated/fire/fire-04.png",
  ],
  sequence: [0, 1, 2, 1, 3, 1],
  intervalMs: 150,
  zIndex: 1,
};

export const SCAVLORD_LAYER: AtmosphereLayer = {
  id: "scavlord",
  box: box(48.619, 39.411, 12.983, 19.337),
  frames: [
    "/game/hub/animated/scavlord/scavlord-idle-01.png",
    "/game/hub/animated/scavlord/scavlord-idle-02.png",
    "/game/hub/animated/scavlord/scavlord-idle-03.png",
  ],
  sequence: [0, 0, 1, 0, 2, 0],
  intervalMs: 650,
  zIndex: 2,
};

export const LANTERN_LEFT_LAYER: AtmosphereLayer = {
  id: "lantern-left",
  box: box(37.845, 47.145, 3.039, 4.42),
  frames: [
    "/game/hub/animated/lantern/left-01.png",
    "/game/hub/animated/lantern/left-02.png",
    "/game/hub/animated/lantern/left-03.png",
  ],
  sequence: [0, 1, 0, 2],
  intervalMs: 310,
  zIndex: 1,
};

export const LANTERN_RIGHT_LAYER: AtmosphereLayer = {
  id: "lantern-right",
  box: box(83.149, 43.462, 2.762, 4.236),
  frames: [
    "/game/hub/animated/lantern/right-01.png",
    "/game/hub/animated/lantern/right-02.png",
    "/game/hub/animated/lantern/right-03.png",
  ],
  sequence: [0, 2, 1, 0, 1],
  intervalMs: 430,
  zIndex: 1,
};

export const ATMOSPHERE_LAYERS: readonly AtmosphereLayer[] = [
  FIRE_LAYER,
  LANTERN_LEFT_LAYER,
  LANTERN_RIGHT_LAYER,
  SCAVLORD_LAYER,
];

export function campPlateSrc(reducedMotion = false): string {
  if (CAMP_FIRE_TEST) return CAMP_CLEAN_SRC;
  if (!CAMP_ATMOSPHERE_READY || reducedMotion) return CAMP_IMAGE_SRC;
  return CAMP_CLEAN_SRC;
}

export function shouldRenderAtmosphere(reducedMotion = false): boolean {
  return CAMP_ATMOSPHERE_READY && !reducedMotion;
}

export function atmosphereLayersToRender(reducedMotion = false): readonly AtmosphereLayer[] {
  return shouldRenderAtmosphere(reducedMotion) ? ATMOSPHERE_LAYERS : [];
}

export function atmosphereFrameIndex(
  sequence: readonly number[],
  step: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion || sequence.length === 0) return 0;
  return sequence[step % sequence.length] ?? 0;
}

export function boxIsInImage(b: AtmosphereBox): boolean {
  return (
    b.xPercent >= 0 &&
    b.yPercent >= 0 &&
    b.widthPercent > 0 &&
    b.heightPercent > 0 &&
    b.xPercent + b.widthPercent <= 100 &&
    b.yPercent + b.heightPercent <= 100
  );
}

export function sequenceFitsFrames(layer: AtmosphereLayer): boolean {
  return layer.sequence.every((i) => i >= 0 && i < layer.frames.length);
}
