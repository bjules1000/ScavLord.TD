import { useMemo, useState } from "react";
import {
  attachmentLabFields,
  armorLabFields,
  applyBalanceOverrides,
  balanceLabCatalog,
  canonicalArmor,
  canonicalAttachment,
  canonicalWeapon,
  emptyBalanceOverrides,
  filterLabCatalog,
  formatBalancePatch,
  getBalanceOverrides,
  modifiedItemCount,
  resetOverrideItem,
  setOverrideField,
  weaponLabFields,
  type BalanceOverrides,
  type LabCategory,
  type LabEntry,
  type LabField,
} from "./balance";
import { DEV_TOOLS_ENABLED } from "./tools";

const CATS: LabCategory[] = ["ALL", "WEAPONS", "ARMOR", "ATTACHMENTS"];

function fieldValue(obj: object, key: string): number | undefined {
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

function formatValue(key: string, n: number): string {
  if (key === "reduction") return `${Math.round(n * 100)}%`;
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
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
  const visible = useMemo(() => filterLabCatalog(catalog, category, query), [catalog, category, query]);

  if (!enabled) return null;

  const canonical =
    selected?.kind === "weapon"
      ? canonicalWeapon(selected.id)
      : selected?.kind === "armor"
        ? canonicalArmor(selected.id)
        : selected
          ? canonicalAttachment(selected.id)
          : undefined;
  const fields: LabField[] = !selected || !canonical
    ? []
    : selected.kind === "weapon"
      ? weaponLabFields(canonical as ReturnType<typeof canonicalWeapon> & object)
      : selected.kind === "armor"
        ? armorLabFields()
        : attachmentLabFields(canonical as NonNullable<ReturnType<typeof canonicalAttachment>>);

  const overBag =
    selected?.kind === "weapon"
      ? draft.weapons[selected.id]
      : selected?.kind === "armor"
        ? draft.armors[selected.id]
        : selected
          ? draft.attachments[selected.id]
          : undefined;

  const derived = selected?.kind === "weapon" && canonical
    ? (() => {
        const w = { ...(canonical as NonNullable<ReturnType<typeof canonicalWeapon>>), ...(overBag ?? {}) };
        const pellets = w.pellets ?? 1;
        return [
          w.pellets != null ? { label: "Max raw blast", value: String(pellets * w.damage) } : null,
          { label: "Fire rate", value: `${(60000 / w.cooldown).toFixed(0)} RPM` },
          { label: "Magazine", value: String(w.magSize) },
          { label: "Weight", value: String(w.weight) },
        ].filter(Boolean) as { label: string; value: string }[];
      })()
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
    <div className="absolute inset-0 z-40 flex items-stretch justify-center bg-background/90 p-2 backdrop-blur-[2px] sm:p-4">
      <div className="pixel-card flex h-full max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden p-2 sm:p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-display text-sm text-primary">BALANCE LAB</div>
          <button type="button" className="pixel-btn px-2 py-1" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {CATS.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`pixel-btn px-1 py-0 text-[9px] ${category === cat ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SEARCH"
            className="min-w-[8rem] flex-1 border border-border bg-background px-1 py-0.5 font-mono text-[10px]"
          />
        </div>
        <div className="mt-2 grid min-h-0 flex-1 gap-2 overflow-hidden md:grid-cols-[minmax(140px,0.34fr)_minmax(0,1fr)]">
          <div className="pixel-scrollbar min-h-0 overflow-auto border border-border">
            {visible.map((entry) => (
              <button
                key={`${entry.kind}:${entry.id}`}
                type="button"
                className={`flex w-full items-center justify-between px-2 py-1 text-left font-mono text-[10px] ${
                  selected?.id === entry.id && selected.kind === entry.kind
                    ? "bg-secondary text-primary"
                    : "text-foreground hover:bg-secondary/60"
                }`}
                onClick={() => setSelected(entry)}
              >
                <span>{entry.name}</span>
                <span className="uppercase text-muted-foreground">{entry.kind}</span>
              </button>
            ))}
          </div>
          <div className="pixel-scrollbar min-h-0 overflow-auto border border-border p-2">
            {!selected || !canonical ? (
              <div className="font-mono text-[10px] text-muted-foreground">Select an item.</div>
            ) : (
              <>
                <div className="font-display text-[11px] text-primary">{selected.name}</div>
                <div className="mt-2 space-y-1">
                  {fields.map((field) => {
                    const base = fieldValue(canonical, field.key) ?? 0;
                    const test = fieldValue(overBag ?? {}, field.key);
                    const current = test ?? base;
                    const changed = test != null && test !== base;
                    return (
                      <label key={field.key} className="flex items-center justify-between gap-2 font-mono text-[10px]">
                        <span className={changed ? "text-primary" : "text-muted-foreground"}>{field.label}</span>
                        <span className="flex items-center gap-1">
                          <span className="text-muted-foreground">{formatValue(field.key, base)}</span>
                          {changed && <span className="text-primary">→ {formatValue(field.key, current)}</span>}
                          <input
                            type="number"
                            step={field.step}
                            value={current}
                            className="w-16 border border-border bg-background px-1 py-0.5 text-foreground"
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              setDraft((d) => setOverrideField(d, selected.kind, selected.id, field.key, n, base));
                            }}
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
                {derived.length > 0 && (
                  <div className="mt-3">
                    <div className="font-display text-[9px] text-muted-foreground">DERIVED</div>
                    {derived.map((row) => (
                      <div key={row.label} className="flex justify-between font-mono text-[10px] text-muted-foreground">
                        <span>{row.label}</span>
                        <span>{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="mr-auto font-mono text-[10px] text-muted-foreground">
            MODIFIED: {modifiedItemCount(getBalanceOverrides())}
            {modifiedItemCount(draft) !== modifiedItemCount(getBalanceOverrides())
              ? ` · DRAFT ${modifiedItemCount(draft)}`
              : ""}
          </span>
          <button
            type="button"
            className="pixel-btn px-2 py-1 text-[9px]"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              applyDraft(resetOverrideItem(getBalanceOverrides(), selected.kind, selected.id));
            }}
          >
            RESET ITEM
          </button>
          <button type="button" className="pixel-btn px-2 py-1 text-[9px]" onClick={() => applyDraft(emptyBalanceOverrides())}>
            RESET ALL
          </button>
          <button type="button" className="pixel-btn px-2 py-1 text-[9px]" onClick={() => void exportPatch()}>
            {copied ? "COPIED" : "EXPORT PATCH"}
          </button>
          <button type="button" className="pixel-btn pixel-btn-primary px-2 py-1 text-[9px]" onClick={() => applyDraft(draft)}>
            APPLY
          </button>
        </div>
      </div>
    </div>
  );
}
