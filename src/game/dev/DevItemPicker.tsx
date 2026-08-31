import { useMemo, useState } from "react";
import { RARITY_COLOR } from "../gear";
import {
  DEV_PICKER_CATEGORIES,
  filterDevPickerItems,
  raidBackpackItemDefs,
  type DevPickerCategory,
} from "./inventory";

export default function DevItemPicker({
  onPick,
  onClose,
}: {
  onPick: (defId: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<DevPickerCategory>("ALL");
  const [query, setQuery] = useState("");
  const defs = useMemo(() => raidBackpackItemDefs(), []);
  const visible = useMemo(() => filterDevPickerItems(defs, category, query), [defs, category, query]);

  return (
    <div className="mt-2 border border-border bg-background/80 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-[10px] text-primary">DEV ADD</div>
        <button type="button" className="pixel-btn px-1 py-0 text-[9px]" onClick={onClose}>
          CLOSE
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {DEV_PICKER_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`pixel-btn px-1 py-0 text-[8px] ${
              category === cat ? "text-primary" : "text-muted-foreground"
            }`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="SEARCH"
        className="mt-1 w-full border border-border bg-background px-1 py-0.5 font-mono text-[10px] text-foreground"
      />
      <div className="pixel-scrollbar mt-1 max-h-40 space-y-0.5 overflow-auto">
        {visible.map((def) => (
          <button
            key={def.id}
            type="button"
            className="flex w-full items-center justify-between border border-transparent px-1 py-0.5 text-left font-mono text-[9px] hover:border-border"
            style={{ color: RARITY_COLOR[def.rarity] }}
            onClick={() => onPick(def.id)}
          >
            <span>{def.name}</span>
            <span className="uppercase text-muted-foreground">{def.kind}</span>
          </button>
        ))}
        {visible.length === 0 && (
          <div className="font-mono text-[9px] text-muted-foreground">NO MATCHES</div>
        )}
      </div>
    </div>
  );
}
