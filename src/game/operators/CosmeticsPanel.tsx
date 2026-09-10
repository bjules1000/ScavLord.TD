import { useState } from "react";
import CosmeticFigure from "../CosmeticFigure";
import {
  COSMETIC_CATALOG,
  COSMETIC_SLOTS,
  SWATCH_LISTS,
  cosmeticOption,
  resolvePaintSwatchId,
  type ColorSwatch,
  type CosmeticLoadout,
  type CosmeticOption,
  type CosmeticSlot,
  type PaintRegionId,
} from "../cosmetics";

/** One style choice in the active tab's grid — a mini preview of the whole character
 * with just this slot swapped to `option`, so you see it in context rather than as an
 * isolated icon. */
function StyleThumbnail({
  loadout,
  slot,
  option,
  selected,
  onSelect,
}: {
  loadout: CosmeticLoadout;
  slot: CosmeticSlot;
  option: CosmeticOption;
  selected: boolean;
  onSelect: (slot: CosmeticSlot, optionId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(slot, option.id)}
      aria-pressed={selected}
      className={`overflow-hidden border-2 p-1 text-center ${
        selected ? "border-primary bg-primary/10" : "border-border bg-background/50"
      }`}
    >
      <div className="flex justify-center bg-black/20 p-1">
        <CosmeticFigure loadout={{ ...loadout, [slot]: option.id }} scale={3} />
      </div>
      <div className="mt-1 truncate font-mono text-[8px] text-foreground">{option.name}</div>
    </button>
  );
}

function PaletteSwatch({
  swatch,
  selected,
  onSelect,
}: {
  swatch: ColorSwatch;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={swatch.name}
      aria-pressed={selected}
      title={swatch.name}
      onClick={onSelect}
      className={`h-5 w-5 shrink-0 ${selected ? "border-2 border-primary" : "border border-black/40"}`}
      style={{ background: swatch.hex }}
    />
  );
}

export default function CosmeticsPanel({
  loadout,
  onSelect,
  onSelectPaint,
}: {
  loadout: CosmeticLoadout;
  onSelect: (slot: CosmeticSlot, optionId: string) => void;
  onSelectPaint: (slot: CosmeticSlot, region: PaintRegionId, swatchId: string) => void;
}) {
  const [activeSlot, setActiveSlot] = useState<CosmeticSlot>("hat");
  const activeOption = cosmeticOption(activeSlot, loadout[activeSlot]);
  const regions = Object.keys(activeOption?.paintRegions ?? {});

  return (
    <div className="pixel-card flex flex-col gap-3 text-left font-mono text-[10px] lg:flex-row">
      <div className="flex shrink-0 justify-center bg-black/20 p-3 lg:w-[220px]">
        <CosmeticFigure loadout={loadout} scale={8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-1 border-b border-border/40 pb-2">
          {COSMETIC_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setActiveSlot(slot)}
              className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                activeSlot === slot
                  ? "border-primary text-primary"
                  : "border-border/60 text-muted-foreground"
              }`}
            >
              {slot}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {COSMETIC_CATALOG[activeSlot].map((option) => (
            <StyleThumbnail
              key={option.id}
              loadout={loadout}
              slot={activeSlot}
              option={option}
              selected={loadout[activeSlot] === option.id}
              onSelect={onSelect}
            />
          ))}
        </div>

        {regions.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t border-border/40 pt-2">
            {regions.map((region) => (
              <div key={region}>
                <div className="font-mono text-[9px] uppercase text-muted-foreground">{region}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {SWATCH_LISTS[region]?.map((swatch) => (
                    <PaletteSwatch
                      key={swatch.id}
                      swatch={swatch}
                      selected={resolvePaintSwatchId(loadout, activeSlot, region) === swatch.id}
                      onSelect={() => onSelectPaint(activeSlot, region, swatch.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
