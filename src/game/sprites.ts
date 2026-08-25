import frames from "./atlas.json";
import gearFrames from "./gear-atlas.json";

export type FrameName = keyof typeof frames;
export type GearFrameName = keyof typeof gearFrames;

/**
 * Sprite-atlas rendering is disabled: the game uses its original procedural
 * pixel-art renderer. These stubs report "not ready" so every draw call in
 * draw.ts falls back to the hand-drawn shapes. Game logic is unaffected.
 */

export const spritesReady = () => false;
export const gearSpritesReady = () => false;
export const floorReadyFn = () => false;
export const floorImage = (): HTMLImageElement | null => null;

export function drawSprite(
  _ctx: CanvasRenderingContext2D,
  _name: FrameName,
  _x: number,
  _y: number,
  _boxW: number,
  _boxH: number,
  _opts: { anchor?: "bottom" | "center"; alpha?: number } = {},
) {
  return false;
}

export function drawGear(
  _ctx: CanvasRenderingContext2D,
  _name: GearFrameName,
  _x: number,
  _y: number,
  _width: number,
  _opts: { anchor?: "left" | "center" } = {},
) {
  return false;
}
