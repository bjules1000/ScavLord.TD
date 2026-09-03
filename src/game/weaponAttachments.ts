import {
  ATTACHMENTS,
  WEAPONS,
  applyAttachmentMods,
  type AttachMount,
  type AttachmentCompatibility,
  type AttachmentDef,
  type WeaponCategory,
  type WeaponDef,
} from "./gear";
import { effectiveAttachment, effectiveWeapon } from "./dev/balance";
import { attachmentDef, weaponDef } from "./weapons";
import { scavVisualMods, type WeaponVisualState } from "./weaponVisuals";

export type { AttachMount, AttachmentCompatibility, WeaponCategory } from "./gear";

export const ATTACH_MOUNTS: readonly AttachMount[] = [
  "optic",
  "muzzle",
  "magazine",
  "underbarrel",
];

export const MOUNT_LABEL: Record<AttachMount, string> = {
  optic: "OPTIC",
  muzzle: "MUZZLE",
  magazine: "MAGAZINE",
  underbarrel: "UNDERBARREL",
};

export const WEAPON_CATEGORIES: readonly WeaponCategory[] = [
  "pistol",
  "shotgun",
  "ar",
  "lmg",
  "sniper",
  "launcher",
];

export const CATEGORY_LABEL: Record<WeaponCategory, string> = {
  pistol: "PISTOL",
  shotgun: "SHOTGUN",
  ar: "AR",
  lmg: "LMG",
  sniper: "SNIPER",
  launcher: "LAUNCHER",
};

/** Legacy slot aliases from pre-M5.4 saves and item refs. */
const LEGACY_MOUNT: Record<string, AttachMount> = {
  optic: "optic",
  thermal: "optic",
  barrel: "muzzle",
  brake: "muzzle",
  supp: "muzzle",
  magazine: "magazine",
  mag: "magazine",
  mod: "underbarrel",
  grip: "underbarrel",
  laser: "underbarrel",
  m995: "underbarrel",
};

export function defaultCategoryForWeapon(weapon: Pick<WeaponDef, "cls">): WeaponCategory {
  switch (weapon.cls) {
    case "pistolCarbine":
      return "pistol";
    case "shotgun":
      return "shotgun";
    case "rifle":
      return "ar";
    case "lmg":
      return "lmg";
    case "sniper":
      return "sniper";
    case "launcher":
      return "launcher";
    default:
      return "ar";
  }
}

/** Resolve category from definition or derive from weapon class. */
export function weaponCategoryOf(weapon: WeaponDef): WeaponCategory {
  return weapon.category ?? defaultCategoryForWeapon(weapon);
}

/** Default mounts when legacy saves omit attachmentSlots. */
export function defaultMountsForWeapon(weapon: WeaponDef): AttachMount[] {
  const n = weapon.slots ?? 1;
  switch (weapon.cls) {
    case "pistolCarbine":
      return n >= 2 ? ["optic", "underbarrel"] : ["underbarrel"];
    case "shotgun":
      return n >= 2 ? ["muzzle", "optic"] : ["muzzle"];
    case "rifle":
      if (n >= 4) return ["optic", "muzzle", "magazine", "underbarrel"];
      if (n >= 3) return ["optic", "muzzle", "underbarrel"];
      return ["optic", "muzzle"];
    case "lmg":
      return n >= 2 ? ["optic", "muzzle"] : ["muzzle"];
    case "sniper":
      if (n >= 4) return ["optic", "muzzle", "magazine", "underbarrel"];
      if (n >= 3) return ["optic", "muzzle", "underbarrel"];
      return ["optic", "muzzle"];
    case "launcher":
      return ["muzzle"];
    default:
      return (["optic", "muzzle"] as AttachMount[]).slice(0, n);
  }
}

export function weaponMounts(weapon: WeaponDef): AttachMount[] {
  if (weapon.attachmentSlots?.length) return [...weapon.attachmentSlots];
  return defaultMountsForWeapon(weapon);
}

export function weaponHasMount(weapon: WeaponDef, mount: AttachMount): boolean {
  return weaponMounts(weapon).includes(mount);
}

export function attachmentMountOf(
  attachment: Pick<AttachmentDef, "slot" | "id">,
): AttachMount | null {
  if (attachment.slot) return attachment.slot;
  return LEGACY_MOUNT[attachment.id] ?? null;
}

export function slotOf(attachId: string, lookup: (id: string) => AttachmentDef | undefined = attachmentDef): AttachMount | null {
  const def = lookup(attachId);
  if (!def) return LEGACY_MOUNT[attachId] ?? null;
  return attachmentMountOf(def);
}

export type InstallCheck =
  | { ok: true; reason?: string }
  | { ok: false; reason: string };

/**
 * Compatibility semantics:
 * - weapon must expose the attachment mount
 * - if weaponCategories set: weapon category must match one
 * - if weaponIds set: weapon id must be listed
 * - when both positive lists exist, both must pass
 * - excludedWeaponIds always blocks
 */
export function canInstallAttachment(
  weapon: WeaponDef,
  attachment: AttachmentDef,
): InstallCheck {
  const mount = attachmentMountOf(attachment);
  if (!mount) return { ok: false, reason: "Unknown attachment slot." };
  if (!weaponHasMount(weapon, mount)) {
    return { ok: false, reason: `NO ${MOUNT_LABEL[mount]} MOUNT` };
  }

  const compat = attachment.compatibility;
  const category = weaponCategoryOf(weapon);

  if (compat?.excludedWeaponIds?.includes(weapon.id)) {
    return { ok: false, reason: "INCOMPATIBLE WEAPON" };
  }

  const categories = compat?.weaponCategories;
  const ids = compat?.weaponIds;
  const categoryOk = !categories?.length || categories.includes(category);
  const idOk = !ids?.length || ids.includes(weapon.id);

  if (!categoryOk && categories?.length) {
    const label = categories.map((c) => CATEGORY_LABEL[c]).join("/");
    return { ok: false, reason: `INCOMPATIBLE — ${label} ONLY` };
  }
  if (!idOk && ids?.length) {
    return { ok: false, reason: "INCOMPATIBLE WEAPON" };
  }
  if (!categoryOk || !idOk) {
    return { ok: false, reason: "INCOMPATIBLE" };
  }

  return { ok: true };
}

export function canInstallAttachmentOnWeapon(
  weaponId: string,
  attachId: string,
): InstallCheck {
  const weapon = weaponDef(weaponId);
  const attachment = attachmentDef(attachId);
  if (!attachment) return { ok: false, reason: "Unknown attachment." };
  return canInstallAttachment(weapon, attachment);
}

export function installedInMount(
  attachments: readonly string[],
  mount: AttachMount,
  lookup: (id: string) => AttachmentDef | undefined = attachmentDef,
): string | undefined {
  return attachments.find((id) => slotOf(id, lookup) === mount);
}

export function mountRowsForWeapon(
  weaponId: string,
  installed: readonly string[],
): { mount: AttachMount; label: string; attachmentId: string | null }[] {
  const weapon = weaponDef(weaponId);
  return weaponMounts(weapon).map((mount) => ({
    mount,
    label: MOUNT_LABEL[mount],
    attachmentId: installedInMount(installed, mount) ?? null,
  }));
}

export type InstallResult =
  | { ok: true; attachments: string[]; replaced: string | null; message: string }
  | { ok: false; reason: string };

/** Install or atomically replace an attachment in its mount slot. */
export function installAttachmentInMounts(
  weaponId: string,
  installed: readonly string[],
  attachId: string,
): InstallResult {
  const weapon = weaponDef(weaponId);
  const attachment = attachmentDef(attachId);
  if (!attachment) return { ok: false, reason: "Unknown attachment." };

  const check = canInstallAttachment(weapon, attachment);
  if (!check.ok) return check;

  const mount = attachmentMountOf(attachment)!;
  if (installed.includes(attachId)) {
    return { ok: false, reason: "Already installed." };
  }

  const occupied = installedInMount(installed, mount);
  const withoutMount = installed.filter((id) => slotOf(id) !== mount);
  const next = [...withoutMount, attachId];

  if (occupied) {
    return {
      ok: true,
      attachments: next,
      replaced: occupied,
      message: `${attachment.name} swapped in.`,
    };
  }

  const capacity = weaponMounts(weapon).length;
  if (next.length > capacity) {
    return { ok: false, reason: `${weapon.name} has no free slots (${capacity}).` };
  }

  return {
    ok: true,
    attachments: next,
    replaced: null,
    message: `${attachment.name} installed.`,
  };
}

export function detachAttachmentFromMounts(
  installed: readonly string[],
  attachId: string,
): { ok: true; attachments: string[] } | { ok: false; reason: string } {
  if (!installed.includes(attachId)) return { ok: false, reason: "Nothing to detach." };
  return { ok: true, attachments: installed.filter((id) => id !== attachId) };
}

/** Effective magazine capacity including installed attachment modifiers. */
export function getEffectiveMagazineCapacity(
  weaponId: string,
  attachments: readonly string[],
): number {
  return applyAttachmentMods(weaponDef(weaponId), attachments, attachmentDef).magSize;
}

/** Trim installed list to legal mounts; preserve unknown legacy attachments. */
export function normalizeInstalledAttachments(
  weaponId: string,
  installed: readonly string[],
): string[] {
  const weapon = weaponDef(weaponId);
  const mounts = weaponMounts(weapon);
  const used = new Set<AttachMount>();
  const kept: string[] = [];

  for (const id of installed) {
    const mount = slotOf(id);
    if (!mount) {
      kept.push(id);
      continue;
    }
    if (!mounts.includes(mount)) {
      kept.push(id);
      continue;
    }
    if (used.has(mount)) continue;
    kept.push(id);
    used.add(mount);
  }

  return kept;
}

export function listCompatibilityPreview(
  attachment: AttachmentDef,
  weapons: Record<string, WeaponDef> = WEAPONS,
): { fits: string[]; rejects: string[] } {
  const fits: string[] = [];
  const rejects: string[] = [];
  for (const w of Object.values(weapons)) {
    const effective = effectiveWeapon(w.id) ?? w;
    if (canInstallAttachment(effective, attachment).ok) fits.push(effective.name);
    else rejects.push(effective.name);
  }
  return { fits, rejects };
}

export function fittedWeaponStats(
  weaponId: string,
  attachments: readonly string[],
  scavMods?: WeaponVisualState | null,
) {
  const weapon = weaponDef(weaponId);
  const mods = applyAttachmentMods(weapon, attachments, attachmentDef);
  let attachWeight = 0;
  for (const id of attachments) {
    attachWeight += effectiveAttachment(id)?.weight ?? ATTACHMENTS[id]?.weight ?? 0;
  }
  const scav = scavVisualMods(weaponId, scavMods);
  let accuracy = Math.max(0.15, Math.min(0.99, mods.accuracy + scav.accuracyAdd));
  let range = Math.max(1, (mods.range + scav.rangeAdd) * scav.rangeMult);
  let reloadMs = Math.max(100, Math.round(mods.reloadMs * scav.reloadTimeMult));
  return {
    magSize: mods.magSize,
    weight: weapon.weight + attachWeight + scav.weightAdd,
    reloadMs,
    accuracy,
    range,
    damage: mods.damage,
    cooldown: mods.cooldown,
    spread: mods.spread,
    moveMult: scav.moveMult,
  };
}

/** Compact modifier lines for stash / equipment UI. */
export function attachmentModifierLines(attachId: string): string[] {
  const att = attachmentDef(attachId);
  if (!att) return [];
  const lines: string[] = [];
  if (att.magSizeAdd) lines.push(`MAG +${att.magSizeAdd}`);
  if (att.accuracy) lines.push(`ACC ${att.accuracy > 0 ? "+" : ""}${Math.round(att.accuracy * 100)}%`);
  if (att.rangeAdd) lines.push(`RNG +${att.rangeAdd}`);
  if (att.spreadAdd) lines.push(`SPREAD ${att.spreadAdd > 0 ? "+" : ""}${att.spreadAdd.toFixed(2)}`);
  if (att.reloadTimeMult && att.reloadTimeMult !== 1) {
    const pct = Math.round((att.reloadTimeMult - 1) * 100);
    lines.push(`RELOAD ${pct > 0 ? "+" : ""}${pct}%`);
  }
  if (att.weight) lines.push(`WT +${att.weight.toFixed(2)}`);
  if (att.pen) lines.push(`PEN +${att.pen}`);
  return lines;
}

export function kitResolvedStatLines(weaponId: string, attachments: readonly string[]) {
  const base = weaponDef(weaponId);
  const fitted = fittedWeaponStats(weaponId, attachments);
  const rows: { label: string; value: string }[] = [
    { label: "MAG", value: String(fitted.magSize) },
    { label: "ACC", value: fitted.accuracy.toFixed(2) },
    { label: "RNG", value: String(Math.round(fitted.range)) },
    { label: "RLD", value: `${(fitted.reloadMs / 1000).toFixed(1)}s` },
  ];
  if (base.spread != null && fitted.spread != null) {
    rows.push({ label: "SPREAD", value: fitted.spread.toFixed(2) });
  }
  return rows;
}
