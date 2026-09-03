/**
 * Camp Gun Bench — factory mounts + scav improvised Bench work.
 * Evolved from the Armory / Gunsmith panel.
 */

import { useMemo, useState } from "react";
import {
  armoryMountRows,
  armoryStatRows,
  listArmoryCandidates,
  mountIndexForUnequip,
  previewAttachmentsForCandidate,
  weaponBuildSummary,
  type ArmoryCandidate,
  type ArmoryStatTone,
  type AttachMount,
  MOUNT_LABEL,
} from "./armory";
import { ATTACHMENTS, RARITY_COLOR, type Item } from "./gear";
import type { Meta } from "./meta";
import {
  coerceEquipmentOwnerId,
  getOwnerEquipment,
  listCrewEquipmentRows,
  ownerLoadSummary,
  weaponDisplayName,
  type EquipmentOwnerId,
} from "./operators/crewEquipment";
import {
  applyScavAction,
  ensureVisualState,
  listScavActionsForWeapon,
  previewScavAction,
  type ScavBenchAction,
} from "./scavWeaponMods";
import { attachmentModifierLines } from "./weaponAttachments";
import {
  currentPartLabel,
  platformForWeaponId,
  slotLabel,
  type WeaponVisualSlot,
  type WeaponVisualState,
} from "./weaponVisuals";
import WeaponSprite from "./WeaponSprite";

function toneClass(tone: ArmoryStatTone): string {
  if (tone === "good") return "text-emerald-400";
  if (tone === "bad") return "text-red-400";
  return "text-muted-foreground";
}

const BENCH_SLOTS: WeaponVisualSlot[] = ["stock", "magazine", "underbarrel", "optic", "muzzle"];

export default function ArmoryPanel({
  meta,
  selectedOwnerId,
  onSelectOwner,
  stash,
  stashSlots,
  shopDefIds,
  buyMult,
  bank,
  onInstallFromStash,
  onBuyAndInstall,
  onDetachMount,
  onApplyScavMods,
  onBack,
  onOpenEquipment,
}: {
  meta: Meta;
  selectedOwnerId: EquipmentOwnerId;
  onSelectOwner: (id: EquipmentOwnerId) => void;
  stash: Item[];
  stashSlots: number;
  shopDefIds: readonly string[];
  buyMult: number;
  bank: number;
  onInstallFromStash: (stashUid: number) => void;
  onBuyAndInstall: (shopDefId: string) => void;
  onDetachMount: (mountIndex: number) => void;
  onApplyScavMods: (next: WeaponVisualState) => void;
  onBack: () => void;
  onOpenEquipment: () => void;
}) {
  const ownerId = coerceEquipmentOwnerId(meta, selectedOwnerId);
  const rows = listCrewEquipmentRows(meta);
  const eq = getOwnerEquipment(meta, ownerId);
  const load = ownerLoadSummary(meta, ownerId);
  const [activeMount, setActiveMount] = useState<AttachMount | null>(null);
  const [hoverCandidate, setHoverCandidate] = useState<ArmoryCandidate | null>(null);
  const [previewRemove, setPreviewRemove] = useState(false);
  const [hoverAction, setHoverAction] = useState<ScavBenchAction | null>(null);

  const mountRows = eq ? armoryMountRows(eq.weapon, eq.attachments) : [];
  const summary = eq ? weaponBuildSummary(eq.weapon, eq.attachments) : "NO WEAPON";
  const platform = eq ? platformForWeaponId(eq.weapon) : null;
  const scavState = eq ? ensureVisualState(eq.weapon, eq.scavMods) : null;

  const previewScav = useMemo(() => {
    if (!eq || !hoverAction) return scavState;
    return previewScavAction(eq.weapon, scavState, hoverAction.id) ?? scavState;
  }, [eq, hoverAction, scavState]);

  const previewAttachments = useMemo(() => {
    if (!eq || !activeMount) return eq?.attachments ?? [];
    return previewAttachmentsForCandidate(
      eq.weapon,
      eq.attachments,
      activeMount,
      hoverCandidate,
      previewRemove,
    );
  }, [eq, activeMount, hoverCandidate, previewRemove]);

  const stats = eq
    ? armoryStatRows(
        eq.weapon,
        eq.attachments,
        previewAttachments,
        eq.armor,
        scavState,
        previewScav,
      )
    : [];

  const candidates =
    eq && activeMount
      ? listArmoryCandidates({
          weaponId: eq.weapon,
          mount: activeMount,
          currentAttachments: eq.attachments,
          stash,
          shopDefIds,
          bank,
          buyMult,
          stashSlots,
        })
      : [];

  const scavActions = eq ? listScavActionsForWeapon(eq.weapon, scavState) : [];

  const equippedOnMount = activeMount
    ? mountRows.find((r) => r.mount === activeMount)?.attachmentId
    : null;

  const selectMount = (mount: AttachMount) => {
    setActiveMount(mount);
    setHoverCandidate(null);
    setPreviewRemove(false);
    setHoverAction(null);
  };

  const runCandidate = (c: ArmoryCandidate) => {
    if (c.blockedReason) return;
    if (c.action === "KEEP") return;
    if (c.action === "BUY_INSTALL" && c.shopDefId) {
      onBuyAndInstall(c.shopDefId);
    } else if ((c.action === "INSTALL" || c.action === "REPLACE") && c.stashUid != null) {
      onInstallFromStash(c.stashUid);
    }
    setHoverCandidate(null);
    setPreviewRemove(false);
  };

  const detachActive = () => {
    if (!eq || !activeMount) return;
    const idx = mountIndexForUnequip(eq.weapon, eq.attachments, activeMount);
    if (idx == null) return;
    onDetachMount(idx);
    setPreviewRemove(false);
    setHoverCandidate(null);
  };

  const runScavAction = (action: ScavBenchAction) => {
    if (!eq) return;
    const result = applyScavAction(eq.weapon, scavState, action.id);
    if (!result.ok) return;
    onApplyScavMods(result.state);
    setHoverAction(null);
  };

  const showScavPreview = !!hoverAction;
  const showAttachPreview = !!(hoverCandidate || previewRemove);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="grid min-h-0 flex-1 gap-2 text-left lg:grid-cols-[minmax(150px,0.2fr)_minmax(0,0.48fr)_minmax(220px,0.32fr)] lg:items-stretch">
        {/* CREW */}
        <div className="pixel-card flex min-h-0 flex-col">
          <div className="font-display text-[10px] text-primary">CREW</div>
          <p className="mt-1 font-mono text-[9px] text-muted-foreground">Who to work on</p>
          <div className="pixel-scrollbar mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {rows.map((row) => {
              const active = row.ownerId === ownerId;
              return (
                <button
                  key={row.ownerId}
                  type="button"
                  onClick={() => {
                    onSelectOwner(row.ownerId);
                    setActiveMount(null);
                    setHoverCandidate(null);
                    setHoverAction(null);
                  }}
                  className={`w-full border px-2 py-2 text-left font-mono ${
                    active ? "border-primary text-primary" : "border-border/50 text-foreground"
                  }`}
                >
                  <div className="truncate text-[11px] font-display tracking-wide">{row.name}</div>
                  <div className="mt-1 truncate text-[8px] text-muted-foreground">
                    {weaponDisplayName(row.weaponId)}
                  </div>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onOpenEquipment}
            className="pixel-btn mt-2 w-full shrink-0 px-2 py-1.5 text-[9px]"
          >
            OPEN EQUIPMENT
          </button>
        </div>

        {/* WEAPON BUILD */}
        <div className="pixel-card flex min-h-0 flex-col">
          {!eq ? (
            <div className="font-mono text-[10px] text-muted-foreground">No kit for this operator.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-display text-[10px] text-primary">WEAPON BUILD</div>
                  <div className="mt-1 font-display text-[14px] tracking-wide text-foreground">
                    {weaponDisplayName(eq.weapon)}
                  </div>
                  <div className="mt-1 font-mono text-[9px] text-accent">{summary}</div>
                </div>
                <div className="font-mono text-[9px] text-muted-foreground">
                  LOAD {load.weight.toFixed(1)} · {load.moveTilesPerSec.toFixed(2)} t/s
                </div>
              </div>

              <div className="mt-3 flex justify-center border border-border/50 bg-[#141210] py-3">
                <WeaponSprite
                  weaponId={eq.weapon}
                  scavMods={showScavPreview ? previewScav : scavState}
                  scale={2}
                />
              </div>
              {showScavPreview && hoverAction && (
                <div className="mt-1 text-center font-mono text-[8px] text-accent">
                  PREVIEW · {hoverAction.label}
                </div>
              )}

              {platform && scavState && (
                <div className="mt-3 grid grid-cols-2 gap-1 font-mono text-[9px]">
                  {BENCH_SLOTS.filter((s) => platform.supportedSlots.includes(s)).map((slot) => (
                    <div key={slot} className="border border-border/40 px-2 py-1">
                      <div className="text-[7px] uppercase text-muted-foreground">{slotLabel(slot)}</div>
                      <div className="truncate text-foreground">
                        {currentPartLabel(eq.weapon, showScavPreview ? previewScav : scavState, slot)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {platform && (
                <div className="mt-3 border-t border-border/50 pt-2">
                  <div className="font-display text-[10px] text-primary">BENCH WORK</div>
                  <p className="mt-0.5 font-mono text-[8px] text-muted-foreground">
                    Cut · tape · weld · shorten
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {scavActions.length === 0 ? (
                      <span className="font-mono text-[9px] text-muted-foreground">
                        No work available for this build.
                      </span>
                    ) : (
                      scavActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          className="pixel-btn px-2 py-1 text-[8px]"
                          onMouseEnter={() => {
                            setHoverAction(action);
                            setHoverCandidate(null);
                            setPreviewRemove(false);
                          }}
                          onMouseLeave={() => setHoverAction(null)}
                          onClick={() => runScavAction(action)}
                          title={action.desc}
                        >
                          {action.label}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Factory mounts */}
              <div className="mt-3 border-t border-border/50 pt-2">
                <div className="font-display text-[10px] text-primary">FACTORY PARTS</div>
                <p className="mt-0.5 font-mono text-[8px] text-muted-foreground">
                  Optics · muzzles · mags · grips
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {mountRows.map((row) => {
                    const selected = activeMount === row.mount;
                    const filled = !!row.attachmentId;
                    return (
                      <button
                        key={row.mount}
                        type="button"
                        onClick={() => selectMount(row.mount)}
                        className={`border-2 px-2 py-2 text-left font-mono transition-colors ${
                          selected
                            ? "border-primary bg-primary/10"
                            : filled
                              ? "border-accent/70 bg-background/70 hover:border-accent"
                              : "border-dashed border-border/70 bg-background/30 hover:border-primary/60"
                        }`}
                      >
                        <div className="text-[8px] uppercase tracking-wide text-muted-foreground">
                          {row.label}
                        </div>
                        <div
                          className={`mt-1 truncate text-[11px] ${
                            filled ? "text-accent" : "text-muted-foreground"
                          }`}
                        >
                          {filled
                            ? (ATTACHMENTS[row.attachmentId!]?.name ?? row.attachmentId)
                            : "EMPTY"}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {mountRows.length === 0 && (
                  <div className="mt-2 font-mono text-[10px] text-muted-foreground">
                    No factory mounts on this weapon.
                  </div>
                )}
              </div>

              {activeMount && (
                <div className="mt-3 min-h-0 flex-1 border-t border-border/50 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-display text-[10px] text-primary">
                      {MOUNT_LABEL[activeMount]} OPTIONS
                    </div>
                    {equippedOnMount && (
                      <button
                        type="button"
                        className="pixel-btn px-2 py-1 text-[8px]"
                        onMouseEnter={() => {
                          setPreviewRemove(true);
                          setHoverCandidate(null);
                          setHoverAction(null);
                        }}
                        onMouseLeave={() => setPreviewRemove(false)}
                        onClick={detachActive}
                      >
                        REMOVE
                      </button>
                    )}
                  </div>
                  <div className="pixel-scrollbar mt-2 max-h-[22vh] space-y-1 overflow-y-auto">
                    {candidates.length === 0 ? (
                      <div className="font-mono text-[9px] text-muted-foreground">
                        No compatible parts in stash or shop.
                      </div>
                    ) : (
                      candidates.map((c) => (
                        <CandidateRow
                          key={`${c.source}-${c.attachId}-${c.stashUid ?? c.shopDefId ?? "eq"}`}
                          candidate={c}
                          onHover={() => {
                            setPreviewRemove(false);
                            setHoverAction(null);
                            setHoverCandidate(c.action === "KEEP" ? null : c);
                          }}
                          onLeave={() => setHoverCandidate(null)}
                          onAction={() => runCandidate(c)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* STATS */}
        <div className="pixel-card flex min-h-0 flex-col">
          <div className="font-display text-[10px] text-primary">STATS</div>
          <p className="mt-1 font-mono text-[8px] text-muted-foreground">
            BASE · FITTED · PREVIEW delta
          </p>
          {eq ? (
            <div className="pixel-scrollbar mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
              <div className="grid grid-cols-[minmax(4.5rem,1fr)_3.2rem_3.2rem_3.5rem] gap-1 font-mono text-[8px] uppercase text-muted-foreground">
                <span>Stat</span>
                <span>Base</span>
                <span>Now</span>
                <span>Δ</span>
              </div>
              {stats.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[minmax(4.5rem,1fr)_3.2rem_3.2rem_3.5rem] items-baseline gap-1 border-b border-border/40 py-1.5 font-mono text-[10px]"
                >
                  <span className="text-foreground">{row.label}</span>
                  <span className="text-muted-foreground">{row.display(row.base)}</span>
                  <span className="text-foreground">{row.display(row.current)}</span>
                  <span className={toneClass(row.tone)}>
                    {showAttachPreview || showScavPreview ? row.deltaLabel : "—"}
                  </span>
                </div>
              ))}
              {(showAttachPreview || showScavPreview) && (
                <div className="mt-2 border border-border/40 bg-background/40 px-2 py-1.5 font-mono text-[9px]">
                  <div className="text-muted-foreground">PREVIEW</div>
                  <div className="mt-0.5 text-foreground">
                    {hoverAction
                      ? hoverAction.label
                      : previewRemove
                        ? `Remove ${equippedOnMount ? ATTACHMENTS[equippedOnMount]?.name ?? equippedOnMount : "mod"}`
                        : hoverCandidate
                          ? `${hoverCandidate.action.replace("_", " + ")} ${hoverCandidate.name}`
                          : ""}
                  </div>
                  {hoverAction && (
                    <div className="mt-1 text-[8px] text-accent">{hoverAction.desc}</div>
                  )}
                  {hoverCandidate && hoverCandidate.effects.length > 0 && (
                    <div className="mt-1 text-[8px] text-accent">
                      {hoverCandidate.effects.join(" · ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 font-mono text-[10px] text-muted-foreground">—</div>
          )}
          <div className="mt-3 shrink-0 font-mono text-[9px] text-muted-foreground">
            BANK {bank.toLocaleString()}₽
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onBack} className="pixel-btn pixel-btn-primary flex-1">
          BACK TO CAMP
        </button>
      </div>
    </div>
  );
}

function CandidateRow({
  candidate,
  onHover,
  onLeave,
  onAction,
}: {
  candidate: ArmoryCandidate;
  onHover: () => void;
  onLeave: () => void;
  onAction: () => void;
}) {
  const sourceLabel =
    candidate.source === "equipped"
      ? "EQUIPPED"
      : candidate.source === "stash"
        ? "STASH"
        : "SHOP";
  const actionLabel =
    candidate.action === "BUY_INSTALL"
      ? "BUY + INSTALL"
      : candidate.action === "REPLACE"
        ? "REPLACE"
        : candidate.action === "INSTALL"
          ? "INSTALL"
          : "FITTED";
  const blocked = !!candidate.blockedReason;

  return (
    <div
      className={`flex items-start gap-2 border-b border-border/40 py-1.5 ${
        blocked ? "opacity-60" : ""
      }`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="min-w-0 flex-1 font-mono text-[10px] leading-snug">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="truncate text-foreground" style={{ color: RARITY_COLOR.common }}>
            {candidate.name}
          </span>
          <span className="text-[8px] uppercase text-muted-foreground">{sourceLabel}</span>
          {candidate.price != null && (
            <span className="text-[8px] text-primary">{candidate.price.toLocaleString()}₽</span>
          )}
        </div>
        <div className="mt-0.5 text-[8px] text-muted-foreground">
          {candidate.effects.length
            ? candidate.effects.join(" · ")
            : attachmentModifierLines(candidate.attachId).join(" · ") || "—"}
          {` · WT +${candidate.weight.toFixed(2)}`}
          {candidate.blockedReason ? ` · ${candidate.blockedReason}` : ""}
        </div>
      </div>
      {candidate.action !== "KEEP" && (
        <button
          type="button"
          disabled={blocked}
          onClick={onAction}
          className="pixel-btn shrink-0 px-1.5 py-1 text-[8px] disabled:opacity-40"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
