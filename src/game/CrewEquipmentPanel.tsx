/**
 * Crew Equipment / Raid Prep panel — select operator, edit persistent kit, shared stash.
 */

import {
  ARMORS,
  ATTACHMENTS,
  RARITY_COLOR,
  WEAPONS,
  type Item,
} from "./gear";
import type { RaidPrepAction } from "./hub/prep";
import { raidPrepActions } from "./hub/prep";
import type { Meta } from "./meta";
import {
  armorDisplayName,
  attachmentDisplayName,
  coerceEquipmentOwnerId,
  getOwnerEquipment,
  kitActionsForOwner,
  listCrewEquipmentRows,
  ownerLoadSummary,
  weaponDisplayName,
  type EquipmentOwnerId,
} from "./operators/crewEquipment";

type StashKindTab = "all" | "weapon" | "attachment" | "armor" | "meds" | "valuable";

export default function CrewEquipmentPanel({
  meta,
  selectedOwnerId,
  onSelectOwner,
  stash,
  stashSlots,
  stashTab,
  setStashTab,
  sortedStash,
  loadout,
  loadoutSlots,
  onEquip,
  onUnequip,
  onPack,
  onUnpack,
  onBack,
}: {
  meta: Meta;
  selectedOwnerId: EquipmentOwnerId;
  onSelectOwner: (id: EquipmentOwnerId) => void;
  stash: Item[];
  stashSlots: number;
  stashTab: StashKindTab;
  setStashTab: (tab: StashKindTab) => void;
  sortedStash: Item[];
  loadout: Item[];
  loadoutSlots: number;
  onEquip: (uid: number) => void;
  onUnequip: (slot: "weapon" | "armor" | number) => void;
  onPack: (uid: number) => void;
  onUnpack: (uid: number) => void;
  onBack: () => void;
}) {
  const ownerId = coerceEquipmentOwnerId(meta, selectedOwnerId);
  const rows = listCrewEquipmentRows(meta);
  const selectedRow = rows.find((r) => r.ownerId === ownerId) ?? rows[0]!;
  const eq = getOwnerEquipment(meta, ownerId);
  const kitActions = kitActionsForOwner(meta, ownerId);
  const load = ownerLoadSummary(meta, ownerId);
  const slots = eq ? (WEAPONS[eq.weapon]?.slots ?? 1) : 1;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="grid min-h-0 flex-1 gap-2 text-left lg:grid-cols-[minmax(148px,0.22fr)_minmax(200px,0.32fr)_minmax(0,1fr)] lg:items-stretch">
        {/* CREW */}
        <div className="pixel-card flex min-h-0 flex-col lg:max-h-none">
          <div className="font-display text-[10px] text-primary">CREW</div>
          <p className="mt-1 font-mono text-[9px] text-muted-foreground">Select who to kit</p>
          <div className="pixel-scrollbar mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto max-h-[22vh] lg:max-h-none">
            {rows.map((row) => {
              const active = row.ownerId === ownerId;
              return (
                <button
                  key={row.ownerId}
                  type="button"
                  onClick={() => onSelectOwner(row.ownerId)}
                  className={`w-full border px-2 py-1.5 text-left font-mono ${
                    active ? "border-primary text-primary" : "border-border/50 text-foreground"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="truncate text-[10px] font-display tracking-wide">{row.name}</span>
                    <span className="shrink-0 text-[8px] uppercase text-muted-foreground">{row.roleLabel}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[8px] text-muted-foreground">
                    {weaponDisplayName(row.weaponId)} · {armorDisplayName(row.armorId)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* SELECTED KIT */}
        <div className="pixel-card flex min-h-0 flex-col">
          <div className="font-display text-[10px] text-primary">
            {selectedRow.name} · KIT
          </div>
          <div className="mt-0.5 font-mono text-[8px] uppercase tracking-wide text-muted-foreground">
            {selectedRow.roleLabel}
            <span className="text-border"> · </span>
            worn · tap slot to stash
          </div>
          {eq && (
            <div className="mt-2 grid min-h-0 gap-2 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => onUnequip("weapon")}
                className="pixel-card text-left hover:-translate-y-[2px]"
              >
                <div className="text-[8px] text-muted-foreground">WEAPON</div>
                <div className="text-primary">{weaponDisplayName(eq.weapon)}</div>
                {eq.attachments.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[8px] text-accent">
                    {eq.attachments.map((att, i) => (
                      <li key={`${att}-${i}`}>├ {attachmentDisplayName(att)}</li>
                    ))}
                  </ul>
                )}
              </button>
              <button
                type="button"
                onClick={() => onUnequip("armor")}
                className="pixel-card text-left hover:-translate-y-[2px]"
              >
                <div className="text-[8px] text-muted-foreground">BODY ARMOR</div>
                <div className={eq.armor ? "text-primary" : "text-muted-foreground"}>
                  {eq.armor ? (ARMORS[eq.armor]?.name ?? "ARMOR") : "EMPTY"}
                </div>
              </button>
              <div>
                <div className="text-[8px] text-muted-foreground">
                  MODS {eq.attachments.length}/{slots}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {Array.from({ length: slots }).map((_, i) => {
                    const att = eq.attachments[i];
                    if (!att) {
                      return (
                        <div
                          key={`empty-mod-${i}`}
                          className="h-[40px] border border-dashed border-border/60 bg-background/40"
                        />
                      );
                    }
                    return (
                      <button
                        key={`mod-${i}-${att}`}
                        type="button"
                        onClick={() => onUnequip(i)}
                        title={ATTACHMENTS[att]?.name}
                        className="h-[40px] overflow-hidden border-2 border-accent bg-background/70 p-1 text-left text-[8px] leading-tight text-accent hover:-translate-y-[2px]"
                      >
                        {ATTACHMENTS[att]?.name ?? att}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="border border-border/40 bg-background/30 px-2 py-1.5">
                <div className="font-display text-[9px] text-primary">LOAD</div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-[9px]">
                  <div>
                    <div className="text-muted-foreground">WEIGHT</div>
                    <div className="text-foreground">{load.weight.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">MOVE</div>
                    <div className="text-foreground">{load.moveTilesPerSec.toFixed(2)} t/s</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* STASH */}
        <div className="pixel-card flex min-h-0 flex-col sm:col-span-1 lg:h-full">
          <div className="shrink-0">
            <div className="font-display text-[10px] text-primary">
              STASH {stash.length}/{stashSlots}
            </div>
            <p className="mt-1 font-mono text-[9px] text-muted-foreground">
              Shared gang stash · EQUIP / INSTALL → {selectedRow.name} · PACK → raid loadout
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(["all", "weapon", "attachment", "armor", "meds", "valuable"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setStashTab(t)}
                  className={`border px-1.5 py-[3px] font-mono text-[9px] uppercase ${
                    stashTab === t
                      ? "border-primary text-primary"
                      : "border-border/60 text-muted-foreground"
                  }`}
                >
                  {t === "all" ? "all" : `${t}s`}
                </button>
              ))}
            </div>
          </div>
          <div className="pixel-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto max-h-[32vh] lg:max-h-none">
            {sortedStash.length === 0 ? (
              <div className="font-mono text-[9px] text-muted-foreground">Nothing in this category.</div>
            ) : (
              sortedStash.map((item) => (
                <PrepItemRow
                  key={item.uid}
                  item={item}
                  actions={raidPrepActions(item, kitActions)}
                  onEquip={() => onEquip(item.uid)}
                  onPack={() => onPack(item.uid)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* RAID LOADOUT — still shared / global; not per-operator backpacks */}
      <div className="pixel-card shrink-0 text-left">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="font-display text-[10px] text-primary">
              RAID LOADOUT {loadout.length}/{loadoutSlots}
            </div>
            <p className="mt-0.5 font-mono text-[8px] text-muted-foreground">
              Shared carried slots for the next raid (meds / consumables) · not persistent kit
            </p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-6 md:grid-cols-8">
          {Array.from({ length: loadoutSlots }).map((_, i) => {
            const item = loadout[i];
            if (!item) {
              return (
                <div
                  key={`empty-load-${i}`}
                  className="h-[42px] border border-dashed border-border/60 bg-background/40"
                />
              );
            }
            return (
              <button
                key={item.uid}
                type="button"
                onClick={() => onUnpack(item.uid)}
                className="h-[42px] overflow-hidden border-2 border-border bg-background/70 p-1 text-left font-mono text-[8px] leading-tight hover:border-primary"
                style={{ color: RARITY_COLOR[item.rarity] }}
                title={item.name}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" onClick={onBack} className="pixel-btn pixel-btn-primary w-full shrink-0">
        BACK TO CAMP
      </button>
    </div>
  );
}

function PrepItemRow({
  item,
  actions,
  onEquip,
  onPack,
}: {
  item: Item;
  actions: RaidPrepAction[];
  onEquip: () => void;
  onPack: () => void;
}) {
  const equipLabel = item.kind === "attachment" ? "INSTALL" : "EQUIP";
  return (
    <div className="flex items-center gap-2 border-b border-border/40 py-1.5">
      <div
        className="min-w-0 flex-1 text-left font-mono text-[10px] leading-snug"
        style={{ color: RARITY_COLOR[item.rarity] }}
      >
        <div className="truncate">{item.name}</div>
        <div className="text-[8px] uppercase text-muted-foreground">
          {item.kind}
          {item.kind === "weapon" && item.installed?.length
            ? ` · ${item.installed.length} mod${item.installed.length === 1 ? "" : "s"}`
            : ""}
        </div>
      </div>
      {actions.includes("equip") && (
        <button type="button" onClick={onEquip} className="pixel-btn shrink-0 px-1.5 py-1 text-[8px]">
          {equipLabel}
        </button>
      )}
      {actions.includes("pack") && (
        <button type="button" onClick={onPack} className="pixel-btn shrink-0 px-1.5 py-1 text-[8px]">
          PACK
        </button>
      )}
    </div>
  );
}
