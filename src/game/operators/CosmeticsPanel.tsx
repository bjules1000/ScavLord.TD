import CosmeticFigure from "../CosmeticFigure";
import {
  COSMETIC_SLOTS,
  GLOBAL_PAINT_REGIONS,
  cosmeticOption,
  paintSwatch,
  type CosmeticLoadout,
  type CosmeticSlot,
  type PaintRegionId,
} from "../cosmetics";

function CosmeticRow({
  slot,
  loadout,
  onCycle,
}: {
  slot: CosmeticSlot;
  loadout: CosmeticLoadout;
  onCycle: (slot: CosmeticSlot, direction: 1 | -1) => void;
}) {
  const option = cosmeticOption(slot, loadout[slot]);
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="w-14 shrink-0 font-display text-[9px] text-muted-foreground">
        {slot.toUpperCase()}
      </span>
      <button
        type="button"
        aria-label={`Previous ${slot}`}
        className="pixel-btn px-2 py-0.5"
        onClick={() => onCycle(slot, -1)}
      >
        ‹
      </button>
      <span className="flex-1 text-center font-mono text-[10px] text-foreground">
        {option?.name ?? loadout[slot]}
      </span>
      <button
        type="button"
        aria-label={`Next ${slot}`}
        className="pixel-btn px-2 py-0.5"
        onClick={() => onCycle(slot, 1)}
      >
        ›
      </button>
    </div>
  );
}

function PaintRow({
  slot,
  region,
  loadout,
  onCyclePaint,
  indent = true,
}: {
  slot: CosmeticSlot;
  region: PaintRegionId;
  loadout: CosmeticLoadout;
  onCyclePaint: (slot: CosmeticSlot, region: PaintRegionId, direction: 1 | -1) => void;
  /** Nested-under-a-slot rows indent; a standalone row (e.g. in the shared appearance block) doesn't. */
  indent?: boolean;
}) {
  const swatch = paintSwatch(loadout, slot, region);
  return (
    <div className={`flex items-center justify-between gap-2 py-1 ${indent ? "pl-4" : ""}`}>
      <span className="w-10 shrink-0 font-mono text-[9px] uppercase text-muted-foreground">
        {region}
      </span>
      <button
        type="button"
        aria-label={`Previous ${region}`}
        className="pixel-btn px-2 py-0.5"
        onClick={() => onCyclePaint(slot, region, -1)}
      >
        ‹
      </button>
      <span className="flex flex-1 items-center justify-center gap-1.5 text-center font-mono text-[9px] text-foreground">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 border border-black/40"
          style={{ background: swatch?.hex ?? "#666" }}
        />
        {swatch?.name ?? "—"}
      </span>
      <button
        type="button"
        aria-label={`Next ${region}`}
        className="pixel-btn px-2 py-0.5"
        onClick={() => onCyclePaint(slot, region, 1)}
      >
        ›
      </button>
    </div>
  );
}

export default function CosmeticsPanel({
  loadout,
  onCycle,
  onCyclePaint,
}: {
  loadout: CosmeticLoadout;
  onCycle: (slot: CosmeticSlot, direction: 1 | -1) => void;
  onCyclePaint: (slot: CosmeticSlot, region: PaintRegionId, direction: 1 | -1) => void;
}) {
  const regionsFor = (slot: CosmeticSlot) =>
    Object.keys(cosmeticOption(slot, loadout[slot])?.paintRegions ?? {});

  // Global regions (skin, hair, ...) read/write one shared value regardless of slot — show
  // each at most once instead of repeating it under every slot that happens to use it.
  const activeGlobalRegions = GLOBAL_PAINT_REGIONS.filter((region) =>
    COSMETIC_SLOTS.some((slot) => regionsFor(slot).includes(region)),
  );
  const anySlotFor = (region: PaintRegionId): CosmeticSlot =>
    COSMETIC_SLOTS.find((slot) => regionsFor(slot).includes(region)) ?? COSMETIC_SLOTS[0]!;

  // ARMOR previews a top-layer overlay rather than an outfit piece, so it sits with the
  // appearance traits (skin/hair) under the portrait instead of among the equip slots.
  const equipSlots = COSMETIC_SLOTS.filter((slot) => slot !== "armor");
  const armorRegions = regionsFor("armor");

  return (
    <div className="pixel-card flex flex-col items-center gap-3 text-left font-mono text-[10px] sm:flex-row sm:items-start sm:justify-center">
      <div className="flex w-full max-w-[220px] shrink-0 flex-col gap-2 sm:w-[220px]">
        <div className="flex justify-center bg-black/20 p-3">
          <CosmeticFigure loadout={loadout} scale={6} />
        </div>
        <div>
          {activeGlobalRegions.map((region) => (
            <PaintRow
              key={region}
              slot={anySlotFor(region)}
              region={region}
              loadout={loadout}
              onCyclePaint={onCyclePaint}
              indent={false}
            />
          ))}
          <CosmeticRow slot="armor" loadout={loadout} onCycle={onCycle} />
          {armorRegions.map((region) => (
            <PaintRow
              key={region}
              slot="armor"
              region={region}
              loadout={loadout}
              onCyclePaint={onCyclePaint}
            />
          ))}
        </div>
      </div>
      <div className="w-full max-w-[220px]">
        {equipSlots.map((slot) => {
          const regions = regionsFor(slot).filter((region) => !GLOBAL_PAINT_REGIONS.includes(region));
          return (
            <div key={slot} className="border-b border-border/40 last:border-b-0">
              <CosmeticRow slot={slot} loadout={loadout} onCycle={onCycle} />
              {regions.map((region) => (
                <PaintRow
                  key={region}
                  slot={slot}
                  region={region}
                  loadout={loadout}
                  onCyclePaint={onCyclePaint}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
