import { useEffect, useRef, type RefObject } from "react";
import {
  boxPercentStyle,
  editorOffset,
  formatPlacementPopup,
  integerOffset,
  isTypingTarget,
  nudgeOffset,
  placedBounds,
  ZERO_OFFSET,
  type EditableObject,
  type PlacementOffset,
} from "./placement";

export default function PlacementLayer({
  objects,
  offsets,
  selectedId,
  editMode,
  controlsEnabled,
  imageW,
  imageH,
  frameRef,
  onSelect,
  onOffsetChange,
  onDeselect,
}: {
  objects: readonly EditableObject[];
  offsets: Readonly<Record<string, PlacementOffset>>;
  selectedId: string | null;
  editMode: boolean;
  controlsEnabled: boolean;
  imageW: number;
  imageH: number;
  frameRef: RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onOffsetChange: (id: string, offset: PlacementOffset) => void;
  onDeselect: () => void;
}) {
  const drag = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    origin: PlacementOffset;
  } | null>(null);

  useEffect(() => {
    if (!controlsEnabled || !selectedId) return;

    const onKey = (ev: KeyboardEvent) => {
      if (isTypingTarget(ev.target)) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        onDeselect();
        return;
      }
      const step = ev.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (ev.key === "ArrowLeft") dx = -step;
      else if (ev.key === "ArrowRight") dx = step;
      else if (ev.key === "ArrowUp") dy = -step;
      else if (ev.key === "ArrowDown") dy = step;
      else return;
      ev.preventDefault();
      const current = offsets[selectedId] ?? ZERO_OFFSET;
      onOffsetChange(selectedId, nudgeOffset(current, dx, dy));
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controlsEnabled, selectedId, offsets, onDeselect, onOffsetChange]);

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const selectedOffset = selectedId ? (offsets[selectedId] ?? ZERO_OFFSET) : ZERO_OFFSET;
  const popup = selected ? formatPlacementPopup(selected.label, selected.bounds, selectedOffset) : null;

  return (
    <>
      {objects.map((obj) => {
        const offset = editorOffset(editMode, offsets[obj.id]);
        const box = placedBounds(obj.bounds, offset);
        const isSelected = editMode && obj.id === selectedId;
        const z = isSelected ? 20 : 1 + (obj.zIndex ?? 0);

        return (
          <div key={obj.id}>
            {obj.src && obj.fullCanvas && (
              <img
                src={obj.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full select-none"
                style={{
                  imageRendering: "pixelated",
                  objectFit: "contain",
                  transform: `translate(${(offset.offsetX / imageW) * 100}%, ${(offset.offsetY / imageH) * 100}%)`,
                  zIndex: z,
                }}
              />
            )}
            {obj.src && !obj.fullCanvas && (
              <img
                src={obj.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute select-none"
                style={{
                  ...boxPercentStyle(box, imageW, imageH),
                  imageRendering: "pixelated",
                  objectFit: "fill",
                  zIndex: z,
                }}
              />
            )}
            {!obj.src && editMode && (
              <div
                aria-hidden
                className="pointer-events-none absolute"
                style={{
                  ...boxPercentStyle(box, imageW, imageH),
                  zIndex: z,
                  background: "#6f7f52",
                  boxShadow: "inset 0 0 0 2px #c8d4a0",
                }}
              />
            )}
            {controlsEnabled && (
              <div
                role="presentation"
                className="absolute cursor-grab touch-none"
                style={{
                  ...boxPercentStyle(box, imageW, imageH),
                  zIndex: z + 1,
                  outline: isSelected ? "2px solid #f0b400" : "none",
                  outlineOffset: "-2px",
                }}
                onPointerDown={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  onSelect(obj.id);
                  ev.currentTarget.setPointerCapture(ev.pointerId);
                  drag.current = {
                    id: obj.id,
                    pointerId: ev.pointerId,
                    startX: ev.clientX,
                    startY: ev.clientY,
                    origin: offsets[obj.id] ?? ZERO_OFFSET,
                  };
                }}
                onPointerMove={(ev) => {
                  const d = drag.current;
                  if (!d || d.pointerId !== ev.pointerId || d.id !== obj.id) return;
                  const frame = frameRef.current;
                  if (!frame) return;
                  const rect = frame.getBoundingClientRect();
                  const scale = Math.min(rect.width / imageW, rect.height / imageH);
                  if (scale <= 0) return;
                  onOffsetChange(
                    d.id,
                    integerOffset(d.origin.offsetX + (ev.clientX - d.startX) / scale, d.origin.offsetY + (ev.clientY - d.startY) / scale),
                  );
                }}
                onPointerUp={(ev) => {
                  if (drag.current?.pointerId === ev.pointerId) drag.current = null;
                }}
              />
            )}
          </div>
        );
      })}

      {editMode && popup && (
        <div
          className="pointer-events-none absolute left-1 top-1 z-30 font-mono text-[9px] leading-tight sm:text-[10px]"
          style={{
            border: "2px solid var(--color-border)",
            background: "var(--color-card)",
            padding: "4px 8px",
            boxShadow: "3px 3px 0 0 oklch(0 0 0 / 0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          <div className="text-primary">{popup.label}</div>
          <div className="whitespace-pre text-muted-foreground">{popup.pos}</div>
          <div className="whitespace-pre text-muted-foreground">{popup.move}</div>
        </div>
      )}
    </>
  );
}
