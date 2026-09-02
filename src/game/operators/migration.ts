import type { Meta } from "../meta";
import { freshCrewState, normalizeCrewState } from "./crew";
import { migratePotentialStats } from "./potentialGeneration";
import { isCanonicalPerkId } from "./perks";
import {
  enforceCurrentPotentialInvariant,
  isValidPotential,
  isValidStatPair,
  isValidStats,
} from "./stats";
import { WEAPONS } from "../gear";
import type { OperatorBaseStats, PersistentOperator, RecruitCandidate } from "./types";

export function migrateV5ToV6(v5: Meta): Meta {
  const base = { ...v5 };
  return {
    ...base,
    crew: freshCrewState(base.runs),
  };
}

function resolvePotential(
  stats: OperatorBaseStats,
  potential: Partial<OperatorBaseStats> | undefined,
  archetypeId: string,
  identityKey: string,
): OperatorBaseStats {
  if (potential && isValidPotential(potential as OperatorBaseStats)) {
    return enforceCurrentPotentialInvariant(stats, potential as OperatorBaseStats);
  }
  return migratePotentialStats(stats, archetypeId, identityKey);
}

export function normalizeCandidatePotential(raw: Partial<RecruitCandidate>): RecruitCandidate["potential"] {
  const stats = raw.stats;
  if (!stats || !isValidStats(stats)) {
    return migratePotentialStats(
      { aim: 50, toughness: 50, handling: 50, mobility: 50 },
      raw.archetypeId ?? "rifleman",
      raw.candidateId ?? "unknown",
    );
  }
  return resolvePotential(stats, raw.potential, raw.archetypeId ?? "rifleman", raw.candidateId ?? raw.name ?? "unknown");
}

export function normalizeOperator(raw: Partial<PersistentOperator>): PersistentOperator | null {
  if (!raw.id || !raw.name) return null;
  const stats = raw.stats;
  if (!stats || !isValidStats(stats)) return null;
  const potential = resolvePotential(stats, raw.potential, raw.archetypeId ?? "rifleman", raw.id);
  if (!isValidStatPair(stats, potential)) return null;
  const weapon = raw.equipment?.weapon && WEAPONS[raw.equipment.weapon] ? raw.equipment.weapon : "pm";
  const perkIds = Array.isArray(raw.perkIds) ? raw.perkIds.filter(isCanonicalPerkId) : [];
  const negativeTraitIds = Array.isArray(raw.negativeTraitIds)
    ? raw.negativeTraitIds.filter(isCanonicalPerkId)
    : [];
  const op: PersistentOperator = {
    id: raw.id,
    name: raw.name,
    roleLabel: raw.roleLabel ?? "OPERATOR",
    archetypeId: raw.archetypeId ?? "rifleman",
    stats: { ...stats },
    potential: { ...potential },
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
  if (negativeTraitIds.length) op.negativeTraitIds = negativeTraitIds;
  return op;
}

export function normalizeMetaV6(raw: Partial<Meta>, runs: number): Meta {
  const operators = Array.isArray(raw.crew?.operators)
    ? raw.crew.operators.map(normalizeOperator).filter((o): o is PersistentOperator => !!o)
    : [];
  const crewBase = normalizeCrewState(raw.crew, runs);
  const candidates = crewBase.recruitment.candidates.map((c) => {
    const stats = isValidStats(c.stats) ? c.stats : { aim: 50, toughness: 50, handling: 50, mobility: 50 };
    const potential = normalizeCandidatePotential({ ...c, stats });
    return { ...c, stats, potential };
  });
  return {
    ...(raw as Meta),
    crew: {
      ...crewBase,
      operators,
      recruitment: { ...crewBase.recruitment, candidates },
    },
  };
}

/** Idempotent migration check for tests. */
export function migrateOperatorPotentialOnce(
  stats: OperatorBaseStats,
  potential: OperatorBaseStats | undefined,
  archetypeId: string,
  identityKey: string,
): OperatorBaseStats {
  const first = resolvePotential(stats, potential, archetypeId, identityKey);
  const second = resolvePotential(stats, first, archetypeId, identityKey);
  return second;
}
