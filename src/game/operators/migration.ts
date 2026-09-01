import type { Meta } from "../meta";
import { freshCrewState, normalizeCrewState } from "./crew";
import { isValidStats } from "./stats";
import { isCanonicalPerkId } from "./perks";
import { WEAPONS } from "../gear";
import type { PersistentOperator } from "./types";

export function migrateV5ToV6(v5: Meta): Meta {
  const base = { ...v5 };
  return {
    ...base,
    crew: freshCrewState(base.runs),
  };
}

export function normalizeOperator(raw: Partial<PersistentOperator>): PersistentOperator | null {
  if (!raw.id || !raw.name) return null;
  const stats = raw.stats;
  if (!stats || !isValidStats(stats)) return null;
  const weapon = raw.equipment?.weapon && WEAPONS[raw.equipment.weapon] ? raw.equipment.weapon : "pm";
  const perkIds = Array.isArray(raw.perkIds) ? raw.perkIds.filter(isCanonicalPerkId) : [];
  return {
    id: raw.id,
    name: raw.name,
    roleLabel: raw.roleLabel ?? "OPERATOR",
    archetypeId: raw.archetypeId ?? "rifleman",
    stats: { ...stats },
    perkIds,
    equipment: {
      weapon,
      attachments: Array.isArray(raw.equipment?.attachments) ? [...raw.equipment.attachments] : [],
      armor: raw.equipment?.armor ?? null,
    },
    appearance: raw.appearance?.paletteId
      ? { presetId: raw.appearance?.presetId ?? "scav_0", paletteId: raw.appearance.paletteId }
      : { presetId: raw.appearance?.presetId ?? "scav_0" },
    progression: {
      level: Math.max(1, Number(raw.progression?.level) || 1),
      xp: Math.max(0, Number(raw.progression?.xp) || 0),
    },
    status: raw.status === "dead" ? "dead" : "alive",
  };
}

export function normalizeMetaV6(raw: Partial<Meta>, runs: number): Meta {
  const operators = Array.isArray(raw.crew?.operators)
    ? raw.crew.operators.map(normalizeOperator).filter((o): o is PersistentOperator => !!o)
    : [];
  return {
    ...(raw as Meta),
    crew: {
      ...normalizeCrewState(raw.crew, runs),
      operators,
    },
  };
}
