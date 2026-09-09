import CosmeticFigure from "../CosmeticFigure";
import { COSMETIC_SLOTS, cosmeticOption, type CosmeticLoadout, type CosmeticSlot } from "../cosmetics";

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
    <div className="flex items-center justify-between gap-2 border-b border-border/40 py-1.5 last:border-b-0">
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

export default function CosmeticsPanel({
  loadout,
  onCycle,
}: {
  loadout: CosmeticLoadout;
  onCycle: (slot: CosmeticSlot, direction: 1 | -1) => void;
}) {
  return (
    <div className="pixel-card flex flex-col items-center gap-3 text-left font-mono text-[10px] sm:flex-row sm:items-start sm:justify-center">
      <div className="flex shrink-0 justify-center bg-black/20 p-3">
        <CosmeticFigure loadout={loadout} scale={4} />
      </div>
      <div className="w-full max-w-[220px]">
        {COSMETIC_SLOTS.map((slot) => (
          <CosmeticRow key={slot} slot={slot} loadout={loadout} onCycle={onCycle} />
        ))}
      </div>
    </div>
  );
}
