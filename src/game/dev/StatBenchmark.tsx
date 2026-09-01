import { balanceToneTextClass } from "./balance";
import MetricTrack from "./MetricTrack";
import { formatEditorRank, type EditorBenchmark } from "./compareMetrics";

export default function StatBenchmark({
  bench,
  onOpen,
}: {
  bench: EditorBenchmark;
  onOpen?: (() => void) | undefined;
}) {
  const markers = bench.changed
    ? [
        { kind: "base" as const, value: bench.base, title: `BASE ${bench.base}` },
        { kind: "test" as const, value: bench.test, tone: bench.tone, title: `TEST ${bench.test}` },
      ]
    : [{ kind: "test" as const, value: bench.test, title: String(bench.test) }];
  const rankClass =
    bench.changed && bench.rankChanged ? balanceToneTextClass(bench.tone) : "text-muted-foreground";
  const inner = (
    <>
      <div className="min-w-[4.25rem] flex-1">
        <MetricTrack compact min={bench.domain.min} max={bench.domain.max} markers={markers} />
      </div>
      <span className={`shrink-0 whitespace-nowrap font-mono text-[10px] ${rankClass}`}>
        {formatEditorRank(bench)}
      </span>
    </>
  );
  if (!onOpen) {
    return <div className="flex min-w-0 items-center gap-2">{inner}</div>;
  }
  return (
    <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={onOpen}>
      {inner}
    </button>
  );
}
