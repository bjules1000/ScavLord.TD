import { balanceToneTextClass, type BalanceTone } from "./balance";
import { scalePosition } from "./compareMetrics";

export type TrackMarker = {
  kind: "base" | "test" | "median";
  value: number;
  tone?: BalanceTone;
  title?: string;
};

export default function MetricTrack({
  min,
  max,
  markers,
  lowLabel = "LOW",
  highLabel = "HIGH",
  compact = false,
}: {
  min: number;
  max: number;
  markers: readonly TrackMarker[];
  lowLabel?: string;
  highLabel?: string;
  compact?: boolean;
}) {
  const h = compact ? "h-5" : "h-7";
  return (
    <div className="min-w-0">
      <div className={`relative ${h} w-full`}>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <div className="absolute inset-y-1 left-0 w-px bg-border" />
        <div className="absolute inset-y-1 right-0 w-px bg-border" />
        {markers.map((m, i) => {
          const pct = scalePosition(m.value, min, max) * 100;
          if (m.kind === "median") {
            return (
              <div
                key={`median-${i}`}
                title={m.title ?? "ARSENAL MEDIAN"}
                className="absolute top-0 h-full w-px bg-primary/45"
                style={{ left: `${pct}%` }}
              />
            );
          }
          const toneClass = m.tone ? balanceToneTextClass(m.tone) : "text-foreground";
          return (
            <span
              key={`${m.kind}-${i}`}
              title={m.title ?? `${m.kind} ${m.value}`}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono ${
                compact ? "text-[10px]" : "text-xs"
              } ${toneClass}`}
              style={{ left: `${pct}%` }}
            >
              {m.kind === "base" ? "○" : "●"}
            </span>
          );
        })}
      </div>
      {!compact && (
        <div className="flex justify-between font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}
