/**
 * Source-specific loot profiles.
 *
 * Runtime loot is: source context → profile → procedural generator.
 * Profiles constrain eligibility and relative weights. They do not replace
 * kind / rarity / wave / lootMult / extra-slot / at-most-one-weapon.
 *
 * Canonical defaults reproduce the previous shared-pool behavior:
 * every lootable item enabled, weight 1, minWave 1, maxWave unset.
 */

import type { ItemDef, ItemKind } from "./gear";
import { MAP_DEFS } from "./map";

export const LOOTABLE_KINDS: readonly ItemKind[] = ["weapon", "attachment", "armor", "meds", "valuable"];

export function isLootableKind(kind: ItemKind): boolean {
  return (LOOTABLE_KINDS as readonly string[]).includes(kind);
}

export type LootSourceId = string;
export type LootProfileId = string;

/** Implemented raid loot rolls. Shop is not a loot profile. */
export type LootSourceType = "crate" | "reward";

/** Reserved for later Economy Lab rows. Do not populate fake entries. */
export type FutureLootSourceType = "enemy" | "boss" | "quest" | "special_zone";

export type LootProfileEntry = {
  enabled: boolean;
  weight: number;
  minWave: number;
  maxWave?: number;
};

/** Sparse DEV / data overrides. Missing fields keep the canonical default. */
export type LootProfileOverride = {
  enabled?: boolean;
  weight?: number;
  minWave?: number;
  maxWave?: number;
};

export type LootProfile = Readonly<Record<string, LootProfileOverride>>;

export type LootSourceContext = {
  id: LootSourceId;
  type: LootSourceType;
  mapId: string;
  profileId: LootProfileId;
};

export const CANONICAL_PROFILE_MIN_WAVE = 1;
export const CANONICAL_PROFILE_ENABLED = true;

/**
 * Conservative default loot gates for new attachment catalog items.
 * Economy Lab can override per source; absent overrides use these seeds.
 */
export const ATTACHMENT_LOOT_SEEDS: Readonly<Record<string, LootProfileOverride>> = {
  a_red_dot: { weight: 1.1 },
  a_light_comp: { weight: 1.1 },
  a_optic_2x: { weight: 0.85 },
  a_brake: { weight: 0.85 },
  a_tight_choke: { weight: 0.8 },
  a_wide_choke: { weight: 0.8 },
  a_pistol_ext: { weight: 0.9 },
  a_stanag_ext: { weight: 0.75 },
  a_grip: { weight: 0.85 },
  a_optic: { weight: 0.65 },
  a_quick_mag: { minWave: 10, weight: 0.45 },
  a_angled_grip: { minWave: 10, weight: 0.45 },
  a_heavy_grip: { minWave: 10, weight: 0.4 },
  a_dvl_ext: { minWave: 10, weight: 0.35 },
  a_marksman: { minWave: 10, weight: 0.3 },
  a_ar_drum: { minWave: 10, weight: 0.28 },
  a_ak_drum: { minWave: 10, weight: 0.25 },
  a_pistol_drum: { minWave: 10, weight: 0.25 },
  a_mag: { weight: 0.5 },
  a_laser: { weight: 0.5 },
  a_m995: { minWave: 10, weight: 0.35 },
};

export function canonicalProfileEntry(): LootProfileEntry {
  return {
    enabled: CANONICAL_PROFILE_ENABLED,
    weight: CANONICAL_PROFILE_ENTRY_WEIGHT,
    minWave: CANONICAL_PROFILE_MIN_WAVE,
  };
}

/** Default per-item weight before profile overrides / attachment seeds. */
export const CANONICAL_PROFILE_ENTRY_WEIGHT = 1;

export function lootSourceId(mapId: string, type: LootSourceType): LootSourceId {
  return `${mapId}:${type}`;
}

export function parseLootSourceId(id: string): { mapId: string; type: LootSourceType } | undefined {
  const split = id.split(":");
  if (split.length !== 2) return undefined;
  const [mapId, type] = split;
  if (!mapId || (type !== "crate" && type !== "reward")) return undefined;
  return { mapId, type };
}

/** Future ids such as enemy:<id> / boss:<id>. Not listed in the live catalog. */
export function futureLootSourceId(type: FutureLootSourceType, entityId: string): LootSourceId {
  return `${type}:${entityId}`;
}

export function mapHasCrates(mapId: string): boolean {
  const map = MAP_DEFS.find((m) => m.id === mapId);
  return !!map && map.crates.length > 0;
}

/**
 * One independent profile per map loot source that actually exists.
 * Grain Gate has wave rewards only. Sharing must be explicit (same profileId).
 */
export function canonicalLootSources(): LootSourceContext[] {
  const out: LootSourceContext[] = [];
  for (const map of MAP_DEFS) {
    if (map.crates.length > 0) {
      const id = lootSourceId(map.id, "crate");
      out.push({ id, type: "crate", mapId: map.id, profileId: id });
    }
    const rewardId = lootSourceId(map.id, "reward");
    out.push({ id: rewardId, type: "reward", mapId: map.id, profileId: rewardId });
  }
  return out;
}

export function lootSourceById(id: string): LootSourceContext | undefined {
  return canonicalLootSources().find((s) => s.id === id);
}

export function isCanonicalLootSourceId(id: string): boolean {
  return lootSourceById(id) != null;
}

export function resolveProfileEntry(
  itemId: string,
  profile: LootProfile | undefined,
  fallbackWeight: number,
): LootProfileEntry {
  const seed =
    profile?.[itemId] == null && fallbackWeight === CANONICAL_PROFILE_ENTRY_WEIGHT
      ? ATTACHMENT_LOOT_SEEDS[itemId]
      : undefined;
  const over = { ...seed, ...profile?.[itemId] };
  const base = canonicalProfileEntry();
  const weight = typeof over?.weight === "number" && Number.isFinite(over.weight) ? over.weight : fallbackWeight;
  const minWave =
    typeof over?.minWave === "number" && Number.isFinite(over.minWave) ? over.minWave : base.minWave;
  const maxWave =
    typeof over?.maxWave === "number" && Number.isFinite(over.maxWave) ? over.maxWave : undefined;
  const entry: LootProfileEntry = {
    enabled: typeof over?.enabled === "boolean" ? over.enabled : base.enabled,
    weight,
    minWave,
  };
  if (maxWave != null) entry.maxWave = maxWave;
  return entry;
}

export function isProfileEntryEligible(entry: LootProfileEntry, wave: number): boolean {
  if (!entry.enabled) return false;
  if (!(entry.weight > 0)) return false;
  if (!Number.isFinite(wave) || wave < entry.minWave) return false;
  if (entry.maxWave != null && wave > entry.maxWave) return false;
  return true;
}

export function isItemEligibleForProfile(
  item: ItemDef,
  wave: number,
  profile: LootProfile | undefined,
  fallbackWeight: number,
): boolean {
  if (!isLootableKind(item.kind)) return false;
  return isProfileEntryEligible(resolveProfileEntry(item.id, profile, fallbackWeight), wave);
}

export function eligibleLootItems(
  catalog: readonly ItemDef[],
  wave: number,
  profile: LootProfile | undefined,
  fallbackWeightOf: (id: string) => number,
  used: ReadonlySet<string> = new Set(),
): ItemDef[] {
  return catalog.filter(
    (item) => !used.has(item.id) && isItemEligibleForProfile(item, wave, profile, fallbackWeightOf(item.id)),
  );
}

export function kindsWithEligibleItems(items: readonly ItemDef[]): Record<ItemKind, boolean> {
  const flags: Record<ItemKind, boolean> = {
    weapon: false,
    attachment: false,
    armor: false,
    meds: false,
    valuable: false,
    backpack: false,
  };
  for (const item of items) flags[item.kind] = true;
  return flags;
}

export type ProfileIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  sourceId?: string;
  itemId?: string;
};

export function validateProfileOverrides(
  profiles: Readonly<Record<string, LootProfile | undefined>>,
  catalog: readonly ItemDef[],
): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const knownItems = new Set(catalog.map((i) => i.id));
  for (const [sourceId, profile] of Object.entries(profiles)) {
    if (!profile) continue;
    if (!isCanonicalLootSourceId(sourceId)) {
      issues.push({
        level: "error",
        code: "UNKNOWN_SOURCE",
        message: `Unknown loot source "${sourceId}".`,
        sourceId,
      });
    }
    const seen = new Set<string>();
    for (const [itemId, entry] of Object.entries(profile)) {
      if (seen.has(itemId)) {
        issues.push({
          level: "error",
          code: "DUPLICATE_ITEM",
          message: `Duplicate profile entry for ${itemId} on ${sourceId}.`,
          sourceId,
          itemId,
        });
      }
      seen.add(itemId);
      if (!knownItems.has(itemId)) {
        issues.push({
          level: "error",
          code: "UNKNOWN_ITEM",
          message: `Unknown item "${itemId}" on ${sourceId}.`,
          sourceId,
          itemId,
        });
        continue;
      }
      const def = catalog.find((i) => i.id === itemId);
      if (def && !isLootableKind(def.kind)) {
        issues.push({
          level: "error",
          code: "NOT_LOOTABLE",
          message: `${itemId} is not a lootable kind.`,
          sourceId,
          itemId,
        });
      }
      if (typeof entry.weight === "number" && (!Number.isFinite(entry.weight) || entry.weight < 0)) {
        issues.push({
          level: "error",
          code: "NEGATIVE_WEIGHT",
          message: `Weight for ${itemId} on ${sourceId} must be >= 0.`,
          sourceId,
          itemId,
        });
      }
      if (typeof entry.minWave === "number" && (!Number.isFinite(entry.minWave) || entry.minWave < 1)) {
        issues.push({
          level: "error",
          code: "MIN_WAVE",
          message: `minWave for ${itemId} on ${sourceId} must be >= 1.`,
          sourceId,
          itemId,
        });
      }
      const minWave = typeof entry.minWave === "number" ? entry.minWave : CANONICAL_PROFILE_MIN_WAVE;
      if (typeof entry.maxWave === "number" && Number.isFinite(entry.maxWave) && entry.maxWave < minWave) {
        issues.push({
          level: "error",
          code: "MAX_WAVE",
          message: `maxWave for ${itemId} on ${sourceId} is below minWave.`,
          sourceId,
          itemId,
        });
      }
    }
  }
  return issues;
}
