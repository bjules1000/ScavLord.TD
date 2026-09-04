import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { MAP_DEFS } from "../map";
import type { EnemyDef, EnemyKind } from "../types";
import {
  builtinBehaviorForKind,
  derivedBehaviorSummary,
  type EnemyBehaviorConfig,
  type EnemyDamageReaction,
  type EnemyObjective,
} from "../enemyBehavior";
import { cloneHitZones, defaultHitZones, enemyWorldBounds, resolveEnemyHitZones, type EnemyHitZone } from "../enemyHitZones";
import {
  enemyBodyDrawWidth,
  resolveEnemyBodyFrame,
  resolveEnemyGunFrame,
} from "../draw";
import { drawGear, gearSpritesReady } from "../sprites";
import { balanceToneBorderClass, balanceToneTextClass } from "./balance";
import EnemyCompare from "./EnemyCompare";
import {
  HITBOX_CANVAS_H,
  HITBOX_CANVAS_W,
  HITBOX_HANDLE_PX,
  clampZoneGeometry,
  handlePositions,
  hitTestHandle,
  layoutHitboxCanvasForEnemy,
  moveZoneByGrab,
  newCustomHitZone,
  pointInZoneScreen,
  resizeZoneByHandle,
  screenToNormalized,
  selectZoneAtScreen,
  withShape,
  zoneColor,
  zoneScreenRect,
  type ResizeHandle,
} from "./hitboxEditor";
import MetricTrack from "./MetricTrack";
import {
  allCanonicalEnemies,
  enemyDerived,
  enemyFieldTone,
  enemyMetricValue,
  enemyRanks,
  formatEnemyRank,
  type EnemyCategory,
  type EnemyMetricKey,
} from "./enemyMetrics";
import {
  WAVE_CATALOG_MAX,
  addWaveGroup,
  applyWaveLabOverrides,
  canonicalEnemy,
  canonicalWave,
  createBlankEnemy,
  deleteCustomEnemy,
  duplicateEnemy,
  effectiveEnemy,
  effectiveWave,
  emptyWaveLabOverrides,
  enemyBehaviorShortLabel,
  enemyCatalog,
  enemyEditorFields,
  enemyOverrideCount,
  formatWaveLabPatch,
  getWaveLabOverrides,
  isBossKind,
  listAllEnemyKinds,
  mapLaneSummary,
  modifiedWaveLabCount,
  removeWaveGroup,
  resetEnemyItem,
  resetWaveItem,
  setEnemyBehavior,
  setEnemyField,
  setEnemyHitZones,
  setWaveName,
  updateWaveGroup,
  waveLabOverridesEqual,
  waveOverrideCount,
  waveTotals,
  type WaveLabOverrides,
  type WaveLabView,
} from "./waveLabCore";

const EDITOR_COLS =
  "grid-cols-[minmax(7rem,1fr)_minmax(3.5rem,0.5fr)_minmax(5rem,0.7fr)_minmax(6rem,0.8fr)_minmax(8rem,1.1fr)]";

type EnemySubView = "editor" | "compare";
type EnemyDetailTab = "stats" | "hitbox" | "behavior";

function fieldNum(obj: object, key: string): number {
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" ? v : 0;
}

export default function WaveLab({
  enabled,
  inRaid,
  mapId,
  onClose,
  onApplied,
  onTestWave,
  onResetTest,
}: {
  enabled: boolean;
  inRaid: boolean;
  mapId: string;
  onClose: () => void;
  onApplied: (overrides: WaveLabOverrides) => void;
  onTestWave: (wave: number) => { ok: true } | { ok: false; reason: string };
  onResetTest: () => void;
}) {
  const [view, setView] = useState<WaveLabView>("waves");
  const [enemySub, setEnemySub] = useState<EnemySubView>("editor");
  const [query, setQuery] = useState("");
  const [mapFilter, setMapFilter] = useState(mapId);
  const [selectedWave, setSelectedWave] = useState(1);
  const [selectedKind, setSelectedKind] = useState<EnemyKind | null>(null);
  const [draft, setDraft] = useState<WaveLabOverrides>(() => getWaveLabOverrides());
  const [copied, setCopied] = useState(false);
  const [compareCategory, setCompareCategory] = useState<EnemyCategory>("ALL");
  const [compareMetric, setCompareMetric] = useState<EnemyMetricKey>("hp");
  const [compareSortDir, setCompareSortDir] = useState<"asc" | "desc">("desc");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<EnemyDetailTab>("stats");

  const map = MAP_DEFS.find((m) => m.id === mapFilter) ?? MAP_DEFS[0]!;
  const allEnemies = useMemo(() => {
    const byKind = new Map<string, EnemyDef>();
    for (const e of allCanonicalEnemies()) byKind.set(e.kind, e);
    for (const e of Object.values(draft.customEnemies ?? {})) byKind.set(e.kind, e);
    return [...byKind.values()];
  }, [draft.customEnemies]);
  const list = view === "bosses" ? enemyCatalog(true, draft) : enemyCatalog(false, draft);
  const kindOptions = listAllEnemyKinds(draft);
  const visibleEnemies = list.filter((e) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const live = effectiveEnemy(e.kind, draft, true);
    return live.name.toLowerCase().includes(q) || e.kind.toLowerCase().includes(q);
  });
  const waveNums = useMemo(() => Array.from({ length: WAVE_CATALOG_MAX }, (_, i) => i + 1), []);
  const visibleWaves = waveNums.filter((n) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const w = effectiveWave(map, n, draft, true);
    return w.name.toLowerCase().includes(q) || String(n).includes(q) || (n % 10 === 0 && "boss".includes(q));
  });

  if (!enabled) return null;

  const applied = getWaveLabOverrides();
  const appliedCount = modifiedWaveLabCount(applied);
  const draftCount = modifiedWaveLabCount(draft);
  const draftDirty = !waveLabOverridesEqual(draft, applied);

  const liveKind = selectedKind;
  const canonical = liveKind ? canonicalEnemy(liveKind, draft) : undefined;
  const testEnemy = liveKind ? effectiveEnemy(liveKind, draft, true) : undefined;
  const derived = testEnemy && canonical ? { base: enemyDerived(canonical), test: enemyDerived(testEnemy) } : null;

  const liveWave = effectiveWave(map, selectedWave, draft, true);
  const baseWave = canonicalWave(map, selectedWave);
  const totals = waveTotals(map, selectedWave, draft, true);
  const lanes = mapLaneSummary(map);

  const applyDraft = (next: WaveLabOverrides) => {
    const live = applyWaveLabOverrides(next, true);
    setDraft(live);
    onApplied(live);
  };

  const exportPatch = async () => {
    const text = formatWaveLabPatch(getWaveLabOverrides());
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt("Copy wave lab patch", text);
    }
  };

  const openCompareFromMetric = (metric: EnemyMetricKey) => {
    setCompareMetric(metric);
    setEnemySub("compare");
    setView("enemies");
  };

  type RankBench = {
    metric: EnemyMetricKey;
    base: number;
    test: number;
    changed: boolean;
    baseRank: number;
    testRank: number;
    total: number;
    domain: { min: number; max: number };
  };

  const editorBench = (key: EnemyMetricKey): RankBench | null => {
    if (!canonical || !testEnemy) return null;
    const pool = allEnemies;
    const testOfAll = (d: (typeof pool)[number]) => effectiveEnemy(d.kind, draft, true);
    const testRanks = enemyRanks(pool, key, testOfAll);
    const baseRanks = enemyRanks(pool, key, (d) => d);
    const base = enemyMetricValue(canonical, key);
    const test = enemyMetricValue(testEnemy, key);
    const values = pool.flatMap((d) => [enemyMetricValue(d, key), enemyMetricValue(testOfAll(d), key)]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      metric: key,
      base,
      test,
      changed: Math.abs(base - test) > 1e-9,
      baseRank: baseRanks.get(canonical.kind) ?? 1,
      testRank: testRanks.get(canonical.kind) ?? 1,
      total: pool.length,
      domain: { min, max },
    };
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/92 p-1 backdrop-blur-[2px] sm:p-2">
      <div className="pixel-card flex h-[94vh] w-[96vw] max-h-[94vh] max-w-[96vw] flex-col overflow-hidden p-3 sm:p-4">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border pb-3">
          <div>
            <div className="font-display text-sm text-primary sm:text-base">WAVE LAB</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              DEV DRAFT — enemy stats and wave composition · runtime test only
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span
              className={`pixel-chip font-mono text-[11px] ${
                draftCount > 0 || appliedCount > 0 ? "text-primary" : "text-muted-foreground"
              }`}
            >
              MODIFIED {draftCount}
              {draftDirty ? " · UNAPPLIED" : appliedCount > 0 ? " · LIVE" : ""}
            </span>
            <button type="button" className="pixel-btn px-3 py-2 text-[10px]" onClick={onClose}>
              CLOSE
            </button>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          {(["waves", "enemies", "bosses"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`pixel-btn px-3 py-2 text-[10px] ${view === v ? "pixel-btn-primary" : "text-muted-foreground"}`}
              onClick={() => setView(v)}
            >
              {v.toUpperCase()}
            </button>
          ))}
          {view === "enemies" &&
            (["editor", "compare"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`pixel-btn px-3 py-2 text-[10px] ${
                  enemySub === s ? "pixel-btn-primary" : "text-muted-foreground"
                }`}
                onClick={() => setEnemySub(s)}
              >
                {s.toUpperCase()}
              </button>
            ))}
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          {view === "waves" &&
            MAP_DEFS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`pixel-btn px-3 py-2 text-[10px] ${
                  mapFilter === m.id ? "pixel-btn-primary" : "text-muted-foreground"
                }`}
                onClick={() => setMapFilter(m.id)}
              >
                {m.name}
              </button>
            ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={view === "waves" ? "SEARCH WAVES" : "SEARCH ENEMIES"}
            className="min-w-[14rem] flex-1 border-2 border-border bg-background px-3 py-2 font-mono text-sm"
          />
        </div>

        {view === "waves" ? (
          <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-hidden md:grid-cols-[minmax(220px,0.26fr)_minmax(0,0.74fr)]">
            <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/50">
              {visibleWaves.map((n) => {
                const w = effectiveWave(map, n, draft, true);
                const active = selectedWave === n;
                const changed = waveOverrideCount(draft, map.id, n);
                return (
                  <button
                    key={n}
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5 text-left font-mono text-xs ${
                      active ? "bg-secondary text-primary" : "text-foreground hover:bg-secondary/60"
                    }`}
                    onClick={() => setSelectedWave(n)}
                  >
                    <span className="min-w-0 truncate">
                      WAVE {n}
                      <span className="ml-2 text-[10px] text-muted-foreground">{w.name}</span>
                    </span>
                    {changed > 0 && <span className="text-primary">●</span>}
                  </button>
                );
              })}
            </div>
            <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/40 p-3 sm:p-4">
              <div className="font-display text-sm text-primary">
                {map.name} · WAVE {selectedWave}
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                Shared wave formula · map tuning countMult {map.waveMods?.countMult ?? 1}, heavyDelay{" "}
                {map.waveMods?.heavyDelay ?? 0} · {lanes.rule}
              </div>
              <input
                value={liveWave.name}
                onChange={(e) => setDraft((d) => setWaveName(d, map.id, selectedWave, e.target.value, baseWave.name))}
                className="mt-3 w-full border-2 border-border bg-background px-3 py-2 font-display text-sm text-primary"
              />

              <div className="mt-4 font-display text-[11px] text-primary">COMPOSITION</div>
              <div className="mt-2 space-y-2">
                {liveWave.groups.map((g, i) => (
                  <div key={i} className="grid grid-cols-[minmax(8rem,1.2fr)_minmax(4rem,0.5fr)_minmax(5rem,0.6fr)_auto] items-center gap-2 font-mono text-sm">
                    <select
                      value={g.kind}
                      className="border-2 border-border bg-background px-2 py-1"
                      onChange={(e) =>
                        setDraft((d) => updateWaveGroup(d, map, selectedWave, i, { kind: e.target.value as EnemyKind }))
                      }
                    >
                      {kindOptions.map((k) => (
                        <option key={k} value={k}>
                          {effectiveEnemy(k, draft, true).name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={g.count}
                      className="border-2 border-border bg-background px-2 py-1"
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n) || n < 0) return;
                        setDraft((d) => updateWaveGroup(d, map, selectedWave, i, { count: Math.round(n) }));
                      }}
                    />
                    <input
                      type="number"
                      min={0}
                      title="gap ms"
                      value={g.gap}
                      className="border-2 border-border bg-background px-2 py-1"
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n) || n < 0) return;
                        setDraft((d) => updateWaveGroup(d, map, selectedWave, i, { gap: Math.round(n) }));
                      }}
                    />
                    <button
                      type="button"
                      className="pixel-btn px-2 py-1 text-[9px]"
                      onClick={() => setDraft((d) => removeWaveGroup(d, map, selectedWave, i))}
                    >
                      REMOVE
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="pixel-btn mt-3 px-3 py-2 text-[10px]"
                onClick={() => setDraft((d) => addWaveGroup(d, map, selectedWave))}
              >
                ADD ENEMY
              </button>

              <div className="mt-5 font-display text-[11px] text-primary">DERIVED</div>
              <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">
                <Stat label="Enemies" value={String(totals.count)} />
                <Stat label="Total HP" value={String(Math.round(totals.hp))} />
                <Stat label="Total bounty" value={`${totals.bounty}₽`} />
                <Stat label="Spawn duration" value={`${(totals.spawnDurationMs / 1000).toFixed(1)}s`} />
              </div>
              <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                HP uses waveScale × map hpMult ({map.hpMult}). Not a difficulty score. EHP vs 10-dmg 0-pen:{" "}
                {Math.round(totals.ehpVs10)}.
              </div>
              <div className="mt-3 flex h-3 w-full overflow-hidden border border-border">
                {totals.shares.map((s) => (
                  <div
                    key={s.kind}
                    title={`${effectiveEnemy(s.kind, draft, true).name} ${Math.round(s.share * 100)}%`}
                    className="h-full bg-primary/70"
                    style={{ width: `${s.share * 100}%`, opacity: 0.4 + s.share }}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] text-muted-foreground">
                {totals.shares.map((s) => (
                  <span key={s.kind}>
                    {effectiveEnemy(s.kind, draft, true).name.toUpperCase()} {Math.round(s.share * 100)}% ×{s.count}
                  </span>
                ))}
              </div>
              {testMsg && <div className="mt-3 font-mono text-[11px] text-primary">{testMsg}</div>}
            </div>
          </div>
        ) : view === "enemies" && enemySub === "compare" ? (
          <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
            <EnemyCompare
              all={allEnemies}
              testOf={(d) => effectiveEnemy(d.kind, draft, true)}
              displayName={(d) => effectiveEnemy(d.kind, draft, true).name}
              category={compareCategory}
              query={query}
              metric={compareMetric}
              sortDir={compareSortDir}
              selectedId={selectedKind}
              onCategory={setCompareCategory}
              onMetric={setCompareMetric}
              onSortDir={setCompareSortDir}
              onSelect={(id) => {
                setSelectedKind(id);
                setEnemySub("editor");
                setView(isBossKind(id) ? "bosses" : "enemies");
              }}
            />
          </div>
        ) : (
          <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-hidden md:grid-cols-[minmax(220px,0.26fr)_minmax(0,0.74fr)]">
            <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/50">
              {view !== "bosses" && (
                <div className="border-b border-border/70 p-2">
                  <button
                    type="button"
                    className="pixel-btn pixel-btn-primary w-full px-3 py-2 text-[10px]"
                    onClick={() => setAddMenuOpen((o) => !o)}
                  >
                    + ADD ENEMY
                  </button>
                  {addMenuOpen && (
                    <div className="mt-2 space-y-1">
                      <button
                        type="button"
                        className="pixel-btn w-full px-2 py-1.5 text-[9px]"
                        disabled={!selectedKind}
                        onClick={() => {
                          if (!selectedKind) return;
                          const r = duplicateEnemy(draft, selectedKind);
                          setDraft(r.overrides);
                          setSelectedKind(r.kind);
                          setAddMenuOpen(false);
                          setDetailTab("stats");
                          setView(isBossKind(r.kind) ? "bosses" : "enemies");
                        }}
                      >
                        DUPLICATE SELECTED
                      </button>
                      <button
                        type="button"
                        className="pixel-btn w-full px-2 py-1.5 text-[9px]"
                        onClick={() => {
                          const r = createBlankEnemy(draft);
                          setDraft(r.overrides);
                          setSelectedKind(r.kind);
                          setAddMenuOpen(false);
                          setDetailTab("stats");
                          setView("enemies");
                        }}
                      >
                        NEW BLANK
                      </button>
                    </div>
                  )}
                </div>
              )}
              {visibleEnemies.length === 0 && view === "bosses" ? (
                <div className="px-3 py-4 font-mono text-xs text-muted-foreground">NO BOSSES DEFINED</div>
              ) : (
                visibleEnemies.map((e) => {
                  const live = effectiveEnemy(e.kind, draft, true);
                  const active = selectedKind === e.kind;
                  const changed = enemyOverrideCount(draft, e.kind);
                  const behaviorLine = enemyBehaviorShortLabel(live.behavior);
                  return (
                    <button
                      key={e.kind}
                      type="button"
                      className={`flex w-full items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5 text-left font-mono text-xs ${
                        active ? "bg-secondary text-primary" : "text-foreground hover:bg-secondary/60"
                      }`}
                      onClick={() => setSelectedKind(e.kind)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{live.name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{behaviorLine}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 uppercase text-muted-foreground">
                        {changed > 0 && <span className="text-primary">● {changed}</span>}
                        <span>{e.kind}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/40 p-3 sm:p-4">
              {!canonical || !testEnemy ? (
                <div className="font-mono text-sm text-muted-foreground">
                  {view === "bosses" && enemyCatalog(true, draft).length === 0
                    ? "NO BOSSES DEFINED"
                    : "Select an enemy to edit its draft stats."}
                </div>
              ) : (
                <EnemyEditor
                  canonical={canonical}
                  test={testEnemy}
                  derived={derived}
                  draft={draft}
                  onDraft={setDraft}
                  benchOf={editorBench}
                  onOpenCompare={openCompareFromMetric}
                  detailTab={detailTab}
                  onDetailTab={setDetailTab}
                  onDeleteCustom={() => {
                    if (!selectedKind || !testEnemy.custom) return;
                    setDraft(deleteCustomEnemy(draft, selectedKind));
                    setSelectedKind(null);
                  }}
                />
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 border-t-2 border-border pt-3">
          <span className="mr-auto font-mono text-xs text-muted-foreground">
            {draftDirty ? "Unapplied draft edits" : appliedCount > 0 ? "Live test overrides active" : "No draft changes"}
          </span>
          {view === "waves" && (
            <>
              <button
                type="button"
                className="pixel-btn px-3 py-2 text-[10px]"
                disabled={!inRaid}
                title={inRaid ? "Start this wave now" : "ENTER RAID TO TEST"}
                onClick={() => {
                  const r = onTestWave(selectedWave);
                  setTestMsg(r.ok ? `TEST WAVE ${selectedWave} queued` : r.reason === "NOT_IN_RAID" ? "ENTER RAID TO TEST" : r.reason);
                }}
              >
                {inRaid ? "TEST WAVE" : "ENTER RAID TO TEST"}
              </button>
              <button type="button" className="pixel-btn px-3 py-2 text-[10px]" disabled={!inRaid} onClick={onResetTest}>
                RESET TEST
              </button>
              <button
                type="button"
                className="pixel-btn px-3 py-2 text-[10px]"
                onClick={() => applyDraft(resetWaveItem(draft, map.id, selectedWave))}
              >
                RESET WAVE
              </button>
            </>
          )}
          {(view === "enemies" || view === "bosses") && (
            <button
              type="button"
              className="pixel-btn px-3 py-2 text-[10px]"
              disabled={!selectedKind}
              onClick={() => {
                if (!selectedKind) return;
                applyDraft(resetEnemyItem(draft, selectedKind));
              }}
            >
              RESET ITEM
            </button>
          )}
          <button type="button" className="pixel-btn px-3 py-2 text-[10px]" onClick={() => applyDraft(emptyWaveLabOverrides())}>
            RESET ALL
          </button>
          <button type="button" className="pixel-btn px-3 py-2 text-[10px]" onClick={() => void exportPatch()}>
            {copied ? "COPIED" : "EXPORT PATCH"}
          </button>
          <button type="button" className="pixel-btn pixel-btn-primary px-3 py-2 text-[10px]" onClick={() => applyDraft(draft)}>
            APPLY
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-secondary/30 px-2 py-2">
      <div className="font-mono text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="font-display text-sm text-foreground">{value}</div>
    </div>
  );
}

function EnemyEditor({
  canonical,
  test,
  derived,
  draft,
  onDraft,
  benchOf,
  onOpenCompare,
  detailTab,
  onDetailTab,
  onDeleteCustom,
}: {
  canonical: EnemyDef;
  test: EnemyDef;
  derived: { base: ReturnType<typeof enemyDerived>; test: ReturnType<typeof enemyDerived> } | null;
  draft: WaveLabOverrides;
  onDraft: (d: WaveLabOverrides) => void;
  benchOf: (key: EnemyMetricKey) => {
    metric: EnemyMetricKey;
    base: number;
    test: number;
    changed: boolean;
    baseRank: number;
    testRank: number;
    total: number;
    domain: { min: number; max: number };
  } | null;
  onOpenCompare: (m: EnemyMetricKey) => void;
  detailTab: EnemyDetailTab;
  onDetailTab: (t: EnemyDetailTab) => void;
  onDeleteCustom: () => void;
}) {
  const nameChanged = test.name !== canonical.name;
  const metricForField: Record<string, EnemyMetricKey | null> = {
    hp: "hp",
    speed: "speed",
    armor: "armor",
    towerDamage: "towerDamage",
    fireRange: "fireRange",
    bounty: "bounty",
    damage: "leak",
    fireCooldown: null,
    size: null,
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(["stats", "hitbox", "behavior"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`pixel-btn px-3 py-1.5 text-[10px] ${
              detailTab === t ? "pixel-btn-primary" : "text-muted-foreground"
            }`}
            onClick={() => onDetailTab(t)}
          >
            {t === "hitbox" ? "HITBOX" : t.toUpperCase()}
          </button>
        ))}
        {test.custom && (
          <button type="button" className="pixel-btn ml-auto px-2 py-1.5 text-[9px]" onClick={onDeleteCustom}>
            DELETE CUSTOM
          </button>
        )}
      </div>

      {detailTab === "stats" && (
        <>
          <div className="mt-4 font-mono text-[11px] uppercase text-muted-foreground">Display name</div>
          <input
            value={test.name}
            onChange={(e) => onDraft(setEnemyField(draft, canonical.kind, "name", e.target.value, canonical.name))}
            className={`mt-1 w-full border-2 bg-background px-3 py-2 font-display text-sm text-primary ${
              nameChanged ? "border-primary" : "border-border"
            }`}
          />
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            {canonical.kind}
            {isBossKind(canonical.kind) ? " · boss" : ""}
            {test.custom ? " · custom" : ""}
          </div>

          <div
            className={`mt-5 grid items-center gap-x-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground ${EDITOR_COLS}`}
          >
            <span>Stat</span>
            <span>Base</span>
            <span>Delta</span>
            <span>Test value</span>
            <span>Rank</span>
          </div>
          {enemyEditorFields().map((field) => {
            const base = fieldNum(canonical, field.key);
            const current = fieldNum(test, field.key);
            const changed = current !== base;
            const tone = enemyFieldTone(field.key, base, current);
            const metric = metricForField[field.key];
            const bench = metric ? benchOf(metric) : null;
            return (
              <div
                key={field.key}
                className={`mt-1 grid items-center gap-x-3 border-b border-border/60 py-2.5 font-mono text-sm ${EDITOR_COLS}`}
              >
                <span className={changed ? "text-foreground" : "text-muted-foreground"}>{field.label}</span>
                <span className="text-muted-foreground">{base}</span>
                <span
                  className={
                    changed ? (field.key === "bounty" ? "text-primary" : balanceToneTextClass(tone)) : "text-muted-foreground"
                  }
                >
                  {changed ? `${current - base > 0 ? "+" : ""}${Math.round((current - base) * 1000) / 1000}` : "—"}
                </span>
                <input
                  type="number"
                  step={field.step}
                  min={0}
                  value={current}
                  className={`border-2 bg-background px-2 py-1.5 ${
                    field.key === "bounty"
                      ? changed
                        ? "border-primary"
                        : "border-border"
                      : balanceToneBorderClass(tone)
                  }`}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n) || n < 0) return;
                    onDraft(setEnemyField(draft, canonical.kind, field.key, n, base));
                  }}
                />
                {bench ? (
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 text-left"
                    onClick={() => metric && onOpenCompare(metric)}
                  >
                    <div className="min-w-[4.25rem] flex-1">
                      <MetricTrack
                        compact
                        min={bench.domain.min}
                        max={bench.domain.max}
                        markers={
                          bench.changed
                            ? [
                                { kind: "base", value: bench.base, title: `BASE ${bench.base}` },
                                { kind: "test", value: bench.test, title: `TEST ${bench.test}` },
                              ]
                            : [{ kind: "test", value: bench.test, title: String(bench.test) }]
                        }
                      />
                    </div>
                    <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                      {formatEnemyRank(bench.testRank, bench.total, bench.changed ? bench.baseRank : undefined)}
                    </span>
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}

          {derived && (
            <div className="mt-6 border-t-2 border-border pt-4">
              <div className="font-display text-[11px] text-primary">DERIVED</div>
              <DerivedRow
                label="Attacks / sec"
                base={derived.base.attacksPerSec}
                test={derived.test.attacksPerSec}
                fmt={(n) => n.toFixed(2)}
              />
              <DerivedRow label="Operator DPS" base={derived.base.dps} test={derived.test.dps} fmt={(n) => n.toFixed(1)} />
              <DerivedRow
                label="EHP vs 10-dmg 0-pen"
                base={derived.base.ehpVs10}
                test={derived.test.ehpVs10}
                fmt={(n) => n.toFixed(1)}
              />
              <DerivedRow
                label="Bounty / HP"
                base={derived.base.bountyPerHp}
                test={derived.test.bountyPerHp}
                fmt={(n) => n.toFixed(2)}
                tone="neutral"
              />
            </div>
          )}
        </>
      )}

      {detailTab === "hitbox" && (
        <HitboxEditor
          kind={canonical.kind}
          test={test}
          draft={draft}
          onDraft={onDraft}
        />
      )}

      {detailTab === "behavior" && (
        <BehaviorEditor kind={canonical.kind} test={test} draft={draft} onDraft={onDraft} />
      )}
    </>
  );
}

type HitboxDrag =
  | { mode: "move"; zoneId: string; grabOffX: number; grabOffY: number }
  | { mode: "resize"; zoneId: string; handle: ResizeHandle; start: EnemyHitZone };

function HitboxEditor({
  kind,
  test,
  draft,
  onDraft,
}: {
  kind: EnemyKind;
  test: EnemyDef;
  draft: WaveLabOverrides;
  onDraft: (d: WaveLabOverrides) => void;
}) {
  const zones = resolveEnemyHitZones(test.hitZones ?? defaultHitZones());
  const [selectedZone, setSelectedZone] = useState(zones[0]?.id ?? "body");
  const [gearTick, setGearTick] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<HitboxDrag | null>(null);
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const layout = useMemo(() => layoutHitboxCanvasForEnemy(test.size), [test.size]);
  const zone = zones.find((z) => z.id === selectedZone) ?? zones[0];

  useEffect(() => {
    if (!zones.some((z) => z.id === selectedZone) && zones[0]) setSelectedZone(zones[0].id);
  }, [zones, selectedZone]);

  // Retry draw until gear atlas is ready (same sheets as raid).
  useEffect(() => {
    if (gearSpritesReady()) return;
    const id = window.setInterval(() => {
      if (gearSpritesReady()) {
        setGearTick((n) => n + 1);
        window.clearInterval(id);
      }
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { canvasW: W, canvasH: H, contentLeft, contentTop, contentW, contentH } = layout;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#14120f";
    ctx.fillRect(0, 0, W, H);
    // Content AABB (matches enemyWorldBounds mapping used by combat)
    ctx.strokeStyle = "#2a2620";
    ctx.lineWidth = 1;
    ctx.strokeRect(contentLeft - 0.5, contentTop - 0.5, contentW + 1, contentH + 1);

    const cx = contentLeft + contentW / 2;
    const cy = contentTop + contentH / 2;
    // Map runtime world AABB → canvas content rect so zones align with raid collision.
    const world = enemyWorldBounds(0, 0, test.size);
    const artScale = contentW / world.width;
    const bodyW = enemyBodyDrawWidth(kind, test.size) * artScale;
    const bodyFrame = resolveEnemyBodyFrame(kind, false);
    const gunFrame = resolveEnemyGunFrame(kind, false);
    // drawEnemy centers body at (x, y-1) in world px; mirror that offset in content space.
    const artCy = cy - 1 * artScale;
    const drew = drawGear(ctx, bodyFrame, cx, artCy, bodyW, { anchor: "center" });
    if (drew) {
      ctx.save();
      ctx.translate(cx, artCy);
      const gunLen = (kind === "sniperScav" ? 13 : kind === "boss" ? 12 : 9) * artScale;
      drawGear(ctx, gunFrame, -4 * artScale, 0, gunLen + 8 * artScale);
      ctx.restore();
    } else {
      // Fallback silhouette when atlas missing — fills the same AABB zones use.
      ctx.fillStyle = test.body || "#8a7a5c";
      ctx.fillRect(contentLeft + contentW * 0.28, contentTop + contentH * 0.08, contentW * 0.44, contentH * 0.82);
      ctx.fillStyle = test.gear || "#4b4030";
      ctx.fillRect(contentLeft + contentW * 0.32, contentTop + contentH * 0.0, contentW * 0.36, contentH * 0.22);
    }

    zones.forEach((z, i) => {
      const r = zoneScreenRect(layout, z);
      const color = zoneColor(z.id, i);
      const selected = z.id === selectedZone;
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.strokeStyle = color;
      ctx.globalAlpha = z.enabled ? 0.95 : 0.35;
      if (z.shape === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(1, r.w / 2), Math.max(1, r.h / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.globalAlpha = z.enabled ? (selected ? 0.28 : 0.16) : 0.06;
        ctx.fill();
      } else {
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = color;
        ctx.globalAlpha = z.enabled ? (selected ? 0.28 : 0.16) : 0.06;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      ctx.globalAlpha = 1;
      if (selected) {
        const hs = handlePositions(layout, z);
        for (const p of Object.values(hs)) {
          ctx.fillStyle = "#f5f0e6";
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.fillRect(p.x - HITBOX_HANDLE_PX / 2, p.y - HITBOX_HANDLE_PX / 2, HITBOX_HANDLE_PX, HITBOX_HANDLE_PX);
          ctx.strokeRect(p.x - HITBOX_HANDLE_PX / 2, p.y - HITBOX_HANDLE_PX / 2, HITBOX_HANDLE_PX, HITBOX_HANDLE_PX);
        }
      }
    });
  }, [zones, selectedZone, test.body, test.gear, test.size, kind, layout, gearTick]);

  const commitZones = (next: EnemyHitZone[]) => {
    onDraft(setEnemyHitZones(draftRef.current, kind, next));
  };

  const patchZone = (patch: Partial<EnemyHitZone>) => {
    if (!zone) return;
    const merged = { ...zone, ...patch };
    const geo = clampZoneGeometry(merged);
    const next = cloneHitZones(zones).map((z) =>
      z.id === zone.id ? { ...merged, ...geo } : z,
    );
    commitZones(next);
  };

  const canvasCoords = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const sy = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { sx, sy };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = canvasCoords(e);
    const z = zone;
    if (z) {
      const handle = hitTestHandle(layout, z, sx, sy);
      if (handle) {
        dragRef.current = { mode: "resize", zoneId: z.id, handle, start: { ...z } };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (pointInZoneScreen(layout, z, sx, sy)) {
        const n = screenToNormalized(layout, sx, sy);
        dragRef.current = {
          mode: "move",
          zoneId: z.id,
          grabOffX: n.x - z.x,
          grabOffY: n.y - z.y,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    const picked = selectZoneAtScreen(zonesRef.current, layout, sx, sy);
    if (picked) {
      setSelectedZone(picked);
      const pz = zonesRef.current.find((x) => x.id === picked);
      if (pz) {
        const n = screenToNormalized(layout, sx, sy);
        dragRef.current = {
          mode: "move",
          zoneId: picked,
          grabOffX: n.x - pz.x,
          grabOffY: n.y - pz.y,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { sx, sy } = canvasCoords(e);
    const n = screenToNormalized(layout, sx, sy);
    const cur = zonesRef.current;
    const next = cloneHitZones(cur).map((z) => {
      if (z.id !== drag.zoneId) return z;
      if (drag.mode === "move") {
        const g = moveZoneByGrab(z, n.x, n.y, drag.grabOffX, drag.grabOffY);
        return { ...z, ...g };
      }
      const g = resizeZoneByHandle(drag.start, drag.handle, n.x, n.y);
      return { ...z, ...g };
    });
    commitZones(next);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <div className="mt-4">
      <div className="font-display text-[11px] text-primary">HIT ZONES</div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
        Drag / resize on sprite · size {test.size} · normalized over collision AABB
      </div>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start">
        <canvas
          ref={canvasRef}
          width={HITBOX_CANVAS_W}
          height={HITBOX_CANVAS_H}
          className="max-w-full shrink-0 cursor-crosshair border-2 border-border bg-background touch-none"
          style={{ width: HITBOX_CANVAS_W, height: HITBOX_CANVAS_H }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            {zones.map((z) => (
              <button
                key={z.id}
                type="button"
                className={`pixel-btn px-3 py-1.5 text-[10px] ${
                  selectedZone === z.id ? "pixel-btn-primary" : "text-muted-foreground"
                }`}
                onClick={() => setSelectedZone(z.id)}
              >
                {z.displayName}
              </button>
            ))}
            <button
              type="button"
              className="pixel-btn px-3 py-1.5 text-[10px] text-muted-foreground"
              onClick={() => {
                const z = newCustomHitZone(zones);
                commitZones([...cloneHitZones(zones), z]);
                setSelectedZone(z.id);
              }}
            >
              + ADD ZONE
            </button>
          </div>
          {zone && (
            <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-muted-foreground">Damage mult</span>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  value={zone.damageMult}
                  className="border-2 border-border bg-background px-2 py-1"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n) || n < 0) return;
                    patchZone({ damageMult: n });
                  }}
                />
              </label>
              <label className="flex items-end gap-2 pb-1">
                <input
                  type="checkbox"
                  checked={zone.enabled}
                  onChange={(e) => patchZone({ enabled: e.target.checked })}
                />
                <span className="text-[10px] uppercase text-muted-foreground">Enabled</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-muted-foreground">Shape</span>
                <select
                  className="border-2 border-border bg-background px-2 py-1"
                  value={zone.shape}
                  onChange={(e) =>
                    patchZone(withShape(zone, e.target.value === "rect" ? "rect" : "ellipse"))
                  }
                >
                  <option value="ellipse">ELLIPSE</option>
                  <option value="rect">RECTANGLE</option>
                </select>
              </label>
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase text-muted-foreground">{key}</span>
                  <input
                    type="number"
                    step={0.01}
                    min={0}
                    max={1}
                    value={Number(zone[key].toFixed(3))}
                    className="border-2 border-border bg-background px-2 py-1"
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      patchZone({ [key]: n });
                    }}
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-muted-foreground">Priority</span>
                <input
                  type="number"
                  step={1}
                  value={zone.priority}
                  className="border-2 border-border bg-background px-2 py-1"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    patchZone({ priority: n });
                  }}
                />
              </label>
            </div>
          )}
          <div className="mt-3 font-mono text-[10px] text-muted-foreground">
            Overlap: higher priority wins · ties use definition order. HEAD default 30 &gt; BODY 20 &gt; LEGS
            10.
          </div>
        </div>
      </div>
    </div>
  );
}

function BehaviorGroup({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <div className="border-2 border-border bg-secondary/20 p-3">
      <div className="font-display text-[11px] text-primary">{title}</div>
      {note && <div className="mt-1 font-mono text-[10px] text-muted-foreground">{note}</div>}
      <div className="mt-3 space-y-2 font-mono text-sm">{children}</div>
    </div>
  );
}

function BehaviorEditor({
  kind,
  test,
  draft,
  onDraft,
}: {
  kind: EnemyKind;
  test: EnemyDef;
  draft: WaveLabOverrides;
  onDraft: (d: WaveLabOverrides) => void;
}) {
  const behavior = test.behavior ?? builtinBehaviorForKind(kind);
  const lines = derivedBehaviorSummary(behavior);
  const onDamageInactive = behavior.onDamage === "NONE";

  const set = (patch: Partial<EnemyBehaviorConfig>) => {
    onDraft(setEnemyBehavior(draft, kind, { ...behavior, ...patch }));
  };

  const numField = (
    key: keyof EnemyBehaviorConfig,
    label: string,
    step: number,
    opts?: { muted?: boolean; suffix?: string },
  ) => (
    <label className={`flex flex-col gap-1 ${opts?.muted ? "opacity-70" : ""}`}>
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          min={0}
          value={behavior[key] as number}
          className="w-full border-2 border-border bg-background px-2 py-1"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n) || n < 0) return;
            set({ [key]: n });
          }}
        />
        {opts?.suffix && <span className="text-[10px] text-muted-foreground">{opts.suffix}</span>}
      </div>
    </label>
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="border-2 border-border bg-secondary/30 p-3">
        <div className="font-display text-[11px] text-primary">DERIVED BEHAVIOR</div>
        <ul className="mt-2 space-y-1 font-mono text-[12px] text-muted-foreground">
          {lines.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BehaviorGroup title="MOVEMENT">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-muted-foreground">Objective</span>
            <select
              className="border-2 border-border bg-background px-2 py-1"
              value={behavior.objective}
              onChange={(e) => set({ objective: e.target.value as EnemyObjective })}
            >
              <option value="ADVANCE">ADVANCE</option>
              <option value="LOOT_ESCAPE">LOOT_ESCAPE</option>
            </select>
          </label>
          {numField("normalSpeedMult", "Normal speed", 0.05, { suffix: "×" })}
          {numField("engagedSpeedMult", "Engaged speed", 0.05, { suffix: "×" })}
          {numField("lostTargetSpeedMult", "Lost-target speed", 0.05, { suffix: "×" })}
        </BehaviorGroup>

        <BehaviorGroup
          title="COMBAT / AGGRO"
          note="Can shoot / LOS / sight / memory stay independently authorable — even when Can shoot is off (future melee/aggro)."
        >
          {(
            [
              ["canShoot", "Can shoot"],
              ["requireLosToShoot", "Require LOS"],
              ["fireWhileMoving", "Fire while moving"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={behavior[key]}
                onChange={(e) => set({ [key]: e.target.checked })}
              />
              <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
            </label>
          ))}
          {numField("sightRange", "Sight range", 1)}
          {numField("targetMemoryMs", "Target memory", 50, { suffix: "ms" })}
        </BehaviorGroup>

        <BehaviorGroup title="ON DAMAGE" {...(onDamageInactive ? { note: "Reaction is NONE — speed/duration are kept for later experiments and currently have no effect." } : {})}>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-muted-foreground">Reaction</span>
            <select
              className="border-2 border-border bg-background px-2 py-1"
              value={behavior.onDamage}
              onChange={(e) => set({ onDamage: e.target.value as EnemyDamageReaction })}
            >
              {(["NONE", "SPEED_UP", "SLOW_DOWN", "REVERSE_BRIEFLY", "REROUTE"] as const).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {numField("onDamageSpeedMult", "Reaction speed", 0.05, {
            muted: onDamageInactive,
            suffix: "×",
          })}
          {numField("onDamageDurationMs", "Duration", 50, {
            muted: onDamageInactive,
            suffix: "ms",
          })}
        </BehaviorGroup>

        <BehaviorGroup
          title="NAVIGATION"
          note="Current path system does not yet support runtime rerouting — chance is authored only."
        >
          {numField("rerouteChance", "Reroute chance", 0.05, { suffix: "(0–1)" })}
        </BehaviorGroup>
      </div>
    </div>
  );
}

function DerivedRow({
  label,
  base,
  test,
  fmt,
  tone = "auto",
}: {
  label: string;
  base: number;
  test: number;
  fmt: (n: number) => string;
  tone?: "auto" | "neutral";
}) {
  const changed = Math.abs(base - test) > 1e-9;
  const t = tone === "neutral" ? "neutral" : enemyFieldTone("hp", base, test);
  return (
    <div className="mt-2 grid grid-cols-[minmax(10rem,1.2fr)_minmax(5rem,0.7fr)_minmax(7rem,1fr)] items-center gap-2 border border-border bg-secondary/30 px-3 py-2 font-mono text-sm">
      <span>{label}</span>
      <span className="text-muted-foreground">{fmt(base)}</span>
      <span className={changed && tone !== "neutral" ? balanceToneTextClass(t) : "text-foreground"}>
        {changed ? `${fmt(test)}` : fmt(test)}
      </span>
    </div>
  );
}
