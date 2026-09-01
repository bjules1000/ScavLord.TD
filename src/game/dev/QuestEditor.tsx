import { useMemo, useState, useSyncExternalStore } from "react";
import { ENEMIES } from "../data";
import { ITEMS } from "../gear";
import { MAP_DEFS } from "../map";
import {
  SUPPORTED_OBJECTIVE_TYPES,
  defaultObjective,
  defaultReward,
  evaluateQuest,
  mapSpecialZones,
  validateQuest,
  type QuestObjective,
  type QuestReward,
  type QuestSpec,
  type SupportedObjectiveType,
} from "../quests";
import type { EnemyKind } from "../types";
import {
  addDevQuest,
  applyQuestLabOverrides,
  catalogGraph,
  duplicateDevQuest,
  effectiveQuestCatalog,
  emptyQuestLabOverrides,
  formatQuestPatch,
  getQuestLabOverrides,
  getQuestTestState,
  isCanonicalQuestId,
  questLabOverridesEqual,
  questSummary,
  resetQuestItem,
  setQuestField,
  setQuestObjectives,
  setQuestPrerequisites,
  setQuestRewards,
  subscribeQuestTest,
  testEventsFor,
  type QuestLabOverrides,
  type QuestLabView,
} from "./questLab";

function snapshotTest() {
  return getQuestTestState();
}

export default function QuestEditor({
  enabled,
  inRaid,
  onClose,
  onApplied,
  onTestQuest,
  onResetTestProgress,
}: {
  enabled: boolean;
  inRaid: boolean;
  onClose: () => void;
  onApplied: (overrides: QuestLabOverrides) => void;
  onTestQuest: (questId: string) => { ok: true } | { ok: false; reason: string };
  onResetTestProgress: (questId: string) => void;
}) {
  const [view, setView] = useState<QuestLabView>("quests");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(QUEST_DEFAULT);
  const [draft, setDraft] = useState<QuestLabOverrides>(() => getQuestLabOverrides());
  const [copied, setCopied] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const testSnap = useSyncExternalStore(subscribeQuestTest, snapshotTest, snapshotTest);

  const catalog = useMemo(() => effectiveQuestCatalog(draft, true), [draft]);
  const visible = catalog.filter((q) => {
    const t = query.trim().toLowerCase();
    if (!t) return true;
    return q.name.toLowerCase().includes(t) || q.id.toLowerCase().includes(t) || q.desc.toLowerCase().includes(t);
  });
  const selected = catalog.find((q) => q.id === selectedId) ?? null;
  const validation = selected ? validateQuest(selected, catalog) : null;
  const summary = selected ? questSummary(selected, catalog) : null;
  const graph = catalogGraph(draft, true);
  const progress =
    selected && testSnap.activeId === selected.id
      ? evaluateQuest(selected, { kind: "events", events: testEventsFor(selected.id) })
      : selected
        ? evaluateQuest(selected, { kind: "events", events: testEventsFor(selected.id) })
        : null;

  if (!enabled) return null;

  const applied = getQuestLabOverrides();
  const draftDirty = !questLabOverridesEqual(draft, applied);
  const appliedCount = Object.keys(applied.quests).length;
  const draftCount = Object.keys(draft.quests).length;

  const applyDraft = (next: QuestLabOverrides) => {
    const live = applyQuestLabOverrides(next, true);
    setDraft(live);
    onApplied(live);
  };

  const exportPatch = async () => {
    const text = formatQuestPatch(getQuestLabOverrides());
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt("Copy quest patch", text);
    }
  };

  const errorN = validation?.errors.length ?? 0;
  const warnN = validation?.warnings.length ?? 0;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/92 p-1 backdrop-blur-[2px] sm:p-2">
      <div className="pixel-card flex h-[94vh] w-[96vw] max-h-[94vh] max-w-[96vw] flex-col overflow-hidden p-3 sm:p-4">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border pb-3">
          <div>
            <div className="font-display text-sm text-primary sm:text-base">QUEST EDITOR</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              DEV DRAFT — quest definitions · runtime test only
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {selected && validation && (
              <span
                className={`pixel-chip font-mono text-[11px] ${
                  errorN ? "text-destructive" : warnN ? "text-primary" : "text-accent"
                }`}
              >
                {errorN ? `${errorN} ERROR${errorN === 1 ? "" : "S"}` : "VALID ✓"}
                {warnN ? ` · ${warnN} WARNING${warnN === 1 ? "" : "S"}` : ""}
              </span>
            )}
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
          {(["quests", "validation"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`pixel-btn px-3 py-2 text-[10px] ${view === v ? "pixel-btn-primary" : "text-muted-foreground"}`}
              onClick={() => setView(v)}
            >
              {v === "validation" ? "VALIDATION / GRAPH" : "QUESTS"}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SEARCH QUESTS"
            className="min-w-[14rem] flex-1 border-2 border-border bg-background px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            className="pixel-btn px-3 py-2 text-[10px]"
            onClick={() => {
              const r = addDevQuest(draft);
              setDraft(r.overrides);
              setSelectedId(r.id);
            }}
          >
            NEW QUEST
          </button>
          <button
            type="button"
            className="pixel-btn px-3 py-2 text-[10px]"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              const r = duplicateDevQuest(draft, selected.id);
              if (!r) return;
              setDraft(r.overrides);
              setSelectedId(r.id);
            }}
          >
            DUPLICATE
          </button>
        </div>

        {view === "validation" ? (
          <div className="pixel-scrollbar mt-3 min-h-0 flex-1 overflow-auto border-2 border-border bg-background/40 p-4">
            <div className="font-display text-sm text-primary">PREREQUISITE GRAPH</div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
              Depth order · ALL objectives required · no branching
            </div>
            {graph.duplicates.length > 0 && (
              <div className="mt-3 font-mono text-sm text-destructive">DUPLICATE IDS: {graph.duplicates.join(", ")}</div>
            )}
            {graph.missing.length > 0 && (
              <div className="mt-2 font-mono text-sm text-destructive">ORPHAN PREREQS: {graph.missing.join(", ")}</div>
            )}
            {graph.cycles.length > 0 && (
              <div className="mt-2 font-mono text-sm text-destructive">
                CYCLES: {graph.cycles.map((c) => c.join(" → ")).join(" · ")}
              </div>
            )}
            <div className="mt-4 space-y-1 font-mono text-sm">
              <div className="text-muted-foreground">START</div>
              {graph.order.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={`block w-full text-left ${selectedId === node.id ? "text-primary" : "text-foreground"}`}
                  onClick={() => {
                    setSelectedId(node.id);
                    setView("quests");
                  }}
                >
                  {" ↓".repeat(Math.min(6, node.depth))} {node.name || node.id}{" "}
                  <span className="text-[10px] text-muted-foreground">({node.id})</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-hidden md:grid-cols-[minmax(220px,0.26fr)_minmax(0,0.74fr)]">
            <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/50">
              {visible.map((q) => {
                const active = selectedId === q.id;
                const changed = !!draft.quests[q.id];
                return (
                  <button
                    key={q.id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5 text-left font-mono text-xs ${
                      active ? "bg-secondary text-primary" : "text-foreground hover:bg-secondary/60"
                    }`}
                    onClick={() => setSelectedId(q.id)}
                  >
                    <span className="min-w-0 truncate">
                      {q.name || "(unnamed)"}
                      <span className="ml-2 text-[10px] text-muted-foreground">{q.id}</span>
                    </span>
                    {changed && <span className="text-primary">●</span>}
                  </button>
                );
              })}
            </div>
            <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/40 p-3 sm:p-4">
              {!selected ? (
                <div className="font-mono text-sm text-muted-foreground">Select a quest.</div>
              ) : (
                <QuestDetails
                  spec={selected}
                  catalog={catalog}
                  draft={draft}
                  onDraft={setDraft}
                  summary={summary}
                  validation={validation}
                  progress={progress}
                  testActive={testSnap.activeId === selected.id}
                  testMsg={testMsg}
                />
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 border-t-2 border-border pt-3">
          <span className="mr-auto font-mono text-xs text-muted-foreground">
            {draftDirty ? "Unapplied draft edits" : appliedCount > 0 ? "Live test overrides active" : "No draft changes"}
          </span>
          <button
            type="button"
            className="pixel-btn px-3 py-2 text-[10px]"
            disabled={!inRaid || !selected}
            title={inRaid ? "Activate this quest for DEV testing" : "ENTER RAID TO TEST"}
            onClick={() => {
              if (!selected) return;
              const r = onTestQuest(selected.id);
              setTestMsg(
                r.ok ? `TEST QUEST ${selected.id} active` : r.reason === "NOT_IN_RAID" ? "ENTER RAID TO TEST" : r.reason,
              );
            }}
          >
            {inRaid ? "TEST QUEST" : "ENTER RAID TO TEST"}
          </button>
          <button
            type="button"
            className="pixel-btn px-3 py-2 text-[10px]"
            disabled={!selected}
            onClick={() => selected && onResetTestProgress(selected.id)}
          >
            RESET TEST PROGRESS
          </button>
          <button
            type="button"
            className="pixel-btn px-3 py-2 text-[10px]"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              const next = resetQuestItem(draft, selected.id);
              applyDraft(next);
              if (!isCanonicalQuestId(selected.id) && !next.quests[selected.id]) {
                setSelectedId(QUEST_DEFAULT);
              }
            }}
          >
            RESET QUEST
          </button>
          <button type="button" className="pixel-btn px-3 py-2 text-[10px]" onClick={() => applyDraft(emptyQuestLabOverrides())}>
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

const QUEST_DEFAULT = "debut";

function QuestDetails({
  spec,
  catalog,
  draft,
  onDraft,
  summary,
  validation,
  progress,
  testActive,
  testMsg,
}: {
  spec: QuestSpec;
  catalog: QuestSpec[];
  draft: QuestLabOverrides;
  onDraft: (d: QuestLabOverrides) => void;
  summary: ReturnType<typeof questSummary> | null;
  validation: ReturnType<typeof validateQuest> | null;
  progress: ReturnType<typeof evaluateQuest> | null;
  testActive: boolean;
  testMsg: string | null;
}) {
  const canonical = isCanonicalQuestId(spec.id);
  const zones = spec.mapId ? mapSpecialZones(spec.mapId) : [];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block font-mono text-[11px] uppercase text-muted-foreground">
          ID
          <input
            value={spec.id}
            disabled={canonical}
            onChange={(e) => onDraft(setQuestField(draft, spec.id, "id", e.target.value))}
            className="mt-1 w-full border-2 border-border bg-background px-3 py-2 font-mono text-sm text-primary disabled:opacity-60"
          />
        </label>
        <label className="block font-mono text-[11px] uppercase text-muted-foreground">
          Map requirement
          <select
            value={spec.mapId ?? ""}
            onChange={(e) => onDraft(setQuestField(draft, spec.id, "mapId", e.target.value))}
            className="mt-1 w-full border-2 border-border bg-background px-3 py-2 font-mono text-sm"
          >
            <option value="">ANY / NONE</option>
            {MAP_DEFS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 block font-mono text-[11px] uppercase text-muted-foreground">
        Name
        <input
          value={spec.name}
          onChange={(e) => onDraft(setQuestField(draft, spec.id, "name", e.target.value))}
          className="mt-1 w-full border-2 border-border bg-background px-3 py-2 font-display text-sm text-primary"
        />
      </label>
      <label className="mt-3 block font-mono text-[11px] uppercase text-muted-foreground">
        Description
        <textarea
          value={spec.desc}
          onChange={(e) => onDraft(setQuestField(draft, spec.id, "desc", e.target.value))}
          rows={2}
          className="mt-1 w-full border-2 border-border bg-background px-3 py-2 font-mono text-sm"
        />
      </label>

      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
          <Stat label="Objectives" value={String(summary.objectiveCount)} />
          <Stat label="Rewards" value={String(summary.rewardCount)} />
          <Stat label="Prereqs" value={String(summary.prerequisiteCount)} />
          <Stat label="Status" value={summary.valid ? "VALID" : "INVALID"} />
        </div>
      )}

      <div className="mt-5 font-display text-[11px] text-primary">OBJECTIVES · ALL REQUIRED</div>
      <div className="mt-2 space-y-2">
        {spec.objectives.map((o, i) => (
          <ObjectiveCard
            key={i}
            objective={o}
            {...(spec.mapId ? { mapId: spec.mapId } : {})}
            onChange={(next) => {
              const list = spec.objectives.map((cur, j) => (j === i ? next : cur));
              onDraft(setQuestObjectives(draft, spec.id, list));
            }}
            onRemove={() => onDraft(setQuestObjectives(draft, spec.id, spec.objectives.filter((_, j) => j !== i)))}
          />
        ))}
      </div>
      <button
        type="button"
        className="pixel-btn mt-2 px-3 py-2 text-[10px]"
        onClick={() => onDraft(setQuestObjectives(draft, spec.id, [...spec.objectives, defaultObjective()]))}
      >
        ADD OBJECTIVE
      </button>

      <div className="mt-5 font-display text-[11px] text-primary">REWARDS</div>
      <div className="mt-2 space-y-2">
        {spec.rewards.map((r, i) => (
          <RewardCard
            key={i}
            reward={r}
            onChange={(next) => {
              const list = spec.rewards.map((cur, j) => (j === i ? next : cur));
              onDraft(setQuestRewards(draft, spec.id, list));
            }}
            onRemove={() => onDraft(setQuestRewards(draft, spec.id, spec.rewards.filter((_, j) => j !== i)))}
          />
        ))}
      </div>
      <button
        type="button"
        className="pixel-btn mt-2 px-3 py-2 text-[10px]"
        onClick={() => onDraft(setQuestRewards(draft, spec.id, [...spec.rewards, defaultReward()]))}
      >
        ADD REWARD
      </button>

      <div className="mt-5 font-display text-[11px] text-primary">PREREQUISITES</div>
      <div className="mt-2 space-y-2">
        {spec.prerequisites.map((pre, i) => (
          <div key={i} className="flex gap-2">
            <select
              value={pre}
              className="flex-1 border-2 border-border bg-background px-2 py-1 font-mono text-sm"
              onChange={(e) => {
                const next = spec.prerequisites.map((p, j) => (j === i ? e.target.value : p));
                onDraft(setQuestPrerequisites(draft, spec.id, next));
              }}
            >
              {catalog
                .filter((q) => q.id !== spec.id || q.id === pre)
                .map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name || q.id}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="pixel-btn px-2 py-1 text-[9px]"
              onClick={() =>
                onDraft(setQuestPrerequisites(draft, spec.id, spec.prerequisites.filter((_, j) => j !== i)))
              }
            >
              REMOVE
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="pixel-btn mt-2 px-3 py-2 text-[10px]"
        onClick={() => {
          const other = catalog.find((q) => q.id !== spec.id);
          if (!other) return;
          onDraft(setQuestPrerequisites(draft, spec.id, [...spec.prerequisites, other.id]));
        }}
      >
        ADD PREREQUISITE
      </button>

      {zones.length > 0 && (
        <div className="mt-5 font-mono text-[11px] text-muted-foreground">
          MAP ZONES (authored, not consumed by raid gameplay):{" "}
          {zones.map((z) => `${z.name} [${z.id}]`).join(" · ")}
        </div>
      )}

      {progress && (
        <div className="mt-5 border-t-2 border-border pt-3">
          <div className="font-display text-[11px] text-primary">
            PROGRESS {testActive ? "· TEST ACTIVE" : progress.objectives.some((o) => o.current > 0) ? "" : "· idle"}
          </div>
          {progress.objectives.map((o, i) => (
            <div key={i} className="mt-1 font-mono text-sm">
              {o.label} {o.done ? "✓" : `${o.current} / ${o.required}`}
            </div>
          ))}
        </div>
      )}

      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="mt-4 space-y-1 font-mono text-[11px]">
          {validation.errors.map((e, i) => (
            <div key={`e${i}`} className="text-destructive">
              ERROR {e.message}
            </div>
          ))}
          {validation.warnings.map((w, i) => (
            <div key={`w${i}`} className="text-muted-foreground">
              WARN {w.message}
            </div>
          ))}
        </div>
      )}
      {testMsg && <div className="mt-3 font-mono text-[11px] text-primary">{testMsg}</div>}
    </>
  );
}

function ObjectiveCard({
  objective,
  mapId,
  onChange,
  onRemove,
}: {
  objective: QuestObjective;
  mapId?: string;
  onChange: (o: QuestObjective) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border-2 border-border bg-secondary/20 p-3">
      <div className="flex items-center justify-between">
        <div className="font-display text-[10px] text-primary">OBJECTIVE</div>
        <button type="button" className="pixel-btn px-2 py-1 text-[9px]" onClick={onRemove}>
          REMOVE
        </button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="font-mono text-[10px] uppercase text-muted-foreground">
          Type
          <select
            value={objective.type}
            className="mt-1 w-full border-2 border-border bg-background px-2 py-1 text-sm"
            onChange={(e) => onChange(switchObjectiveType(objective, e.target.value as SupportedObjectiveType))}
          >
            {SUPPORTED_OBJECTIVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="font-mono text-[10px] uppercase text-muted-foreground">
          Map
          <select
            value={"mapId" in objective ? (objective.mapId ?? "") : ""}
            className="mt-1 w-full border-2 border-border bg-background px-2 py-1 text-sm"
            onChange={(e) => onChange(withMap(objective, e.target.value || undefined))}
          >
            <option value="">{mapId ? `QUEST MAP (${mapId})` : "ANY"}</option>
            {MAP_DEFS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {objective.type === "KILL" && (
          <>
            <label className="font-mono text-[10px] uppercase text-muted-foreground">
              Enemy
              <select
                value={objective.enemyId ?? ""}
                className="mt-1 w-full border-2 border-border bg-background px-2 py-1 text-sm"
                onChange={(e) => {
                  const next: QuestObjective = { type: "KILL", count: objective.count };
                  if (objective.mapId) next.mapId = objective.mapId;
                  if (e.target.value) next.enemyId = e.target.value as EnemyKind;
                  onChange(next);
                }}
              >
                <option value="">ANY NON-BOSS</option>
                {Object.values(ENEMIES).map((en) => (
                  <option key={en.kind} value={en.kind}>
                    {en.name}
                  </option>
                ))}
              </select>
            </label>
            <CountField
              value={objective.count}
              onChange={(n) => {
                const next: QuestObjective = { type: "KILL", count: n };
                if (objective.enemyId) next.enemyId = objective.enemyId;
                if (objective.mapId) next.mapId = objective.mapId;
                onChange(next);
              }}
            />
          </>
        )}
        {objective.type === "KILL_BOSS" && (
          <CountField
            value={objective.count}
            onChange={(n) => {
              const next: QuestObjective = { type: "KILL_BOSS", count: n };
              if (objective.mapId) next.mapId = objective.mapId;
              onChange(next);
            }}
          />
        )}
        {(objective.type === "REACH_WAVE" || objective.type === "COMPLETE_WAVE") && (
          <label className="font-mono text-[10px] uppercase text-muted-foreground">
            Wave
            <input
              type="number"
              min={1}
              value={objective.wave}
              className="mt-1 w-full border-2 border-border bg-background px-2 py-1 text-sm"
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                const next: QuestObjective =
                  objective.type === "REACH_WAVE"
                    ? { type: "REACH_WAVE", wave: Math.round(n) }
                    : { type: "COMPLETE_WAVE", wave: Math.round(n) };
                if (objective.mapId) next.mapId = objective.mapId;
                onChange(next);
              }}
            />
          </label>
        )}
        {objective.type === "EXTRACT" && (
          <CountField
            value={objective.count}
            onChange={(n) => {
              const next: QuestObjective = { type: "EXTRACT", count: n };
              if (objective.mapId) next.mapId = objective.mapId;
              onChange(next);
            }}
          />
        )}
        {objective.type === "EXTRACT_ITEM" && (
          <>
            <label className="font-mono text-[10px] uppercase text-muted-foreground">
              Item
              <select
                value={objective.itemId}
                className="mt-1 w-full border-2 border-border bg-background px-2 py-1 text-sm"
                onChange={(e) => {
                  const next: QuestObjective = { type: "EXTRACT_ITEM", itemId: e.target.value, count: objective.count };
                  if (objective.mapId) next.mapId = objective.mapId;
                  onChange(next);
                }}
              >
                {ITEMS.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </select>
            </label>
            <CountField
              value={objective.count}
              onChange={(n) => {
                const next: QuestObjective = { type: "EXTRACT_ITEM", itemId: objective.itemId, count: n };
                if (objective.mapId) next.mapId = objective.mapId;
                onChange(next);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function RewardCard({
  reward,
  onChange,
  onRemove,
}: {
  reward: QuestReward;
  onChange: (r: QuestReward) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-2 border-border bg-secondary/20 p-2">
      <select
        value={reward.type}
        className="border-2 border-border bg-background px-2 py-1 font-mono text-sm"
        onChange={(e) => {
          const t = e.target.value;
          if (t === "UNLOCK") onChange({ type: "UNLOCK", itemId: ITEMS[0]?.id ?? "m_ifak" });
          else if (t === "SKILL_POINTS") onChange({ type: "SKILL_POINTS", amount: 1 });
          else onChange({ type: "ROUBLES", amount: 0 });
        }}
      >
        <option value="ROUBLES">ROUBLES</option>
        <option value="SKILL_POINTS">SKILL POINTS</option>
        <option value="UNLOCK">UNLOCK ITEM</option>
      </select>
      {(reward.type === "ROUBLES" || reward.type === "SKILL_POINTS") && (
        <input
          type="number"
          min={0}
          value={reward.amount}
          className="w-28 border-2 border-border bg-background px-2 py-1 font-mono text-sm"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n) || n < 0) return;
            onChange({ type: reward.type, amount: Math.round(n) });
          }}
        />
      )}
      {reward.type === "UNLOCK" && (
        <select
          value={reward.itemId}
          className="min-w-[10rem] flex-1 border-2 border-border bg-background px-2 py-1 font-mono text-sm"
          onChange={(e) => onChange({ type: "UNLOCK", itemId: e.target.value })}
        >
          {ITEMS.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name}
            </option>
          ))}
        </select>
      )}
      <button type="button" className="pixel-btn ml-auto px-2 py-1 text-[9px]" onClick={onRemove}>
        REMOVE
      </button>
    </div>
  );
}

function CountField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="font-mono text-[10px] uppercase text-muted-foreground">
      Count
      <input
        type="number"
        min={1}
        value={value}
        className="mt-1 w-full border-2 border-border bg-background px-2 py-1 text-sm"
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.round(n));
        }}
      />
    </label>
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

function switchObjectiveType(prev: QuestObjective, type: SupportedObjectiveType): QuestObjective {
  const mapId = "mapId" in prev ? prev.mapId : undefined;
  const count = "count" in prev && typeof prev.count === "number" ? prev.count : 1;
  const wave = "wave" in prev ? prev.wave : 1;
  if (type === "KILL") {
    const next: QuestObjective = { type: "KILL", count };
    if (mapId) next.mapId = mapId;
    return next;
  }
  if (type === "KILL_BOSS") {
    const next: QuestObjective = { type: "KILL_BOSS", count };
    if (mapId) next.mapId = mapId;
    return next;
  }
  if (type === "REACH_WAVE") {
    const next: QuestObjective = { type: "REACH_WAVE", wave };
    if (mapId) next.mapId = mapId;
    return next;
  }
  if (type === "COMPLETE_WAVE") {
    const next: QuestObjective = { type: "COMPLETE_WAVE", wave };
    if (mapId) next.mapId = mapId;
    return next;
  }
  if (type === "EXTRACT") {
    const next: QuestObjective = { type: "EXTRACT", count };
    if (mapId) next.mapId = mapId;
    return next;
  }
  const next: QuestObjective = { type: "EXTRACT_ITEM", itemId: ITEMS[0]?.id ?? "m_ifak", count };
  if (mapId) next.mapId = mapId;
  return next;
}

function withMap(o: QuestObjective, mapId: string | undefined): QuestObjective {
  if (o.type === "USE_DEFENSE") return o;
  if (o.type === "VISIT_ZONE" || o.type === "DEFEND_ZONE") {
    return { ...o, mapId: mapId ?? o.mapId };
  }
  if (mapId) return { ...o, mapId };
  const { mapId: _drop, ...rest } = o;
  return rest as QuestObjective;
}
