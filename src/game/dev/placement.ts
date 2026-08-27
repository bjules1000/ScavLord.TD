/** Image-space integer placement for registered overlay objects. Dev/debug only. */

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacementOffset {
  offsetX: number;
  offsetY: number;
}

export const ZERO_OFFSET: PlacementOffset = { offsetX: 0, offsetY: 0 };

export interface EditableObject {
  id: string;
  label: string;
  /** Content/hit bounds in source image pixels. Not the full transparent canvas. */
  bounds: PixelBox;
  src?: string;
  /** When true, `src` is a full-canvas overlay translated by the offset. */
  fullCanvas?: boolean;
  zIndex?: number;
}

export function placedBounds(bounds: PixelBox, offset: PlacementOffset): PixelBox {
  return {
    x: bounds.x + offset.offsetX,
    y: bounds.y + offset.offsetY,
    width: bounds.width,
    height: bounds.height,
  };
}

export function editorOffset(editMode: boolean, offset: PlacementOffset | undefined): PlacementOffset {
  if (!editMode) return ZERO_OFFSET;
  return offset ?? ZERO_OFFSET;
}

export function integerOffset(x: number, y: number): PlacementOffset {
  return { offsetX: Math.round(x), offsetY: Math.round(y) };
}

export function nudgeOffset(offset: PlacementOffset, dx: number, dy: number): PlacementOffset {
  return integerOffset(offset.offsetX + dx, offset.offsetY + dy);
}

export function pointInBox(px: number, py: number, box: PixelBox): boolean {
  return px >= box.x && py >= box.y && px < box.x + box.width && py < box.y + box.height;
}

export function hitTestEditable(
  objects: readonly EditableObject[],
  offsets: Readonly<Record<string, PlacementOffset>>,
  editMode: boolean,
  px: number,
  py: number,
): string | null {
  const ranked = [...objects].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
  for (const obj of ranked) {
    const box = placedBounds(obj.bounds, editorOffset(editMode, offsets[obj.id]));
    if (pointInBox(px, py, box)) return obj.id;
  }
  return null;
}

/** Map a client point through object-fit:contain onto source pixels. Null = letterbox/background. */
export function clientToImagePixel(
  clientX: number,
  clientY: number,
  container: { left: number; top: number; width: number; height: number },
  imageW: number,
  imageH: number,
): { x: number; y: number } | null {
  if (container.width <= 0 || container.height <= 0 || imageW <= 0 || imageH <= 0) return null;
  const scale = Math.min(container.width / imageW, container.height / imageH);
  if (scale <= 0) return null;
  const drawW = imageW * scale;
  const drawH = imageH * scale;
  const ox = container.left + (container.width - drawW) / 2;
  const oy = container.top + (container.height - drawH) / 2;
  const x = Math.floor((clientX - ox) / scale);
  const y = Math.floor((clientY - oy) / scale);
  if (x < 0 || y < 0 || x >= imageW || y >= imageH) return null;
  return { x, y };
}

export function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

export function boxPercentStyle(box: PixelBox, imageW: number, imageH: number) {
  return {
    left: `${(box.x / imageW) * 100}%`,
    top: `${(box.y / imageH) * 100}%`,
    width: `${(box.width / imageW) * 100}%`,
    height: `${(box.height / imageH) * 100}%`,
  };
}
