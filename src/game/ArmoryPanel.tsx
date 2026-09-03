/**
 * Camp Gun Bench — large weapon workspace with clickable parts.
 * Evolved from the Armory / Gunsmith panel.
 */

import { useEffect, useMemo, useState } from "react";
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
import { ATTACHMENTS, type Item } from "./gear";
import {
  actionShowsDestructiveWarning,
  factoryMountForVisualSlot,
  GUN_BENCH_TITLE,
  gunBenchWorkspaceTitle,
  preferredWeaponScale,
  scavActionsForSelectedSlot,
  selectedPartHeading,
  visualSlotForFactoryMount,
} from "./gunBenchUi";
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
  previewScavAction,
  type ScavBenchAction,
} from "./scavWeaponMods";
import { attachmentModifierLines } from "./weaponAttachments";
import {
  platformForWeaponId,
  type WeaponVisualSlot,
  type WeaponVisualState,
} from "./weaponVisuals";
import WeaponSprite from "./WeaponSprite";

function toneClass(tone: ArmoryStatTone): string {
  if (tone === "good") return "text-emerald-400";
  if (tone === "bad") return "text-red-400";
  return "text-muted-foreground";
}

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

  const [selectedSlot, setSelectedSlot] = useState<WeaponVisualSlot | null>(null);
  const [hoverSlot, setHoverSlot] = useState<WeaponVisualSlot | null>(null);
  const [pendingAction, setPendingAction] = useState<ScavBenchAction | null>(null);
  const [hoverCandidate, setHoverCandidate] = useState<ArmoryCandidate | null>(null);
  const [previewRemove, setPreviewRemove] = useState(false);

  const platform = eq ? platformForWeaponId(eq.weapon) : null;
  const scavState = eq ? ensureVisualState(eq.weapon, eq.scavMods) : null;
  const summary = eq ? weaponBuildSummary(eq.weapon, eq.attachments) : "NO WEAPON";
  const mountRows = eq ? armoryMountRows(eq.weapon, eq.attachments) : [];

  // Reset part selection when operator/weapon changes.
  useEffect(() => {
    setSelectedSlot(null);
    setHoverSlot(null);
    setPendingAction(null);
    setHoverCandidate(null);
    setPreviewRemove(false);
  }, [ownerId, eq?.weapon]);

  const activeMount: AttachMount | null = selectedSlot
    ? factoryMountForVisualSlot(selectedSlot)
    : null;

  // Drop factory mount selection when the weapon has no such mount.
  const factoryMountAvailable =
    !!activeMount && mountRows.some((r) => r.mount === activeMount);
  const effectiveMount = factoryMountAvailable ? activeMount : null;

  const previewScav = useMemo(() => {
    if (!eq || !pendingAction) return scavState;
    return previewScavAction(eq.weapon, scavState, pendingAction.id) ?? scavState;
  }, [eq, pendingAction, scavState]);

  const previewAttachments = useMemo(() => {
    if (!eq || !effectiveMount) return eq?.attachments ?? [];
    return previewAttachmentsForCandidate(
      eq.weapon,
      eq.attachments,
      effectiveMount,
      hoverCandidate,
      previewRemove,
    );
  }, [eq, effectiveMount, hoverCandidate, previewRemove]);

  const previewingScav = !!pendingAction;
  const previewingAttach = !!(hoverCandidate || previewRemove);
  const previewing = previewingScav || previewingAttach;

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

  const slotActions =
    eq && selectedSlot ? scavActionsForSelectedSlot(eq.weapon, scavState, selectedSlot) : [];

  const candidates =
    eq && effectiveMount
      ? listArmoryCandidates({
          weaponId: eq.weapon,
          mount: effectiveMount,
          currentAttachments: eq.attachments,
          stash,
          shopDefIds,
          bank,
          buyMult,
          stashSlots,
        })
      : [];

  const equippedOnMount = effectiveMount
    ? mountRows.find((r) => r.mount === effectiveMount)?.attachmentId
    : null;

  const workspace = gunBenchWorkspaceTitle(
    pendingAction
      ? pendingAction.label
      : previewRemove
        ? `REMOVE ${equippedOnMount ? ATTACHMENTS[equippedOnMount]?.name ?? equippedOnMount : "PART"}`
        : hoverCandidate
          ? `${hoverCandidate.action.replace("_", " ")} ${hoverCandidate.name}`
          : null,
  );

  const scale = preferredWeaponScale(platform?.width ?? 160, 560, 3, 5);

  const selectSlot = (slot: WeaponVisualSlot) => {
    setSelectedSlot(slot);
    setPendingAction(null);
    setHoverCandidate(null);
    setPreviewRemove(false);
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
    if (!eq || !effectiveMount) return;
    const idx = mountIndexForUnequip(eq.weapon, eq.attachments, effectiveMount);
    if (idx == null) return;
    onDetachMount(idx);
    setPreviewRemove(false);
    setHoverCandidate(null);
  };

  const applyPending = () => {
    if (!eq || !pendingAction) return;
    const result = applyScavAction(eq.weapon, scavState, pendingAction.id);
    if (!result.ok) return;
    onApplyScavMods(result.state);
    setPendingAction(null);
  };

  const heading =
    eq && selectedSlot ? selectedPartHeading(eq.weapon, scavState, selectedSlot) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-gun-bench={GUN_BENCH_TITLE}>
      <div className="grid min-h-0 flex-1 gap-2 text-left max-lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-cols-[minmax(110px,0.14fr)_minmax(0,0.62fr)_minmax(180px,0.24fr)] lg:items-stretch">
        {/* CREW — compact */}
        <div className="pixel-card flex min-h-0 flex-col max-lg:max-h-28">
          <div className="font-display text-[10px] text-primary">CREW</div>
          <div className="pixel-scrollbar mt-1.5 flex min-h-0 flex-1 gap-1 overflow-auto lg:flex-col lg:space-y-1 lg:gap-0">
            {rows.map((row) => {
              const active = row.ownerId === ownerId;
              return (
                <button
                  key={row.ownerId}
                  type="button"
                  onClick={() => onSelectOwner(row.ownerId)}
                  className={`shrink-0 border px-2 py-1.5 text-left font-mono lg:w-full ${
                    active ? "border-primary text-primary" : "border-border/50 text-foreground"
                  }`}
                >
                  <div className="truncate text-[10px] font-display tracking-wide">{row.name}</div>
                  <div className="mt-0.5 truncate text-[7px] text-muted-foreground">
                    {weaponDisplayName(row.weaponId)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* CENTER — weapon workspace + part panel */}
        <div className="pixel-card flex min-h-0 flex-col overflow-hidden">
          {!eq ? (
            <div className="font-mono text-[10px] text-muted-foreground">No kit for this operator.</div>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div
                    className={`font-display text-[10px] ${
                      workspace.mode === "preview" ? "text-accent" : "text-primary"
                    }`}
                  >
                    {workspace.title}
                  </div>
                  {workspace.subtitle && (
                    <div className="mt-0.5 font-mono text-[9px] text-accent">{workspace.subtitle}</div>
                  )}
                  <div className="mt-1 font-display text-[13px] tracking-wide text-foreground">
                    {weaponDisplayName(eq.weapon)}
                  </div>
                  <div className="font-mono text-[8px] text-muted-foreground">{summary}</div>
                </div>
                <div className="font-mono text-[8px] text-muted-foreground">
                  LOAD {load.weight.toFixed(1)} · {load.moveTilesPerSec.toFixed(2)} t/s
                </div>
              </div>

              <div className="mt-2 flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-[140px] flex-1 items-center justify-center overflow-hidden border border-border/40 bg-[#0e0d0b]">
                  {platform ? (
                    <WeaponSprite
                      weaponId={eq.weapon}
                      scavMods={previewingScav ? previewScav : scavState}
                      scale={scale}
                      interactive
                      selectedSlot={selectedSlot}
                      hoverSlot={hoverSlot}
                      onSelectSlot={selectSlot}
                      onHoverSlot={setHoverSlot}
                    />
                  ) : (
                    <div className="px-4 py-8 text-center font-mono text-[10px] text-muted-foreground">
                      No Bench platform for this gun yet.
                      <div className="mt-2 text-[8px]">Factory mounts still work below when available.</div>
                      <div className="mt-3 flex flex-wrap justify-center gap-1">
                        {mountRows.map((row) => (
                          <button
                            key={row.mount}
                            type="button"
                            className="pixel-btn px-2 py-1 text-[8px]"
                            onClick={() => selectSlot(visualSlotForFactoryMount(row.mount))}
                          >
                            {row.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <p className="mt-1 shrink-0 text-center font-mono text-[7px] text-muted-foreground">
                  Click a part on the gun to work it
                </p>
              </div>

              {/* Selected part panel */}
              <div className="mt-2 shrink-0 border-t border-border/50 pt-2">
                {!selectedSlot ? (
                  <div className="font-mono text-[9px] text-muted-foreground">
                    Select stock · mag · sight · grip · barrel on the weapon.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <div className="font-display text-[10px] text-primary">
                          {heading?.slotLabel ?? selectedSlot.toUpperCase()}
                        </div>
                        <div className="font-mono text-[11px] text-foreground">
                          {heading?.partLabel ?? "—"}
                        </div>
                      </div>
                      {effectiveMount && equippedOnMount && (
                        <button
                          type="button"
                          className="pixel-btn px-2 py-1 text-[8px]"
                          onMouseEnter={() => {
                            setPreviewRemove(true);
                            setHoverCandidate(null);
                            setPendingAction(null);
                          }}
                          onMouseLeave={() => setPreviewRemove(false)}
                          onClick={detachActive}
                        >
                          REMOVE FACTORY
                        </button>
                      )}
                    </div>

                    {/* Scav work */}
                    <div>
                      <div className="font-mono text-[7px] uppercase tracking-wide text-muted-foreground">
                        Scav work
                      </div>
                      {slotActions.length === 0 ? (
                        <div className="mt-1 font-mono text-[9px] text-muted-foreground">
                          No bench work available.
                        </div>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {slotActions.map((action) => {
                            const selected = pendingAction?.id === action.id;
                            return (
                              <button
                                key={action.id}
                                type="button"
                                className={`pixel-btn px-2 py-1 text-[8px] ${
                                  selected ? "border-accent text-accent" : ""
                                }`}
                                title={action.desc}
                                onClick={() => {
                                  setPendingAction(action);
                                  setHoverCandidate(null);
                                  setPreviewRemove(false);
                                }}
                              >
                                {action.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Pending confirm */}
                    {pendingAction && (
                      <div className="border border-accent/50 bg-accent/5 px-2 py-2">
                        <div className="font-display text-[10px] text-accent">{pendingAction.label}</div>
                        <div className="mt-0.5 font-mono text-[8px] text-muted-foreground">
                          {pendingAction.desc}
                        </div>
                        {actionShowsDestructiveWarning(eq.weapon, pendingAction.id) && (
                          <div className="mt-1 font-mono text-[8px] text-amber-400">
                            ⚠ PERMANENT MODIFICATION
                          </div>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="pixel-btn pixel-btn-primary px-3 py-1 text-[9px]"
                            onClick={applyPending}
                          >
                            DO IT
                          </button>
                          <button
                            type="button"
                            className="pixel-btn px-3 py-1 text-[9px]"
                            onClick={() => setPendingAction(null)}
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Factory parts for this slot */}
                    {effectiveMount && (
                      <div>
                        <div className="font-mono text-[7px] uppercase tracking-wide text-muted-foreground">
                          Factory · {MOUNT_LABEL[effectiveMount]}
                        </div>
                        <div className="pixel-scrollbar mt-1 max-h-[18vh] space-y-0.5 overflow-y-auto">
                          {candidates.length === 0 ? (
                            <div className="font-mono text-[9px] text-muted-foreground">
                              No compatible factory parts in stash or shop.
                            </div>
                          ) : (
                            candidates.map((c) => (
                              <CandidateRow
                                key={`${c.source}-${c.attachId}-${c.stashUid ?? c.shopDefId ?? "eq"}`}
                                candidate={c}
                                onHover={() => {
                                  setPreviewRemove(false);
                                  setPendingAction(null);
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
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* STATS — dense */}
        <div className="pixel-card flex min-h-0 flex-col">
          <div className="font-display text-[10px] text-primary">STATS</div>
          {eq ? (
            <div className="pixel-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-[minmax(3.2rem,1fr)_2.6rem_2.6rem_2.8rem] gap-x-1 font-mono text-[7px] uppercase text-muted-foreground">
                <span />
                <span>Now</span>
                <span>Prev</span>
                <span>Δ</span>
              </div>
              {stats.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[minmax(3.2rem,1fr)_2.6rem_2.6rem_2.8rem] items-baseline gap-x-1 border-b border-border/30 py-1 font-mono text-[9px]"
                >
                  <span className="truncate text-foreground">{row.label}</span>
                  <span className="text-foreground">{row.display(row.current)}</span>
                  <span className={previewing ? "text-accent" : "text-muted-foreground"}>
                    {previewing ? row.display(row.preview) : "—"}
                  </span>
                  <span className={previewing ? toneClass(row.tone) : "text-muted-foreground"}>
                    {previewing ? row.deltaLabel : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">—</div>
          )}
          <div className="mt-2 shrink-0 font-mono text-[8px] text-muted-foreground">
            BANK {bank.toLocaleString()}₽
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onOpenEquipment} className="pixel-btn flex-1 px-2 py-1.5 text-[9px]">
          OPEN EQUIPMENT
        </button>
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
      className={`flex items-start gap-2 border-b border-border/30 py-1 ${blocked ? "opacity-60" : ""}`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="min-w-0 flex-1 font-mono text-[9px] leading-snug">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="truncate text-foreground">{candidate.name}</span>
          <span className="text-[7px] uppercase text-muted-foreground">{sourceLabel}</span>
          {candidate.price != null && (
            <span className="text-[7px] text-primary">{candidate.price.toLocaleString()}₽</span>
          )}
        </div>
        <div className="mt-0.5 text-[7px] text-muted-foreground">
          {candidate.effects.length
            ? candidate.effects.join(" · ")
            : attachmentModifierLines(candidate.attachId).join(" · ") || "—"}
          {candidate.blockedReason ? ` · ${candidate.blockedReason}` : ""}
        </div>
      </div>
      {candidate.action !== "KEEP" && (
        <button
          type="button"
          disabled={blocked}
          onClick={onAction}
          className="pixel-btn shrink-0 px-1.5 py-0.5 text-[7px] disabled:opacity-40"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
