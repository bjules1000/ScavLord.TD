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
import { randomCosmeticLoadout, resolveCosmeticLoadout, type CosmeticLoadout } from "../cosmetics";
import { mulberry32, seedFromParts } from "./rng";
import { resolveTraitIds, type OperatorBaseStats, type PersistentOperator, type RecruitCandidate } from "./types";

/** Old saves predate cosmetics entirely; back-fill a stable-per-id random loadout instead of
 * leaving every migrated operator/candidate with a blank/default one. New saves round-trip as-is. */
function resolveEntityCosmetics(
  cosmetics: Partial<CosmeticLoadout> | undefined,
  seedKey: string,
): CosmeticLoadout {
  if (cosmetics) return resolveCosmeticLoadout(cosmetics);
  return randomCosmeticLoadout(mulberry32(seedFromParts("legacy-cosmetics", seedKey)));
}

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
  const traitInput: {
    traitIds?: string[];
    perkIds?: string[];
    negativeTraitIds?: string[];
  } = {};
  if (Array.isArray(raw.traitIds)) traitInput.traitIds = raw.traitIds.filter(isCanonicalPerkId);
  if (Array.isArray(raw.perkIds)) traitInput.perkIds = raw.perkIds.filter(isCanonicalPerkId);
  if (Array.isArray(raw.negativeTraitIds)) {
    traitInput.negativeTraitIds = raw.negativeTraitIds.filter(isCanonicalPerkId);
  }
  const traits = resolveTraitIds(traitInput);
  const op: PersistentOperator = {
    id: raw.id,
    name: raw.name,
    roleLabel: raw.roleLabel ?? "OPERATOR",
    archetypeId: raw.archetypeId ?? "rifleman",
    stats: { ...stats },
    potential: { ...potential },
    traitIds: traits.traitIds,
    perkIds: traits.perkIds,
    equipment: {
      weapon,
      attachments: Array.isArray(raw.equipment?.attachments) ? [...raw.equipment.attachments] : [],
      armor: raw.equipment?.armor ?? null,
    },
    cosmetics: resolveEntityCosmetics(raw.cosmetics, raw.id),
    progression: {
      level: Math.max(1, Number(raw.progression?.level) || 1),
      xp: Math.max(0, Number(raw.progression?.xp) || 0),
    },
    status: raw.status === "dead" ? "dead" : "alive",
  };
  if (raw.uniqueId) op.uniqueId = String(raw.uniqueId);
  if (traits.negativeTraitIds.length) op.negativeTraitIds = traits.negativeTraitIds;
  return op;
}

export function normalizeMetaV6(raw: Partial<Meta>, runs: number): Meta {
  const operators = Array.isArray(raw.crew?.operators)
    ? raw.crew.operators.map(normalizeOperator).filter((o): o is PersistentOperator => !!o)
    : [];
  const crewBase = normalizeCrewState(raw.crew, runs, {
    claimedQuestIds: Array.isArray(raw.claimed) ? raw.claimed : [],
  });
  const candidates = crewBase.recruitment.candidates.map((c) => {
    const stats = isValidStats(c.stats) ? c.stats : { aim: 50, toughness: 50, handling: 50, mobility: 50 };
    const potential = normalizeCandidatePotential({ ...c, stats });
    const cosmetics = resolveEntityCosmetics(c.cosmetics, c.candidateId);
    return { ...c, stats, potential, cosmetics };
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
