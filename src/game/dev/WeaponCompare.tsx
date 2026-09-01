import type { WeaponDef } from "../gear";
import { balanceToneTextClass } from "./balance";
import MetricTrack from "./MetricTrack";
import {
  COMPARE_CATEGORIES,
  COMPARE_METRIC_LABEL,
  COMPARE_METRICS,
  OVERVIEW_METRICS,
  buildCompareRows,
  compareClassOf,
  compareMetricTone,
  defaultSortDir,
  filterCompareWeapons,
  formatMetricValue,
  formatRank,
  sortWeaponIds,
  type CompareCategory,
  type CompareMetric,
} from "./compareMetrics";

export default function WeaponCompare({
  allWeapons,
  testOf,
  displayName,
  category,
  query,
  metric,
  sortReversed,
  selectedId,
  onCategory,
  onMetric,
  onToggleSort,
  onSelect,
}: {
  allWeapons: readonly WeaponDef[];
  testOf: (w: WeaponDef) => WeaponDef;
  displayName: (w: WeaponDef) => string;
  category: CompareCategory;
  query: string;
  metric: CompareMetric;
  sortReversed: boolean;
  selectedId: string | null;
  onCategory: (c: CompareCategory) => void;
  onMetric: (m: CompareMetric) => void;
  onToggleSort: () => void;
  onSelect: (id: string) => void;
}) {
  const visible = filterCompareWeapons(allWeapons, category, query, displayName);
  const sortMetric = metric === "overview" ? "sustainedDps" : metric;
  const dir = sortReversed ? (defaultSortDir(sortMetric) === "asc" ? "desc" : "asc") : defaultSortDir(sortMetric);

  return (
    <div className="pixel-scrollbar flex min-h-0 flex-1 flex-col overflow-auto border-2 border-border bg-background/40 p-3 sm:p-4">
      <div className="flex shrink-0 flex-wrap items-center gap-1">
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
        {COMPARE_METRICS.map((m) => (
          <button
            key={m}
            type="button"
            className={`pixel-btn px-2 py-1 text-[9px] ${metric === m ? "pixel-btn-primary" : "text-muted-foreground"}`}
            onClick={() => onMetric(m)}
          >
            {COMPARE_METRIC_LABEL[m]}
          </button>
        ))}
        {metric !== "overview" && (
          <button type="button" className="pixel-btn px-2 py-1 text-[9px] text-muted-foreground" onClick={onToggleSort}>
            SORT: {dir === "desc" ? "HIGH → LOW" : "LOW → HIGH"}
          </button>
        )}
        <span className="ml-auto font-mono text-[11px] uppercase text-muted-foreground">
          {visible.length} weapons · dashed tick = median
        </span>
      </div>

      {metric === "overview" ? (
        <OverviewGrid
          weapons={visible}
          testOf={testOf}
          displayName={displayName}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <MetricList
          weapons={visible}
          testOf={testOf}
          displayName={displayName}
          metric={metric}
          dir={dir}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

function OverviewGrid({
  weapons,
  testOf,
  displayName,
  selectedId,
  onSelect,
}: {
  weapons: readonly WeaponDef[];
  testOf: (w: WeaponDef) => WeaponDef;
  displayName: (w: WeaponDef) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const built = Object.fromEntries(OVERVIEW_METRICS.map((m) => [m, buildCompareRows(weapons, testOf, m)])) as Record<
    (typeof OVERVIEW_METRICS)[number],
    ReturnType<typeof buildCompareRows>
  >;

  return (
    <div className="mt-3 space-y-2">
      {weapons.map((w) => {
        const active = selectedId === w.id;
        return (
          <button
            key={w.id}
            type="button"
            className={`w-full border px-3 py-2 text-left ${
              active ? "border-primary bg-secondary" : "border-border bg-secondary/20 hover:bg-secondary/50"
            }`}
            onClick={() => onSelect(w.id)}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={`font-mono text-sm ${active ? "text-primary" : "text-foreground"}`}>
                {displayName(testOf(w))}
              </span>
              <span className="font-mono text-[10px] uppercase text-muted-foreground">{compareClassOf(w)}</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {OVERVIEW_METRICS.map((m) => {
                const pack = built[m]!;
                const row = pack.rows.find((r) => r.id === w.id);
                if (!row) return null;
                const tone = compareMetricTone(m, row.base, row.test);
                const rank = pack.ranksTest.get(w.id) ?? weapons.length;
                return (
                  <div key={m}>
                    <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                      <span>{COMPARE_METRIC_LABEL[m]}</span>
                      <span className={row.changed ? balanceToneTextClass(tone) : ""}>
                        {formatMetricValue(m, row.test)} · {formatRank(rank, weapons.length)}
                      </span>
                    </div>
                    <MetricTrack
                      compact
                      min={pack.domain.min}
                      max={pack.domain.max}
                      markers={[
                        { kind: "median", value: pack.median },
                        ...(row.changed
                          ? [
                              { kind: "base" as const, value: row.base },
                              { kind: "test" as const, value: row.test, tone },
                            ]
                          : [{ kind: "test" as const, value: row.test }]),
                      ]}
                      lowLabel={m === "weight" ? "LIGHT" : "LOW"}
                      highLabel={m === "weight" ? "HEAVY" : "HIGH"}
                    />
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
      {weapons.length === 0 && (
        <div className="font-mono text-sm text-muted-foreground">No weapons match this filter.</div>
      )}
    </div>
  );
}

function MetricList({
  weapons,
  testOf,
  displayName,
  metric,
  dir,
  selectedId,
  onSelect,
}: {
  weapons: readonly WeaponDef[];
  testOf: (w: WeaponDef) => WeaponDef;
  displayName: (w: WeaponDef) => string;
  metric: Exclude<CompareMetric, "overview">;
  dir: "asc" | "desc";
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { rows, ranksTest, ranksBase, median, domain } = buildCompareRows(weapons, testOf, metric);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const order = sortWeaponIds(
    rows.map((r) => ({ id: r.id, value: r.test, name: displayName(testOf(weapons.find((w) => w.id === r.id)!)) })),
    dir,
  );
  const total = weapons.length;

  return (
    <div className="mt-3 space-y-1">
      {order.map((id) => {
        const row = byId.get(id);
        const canon = weapons.find((w) => w.id === id);
        if (!row || !canon) return null;
        const active = selectedId === id;
        const tone = compareMetricTone(metric, row.base, row.test);
        const testRank = ranksTest.get(id) ?? total;
        const baseRank = ranksBase.get(id) ?? total;
        const extra =
          testOf(canon).pellets != null && metric === "damage"
            ? ` · ${testOf(canon).damage}×${testOf(canon).pellets}`
            : "";
        return (
          <button
            key={id}
            type="button"
            className={`grid w-full grid-cols-1 items-center gap-2 border px-3 py-2 text-left md:grid-cols-[minmax(9rem,0.28fr)_minmax(0,1fr)_minmax(7rem,0.22fr)] ${
              active ? "border-primary bg-secondary" : "border-border bg-secondary/15 hover:bg-secondary/45"
            }`}
            onClick={() => onSelect(id)}
          >
            <div className="min-w-0">
              <div className={`truncate font-mono text-sm ${active ? "text-primary" : "text-foreground"}`}>
                {displayName(testOf(canon))}
              </div>
              <div className="font-mono text-[10px] uppercase text-muted-foreground">
                {row.changed ? `${formatRank(baseRank, total)} → ${formatRank(testRank, total)}` : formatRank(testRank, total)}
                {extra}
              </div>
            </div>
            <MetricTrack
              min={domain.min}
              max={domain.max}
              markers={[
                { kind: "median", value: median, title: "GROUP MEDIAN" },
                ...(row.changed
                  ? [
                      { kind: "base" as const, value: row.base, title: `BASE ${formatMetricValue(metric, row.base)}` },
                      { kind: "test" as const, value: row.test, tone, title: `TEST ${formatMetricValue(metric, row.test)}` },
                    ]
                  : [{ kind: "test" as const, value: row.test, title: formatMetricValue(metric, row.test) }]),
              ]}
              lowLabel={metric === "weight" ? "LIGHT" : "LOW"}
              highLabel={metric === "weight" ? "HEAVY" : "HIGH"}
            />
            <div className={`text-right font-mono text-sm ${row.changed ? balanceToneTextClass(tone) : "text-foreground"}`}>
              {row.changed
                ? `${formatMetricValue(metric, row.base)} → ${formatMetricValue(metric, row.test)}`
                : formatMetricValue(metric, row.test)}
            </div>
          </button>
        );
      })}
      {weapons.length === 0 && (
        <div className="font-mono text-sm text-muted-foreground">No weapons match this filter.</div>
      )}
    </div>
  );
}
