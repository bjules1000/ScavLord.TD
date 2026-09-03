/**
 * Camp Armory / Gunsmith helpers — UI layer over canonical attachment + economy systems.
 */

import { getEquippedWeight } from "./armor";
import {
  ATTACHMENTS,
  ITEMS,
  WEAPONS,
  type Item,
} from "./gear";
import { getOperatorMoveSpeed } from "./movement";
import { attachItemId } from "./raidGear";
import {
  attachmentModifierLines,
  canInstallAttachment,
  canInstallAttachmentOnWeapon,
  fittedWeaponStats,
  installAttachmentInMounts,
  MOUNT_LABEL,
  mountRowsForWeapon,
  slotOf,
  type AttachMount,
} from "./weaponAttachments";
import { attachmentDef, weaponDef } from "./weapons";

export type { AttachMount } from "./gear";
export { MOUNT_LABEL };

export type ArmorySource = "equipped" | "stash" | "shop";

export type ArmoryCandidate = {
  attachId: string;
  name: string;
  source: ArmorySource;
  /** Stash item uid when source is stash. */
  stashUid?: number;
  /** Shop item def id when source is shop. */
  shopDefId?: string;
  price?: number;
  affordable: boolean;
  effects: string[];
  weight: number;
  action: "KEEP" | "INSTALL" | "REPLACE" | "BUY_INSTALL";
  blockedReason?: string;
};

export type ArmoryStatTone = "good" | "bad" | "neutral";

export type ArmoryStatRow = {
  key: string;
  label: string;
  base: number;
  current: number;
  preview: number;
  display: (n: number) => string;
  /** Higher preview vs current is good when true; inverted for reload/weight/spread. */
  higherIsBetter: boolean;
  tone: ArmoryStatTone;
  deltaLabel: string;
};

export function armoryMountRows(weaponId: string, attachments: readonly string[]) {
  return mountRowsForWeapon(weaponId, attachments);
}

export function mountIndexForUnequip(
  weaponId: string,
  attachments: readonly string[],
  mount: AttachMount,
): number | null {
  const rows = mountRowsForWeapon(weaponId, attachments);
  const idx = rows.findIndex((r) => r.mount === mount && r.attachmentId);
  return idx >= 0 ? idx : null;
}

function previewAttachmentList(
  weaponId: string,
  current: readonly string[],
  nextAttachId: string | null,
  mount: AttachMount,
): string[] {
  if (nextAttachId == null) {
    return current.filter((id) => slotOf(id) !== mount);
  }
  const result = installAttachmentInMounts(weaponId, current, nextAttachId);
  return result.ok ? result.attachments : [...current];
}

export function armoryStatRows(
  weaponId: string,
  currentAttachments: readonly string[],
  previewAttachments: readonly string[],
  armorId: string | null = null,
): ArmoryStatRow[] {
  const weapon = weaponDef(weaponId);
  const base = fittedWeaponStats(weaponId, []);
  const current = fittedWeaponStats(weaponId, currentAttachments);
  const preview = fittedWeaponStats(weaponId, previewAttachments);

  const baseMove = getOperatorMoveSpeed({
    weapon: weaponId,
    armor: armorId,
    attachments: [],
  });
  const curMove = getOperatorMoveSpeed({
    weapon: weaponId,
    armor: armorId,
    attachments: currentAttachments,
  });
  const prevMove = getOperatorMoveSpeed({
    weapon: weaponId,
    armor: armorId,
    attachments: previewAttachments,
  });

  const baseWeight = getEquippedWeight({
    weapon: weaponId,
    armor: armorId,
    attachments: [],
  });
  const curWeight = getEquippedWeight({
    weapon: weaponId,
    armor: armorId,
    attachments: currentAttachments,
  });
  const prevWeight = getEquippedWeight({
    weapon: weaponId,
    armor: armorId,
    attachments: previewAttachments,
  });

  type Spec = {
    key: string;
    label: string;
    base: number;
    current: number;
    preview: number;
    display: (n: number) => string;
    higherIsBetter: boolean;
  };

  const specs: Spec[] = [
    {
      key: "damage",
      label: "DAMAGE",
      base: base.damage,
      current: current.damage,
      preview: preview.damage,
      display: (n) => (weapon.pellets ? `${n.toFixed(0)}×${weapon.pellets}` : n.toFixed(0)),
      higherIsBetter: true,
    },
    {
      key: "range",
      label: "RANGE",
      base: base.range,
      current: current.range,
      preview: preview.range,
      display: (n) => Math.round(n).toString(),
      higherIsBetter: true,
    },
    {
      key: "accuracy",
      label: "ACCURACY",
      base: base.accuracy,
      current: current.accuracy,
      preview: preview.accuracy,
      display: (n) => n.toFixed(2),
      higherIsBetter: true,
    },
    {
      key: "magSize",
      label: "MAG SIZE",
      base: base.magSize,
      current: current.magSize,
      preview: preview.magSize,
      display: (n) => Math.round(n).toString(),
      higherIsBetter: true,
    },
    {
      key: "reloadMs",
      label: "RELOAD",
      base: base.reloadMs / 1000,
      current: current.reloadMs / 1000,
      preview: preview.reloadMs / 1000,
      display: (n) => `${n.toFixed(1)}s`,
      higherIsBetter: false,
    },
    {
      key: "cooldown",
      label: "CYCLE",
      base: base.cooldown,
      current: current.cooldown,
      preview: preview.cooldown,
      display: (n) => `${Math.round(n)}ms`,
      higherIsBetter: false,
    },
  ];

  if (weapon.spread != null) {
    specs.push({
      key: "spread",
      label: "SPREAD",
      base: base.spread ?? weapon.spread,
      current: current.spread ?? weapon.spread,
      preview: preview.spread ?? weapon.spread,
      display: (n) => n.toFixed(2),
      higherIsBetter: false,
    });
  }

  specs.push(
    {
      key: "weight",
      label: "WEIGHT",
      base: baseWeight,
      current: curWeight,
      preview: prevWeight,
      display: (n) => n.toFixed(1),
      higherIsBetter: false,
    },
    {
      key: "move",
      label: "MOVE",
      base: baseMove,
      current: curMove,
      preview: prevMove,
      display: (n) => `${n.toFixed(2)} t/s`,
      higherIsBetter: true,
    },
  );

  return specs.map((s) => {
    const delta = s.preview - s.current;
    const changed = Math.abs(delta) > 1e-6;
    let tone: ArmoryStatTone = "neutral";
    if (changed) {
      const improved = s.higherIsBetter ? delta > 0 : delta < 0;
      tone = improved ? "good" : "bad";
    }
    return {
      key: s.key,
      label: s.label,
      base: s.base,
      current: s.current,
      preview: s.preview,
      display: s.display,
      higherIsBetter: s.higherIsBetter,
      tone,
      deltaLabel: changed ? formatDelta(s, delta) : "—",
    };
  });
}

function formatDelta(s: { display: (n: number) => string; key: string }, delta: number): string {
  const sign = delta > 0 ? "+" : "";
  if (s.key === "accuracy" || s.key === "spread") return `${sign}${delta.toFixed(2)}`;
  if (s.key === "reloadMs" || s.key === "move" || s.key === "weight") return `${sign}${delta.toFixed(2)}`;
  if (s.key === "cooldown") return `${sign}${Math.round(delta)}`;
  return `${sign}${Math.round(delta * 10) / 10}`;
}

/** Lightweight build identity for fast comprehension. */
export function weaponBuildSummary(
  weaponId: string,
  attachments: readonly string[],
): string {
  const weapon = weaponDef(weaponId);
  const fitted = fittedWeaponStats(weaponId, attachments);
  const base = fittedWeaponStats(weaponId, []);
  const weight = fitted.weight;
  const magGain = fitted.magSize - base.magSize;
  const reloadFaster = fitted.reloadMs < base.reloadMs * 0.92;
  const reloadSlower = fitted.reloadMs > base.reloadMs * 1.08;
  const rangeUp = fitted.range > base.range + 10;
  const spreadTight =
    base.spread != null && fitted.spread != null && fitted.spread < base.spread - 0.05;
  const spreadWide =
    base.spread != null && fitted.spread != null && fitted.spread > base.spread + 0.05;

  if (weapon.cls === "shotgun") {
    if (spreadTight) return "TIGHT LANE SHOTGUN";
    if (spreadWide) return "SHOTGUN CROWD CONTROL";
    return "SHOTGUN BUILD";
  }
  if (magGain >= 20 && weight >= base.weight + 2) return "HEAVY LANE HOLDER";
  if (reloadFaster && magGain <= 0) return "FAST RELOAD BUILD";
  if (rangeUp && weight < base.weight + 1.5) return "MARKSMAN SETUP";
  if (weight <= base.weight + 0.8 && attachments.length > 0) return "LIGHTWEIGHT CARBINE";
  if (magGain >= 8 && !reloadSlower) return "EXTENDED CAPACITY";
  if (attachments.length === 0) return "STOCK CONFIGURATION";
  return "CUSTOM BUILD";
}

export function listArmoryCandidates(args: {
  weaponId: string;
  mount: AttachMount;
  currentAttachments: readonly string[];
  stash: readonly Item[];
  shopDefIds: readonly string[];
  bank: number;
  buyMult: number;
  stashSlots: number;
}): ArmoryCandidate[] {
  const {
    weaponId,
    mount,
    currentAttachments,
    stash,
    shopDefIds,
    bank,
    buyMult,
    stashSlots,
  } = args;
  const weapon = weaponDef(weaponId);
  const equippedId = mountRowsForWeapon(weaponId, currentAttachments).find((r) => r.mount === mount)
    ?.attachmentId;
  const out: ArmoryCandidate[] = [];
  const seenAttach = new Set<string>();

  if (equippedId) {
    const att = attachmentDef(equippedId) ?? ATTACHMENTS[equippedId];
    if (att) {
      out.push({
        attachId: equippedId,
        name: att.name,
        source: "equipped",
        affordable: true,
        effects: attachmentModifierLines(equippedId),
        weight: att.weight,
        action: "KEEP",
      });
      seenAttach.add(equippedId);
    }
  }

  for (const item of stash) {
    if (item.kind !== "attachment" || !item.ref) continue;
    if (seenAttach.has(item.ref)) continue;
    const att = attachmentDef(item.ref) ?? ATTACHMENTS[item.ref];
    if (!att || slotOf(item.ref) !== mount) continue;
    const check = canInstallAttachment(weapon, att);
    if (!check.ok) continue;
    const action = equippedId ? "REPLACE" : "INSTALL";
    const roomOk = action === "REPLACE" || stash.length <= stashSlots;
    const candidate: ArmoryCandidate = {
      attachId: item.ref,
      name: att.name,
      source: "stash",
      stashUid: item.uid,
      affordable: true,
      effects: attachmentModifierLines(item.ref),
      weight: att.weight,
      action,
    };
    if (!roomOk) candidate.blockedReason = "STASH FULL";
    out.push(candidate);
    seenAttach.add(item.ref);
  }

  for (const defId of shopDefIds) {
    const def = ITEMS.find((i) => i.id === defId);
    if (!def || def.kind !== "attachment" || !def.ref || def.price == null) continue;
    if (seenAttach.has(def.ref)) continue;
    const att = attachmentDef(def.ref) ?? ATTACHMENTS[def.ref];
    if (!att || slotOf(def.ref) !== mount) continue;
    const check = canInstallAttachment(weapon, att);
    if (!check.ok) continue;
    const price = Math.round(def.price * buyMult);
    const affordable = bank >= price;
    const canBuy = stash.length < stashSlots;
    const candidate: ArmoryCandidate = {
      attachId: def.ref,
      name: att.name,
      source: "shop",
      shopDefId: defId,
      price,
      affordable,
      effects: attachmentModifierLines(def.ref),
      weight: att.weight,
      action: "BUY_INSTALL",
    };
    if (!affordable) candidate.blockedReason = "NOT ENOUGH ₽";
    else if (!canBuy) candidate.blockedReason = "STASH FULL";
    out.push(candidate);
    seenAttach.add(def.ref);
  }

  return out;
}

export function previewAttachmentsForCandidate(
  weaponId: string,
  current: readonly string[],
  mount: AttachMount,
  candidate: ArmoryCandidate | null,
  remove = false,
): string[] {
  if (remove) return previewAttachmentList(weaponId, current, null, mount);
  if (!candidate || candidate.action === "KEEP") return [...current];
  return previewAttachmentList(weaponId, current, candidate.attachId, mount);
}

export function canPreviewInstall(weaponId: string, attachId: string): boolean {
  return canInstallAttachmentOnWeapon(weaponId, attachId).ok;
}

export function shopDefIdForAttachment(attachId: string): string | null {
  return attachItemId(attachId);
}
