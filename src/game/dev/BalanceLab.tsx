import { useMemo, useState } from "react";
import {
  attachmentLabFields,
  armorLabFields,
  applyBalanceOverrides,
  balanceFieldTone,
  balanceLabCatalog,
  balanceToneBorderClass,
  balanceToneTextClass,
  canonicalArmor,
  canonicalAttachment,
  canonicalWeapon,
  emptyBalanceOverrides,
  filterLabCatalog,
  formatBalancePatch,
  formatLabDelta,
  formatLabValue,
  getBalanceOverrides,
  itemOverrideCount,
  itemOverrideRecord,
  labDisplayName,
  modifiedItemCount,
  overridesEqual,
  resetOverrideItem,
  setOverrideField,
  weaponDerivedRows,
  weaponLabFields,
  type BalanceOverrides,
  type LabCategory,
  type LabEntry,
  type LabField,
} from "./balance";

const CATS: LabCategory[] = ["ALL", "WEAPONS", "ARMOR", "ATTACHMENTS"];

function fieldValue(obj: object, key: string): number | undefined {
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

function stringField(obj: object | undefined, key: string): string | undefined {
  const v = obj ? (obj as Record<string, unknown>)[key] : undefined;
  return typeof v === "string" ? v : undefined;
}

export default function BalanceLab({
  enabled,
  onClose,
  onApplied,
}: {
  enabled: boolean;
  onClose: () => void;
  onApplied: (overrides: BalanceOverrides) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LabCategory>("ALL");
  const [selected, setSelected] = useState<LabEntry | null>(null);
  const [draft, setDraft] = useState<BalanceOverrides>(() => getBalanceOverrides());
  const [copied, setCopied] = useState(false);
  const catalog = useMemo(() => balanceLabCatalog(), []);
  const visible = useMemo(
    () => filterLabCatalog(catalog, category, query, draft),
    [catalog, category, query, draft],
  );

  if (!enabled) return null;

  const applied = getBalanceOverrides();
  const appliedCount = modifiedItemCount(applied);
  const draftCount = modifiedItemCount(draft);
  const draftDirty = !overridesEqual(draft, applied);

  const canonical =
    selected?.kind === "weapon"
      ? canonicalWeapon(selected.id)
      : selected?.kind === "armor"
        ? canonicalArmor(selected.id)
        : selected
          ? canonicalAttachment(selected.id)
          : undefined;
  const fields: LabField[] =
    !selected || !canonical
      ? []
      : selected.kind === "weapon"
        ? weaponLabFields(canonical as ReturnType<typeof canonicalWeapon> & object)
        : selected.kind === "armor"
          ? armorLabFields()
          : attachmentLabFields(canonical as NonNullable<ReturnType<typeof canonicalAttachment>>);

  const overBag = selected ? itemOverrideRecord(draft, selected.kind, selected.id) : undefined;
  const selectedChanged = selected ? itemOverrideCount(draft, selected.kind, selected.id) : 0;
  const draftName = selected ? (stringField(overBag, "name") ?? canonical?.name ?? "") : "";
  const nameChanged = Boolean(selected && canonical && draftName !== canonical.name);

  const derived =
    selected?.kind === "weapon" && canonical
      ? weaponDerivedRows(
          canonical as NonNullable<ReturnType<typeof canonicalWeapon>>,
          {
            ...(canonical as NonNullable<ReturnType<typeof canonicalWeapon>>),
            ...(overBag ?? {}),
          } as NonNullable<ReturnType<typeof canonicalWeapon>>,
        )
      : [];

  const applyDraft = (next: BalanceOverrides) => {
    const live = applyBalanceOverrides(next, true);
    setDraft(live);
    onApplied(live);
  };

  const exportPatch = async () => {
    const text = formatBalancePatch(getBalanceOverrides());
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt("Copy balance patch", text);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/92 p-1 backdrop-blur-[2px] sm:p-2">
      <div className="pixel-card flex h-[94vh] w-[96vw] max-h-[94vh] max-w-[96vw] flex-col overflow-hidden p-3 sm:p-4">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border pb-3">
          <div>
            <div className="font-display text-sm text-primary sm:text-base">BALANCE LAB</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              DEV DRAFT — runtime test values only
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span
              className={`pixel-chip font-mono text-[11px] ${
                draftCount > 0 || appliedCount > 0 ? "text-primary" : "text-muted-foreground"
              }`}
            >
              MODIFIED {draftCount}
              {draftDirty ? ` · UNAPPLIED` : appliedCount > 0 ? " · LIVE" : ""}
            </span>
            <button type="button" className="pixel-btn px-3 py-2 text-[10px]" onClick={onClose}>
              CLOSE
            </button>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          {CATS.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`pixel-btn px-3 py-2 text-[10px] ${
                category === cat ? "pixel-btn-primary" : "text-muted-foreground"
              }`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SEARCH ITEMS"
            className="min-w-[14rem] flex-1 border-2 border-border bg-background px-3 py-2 font-mono text-sm"
          />
        </div>

        <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-hidden md:grid-cols-[minmax(240px,0.28fr)_minmax(0,0.72fr)]">
          <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/50">
            {visible.map((entry) => {
              const changed = itemOverrideCount(draft, entry.kind, entry.id);
              const display = labDisplayName(entry, draft);
              const active = selected?.id === entry.id && selected.kind === entry.kind;
              return (
                <button
                  key={`${entry.kind}:${entry.id}`}
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5 text-left font-mono text-xs ${
                    active ? "bg-secondary text-primary" : "text-foreground hover:bg-secondary/60"
                  }`}
                  onClick={() => setSelected(entry)}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{display}</span>
                    {display !== entry.name && (
                      <span className="block truncate text-[10px] text-muted-foreground">{entry.name}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 uppercase text-muted-foreground">
                    {changed > 0 && <span className="text-primary">● {changed}</span>}
                    <span>{entry.kind}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pixel-scrollbar min-h-0 overflow-auto border-2 border-border bg-background/40 p-3 sm:p-4">
            {!selected || !canonical ? (
              <div className="font-mono text-sm text-muted-foreground">Select an item to edit its draft stats.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      Display name
                    </div>
                    <input
                      value={draftName}
                      onChange={(e) => {
                        setDraft((d) =>
                          setOverrideField(d, selected.kind, selected.id, "name", e.target.value, canonical.name),
                        );
                      }}
                      className={`mt-1 w-full border-2 bg-background px-3 py-2 font-display text-sm text-primary ${
                        nameChanged ? "border-primary" : "border-border"
                      }`}
                    />
                    {nameChanged && (
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                        Base: {canonical.name}
                      </div>
                    )}
                  </div>
                  <div className="font-mono text-[11px] uppercase text-muted-foreground">
                    {selected.kind} · {selected.id}
                    {selectedChanged > 0 ? ` · ${selectedChanged} changed` : ""}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-[minmax(7rem,1.1fr)_minmax(4.5rem,0.7fr)_minmax(6.5rem,0.9fr)_minmax(7rem,1fr)] items-center gap-x-3 gap-y-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span>Stat</span>
                  <span>Base</span>
                  <span>Delta</span>
                  <span>Test value</span>
                </div>
                <div className="mt-1">
                  {fields.map((field) => {
                    const base = fieldValue(canonical, field.key) ?? 0;
                    const test = fieldValue(overBag ?? {}, field.key);
                    const current = test ?? base;
                    const changed = test != null && !Object.is(test, base);
                    const tone = balanceFieldTone(field.key, base, current);
                    const delta = formatLabDelta(field.key, base, current);
                    return (
                      <label
                        key={field.key}
                        className="grid grid-cols-[minmax(7rem,1.1fr)_minmax(4.5rem,0.7fr)_minmax(6.5rem,0.9fr)_minmax(7rem,1fr)] items-center gap-x-3 border-b border-border/60 py-2.5 font-mono text-sm"
                      >
                        <span className={changed ? "text-foreground" : "text-muted-foreground"}>{field.label}</span>
                        <span className="text-muted-foreground">{formatLabValue(field.key, base)}</span>
                        <span className={balanceToneTextClass(tone)}>
                          {changed ? `→ ${formatLabValue(field.key, current)} (${delta})` : "—"}
                        </span>
                        <input
                          type="number"
                          step={field.step}
                          value={current}
                          className={`w-full min-w-[6.5rem] border-2 bg-background px-2 py-1.5 text-foreground ${balanceToneBorderClass(tone)}`}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (!Number.isFinite(n)) return;
                            setDraft((d) => setOverrideField(d, selected.kind, selected.id, field.key, n, base));
                          }}
                        />
                      </label>
                    );
                  })}
                </div>

                {derived.length > 0 && (
                  <div className="mt-6 border-t-2 border-border pt-4">
                    <div className="font-display text-[11px] text-primary">DERIVED</div>
                    <div className="mt-3 space-y-2">
                      {derived.map((row) => {
                        const changed = !Object.is(row.base, row.current);
                        const tone = balanceFieldTone(row.key, row.base, row.current);
                        const delta = formatLabDelta(row.key, row.base, row.current);
                        return (
                          <div
                            key={row.key}
                            className="grid grid-cols-[minmax(8rem,1.2fr)_minmax(5rem,0.8fr)_minmax(7rem,1fr)] items-center gap-3 border border-border bg-secondary/30 px-3 py-2.5 font-mono text-sm"
                          >
                            <span className="text-foreground">{row.label}</span>
                            <span className="text-muted-foreground">{row.display(row.base)}</span>
                            <span className={changed ? balanceToneTextClass(tone) : "text-foreground"}>
                              {changed ? `${row.display(row.current)} (${delta})` : row.display(row.current)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 border-t-2 border-border pt-3">
          <span className="mr-auto font-mono text-xs text-muted-foreground">
            {draftDirty ? "Unapplied draft edits" : appliedCount > 0 ? "Live test overrides active" : "No draft changes"}
          </span>
          <button
            type="button"
            className="pixel-btn px-3 py-2 text-[10px]"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              applyDraft(resetOverrideItem(getBalanceOverrides(), selected.kind, selected.id));
            }}
          >
            RESET ITEM
          </button>
          <button
            type="button"
            className="pixel-btn px-3 py-2 text-[10px]"
            onClick={() => applyDraft(emptyBalanceOverrides())}
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
