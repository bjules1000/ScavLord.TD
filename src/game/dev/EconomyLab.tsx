import { useMemo, useState } from "react";
import { CANONICAL_LOOT_RULES, RAID_SCRAP_MULT, raidScrapValue, type LootRules } from "../loot";
import { MAP_DEFS } from "../map";
import {
  ECONOMY_CATEGORIES,
  applyEconomyOverrides,
  canonicalItem,
  crateEvForSource,
  economyLabCatalog,
  economyOverridesEqual,
  effectiveItemDef,
  effectiveLootMult,
  effectiveLootRules,
  filterEconomyCatalog,
  filterLootSources,
  formatEconomyPatch,
  getEconomyOverrides,
  itemEconomyFields,
  itemOverrideCount,
  itemSourceRows,
  lootSourceCatalog,
  lootTableEntries,
  modifiedEconomyCount,
  resetEconomyItem,
  resetEconomyTable,
  rewardEvForSource,
  setItemEconomyField,
  setItemWeight,
  setLootRule,
  setMapLootMult,
  sourceMapsLabel,
  type EconomyCategory,
  type EconomyLabView,
  type EconomyOverrides,
  type LootSource,
  type LootSourceFilter,
  emptyEconomyOverrides,
} from "./economy";

const EDITOR_COLS =
  "grid-cols-[minmax(8rem,1.1fr)_minmax(3.5rem,0.5fr)_minmax(5rem,0.7fr)_minmax(6rem,0.8fr)]";
const TABLE_COLS =
  "grid-cols-[minmax(7rem,1.2fr)_minmax(3.2rem,0.45fr)_minmax(4.2rem,0.55fr)_minmax(4.5rem,0.6fr)_minmax(5rem,0.7fr)]";

const RULE_FIELDS: Array<{ key: keyof LootRules; label: string; step: number }> = [
  { key: "weaponChanceBase", label: "Weapon base chance", step: 0.01 },
  { key: "weaponChancePerWave", label: "Weapon per wave", step: 0.001 },
  { key: "weaponChanceCap", label: "Weapon chance cap", step: 0.01 },
  { key: "restAttachment", label: "Rest band: attachments", step: 0.01 },
  { key: "restArmor", label: "Rest band: through armor", step: 0.01 },
  { key: "restMeds", label: "Rest band: through meds", step: 0.01 },
  { key: "rarityWaveFactor", label: "Rarity wave factor", step: 0.001 },
  { key: "rarityRareAt", label: "Rare threshold", step: 0.01 },
  { key: "rarityEpicAt", label: "Epic threshold", step: 0.01 },
  { key: "crateExtraChance", label: "Crate extra-item chance", step: 0.05 },
  { key: "waveRewardSlots", label: "Wave reward slots", step: 1 },
];

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function roubles(n: number): string {
  return `${Math.round(n).toLocaleString()}₽`;
}

function changedClass(changed: boolean): string {
  return changed ? "border-primary text-foreground" : "border-border text-muted-foreground";
}

export default function EconomyLab({
  enabled,
  onClose,
  onApplied,
}: {
  enabled: boolean;
  onClose: () => void;
  onApplied: (overrides: EconomyOverrides) => void;
}) {
  const [view, setView] = useState<EconomyLabView>("items");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EconomyCategory>("ALL");
  const [sourceFilter, setSourceFilter] = useState<LootSourceFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EconomyOverrides>(() => getEconomyOverrides());
  const [copied, setCopied] = useState(false);
  const [wave, setWave] = useState(1);

  const catalog = useMemo(() => economyLabCatalog(), []);
  const visibleItems = useMemo(
    () => filterEconomyCatalog(catalog, category, query),
    [catalog, category, query],
  );
  const sources = useMemo(() => lootSourceCatalog(), []);
  const visibleSources = useMemo(
    () => filterLootSources(sources, sourceFilter, query),
    [sources, sourceFilter, query],
  );

  if (!enabled) return null;

  const applied = getEconomyOverrides();
  const appliedCount = modifiedEconomyCount(applied);
  const draftCount = modifiedEconomyCount(draft);
  const draftDirty = !economyOverridesEqual(draft, applied);

  const canonical = selectedId ? canonicalItem(selectedId) : undefined;
  const liveItem = selectedId ? effectiveItemDef(selectedId, draft, true) : undefined;
  const itemFields = canonical ? itemEconomyFields(canonical) : [];
  const sourceRows = selectedId ? itemSourceRows(selectedId, draft, true, wave) : [];
  const selectedItemChanged = selectedId ? itemOverrideCount(draft, selectedId) : 0;

  const selectedSource = sources.find((s) => s.id === selectedSourceId) ?? null;
  const tableEntries = selectedSourceId ? lootTableEntries(selectedSourceId, draft, true, wave) : [];
  const crateEv = selectedSourceId ? crateEvForSource(selectedSourceId, draft, true, wave) : null;
  const rewardEv = selectedSourceId ? rewardEvForSource(selectedSourceId, draft, true, wave) : null;
  const liveRules = effectiveLootRules(draft, true);

  const applyDraft = (next: EconomyOverrides) => {
    const live = applyEconomyOverrides(next, true);
    setDraft(live);
    onApplied(live);
  };

  const exportPatch = async () => {
    const text = formatEconomyPatch(getEconomyOverrides());
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt("Copy economy patch", text);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/92 p-1 backdrop-blur-[2px] sm:p-2">
      <div className="pixel-card flex h-[94vh] w-[96vw] max-h-[94vh] max-w-[96vw] flex-col overflow-hidden p-3 sm:p-4">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border pb-3">
          <div>
            <div className="font-display text-sm text-primary sm:text-base">ECONOMY LAB</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              DEV DRAFT — runtime test values only · basis: item value (sell/stash)
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
          {(["items", "tables"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`pixel-btn px-3 py-2 text-[10px] ${
                view === v ? "pixel-btn-primary" : "text-muted-foreground"
              }`}
              onClick={() => setView(v)}
            >
              {v === "items" ? "ITEMS" : "LOOT TABLES"}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            WAVE
            <input
              type="number"
              min={1}
              max={40}
              value={wave}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 1) setWave(Math.round(n));
              }}
              className="w-16 border-2 border-border bg-background px-2 py-1 text-foreground"
            />
          </label>
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          {view === "items"
            ? ECONOMY_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`pixel-btn px-3 py-2 text-[10px] ${
                    category === cat ? "pixel-btn-primary" : "text-muted-foreground"
                  }`}
                  onClick={() => setCategory(cat)}
                >
                  {cat === "LOOT" ? "VALUABLES / LOOT" : cat}
                </button>
              ))
            : (["ALL", "MAP", "CRATE", "REWARD"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`pixel-btn px-3 py-2 text-[10px] ${
                    sourceFilter === f ? "pixel-btn-primary" : "text-muted-foreground"
                  }`}
                  onClick={() => setSourceFilter(f)}
                >
                  {f}
                </button>
              ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={view === "items" ? "SEARCH ITEMS" : "SEARCH SOURCES"}
            className="min-w-[14rem] flex-1 border-2 border-border bg-background px-3 py-2 font-mono text-sm"
          />
        </div>

        {view === "items" ? (
          <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-hidden md:grid-cols-[minmax(240px,0.28fr)_minmax(0,0.72fr)]">
            <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/50">
              {visibleItems.map((entry) => {
                const changed = itemOverrideCount(draft, entry.id);
                const active = selectedId === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5 text-left font-mono text-xs ${
                      active ? "bg-secondary text-primary" : "text-foreground hover:bg-secondary/60"
                    }`}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <span className="min-w-0 truncate">{entry.name}</span>
                    <span className="flex shrink-0 items-center gap-2 uppercase text-muted-foreground">
                      {changed > 0 && <span className="text-primary">● {changed}</span>}
                      <span>{entry.kind}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/40 p-3 sm:p-4">
              {!canonical || !liveItem ? (
                <div className="font-mono text-sm text-muted-foreground">
                  Select an item to inspect its value and sources.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <div className="font-display text-sm text-primary">{liveItem.name}</div>
                      <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                        {liveItem.kind} · {liveItem.id} · {liveItem.rarity}
                        {selectedItemChanged > 0 ? ` · ${selectedItemChanged} changed` : ""}
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">{liveItem.desc}</div>
                  </div>

                  <div className={`mt-5 grid items-center gap-x-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground ${EDITOR_COLS}`}>
                    <span>Field</span>
                    <span>Base</span>
                    <span>Delta</span>
                    <span>Test value</span>
                  </div>
                  {itemFields.map((field) => {
                    const base = (canonical[field.key] as number | undefined) ?? 0;
                    const current = (liveItem[field.key] as number | undefined) ?? base;
                    const changed = !Object.is(current, base);
                    const delta = current - base;
                    return (
                      <div
                        key={field.key}
                        className={`mt-1 grid items-center gap-x-3 border-b border-border/60 py-2.5 font-mono text-sm ${EDITOR_COLS}`}
                      >
                        <span className={changed ? "text-foreground" : "text-muted-foreground"}>{field.label}</span>
                        <span className="text-muted-foreground">{base}</span>
                        <span className={changed ? "text-primary" : "text-muted-foreground"}>
                          {changed ? `→ ${current} (${delta > 0 ? "+" : ""}${delta})` : "—"}
                        </span>
                        <input
                          type="number"
                          step={field.step}
                          min={0}
                          value={current}
                          className={`w-full min-w-[6.5rem] border-2 bg-background px-2 py-1.5 ${changedClass(changed)}`}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            const result = setItemEconomyField(draft, canonical.id, field.key, n, base);
                            if (result.ok) setDraft(result.overrides);
                          }}
                        />
                      </div>
                    );
                  })}

                  <div className="mt-4 font-mono text-[11px] text-muted-foreground">
                    Raid scrap (derived): {roubles(raidScrapValue(liveItem.value))} = value × {RAID_SCRAP_MULT}. Not a
                    separate canonical field. Charisma sell/buy multipliers are player skills, not item economy.
                  </div>

                  <div className="mt-6 border-t-2 border-border pt-4">
                    <div className="font-display text-[11px] text-primary">SOURCES</div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      Where this item can currently come from. Enemy / boss / quest drops: NOT IMPLEMENTED.
                    </div>
                    {sourceRows.length === 0 ? (
                      <div className="mt-3 font-mono text-sm text-muted-foreground">No canonical loot or shop source.</div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {sourceRows.map((row) => (
                          <div
                            key={`${row.sourceId}:${row.label}`}
                            className="border border-border bg-secondary/30 px-3 py-2.5 font-mono text-sm"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="text-foreground">{row.label}</span>
                              {row.shared && (
                                <span className="text-[10px] uppercase text-muted-foreground">
                                  Shared{row.mapNames.length ? ` · ${row.mapNames.join(", ")}` : ""}
                                </span>
                              )}
                            </div>
                            {row.type === "shop" ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">Buyable when unlocked</div>
                            ) : (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                Weight {row.weight} · pool share {pct(row.poolShare)} · first-slot {pct(row.firstSlotChance)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-hidden md:grid-cols-[minmax(240px,0.28fr)_minmax(0,0.72fr)]">
            <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/50">
              {visibleSources.map((source) => {
                const active = selectedSourceId === source.id;
                return (
                  <button
                    key={source.id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5 text-left font-mono text-xs ${
                      active ? "bg-secondary text-primary" : "text-foreground hover:bg-secondary/60"
                    }`}
                    onClick={() => setSelectedSourceId(source.id)}
                  >
                    <span className="min-w-0 truncate">{source.label}</span>
                    <span className="shrink-0 uppercase text-muted-foreground">{source.type}</span>
                  </button>
                );
              })}
            </div>
            <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/40 p-3 sm:p-4">
              {!selectedSource ? (
                <div className="font-mono text-sm text-muted-foreground">
                  Select a crate, reward, shop, or map source.
                </div>
              ) : (
                <TablePanel
                  source={selectedSource}
                  entries={tableEntries}
                  draft={draft}
                  liveRules={liveRules}
                  crateEv={crateEv}
                  rewardEv={rewardEv}
                  wave={wave}
                  onDraft={setDraft}
                />
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 border-t-2 border-border pt-3">
          <span className="mr-auto font-mono text-xs text-muted-foreground">
            {draftDirty
              ? "Unapplied draft edits"
              : appliedCount > 0
                ? "Live test overrides active"
                : "No draft changes"}
            {view === "tables" ? " · ADD/REMOVE deferred (shared procedural pool)" : ""}
          </span>
          {view === "items" ? (
            <button
              type="button"
              className="pixel-btn px-3 py-2 text-[10px]"
              disabled={!selectedId}
              onClick={() => {
                if (!selectedId) return;
                applyDraft(resetEconomyItem(getEconomyOverrides(), selectedId));
              }}
            >
              RESET ITEM
            </button>
          ) : (
            <button
              type="button"
              className="pixel-btn px-3 py-2 text-[10px]"
              disabled={!selectedSourceId}
              onClick={() => {
                if (!selectedSourceId) return;
                applyDraft(resetEconomyTable(getEconomyOverrides(), selectedSourceId));
              }}
            >
              RESET TABLE
            </button>
          )}
          <button
            type="button"
            className="pixel-btn px-3 py-2 text-[10px]"
            onClick={() => applyDraft(emptyEconomyOverrides())}
          >
            RESET ALL
          </button>
          <button type="button" className="pixel-btn px-3 py-2 text-[10px]" onClick={() => void exportPatch()}>
            {copied ? "COPIED" : "EXPORT PATCH"}
          </button>
          <button
            type="button"
            className="pixel-btn pixel-btn-primary px-3 py-2 text-[10px]"
            onClick={() => applyDraft(draft)}
          >
            APPLY
          </button>
        </div>
      </div>
    </div>
  );
}

function TablePanel({
  source,
  entries,
  draft,
  liveRules,
  crateEv,
  rewardEv,
  wave,
  onDraft,
}: {
  source: LootSource;
  entries: ReturnType<typeof lootTableEntries>;
  draft: EconomyOverrides;
  liveRules: LootRules;
  crateEv: ReturnType<typeof crateEvForSource>;
  rewardEv: ReturnType<typeof rewardEvForSource>;
  wave: number;
  onDraft: (next: EconomyOverrides) => void;
}) {
  const map = source.type === "map" ? MAP_DEFS.find((m) => m.id === source.mapIds[0]) : undefined;
  const showWeights = source.type === "crate" || source.type === "reward" || source.type === "map";
  const showRules = source.type === "crate" || source.type === "reward";

  return (
    <>
      <div className="font-display text-sm text-primary">{source.label}</div>
      <div className="mt-1 font-mono text-[11px] text-muted-foreground">{sourceMapsLabel(source)}</div>
      <div className="mt-2 font-mono text-[11px] text-muted-foreground">
        Mechanic: kind roll (weapon chance + rest bands) → rarity from U(0,1)+wave×factor×lootMult → weight inside
        kind+rarity pool. Canonical weights are 1 (uniform). Effective % is first-slot chance at wave {wave}.
      </div>

      {map && (
        <div className="mt-4 grid grid-cols-[minmax(8rem,1fr)_minmax(6rem,0.7fr)] items-center gap-3 border border-border bg-secondary/30 px-3 py-2.5 font-mono text-sm">
          <span>Map lootMult</span>
          <input
            type="number"
            step={0.05}
            min={0}
            value={effectiveLootMult(map, draft, true)}
            className={`border-2 bg-background px-2 py-1.5 ${changedClass(
              effectiveLootMult(map, draft, true) !== map.lootMult,
            )}`}
            onChange={(e) => {
              const n = Number(e.target.value);
              const result = setMapLootMult(draft, map.id, n);
              if (result.ok) onDraft(result.overrides);
            }}
          />
          <span className="text-[11px] text-muted-foreground">
            Canonical {map.lootMult} · crates {map.crates.length} · wave rewards always
          </span>
        </div>
      )}

      {crateEv?.supported && (
        <div className="mt-4 font-display text-[12px] text-primary">
          EXPECTED SELL VALUE (crate): {roubles(crateEv.value)} / roll
        </div>
      )}
      {rewardEv?.supported && (
        <div className="mt-1 font-display text-[12px] text-primary">
          EXPECTED SELL VALUE (best of {liveRules.waveRewardSlots} rewards): {roubles(rewardEv.value)}
        </div>
      )}
      {source.type === "shop" && (
        <div className="mt-4 font-mono text-[11px] text-muted-foreground">
          Hideout shop stock. Not a loot roll — EV unsupported.
        </div>
      )}
      {crateEv && !crateEv.supported && source.type === "crate" && (
        <div className="mt-4 font-mono text-[11px] text-muted-foreground">{crateEv.reason}</div>
      )}

      {showRules && (
        <div className="mt-5">
          <div className="font-display text-[11px] text-primary">GENERATOR RULES</div>
          <div className="mt-2 space-y-1">
            {RULE_FIELDS.filter((f) => source.type === "crate" || f.key !== "crateExtraChance").map((field) => {
              const base = CANONICAL_LOOT_RULES[field.key];
              const current = liveRules[field.key];
              const changed = current !== base;
              return (
                <div
                  key={field.key}
                  className="grid grid-cols-[minmax(10rem,1.4fr)_minmax(4rem,0.5fr)_minmax(6rem,0.7fr)] items-center gap-2 font-mono text-xs"
                >
                  <span className={changed ? "text-foreground" : "text-muted-foreground"}>{field.label}</span>
                  <span className="text-muted-foreground">{base}</span>
                  <input
                    type="number"
                    step={field.step}
                    min={0}
                    value={current}
                    className={`border-2 bg-background px-2 py-1 ${changedClass(changed)}`}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const result = setLootRule(draft, field.key, n);
                      if (result.ok) onDraft(result.overrides);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showWeights && (
        <div className="mt-5">
          <div className="font-display text-[11px] text-primary">RAID LOOT POOL</div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
            Crate opens and wave rewards share this pool. Weight edits apply to both. ADD/REMOVE is deferred — set
            weight 0 to exclude.
          </div>
          <div className={`mt-3 grid items-center gap-x-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground ${TABLE_COLS}`}>
            <span>Item</span>
            <span>Weight</span>
            <span>Test</span>
            <span>Pool</span>
            <span>First slot</span>
          </div>
          {entries.map((row) => {
            const changed = row.testWeight !== row.baseWeight;
            return (
              <div
                key={row.itemId}
                className={`grid items-center gap-x-3 border-b border-border/60 py-2 font-mono text-sm ${TABLE_COLS}`}
              >
                <span className={changed ? "text-foreground" : "text-muted-foreground"}>
                  {row.name}
                  <span className="ml-2 text-[10px] uppercase text-muted-foreground">{row.kind}</span>
                </span>
                <span className="text-muted-foreground">{row.baseWeight}</span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  value={row.testWeight}
                  className={`w-full border-2 bg-background px-2 py-1 ${changedClass(changed)}`}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const result = setItemWeight(draft, row.itemId, n);
                    if (result.ok) onDraft(result.overrides);
                  }}
                />
                <span>{pct(row.poolShare)}</span>
                <span>{pct(row.firstSlotChance)}</span>
              </div>
            );
          })}
        </div>
      )}

      {source.type === "shop" && (
        <div className="mt-5">
          <div className="font-display text-[11px] text-primary">STOCK</div>
          <div className="mt-2 space-y-1">
            {entries.map((row) => (
              <div
                key={row.itemId}
                className="flex items-center justify-between border-b border-border/60 py-2 font-mono text-sm"
              >
                <span>
                  {row.name}
                  <span className="ml-2 text-[10px] uppercase text-muted-foreground">{row.kind}</span>
                </span>
                <span className="text-muted-foreground">{roubles(row.value)} value</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
