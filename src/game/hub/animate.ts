/** Percent boxes relative to public/game/hub/camp-base.png (1448×1086). Same model as hotspots. */

export interface AtmosphereBox {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface AtmosphereLayer {
  id: string;
  box: AtmosphereBox;
  frames: readonly string[];
  /** Playback order into `frames` (may repeat indices). */
  sequence: readonly number[];
  intervalMs: number;
}

function box(
  xPercent: number,
  yPercent: number,
  widthPercent: number,
  heightPercent: number,
): AtmosphereBox {
  return { xPercent, yPercent, widthPercent, heightPercent };
}

/** Derived covering extracts from camp-base.png. Frame 0 matches the baked pixels in each box. */
export const FIRE_LAYER: AtmosphereLayer = {
  id: "fire",
  box: box(43.508, 55.064, 8.84, 16.575),
  frames: [
    "/game/hub/animated/fire/f0.png",
    "/game/hub/animated/fire/f1.png",
    "/game/hub/animated/fire/f2.png",
    "/game/hub/animated/fire/f3.png",
  ],
  sequence: [0, 1, 2, 1, 3, 1],
  intervalMs: 150,
};

export const SCAVLORD_LAYER: AtmosphereLayer = {
  id: "scavlord",
  box: box(48.619, 39.411, 12.983, 19.337),
  frames: [
    "/game/hub/animated/scavlord/s0.png",
    "/game/hub/animated/scavlord/s1.png",
    "/game/hub/animated/scavlord/s2.png",
  ],
  sequence: [0, 0, 1, 0, 2, 0],
  intervalMs: 650,
};

export const LANTERN_LEFT_LAYER: AtmosphereLayer = {
  id: "lantern-left",
  box: box(37.845, 47.145, 3.039, 4.42),
  frames: [
    "/game/hub/animated/lantern/left-0.png",
    "/game/hub/animated/lantern/left-1.png",
    "/game/hub/animated/lantern/left-2.png",
  ],
  sequence: [0, 1, 0, 2],
  intervalMs: 310,
};

export const LANTERN_RIGHT_LAYER: AtmosphereLayer = {
  id: "lantern-right",
  box: box(83.149, 43.462, 2.762, 4.236),
  frames: [
    "/game/hub/animated/lantern/right-0.png",
    "/game/hub/animated/lantern/right-1.png",
    "/game/hub/animated/lantern/right-2.png",
  ],
  sequence: [0, 2, 1, 0, 1],
  intervalMs: 430,
};

export const ATMOSPHERE_LAYERS: readonly AtmosphereLayer[] = [
  FIRE_LAYER,
  LANTERN_LEFT_LAYER,
  LANTERN_RIGHT_LAYER,
  SCAVLORD_LAYER,
];

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
