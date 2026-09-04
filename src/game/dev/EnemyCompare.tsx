import { useState } from "react";
import type { EnemyDef, EnemyKind } from "../types";
import { ENEMIES } from "../data";
import { balanceToneTextClass } from "./balance";
import MetricTrack from "./MetricTrack";
import { axisTicks, formatRank, scalePosition } from "./compareMetrics";
import {
  ENEMY_CATEGORIES,
  ENEMY_COMPARE_METRICS,
  ENEMY_METRIC_LABEL,
  composeEnemyCompare,
  enemyFieldTone,
  type EnemyCategory,
  type EnemyMetricKey,
} from "./enemyMetrics";

const COLS = "grid-cols-[minmax(10.5rem,0.24fr)_minmax(0,1fr)_minmax(5.75rem,0.16fr)]";

export default function EnemyCompare({
  all,
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
  all: readonly EnemyDef[];
  testOf: (d: EnemyDef) => EnemyDef;
  displayName: (d: EnemyDef) => string;
  category: EnemyCategory;
  query: string;
  metric: EnemyMetricKey;
  sortDir: "asc" | "desc";
  selectedId: EnemyKind | null;
  onCategory: (c: EnemyCategory) => void;
  onMetric: (m: EnemyMetricKey) => void;
  onSortDir: (dir: "asc" | "desc") => void;
  onSelect: (id: EnemyKind) => void;
}) {
  const [hoveredId, setHoveredId] = useState<EnemyKind | null>(null);
  const view = composeEnemyCompare(all, testOf, category, metric, query, sortDir, displayName);
  const byId = new Map(view.rows.map((r) => [r.id, r]));
  const ticks = axisTicks(view.domain.min, view.domain.max);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {ENEMY_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`pixel-btn px-3 py-2 text-[10px] ${
              category === c ? "pixel-btn-primary" : "text-muted-foreground"
            }`}
            onClick={() => onCategory(c)}
          >
            {c}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        {ENEMY_COMPARE_METRICS.map((m) => (
          <button
            key={m}
            type="button"
            className={`pixel-btn px-3 py-2 text-[10px] ${
              metric === m ? "pixel-btn-primary" : "text-muted-foreground"
            }`}
            onClick={() => onMetric(m)}
          >
            {ENEMY_METRIC_LABEL[m]}
          </button>
        ))}
        <button
          type="button"
          className="pixel-btn px-3 py-2 text-[10px] text-muted-foreground"
          onClick={() => onSortDir(sortDir === "desc" ? "asc" : "desc")}
        >
          {sortDir === "desc" ? "HIGH → LOW" : "LOW → HIGH"}
        </button>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden border-2 border-border bg-background/40">
        <div className={`grid shrink-0 items-end gap-3 border-b border-border px-3 py-2 font-mono text-[10px] text-muted-foreground ${COLS}`}>
          <span>ENEMY</span>
          <div className="relative h-4">
            {ticks.map((t, i) => (
              <span
                key={i}
                className="absolute -translate-x-1/2"
                style={{ left: `${scalePosition(t, view.domain.min, view.domain.max) * 100}%` }}
              >
                {Math.round(t)}
              </span>
            ))}
          </div>
          <span className="text-right">RANK</span>
        </div>
        <div className="pixel-scrollbar min-h-0 flex-1 overflow-auto">
          {view.order.map((id) => {
            const row = byId.get(id)!;
            const def = all.find((d) => d.kind === id) ?? ENEMIES[id];
            if (!def) return null;
            const test = testOf(def);
            const tone = enemyFieldTone(metric === "leak" ? "damage" : metric, row.base, row.test);
            const active = selectedId === id;
            const hot = hoveredId === id || active;
            const rank = view.ranksTest.get(id) ?? 0;
            return (
              <button
                key={id}
                type="button"
                className={`grid w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left ${COLS} ${
                  active ? "bg-secondary" : "hover:bg-secondary/50"
                }`}
                onMouseEnter={() => setHoveredId(id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSelect(id)}
              >
                <span className={`truncate font-mono text-sm ${hot ? "text-primary" : "text-foreground"}`}>
                  {displayName(test)}
                </span>
                <MetricTrack
                  min={view.domain.min}
                  max={view.domain.max}
                  markers={
                    row.changed
                      ? [
                          { kind: "base", value: row.base, title: `BASE ${row.base}` },
                          { kind: "test", value: row.test, tone, title: `TEST ${row.test}` },
                        ]
                      : [{ kind: "test", value: row.test, title: String(row.test) }]
                  }
                />
                <span className={`text-right font-mono text-xs ${row.changed ? balanceToneTextClass(tone) : "text-muted-foreground"}`}>
                  {formatRank(rank, view.rows.length)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
