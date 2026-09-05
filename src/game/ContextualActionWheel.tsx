/**
 * Compact pixel-art contextual action wheel for battlefield right-click.
 * Data-driven actions — M10 can append THROW without rebuilding the shell.
 */

import type { WheelActionDef, WheelActionId } from "./actionWheel";

export type ActionWheelProps = {
  clientX: number;
  clientY: number;
  actions: readonly WheelActionDef[];
  onPick: (id: WheelActionId) => void;
  onCancel: () => void;
};

const RADIUS = 54;
const BTN = 44;

/**
 * Place actions around a center CANCEL hub.
 * 2–5 outer actions; CANCEL sits in center when present, else as last outer.
 */
export function ActionWheel({ clientX, clientY, actions, onPick, onCancel }: ActionWheelProps) {
  const cancel = actions.find((a) => a.id === "CANCEL");
  const outer = actions.filter((a) => a.id !== "CANCEL");
  const n = Math.max(1, outer.length);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[60]"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onCancel();
      }}
      onContextMenu={(ev) => {
        ev.preventDefault();
        onCancel();
      }}
    >
      <div
        className="pointer-events-auto absolute"
        style={{
          left: clientX,
          top: clientY,
          transform: "translate(-50%, -50%)",
          width: RADIUS * 2 + BTN,
          height: RADIUS * 2 + BTN,
        }}
      >
        {outer.map((action, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          const x = Math.cos(ang) * RADIUS;
          const y = Math.sin(ang) * RADIUS;
          return (
            <button
              key={action.id}
              type="button"
              className="pixel-btn absolute flex items-center justify-center px-1 py-0.5 text-center font-mono text-[8px] leading-tight"
              style={{
                left: "50%",
                top: "50%",
                width: BTN,
                height: BTN,
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                onPick(action.id);
              }}
            >
              {action.label}
            </button>
          );
        })}
        <button
          type="button"
          className="pixel-btn pixel-btn-primary absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center font-mono text-[8px]"
          title="CANCEL"
          onClick={(ev) => {
            ev.stopPropagation();
            onCancel();
          }}
        >
          {cancel ? "●" : "×"}
        </button>
      </div>
    </div>
  );
}
