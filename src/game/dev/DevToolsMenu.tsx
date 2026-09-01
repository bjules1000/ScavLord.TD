import { useEffect, useRef, useState } from "react";
import { DEV_TOOL_ENTRIES, type DevToolId } from "./menu";

export default function DevToolsMenu({
  enabled,
  onSelect,
}: {
  enabled: boolean;
  onSelect: (id: DevToolId) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!enabled) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="DEV TOOLS"
        aria-expanded={open}
        className="pixel-chip font-mono text-[11px] sm:text-xs"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={open ? "text-primary" : "text-muted-foreground"}>☰</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-[140px] border-2 border-border bg-background p-1 shadow-[3px_3px_0_0_oklch(0_0_0_/_0.6)]">
          <div className="px-1 pb-1 font-display text-[9px] text-primary">DEV TOOLS</div>
          {DEV_TOOL_ENTRIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="block w-full px-2 py-1 text-left font-mono text-[10px] text-foreground hover:bg-secondary"
              onClick={() => {
                setOpen(false);
                onSelect(entry.id);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
