import type { WeaponDef } from "../gear";
import { balanceToneTextClass } from "./balance";
import MetricTrack from "./MetricTrack";
import {
  BENCHMARK_METRICS,
  COMPARE_METRIC_LABEL,
  benchmarkScopeCategory,
  buildCompareRows,
  compareClassOf,
  compareMetricTone,
  filterCompareWeapons,
  formatMetricValue,
  formatRank,
  type BenchmarkScope,
} from "./compareMetrics";

type W = WeaponDef;

export default function ArsenalBenchmark({
  selected,
  testOf,
  allWeapons,
  scope,
  onScope,
}: {
  selected: W;
  testOf: (w: W) => W;
  allWeapons: readonly W[];
  scope: BenchmarkScope;
  onScope: (scope: BenchmarkScope) => void;
}) {
  const category = benchmarkScopeCategory(selected, scope);
  const group = filterCompareWeapons(allWeapons, category, "");
  const total = group.length;

  return (
    <div className="mt-6 border-t-2 border-border pt-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="font-display text-[11px] text-primary">ARSENAL BENCHMARK</div>
          <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
            Compare to: {category === "ALL" ? "ALL WEAPONS" : compareClassOf(selected)}
          </div>
        </div>
        <div className="flex gap-1">
          {(["category", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`pixel-btn px-2 py-1 text-[9px] ${scope === s ? "pixel-btn-primary" : "text-muted-foreground"}`}
              onClick={() => onScope(s)}
            >
              {s === "category" ? "CATEGORY" : "ALL"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {BENCHMARK_METRICS.map((metric) => {
          const { rows, ranksTest, ranksBase, median, domain } = buildCompareRows(group, testOf, metric);
          const row = rows.find((r) => r.id === selected.id);
          if (!row) return null;
          const baseRank = ranksBase.get(selected.id) ?? total;
          const testRank = ranksTest.get(selected.id) ?? total;
          const tone = compareMetricTone(metric, row.base, row.test);
          const markers = [
            { kind: "median" as const, value: median, title: "GROUP MEDIAN" },
            ...(row.changed
              ? [
                  { kind: "base" as const, value: row.base, title: `BASE ${formatMetricValue(metric, row.base)}` },
                  { kind: "test" as const, value: row.test, tone, title: `TEST ${formatMetricValue(metric, row.test)}` },
                ]
              : [{ kind: "test" as const, value: row.test, title: formatMetricValue(metric, row.test) }]),
          ];
          return (
            <div key={metric} className="border border-border bg-secondary/20 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                <span className="text-muted-foreground">{COMPARE_METRIC_LABEL[metric]}</span>
                <span className={row.changed ? balanceToneTextClass(tone) : "text-foreground"}>
                  {row.changed
                    ? `${formatMetricValue(metric, row.base)} → ${formatMetricValue(metric, row.test)} · ${formatRank(baseRank, total)} → ${formatRank(testRank, total)}`
                    : `${formatMetricValue(metric, row.test)} · ${formatRank(testRank, total)}`}
                </span>
              </div>
              <MetricTrack
                min={domain.min}
                max={domain.max}
                markers={markers}
                lowLabel={metric === "weight" ? "LIGHT" : "LOW"}
                highLabel={metric === "weight" ? "HEAVY" : "HIGH"}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
