/**
 * Camp Gun Bench — bench-first layout: crew rail, large weapon, contextual actions, compact stats.
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
  actionRequirementRows,
  actionShowsDestructiveWarning,
  factoryMountForVisualSlot,
  GUN_BENCH_TITLE,
  gunBenchWorkspaceTitle,
  listBenchWeaponSwapCandidates,
  preferredWeaponScale,
  scavActionsForSelectedSlot,
  selectedPartHeading,
  visualSlotForFactoryMount,
  type BenchWeaponSwapCandidate,
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
  onEquipWeapon,
  onUnequipWeapon,
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
  onEquipWeapon: (stashUid: number) => void;
  onUnequipWeapon: () => void;
  onBack: () => void;
  onOpenEquipment: () => void;
}) {
  const ownerId = coerceEquipmentOwnerId(meta, selectedOwnerId);
  const rows = listCrewEquipmentRows(meta);
  const ownerRow = rows.find((r) => r.ownerId === ownerId);
  const eq = getOwnerEquipment(meta, ownerId);
  const load = ownerLoadSummary(meta, ownerId);

  const [selectedSlot, setSelectedSlot] = useState<WeaponVisualSlot | null>(null);
  const [hoverSlot, setHoverSlot] = useState<WeaponVisualSlot | null>(null);
  const [pendingAction, setPendingAction] = useState<ScavBenchAction | null>(null);
  const [hoverCandidate, setHoverCandidate] = useState<ArmoryCandidate | null>(null);
  const [previewRemove, setPreviewRemove] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  const platform = eq ? platformForWeaponId(eq.weapon) : null;
  const scavState = eq ? ensureVisualState(eq.weapon, eq.scavMods) : null;
  const summary = eq ? weaponBuildSummary(eq.weapon, eq.attachments) : "NO WEAPON";
  const mountRows = eq ? armoryMountRows(eq.weapon, eq.attachments) : [];

  useEffect(() => {
    setSelectedSlot(null);
    setHoverSlot(null);
    setPendingAction(null);
    setHoverCandidate(null);
    setPreviewRemove(false);
    setSwapOpen(false);
  }, [ownerId, eq?.weapon]);

  const activeMount: AttachMount | null = selectedSlot
    ? factoryMountForVisualSlot(selectedSlot)
    : null;
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

  const scale = preferredWeaponScale(platform?.width ?? 160, 720, 4, 6);
  const heading =
    eq && selectedSlot ? selectedPartHeading(eq.weapon, scavState, selectedSlot) : null;
  const pendingReqs = pendingAction ? actionRequirementRows(pendingAction) : [];

  const swapCandidates = eq
    ? listBenchWeaponSwapCandidates(eq.weapon, eq.attachments, scavState, stash)
    : [];

  const selectSlot = (slot: WeaponVisualSlot) => {
    setSelectedSlot(slot);
    setPendingAction(null);
    setHoverCandidate(null);
    setPreviewRemove(false);
  };

  const runCandidate = (c: ArmoryCandidate) => {
    if (c.blockedReason) return;
    if (c.action === "KEEP") return;
    if (c.action === "BUY_INSTALL" && c.shopDefId) onBuyAndInstall(c.shopDefId);
    else if ((c.action === "INSTALL" || c.action === "REPLACE") && c.stashUid != null) {
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

  const equipSwap = (c: BenchWeaponSwapCandidate) => {
    if (c.kind === "equipped") {
      setSwapOpen(false);
      return;
    }
    if (c.stashUid == null) return;
    onEquipWeapon(c.stashUid);
    setSwapOpen(false);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2" data-gun-bench={GUN_BENCH_TITLE}>
      {/* Main: purple crew | yellow+blue+green/red workspace */}
      <div className="grid min-h-0 flex-1 gap-2 text-left max-lg:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(140px,0.18fr)_minmax(0,0.82fr)]">
        {/* PURPLE — Crew rail */}
        <aside className="pixel-card flex min-h-0 flex-col max-lg:max-h-32">
          <div className="font-display text-[10px] text-primary">CREW</div>
          <div className="pixel-scrollbar mt-2 flex min-h-0 flex-1 gap-1 overflow-auto lg:flex-col lg:space-y-1.5 lg:gap-0">
            {rows.map((row) => {
              const active = row.ownerId === ownerId;
              return (
                <button
                  key={row.ownerId}
                  type="button"
                  onClick={() => onSelectOwner(row.ownerId)}
                  className={`shrink-0 border px-2 py-2 text-left font-mono lg:w-full ${
                    active ? "border-primary text-primary" : "border-border/50 text-foreground"
                  }`}
                >
                  <div className="truncate text-[11px] font-display tracking-wide">{row.name}</div>
                  <div className="mt-0.5 truncate text-[8px] text-muted-foreground">
                    {weaponDisplayName(row.weaponId)}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main workspace column */}
        <div className="flex min-h-0 flex-col gap-2">
          {/* YELLOW — Current build header */}
          <header className="pixel-card shrink-0 px-3 py-2">
            {!eq ? (
              <div className="font-mono text-[10px] text-muted-foreground">No kit for this operator.</div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div
                    className={`font-display text-[10px] ${
                      workspace.mode === "preview" ? "text-accent" : "text-primary"
                    }`}
                  >
                    {workspace.title}
                    {workspace.subtitle ? ` — ${workspace.subtitle}` : ""}
                  </div>
                  <div className="mt-0.5 font-display text-[16px] tracking-wide text-foreground">
                    {weaponDisplayName(eq.weapon)}
                  </div>
                  <div className="font-mono text-[9px] text-muted-foreground">{summary}</div>
                  <div className="mt-1 font-mono text-[8px] text-muted-foreground">
                    {ownerRow?.name ?? "OPERATOR"}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="font-mono text-[9px] text-muted-foreground">
                    LOAD {load.weight.toFixed(1)} · MOVE {load.moveTilesPerSec.toFixed(2)} t/s
                  </div>
                  <button
                    type="button"
                    className="pixel-btn px-2 py-1 text-[9px]"
                    onClick={() => setSwapOpen(true)}
                  >
                    SWAP WEAPON
                  </button>
                </div>
              </div>
            )}
          </header>

          {/* BLUE — Large weapon bench */}
          <section className="pixel-card flex min-h-0 flex-[1.35] flex-col overflow-hidden">
            <div className="flex min-h-[180px] flex-1 items-center justify-center overflow-hidden bg-[#0e0d0b]">
              {eq && platform ? (
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
              ) : eq ? (
                <div className="px-4 py-8 text-center font-mono text-[10px] text-muted-foreground">
                  No Bench platform for this gun yet.
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
              ) : (
                <div className="font-mono text-[10px] text-muted-foreground">Select a crew member.</div>
              )}
            </div>
            <p className="shrink-0 border-t border-border/40 py-1 text-center font-mono text-[7px] text-muted-foreground">
              Click a part on the gun to work it
            </p>
          </section>

          {/* GREEN + RED — actions ~62% / stats ~38% */}
          <div className="grid min-h-0 flex-1 gap-2 max-md:grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,0.62fr)_minmax(160px,0.38fr)]">
            {/* GREEN — Selected part panel */}
            <section className="pixel-card flex min-h-0 flex-col overflow-hidden">
              {!eq || !selectedSlot ? (
                <div className="font-mono text-[9px] text-muted-foreground">
                  Select stock · mag · sight · grip · barrel on the weapon.
                </div>
              ) : (
                <div className="pixel-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-[11px] text-primary">
                        {heading?.slotLabel ?? selectedSlot.toUpperCase()}
                      </div>
                      <div className="font-mono text-[12px] text-foreground">
                        {heading?.partLabel ?? "—"}
                      </div>
                      <div className="mt-0.5 font-mono text-[8px] text-muted-foreground">
                        {heading?.flavor}
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

                  <div>
                    <div className="font-mono text-[7px] uppercase tracking-wide text-muted-foreground">
                      Bench work
                    </div>
                    {slotActions.length === 0 ? (
                      <div className="mt-1 font-mono text-[9px] text-muted-foreground">
                        No bench work available.
                      </div>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {slotActions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            className={`pixel-btn px-2 py-1.5 text-[9px] ${
                              pendingAction?.id === action.id ? "border-accent text-accent" : ""
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
                        ))}
                      </div>
                    )}
                  </div>

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
                      {pendingReqs.length > 0 && (
                        <div className="mt-2 border-t border-border/40 pt-1.5">
                          <div className="font-mono text-[7px] uppercase text-muted-foreground">
                            Requires
                          </div>
                          <div className="mt-1 space-y-0.5 font-mono text-[8px] text-foreground">
                            {pendingReqs.map((r) => (
                              <div key={`${r.kind}-${r.label}`} className="flex justify-between gap-2">
                                <span>{r.label}</span>
                                <span className="text-muted-foreground">
                                  {r.amount != null ? `×${r.amount}` : "TOOL"}
                                </span>
                              </div>
                            ))}
                          </div>
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

                  {effectiveMount && (
                    <div>
                      <div className="font-mono text-[7px] uppercase tracking-wide text-muted-foreground">
                        Factory / found · {MOUNT_LABEL[effectiveMount]}
                      </div>
                      <div className="mt-1 max-h-[22vh] space-y-0.5 overflow-y-auto">
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
            </section>

            {/* RED — Compact stats */}
            <aside className="pixel-card flex min-h-0 flex-col">
              <div className="font-display text-[10px] text-primary">STATS</div>
              {eq ? (
                <div className="pixel-scrollbar mt-1.5 min-h-0 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-[minmax(3rem,1fr)_2.4rem_2.4rem_2.6rem] gap-x-1 font-mono text-[7px] uppercase text-muted-foreground">
                    <span />
                    <span>Now</span>
                    <span>Prev</span>
                    <span>Δ</span>
                  </div>
                  {stats.map((row) => (
                    <div
                      key={row.key}
                      className="grid grid-cols-[minmax(3rem,1fr)_2.4rem_2.4rem_2.6rem] items-baseline gap-x-1 border-b border-border/30 py-0.5 font-mono text-[9px]"
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
              <div className="mt-1 shrink-0 font-mono text-[8px] text-muted-foreground">
                BANK {bank.toLocaleString()}₽
              </div>
            </aside>
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

      {swapOpen && eq && (
        <WeaponSwapDrawer
          candidates={swapCandidates}
          onEquip={equipSwap}
          onUnequip={() => {
            onUnequipWeapon();
            setSwapOpen(false);
          }}
          onClose={() => setSwapOpen(false)}
        />
      )}
    </div>
  );
}

function WeaponSwapDrawer({
  candidates,
  onEquip,
  onUnequip,
  onClose,
}: {
  candidates: BenchWeaponSwapCandidate[];
  onEquip: (c: BenchWeaponSwapCandidate) => void;
  onUnequip: () => void;
  onClose: () => void;
}) {
  const equipped = candidates.find((c) => c.kind === "equipped");
  const stashGuns = candidates.filter((c) => c.kind === "stash");

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-3">
      <div className="pixel-card flex max-h-[80%] w-full max-w-md flex-col">
        <div className="flex items-center justify-between gap-2">
          <div className="font-display text-[11px] text-primary">SWAP WEAPON</div>
          <button type="button" className="pixel-btn px-2 py-1 text-[8px]" onClick={onClose}>
            CLOSE
          </button>
        </div>

        {equipped && (
          <div className="mt-3 border border-border/50 px-2 py-2 font-mono text-[9px]">
            <div className="text-[7px] uppercase text-muted-foreground">Equipped</div>
            <div className="mt-0.5 text-[11px] text-foreground">{equipped.name}</div>
            <div className="mt-0.5 text-[8px] text-muted-foreground">
              ATT {equipped.attachmentCount} · {equipped.scavSummary} · WT {equipped.weight.toFixed(1)}
            </div>
            <button
              type="button"
              className="pixel-btn mt-2 px-2 py-1 text-[8px]"
              onClick={onUnequip}
            >
              UNEQUIP
            </button>
          </div>
        )}

        <div className="mt-3 font-mono text-[7px] uppercase text-muted-foreground">Stash</div>
        <div className="pixel-scrollbar mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {stashGuns.length === 0 ? (
            <div className="font-mono text-[9px] text-muted-foreground">No other guns in stash.</div>
          ) : (
            stashGuns.map((c) => (
              <div
                key={c.stashUid}
                className="flex items-center gap-2 border-b border-border/40 py-1.5 font-mono text-[9px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-foreground">{c.name}</div>
                  <div className="text-[7px] text-muted-foreground">
                    ATT {c.attachmentCount} · {c.scavSummary} · WT {c.weight.toFixed(1)}
                  </div>
                </div>
                <button
                  type="button"
                  className="pixel-btn shrink-0 px-2 py-1 text-[8px]"
                  onClick={() => onEquip(c)}
                >
                  EQUIP
                </button>
              </div>
            ))
          )}
        </div>
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
