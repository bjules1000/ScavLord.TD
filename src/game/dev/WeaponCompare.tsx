import { useState } from "react";
import type { WeaponDef } from "../gear";
import { balanceToneTextClass } from "./balance";
import {
  COMPARE_CATEGORIES,
  COMPARE_METRIC_LABEL,
  STACK_METRICS,
  axisTicks,
  compareMetricTone,
  composeStackedCompare,
  formatMetricValue,
  formatRank,
  scalePosition,
  type CompareCategory,
  type CompareSortDir,
  type ScalarMetric,
} from "./compareMetrics";

const COLS = "grid-cols-[minmax(10.5rem,0.24fr)_minmax(0,1fr)_minmax(5.75rem,0.16fr)]";

export default function WeaponCompare({
  allWeapons,
  testOf,
  displayName,
  category,
  query,
  metric,
  sortDir,
  selectedId,
  onCategory,
  onMetric,
  onSortDir,
  onSelect,
}: {
  allWeapons: readonly WeaponDef[];
  testOf: (w: WeaponDef) => WeaponDef;
  displayName: (w: WeaponDef) => string;
  category: CompareCategory;
  query: string;
  metric: ScalarMetric;
  sortDir: CompareSortDir;
  selectedId: string | null;
  onCategory: (c: CompareCategory) => void;
  onMetric: (m: ScalarMetric) => void;
  onSortDir: (dir: CompareSortDir) => void;
  onSelect: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const view = composeStackedCompare(allWeapons, testOf, category, metric, query, sortDir, displayName);
  const byId = new Map(view.rows.map((r) => [r.id, r]));
  const ticks = axisTicks(view.domain.min, view.domain.max);
  const medianPct = scalePosition(view.median, view.domain.min, view.domain.max) * 100;
  const lowLabel = metric === "weight" ? "LIGHT" : "LOW";
  const highLabel = metric === "weight" ? "HEAVY" : "HIGH";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-2 border-border bg-background/40 p-3 sm:p-4">
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Category</span>
        {COMPARE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`pixel-btn px-2 py-1 text-[9px] ${category === cat ? "pixel-btn-primary" : "text-muted-foreground"}`}
            onClick={() => onCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Stat</span>
        {STACK_METRICS.map((m) => (
          <button
            key={m}
            type="button"
            className={`pixel-btn px-2 py-1 text-[9px] ${metric === m ? "pixel-btn-primary" : "text-muted-foreground"}`}
            onClick={() => onMetric(m)}
          >
            {COMPARE_METRIC_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Sort</span>
        {(["desc", "asc"] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            className={`pixel-btn px-2 py-1 text-[9px] ${sortDir === dir ? "pixel-btn-primary" : "text-muted-foreground"}`}
            onClick={() => onSortDir(dir)}
          >
            {dir === "desc" ? "HIGH → LOW" : "LOW → HIGH"}
          </button>
        ))}
        <span className="ml-auto font-mono text-[11px] uppercase text-muted-foreground">
          {view.weapons.length} · {COMPARE_METRIC_LABEL[metric]}
          {category !== "ALL" ? ` · ${category}` : ""}
        </span>
      </div>

      {view.weapons.length === 0 ? (
        <div className="mt-6 font-mono text-sm text-muted-foreground">No weapons match this filter.</div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <div className={`grid shrink-0 items-end gap-x-3 border-b border-border pb-1 ${COLS}`}>
            <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Weapon</div>
            <div className="min-w-0">
              <div className="flex justify-between font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                <span>{lowLabel}</span>
                <span>{highLabel}</span>
              </div>
              <div className="relative mt-1 h-6">
                <div className="absolute inset-x-0 bottom-0 h-px bg-border" />
                {ticks.map((tick, i) => {
                  const pct = scalePosition(tick, view.domain.min, view.domain.max) * 100;
                  return (
                    <div
                      key={`${tick}-${i}`}
                      className="absolute bottom-0 -translate-x-1/2 text-center"
                      style={{ left: `${pct}%` }}
                    >
                      <div className="mx-auto h-2 w-px bg-border" />
                      <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                        {formatMetricValue(metric, tick)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-right font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Value
            </div>
          </div>

          <div className="pixel-scrollbar min-h-0 flex-1 overflow-auto">
            {view.order.map((id) => {
              const row = byId.get(id);
              const canon = view.weapons.find((w) => w.id === id);
              if (!row || !canon) return null;
              const live = testOf(canon);
              const active = selectedId === id;
              const hovered = hoveredId === id;
              const tone = compareMetricTone(metric, row.base, row.test);
              const rank = view.ranksTest.get(id) ?? view.weapons.length;
              const testPct = scalePosition(row.test, view.domain.min, view.domain.max) * 100;
              const basePct = scalePosition(row.base, view.domain.min, view.domain.max) * 100;
              const pelletNote =
                metric === "damage" && live.pellets != null ? `${live.damage}×${live.pellets}` : null;
              return (
                <button
                  key={id}
                  type="button"
                  className={`grid w-full items-center gap-x-3 border-b border-border/50 px-0 py-1.5 text-left ${COLS} ${
                    active
                      ? "bg-secondary"
                      : hovered
                        ? "bg-secondary/50"
                        : "hover:bg-secondary/35"
                  }`}
                  onMouseEnter={() => setHoveredId(id)}
                  onMouseLeave={() => setHoveredId((cur) => (cur === id ? null : cur))}
                  onClick={() => onSelect(id)}
                >
                  <div className="min-w-0 pl-1">
                    <div className={`truncate font-mono text-sm ${active ? "text-primary" : "text-foreground"}`}>
                      {displayName(live)}
                    </div>
                    <div className="font-mono text-[10px] uppercase text-muted-foreground">
                      {formatRank(rank, view.weapons.length)}
                      {pelletNote ? ` · ${pelletNote}` : ""}
                    </div>
                  </div>
                  <div className="relative h-8 min-w-0">
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/80" />
                    <div
                      className="absolute top-1 bottom-1 w-px bg-primary/30"
                      style={{ left: `${medianPct}%` }}
                      title="Median"
                    />
                    {row.changed && (
                      <div
                        className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-muted-foreground/55"
                        style={{
                          left: `${Math.min(basePct, testPct)}%`,
                          width: `${Math.abs(testPct - basePct)}%`,
                        }}
                      />
                    )}
                    {row.changed && (
                      <span
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground"
                        style={{ left: `${basePct}%` }}
                        title={`BASE ${formatMetricValue(metric, row.base)}`}
                      >
                        ○
                      </span>
                    )}
                    <span
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono leading-none ${
                        active || hovered ? "text-base" : "text-sm"
                      } ${row.changed ? balanceToneTextClass(tone) : active ? "text-primary" : "text-foreground"}`}
                      style={{ left: `${testPct}%` }}
                      title={`${displayName(live)} ${formatMetricValue(metric, row.test)}`}
                    >
                      ●
                    </span>
                  </div>
                  <div
                    className={`pr-1 text-right font-mono text-sm ${
                      row.changed ? balanceToneTextClass(tone) : "text-foreground"
                    }`}
                  >
                    {formatMetricValue(metric, row.test)}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
            Shared scale · ○ base · ● test · click a row to edit
          </div>
        </div>
      )}
    </div>
  );
}
