/**
 * Camp Armory / Gunsmith — inspect mounts, preview stats, install / buy attachments.
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
import { attachmentModifierLines } from "./weaponAttachments";

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
  onBack: () => void;
  onOpenEquipment: () => void;
}) {
  const ownerId = coerceEquipmentOwnerId(meta, selectedOwnerId);
  const rows = listCrewEquipmentRows(meta);
  const selectedRow = rows.find((r) => r.ownerId === ownerId) ?? rows[0]!;
  const eq = getOwnerEquipment(meta, ownerId);
  const load = ownerLoadSummary(meta, ownerId);
  const [activeMount, setActiveMount] = useState<AttachMount | null>(null);
  const [hoverCandidate, setHoverCandidate] = useState<ArmoryCandidate | null>(null);
  const [previewRemove, setPreviewRemove] = useState(false);

  const mountRows = eq ? armoryMountRows(eq.weapon, eq.attachments) : [];
  const summary = eq ? weaponBuildSummary(eq.weapon, eq.attachments) : "NO WEAPON";

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
    ? armoryStatRows(eq.weapon, eq.attachments, previewAttachments, eq.armor)
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

  const equippedOnMount = activeMount
    ? mountRows.find((r) => r.mount === activeMount)?.attachmentId
    : null;

  const selectMount = (mount: AttachMount) => {
    setActiveMount(mount);
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
    if (!eq || !activeMount) return;
    const idx = mountIndexForUnequip(eq.weapon, eq.attachments, activeMount);
    if (idx == null) return;
    onDetachMount(idx);
    setPreviewRemove(false);
    setHoverCandidate(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="grid min-h-0 flex-1 gap-2 text-left lg:grid-cols-[minmax(150px,0.22fr)_minmax(0,0.45fr)_minmax(220px,0.33fr)] lg:items-stretch">
        {/* CREW */}
        <div className="pixel-card flex min-h-0 flex-col">
          <div className="font-display text-[10px] text-primary">CREW</div>
          <p className="mt-1 font-mono text-[9px] text-muted-foreground">Who to mod</p>
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

        {/* WEAPON + MOUNTS */}
        <div className="pixel-card flex min-h-0 flex-col">
          {!eq ? (
            <div className="font-mono text-[10px] text-muted-foreground">No kit for this operator.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-display text-[10px] text-primary">WEAPON</div>
                  <div className="mt-1 font-display text-[14px] tracking-wide text-foreground">
                    {weaponDisplayName(eq.weapon)}
                  </div>
                  <div className="mt-1 font-mono text-[9px] text-accent">{summary}</div>
                </div>
                <div className="font-mono text-[9px] text-muted-foreground">
                  LOAD {load.weight.toFixed(1)} · {load.moveTilesPerSec.toFixed(2)} t/s
                </div>
              </div>

              {/* Schematic mount board */}
              <div className="relative mt-4 flex min-h-[180px] flex-1 flex-col items-center justify-center border border-border/50 bg-background/40 px-3 py-6">
                <div className="pointer-events-none absolute inset-x-8 top-1/2 h-[3px] -translate-y-1/2 bg-border/70" />
                <div className="pointer-events-none absolute left-1/2 top-6 bottom-6 w-[3px] -translate-x-1/2 bg-border/40" />
                <div className="relative z-[1] grid w-full max-w-md grid-cols-2 gap-3">
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
                  <div className="font-mono text-[10px] text-muted-foreground">
                    This weapon has no attachment mounts.
                  </div>
                )}
              </div>

              {/* Picker */}
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
                        }}
                        onMouseLeave={() => setPreviewRemove(false)}
                        onClick={detachActive}
                      >
                        REMOVE
                      </button>
                    )}
                  </div>
                  <div className="pixel-scrollbar mt-2 max-h-[28vh] space-y-1 overflow-y-auto lg:max-h-[32vh]">
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
                    {hoverCandidate || previewRemove ? row.deltaLabel : "—"}
                  </span>
                </div>
              ))}
              {(hoverCandidate || previewRemove) && (
                <div className="mt-2 border border-border/40 bg-background/40 px-2 py-1.5 font-mono text-[9px]">
                  <div className="text-muted-foreground">PREVIEW</div>
                  <div className="mt-0.5 text-foreground">
                    {previewRemove
                      ? `Remove ${equippedOnMount ? ATTACHMENTS[equippedOnMount]?.name ?? equippedOnMount : "mod"}`
                      : hoverCandidate
                        ? `${hoverCandidate.action.replace("_", " + ")} ${hoverCandidate.name}`
                        : ""}
                  </div>
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
  const rarity =
    Object.values(ATTACHMENTS).find((a) => a.id === candidate.attachId) != null
      ? undefined
      : undefined;

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
          <span className="truncate text-foreground" style={rarity ? { color: RARITY_COLOR.common } : undefined}>
            {candidate.name}
          </span>
          <span className="text-[8px] uppercase text-muted-foreground">{sourceLabel}</span>
          {candidate.price != null && (
            <span className="text-[8px] text-primary">{candidate.price.toLocaleString()}₽</span>
          )}
        </div>
        <div className="mt-0.5 text-[8px] text-muted-foreground">
          {candidate.effects.length ? candidate.effects.join(" · ") : attachmentModifierLines(candidate.attachId).join(" · ") || "—"}
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
