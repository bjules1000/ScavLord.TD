import {
  ARMORS,
  ATTACHMENTS,
  WEAPONS,
  type ArmorDef,
  type AttachmentDef,
  type WeaponDef,
} from "../gear";
import { DEV_TOOLS_ENABLED } from "./tools";

export const BALANCE_STORAGE_KEY = "scavlord.dev.balanceLab.v1";

export type WeaponOverride = Partial<
  Pick<
    WeaponDef,
    | "weight"
    | "damage"
    | "range"
    | "accuracy"
    | "cooldown"
    | "reloadMs"
    | "magSize"
    | "pellets"
    | "spread"
    | "maxPelletHits"
    | "secondaryHitMult"
    | "splash"
  >
>;

export type ArmorOverride = Partial<Pick<ArmorDef, "weight" | "reduction" | "durability">>;

export type AttachmentOverride = Partial<
  Pick<AttachmentDef, "weight" | "damageMult" | "rangeMult" | "rofMult" | "accuracy" | "pen" | "magSizeAdd">
>;

export type BalanceOverrides = {
  weapons: Record<string, WeaponOverride>;
  armors: Record<string, ArmorOverride>;
  attachments: Record<string, AttachmentOverride>;
};

export type LabKind = "weapon" | "armor" | "attachment";
export type LabCategory = "ALL" | "WEAPONS" | "ARMOR" | "ATTACHMENTS";

export type LabEntry = {
  kind: LabKind;
  id: string;
  name: string;
};

export type LabField = {
  key: string;
  label: string;
  step: number;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function emptyBalanceOverrides(): BalanceOverrides {
  return { weapons: {}, armors: {}, attachments: {} };
}

function cloneOverrides(src: BalanceOverrides): BalanceOverrides {
  return {
    weapons: { ...Object.fromEntries(Object.entries(src.weapons).map(([k, v]) => [k, { ...v }])) },
    armors: { ...Object.fromEntries(Object.entries(src.armors).map(([k, v]) => [k, { ...v }])) },
    attachments: { ...Object.fromEntries(Object.entries(src.attachments).map(([k, v]) => [k, { ...v }])) },
  };
}

function pruneEmpty<T extends Record<string, unknown>>(rec: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, fields] of Object.entries(rec)) {
    if (Object.keys(fields).length > 0) out[id] = fields;
  }
  return out;
}

export function pruneBalanceOverrides(src: BalanceOverrides): BalanceOverrides {
  return {
    weapons: pruneEmpty(src.weapons),
    armors: pruneEmpty(src.armors),
    attachments: pruneEmpty(src.attachments),
  };
}

export function balanceLabCatalog(): LabEntry[] {
  return [
    ...Object.values(WEAPONS).map((w) => ({ kind: "weapon" as const, id: w.id, name: w.name })),
    ...Object.values(ARMORS).map((a) => ({ kind: "armor" as const, id: a.id, name: a.name })),
    ...Object.values(ATTACHMENTS).map((a) => ({ kind: "attachment" as const, id: a.id, name: a.name })),
  ];
}

export function filterLabCatalog(entries: readonly LabEntry[], category: LabCategory, query: string): LabEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (category === "WEAPONS" && e.kind !== "weapon") return false;
    if (category === "ARMOR" && e.kind !== "armor") return false;
    if (category === "ATTACHMENTS" && e.kind !== "attachment") return false;
    if (!q) return true;
    return e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.kind.includes(q);
  });
}

export function weaponLabFields(def: WeaponDef): LabField[] {
  const fields: LabField[] = [
    { key: "weight", label: "Weight", step: 0.25 },
    { key: "damage", label: def.pellets != null ? "Damage/Pellet" : "Damage", step: 1 },
  ];
  if (def.pellets != null) fields.push({ key: "pellets", label: "Pellets", step: 1 });
  fields.push(
    { key: "range", label: "Range", step: 1 },
    { key: "accuracy", label: "Accuracy", step: 0.01 },
    { key: "cooldown", label: "Cycle ms", step: 10 },
    { key: "reloadMs", label: "Reload ms", step: 50 },
    { key: "magSize", label: "Magazine", step: 1 },
  );
  if (def.spread != null) fields.push({ key: "spread", label: "Spread", step: 0.01 });
  if (def.maxPelletHits != null) fields.push({ key: "maxPelletHits", label: "Pellet hits", step: 1 });
  if (def.secondaryHitMult != null) fields.push({ key: "secondaryHitMult", label: "2nd hit mult", step: 0.05 });
  if (def.splash > 0) fields.push({ key: "splash", label: "Splash", step: 1 });
  return fields;
}

export function armorLabFields(): LabField[] {
  return [
    { key: "weight", label: "Weight", step: 0.25 },
    { key: "reduction", label: "Protection", step: 0.01 },
    { key: "durability", label: "Durability", step: 10 },
  ];
}

export function attachmentLabFields(def: AttachmentDef): LabField[] {
  const fields: LabField[] = [
    { key: "weight", label: "Weight", step: 0.05 },
    { key: "damageMult", label: "Damage ×", step: 0.01 },
    { key: "rangeMult", label: "Range ×", step: 0.01 },
    { key: "rofMult", label: "ROF ×", step: 0.01 },
    { key: "accuracy", label: "Accuracy", step: 0.01 },
    { key: "pen", label: "Pen", step: 1 },
  ];
  if (def.magSizeAdd != null) fields.push({ key: "magSizeAdd", label: "Mag +", step: 1 });
  return fields;
}

export function canonicalWeapon(id: string): WeaponDef | undefined {
  return WEAPONS[id];
}

export function canonicalArmor(id: string): ArmorDef | undefined {
  return ARMORS[id];
}

export function canonicalAttachment(id: string): AttachmentDef | undefined {
  return ATTACHMENTS[id];
}

function mergeIfOver<T extends object>(base: T, over: object | undefined, enabled: boolean): T {
  if (!enabled || !over || Object.keys(over).length === 0) return base;
  return { ...base, ...(over as Partial<T>) };
}

export function effectiveWeapon(
  id: string,
  overrides: BalanceOverrides = getBalanceOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): WeaponDef | undefined {
  const base = WEAPONS[id];
  if (!base) return undefined;
  return mergeIfOver(base, overrides.weapons[id], enabled);
}

export function effectiveArmor(
  id: string | null | undefined,
  overrides: BalanceOverrides = getBalanceOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): ArmorDef | undefined {
  if (!id) return undefined;
  const base = ARMORS[id];
  if (!base) return undefined;
  return mergeIfOver(base, overrides.armors[id], enabled);
}

export function effectiveAttachment(
  id: string,
  overrides: BalanceOverrides = getBalanceOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): AttachmentDef | undefined {
  const base = ATTACHMENTS[id];
  if (!base) return undefined;
  return mergeIfOver(base, overrides.attachments[id], enabled);
}

export function lookupEffectiveAttachment(id: string): AttachmentDef | undefined {
  return effectiveAttachment(id);
}

export function setOverrideField(
  src: BalanceOverrides,
  kind: LabKind,
  id: string,
  key: string,
  value: number | undefined,
  canonical: number | undefined,
): BalanceOverrides {
  const next = cloneOverrides(src);
  const bag =
    kind === "weapon" ? next.weapons : kind === "armor" ? next.armors : next.attachments;
  const cur = { ...(bag[id] ?? {}) } as Record<string, number>;
  if (value === undefined || value === canonical) delete cur[key];
  else cur[key] = value;
  if (Object.keys(cur).length === 0) delete bag[id];
  else (bag as Record<string, Record<string, number>>)[id] = cur;
  return pruneBalanceOverrides(next);
}

export function resetOverrideItem(src: BalanceOverrides, kind: LabKind, id: string): BalanceOverrides {
  const next = cloneOverrides(src);
  if (kind === "weapon") delete next.weapons[id];
  else if (kind === "armor") delete next.armors[id];
  else delete next.attachments[id];
  return next;
}

export function modifiedItemCount(overrides: BalanceOverrides): number {
  const clean = pruneBalanceOverrides(overrides);
  return Object.keys(clean.weapons).length + Object.keys(clean.armors).length + Object.keys(clean.attachments).length;
}

export type PatchLine = { id: string; name: string; kind: LabKind; field: string; from: number; to: number };

export function balancePatchLines(overrides: BalanceOverrides): PatchLine[] {
  const lines: PatchLine[] = [];
  for (const [id, fields] of Object.entries(overrides.weapons)) {
    const base = WEAPONS[id];
    if (!base) continue;
    for (const [field, to] of Object.entries(fields)) {
      if (typeof to !== "number") continue;
      const from = (base as unknown as Record<string, number | undefined>)[field];
      if (typeof from !== "number" || from === to) continue;
      lines.push({ id, name: base.name, kind: "weapon", field, from, to });
    }
  }
  for (const [id, fields] of Object.entries(overrides.armors)) {
    const base = ARMORS[id];
    if (!base) continue;
    for (const [field, to] of Object.entries(fields)) {
      if (typeof to !== "number") continue;
      const from = (base as unknown as Record<string, number | undefined>)[field];
      if (typeof from !== "number" || from === to) continue;
      lines.push({ id, name: base.name, kind: "armor", field, from, to });
    }
  }
  for (const [id, fields] of Object.entries(overrides.attachments)) {
    const base = ATTACHMENTS[id];
    if (!base) continue;
    for (const [field, to] of Object.entries(fields)) {
      if (typeof to !== "number") continue;
      const from = (base as unknown as Record<string, number | undefined>)[field];
      if (from === to) continue;
      lines.push({ id, name: base.name, kind: "attachment", field, from: from ?? 0, to });
    }
  }
  return lines;
}

export function formatBalancePatch(overrides: BalanceOverrides): string {
  const lines = balancePatchLines(overrides);
  if (lines.length === 0) return "BALANCE PATCH\n\n(no changes)";
  const groups = new Map<string, PatchLine[]>();
  for (const line of lines) {
    const key = `${line.kind}:${line.id}`;
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }
  const parts = ["BALANCE PATCH", ""];
  for (const group of groups.values()) {
    const first = group[0]!;
    parts.push(`${first.id.toUpperCase()} / ${first.name}`);
    for (const line of group) parts.push(`${line.field}: ${line.from} -> ${line.to}`);
    parts.push("");
  }
  return parts.join("\n").trim() + "\n";
}

export type LiveKit = {
  weapon: string;
  attachments: readonly string[];
  ammo: number;
  armor?: string | null;
  armorHp?: number;
};

export function clampLiveKit(
  kit: LiveKit,
  overrides: BalanceOverrides,
  enabled: boolean,
  magSizeOf: (weapon: string, attachments: readonly string[]) => number,
): LiveKit {
  const mag = magSizeOf(kit.weapon, kit.attachments);
  const ammo = Math.max(0, Math.min(kit.ammo, mag));
  const armor = effectiveArmor(kit.armor, overrides, enabled);
  let armorHp = kit.armorHp;
  if (armor && armorHp != null) armorHp = Math.min(armorHp, armor.durability);
  return armorHp === undefined ? { ...kit, ammo } : { ...kit, ammo, armorHp };
}

export function parseStoredOverrides(raw: string | null): BalanceOverrides {
  if (!raw) return emptyBalanceOverrides();
  try {
    const parsed = JSON.parse(raw) as Partial<BalanceOverrides>;
    return pruneBalanceOverrides({
      weapons: parsed.weapons && typeof parsed.weapons === "object" ? parsed.weapons : {},
      armors: parsed.armors && typeof parsed.armors === "object" ? parsed.armors : {},
      attachments: parsed.attachments && typeof parsed.attachments === "object" ? parsed.attachments : {},
    });
  } catch {
    return emptyBalanceOverrides();
  }
}

export function loadBalanceOverrides(enabled: boolean, storage: StorageLike | null): BalanceOverrides {
  if (!enabled || !storage) return emptyBalanceOverrides();
  return parseStoredOverrides(storage.getItem(BALANCE_STORAGE_KEY));
}

export function saveBalanceOverrides(overrides: BalanceOverrides, enabled: boolean, storage: StorageLike | null): void {
  if (!storage) return;
  if (!enabled) {
    storage.removeItem(BALANCE_STORAGE_KEY);
    return;
  }
  storage.setItem(BALANCE_STORAGE_KEY, JSON.stringify(pruneBalanceOverrides(overrides)));
}

let applied: BalanceOverrides = emptyBalanceOverrides();
const listeners = new Set<() => void>();

function memoryStorage(): StorageLike | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function getBalanceOverrides(): BalanceOverrides {
  return applied;
}

export function hydrateBalanceOverrides(enabled: boolean, storage: StorageLike | null = memoryStorage()): void {
  applied = enabled ? loadBalanceOverrides(true, storage) : emptyBalanceOverrides();
  for (const fn of listeners) fn();
}

export function applyBalanceOverrides(
  next: BalanceOverrides,
  enabled: boolean,
  storage: StorageLike | null = memoryStorage(),
): BalanceOverrides {
  applied = pruneBalanceOverrides(cloneOverrides(next));
  saveBalanceOverrides(applied, enabled, storage);
  for (const fn of listeners) fn();
  return applied;
}

export function subscribeBalance(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (DEV_TOOLS_ENABLED) {
  hydrateBalanceOverrides(true);
}
