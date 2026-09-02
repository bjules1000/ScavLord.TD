import type { Meta } from "../meta";
import { DEV_TOOLS_ENABLED } from "../dev/tools";
import {
  effectiveRecruitmentProfiles,
  getRecruitmentLabOverrides,
  progressionFactsFromMeta,
} from "./recruitmentLabCore";
import { generateRecruitmentCandidates, generateRecruitmentPool } from "./generation";
import { normalizeCandidatePotential } from "./migration";
import { withRecruitmentCosts } from "./recruitment";
import {
  freshRadioProgression,
  normalizeRadioProgression,
  resetRetransmissionCount,
  resolveRecruitmentCapability,
  type RadioProgressionState,
} from "./radioProgression";
import { isProfileEligible } from "./recruitmentRequirements";
import { isProfileRangeValid } from "./recruitmentProfiles";
import { seedFromParts } from "./rng";
import { clearOperatorEquipment } from "./runtime";
import { resolveTraitIds, type CrewState, type PersistentOperator, type RecruitCandidate, type RecruitmentPoolState } from "./types";
import {
  canRequestRetransmission,
  CANONICAL_RETRANSMISSION,
} from "./retransmission";
import { incrementRetransmissionCount } from "./radioProgression";
import {
  getUniqueContactProgress,
  uniqueContactRequirementsMet,
  uniqueToOperator,
  UNIQUE_OPERATOR_BY_ID,
} from "./uniqueOperators";

export { progressionFactsFromMeta };

let operatorSeq = 0;

export function createOperatorId(): string {
  operatorSeq += 1;
  return `op_${Date.now().toString(36)}_${operatorSeq.toString(36)}`;
}

export function capabilityFromMeta(meta: Meta) {
  const radio = meta.crew.radio ?? freshRadioProgression();
  const overrides = DEV_TOOLS_ENABLED ? getRecruitmentLabOverrides() : undefined;
  const dev =
    overrides != null
      ? {
          ...(overrides.radioState != null ? { radioState: overrides.radioState } : {}),
          slotOverride: overrides.slotCount ?? null,
          qualityOverride: overrides.qualityLevel ?? null,
          crewCapacityOverride: overrides.crewCapacity ?? null,
          retransmissionUnlocked: overrides.retransmissionUnlocked ?? null,
        }
      : undefined;
  return resolveRecruitmentCapability({
    radio,
    ...(dev ? { dev } : {}),
    devToolsEnabled: DEV_TOOLS_ENABLED,
  });
}

function eligibleProfilesForMeta(meta: Meta) {
  const facts = progressionFactsFromMeta(meta);
  const overrides = DEV_TOOLS_ENABLED
    ? getRecruitmentLabOverrides()
    : { profiles: {}, previewCandidates: {} };
  const quality = facts.effectiveQuality;
  return effectiveRecruitmentProfiles(overrides).filter(
    (p) =>
      p.enabled &&
      (p.minQuality ?? 1) <= quality &&
      isProfileRangeValid(p) &&
      isProfileEligible(p.requirements, facts),
  );
}

export function generatePoolForMeta(meta: Meta, generation: number, seed?: number): RecruitCandidate[] {
  const cap = capabilityFromMeta(meta);
  const count = cap.slots.effective;
  const quality = cap.quality.effective;
  const profiles = eligibleProfilesForMeta(meta);
  const poolSeed = seed ?? seedFromParts("radio", meta.runs, generation);
  const raw =
    profiles.length > 0 && count > 0
      ? generateRecruitmentPool({
          seed: poolSeed,
          generation,
          count,
          existingNames: crewNames(meta),
          profiles,
          quality,
        })
      : [];
  return withRecruitmentCosts(raw);
}

export function freshRecruitmentPool(runs: number, generation = 0, meta?: Meta): RecruitmentPoolState {
  const seed = seedFromParts("radio", runs, generation);
  if (!meta) {
    // New game: 0 slots until signal restored — empty pool.
    return { seed, generation, lastRefreshedAtRun: runs, candidates: [] };
  }
  const candidates = generatePoolForMeta({ ...meta, runs }, generation, seed);
  return { seed, generation, lastRefreshedAtRun: runs, candidates };
}

export function freshCrewState(runs = 0): CrewState {
  return {
    operators: [],
    recruitment: freshRecruitmentPool(runs),
    radio: freshRadioProgression(),
  };
}

export function crewNames(meta: Meta): string[] {
  const pmcName = meta.pmc?.name;
  return [...meta.crew.operators.map((o) => o.name), ...(pmcName ? [pmcName] : [])];
}

export function aliveOperators(meta: Meta): PersistentOperator[] {
  return meta.crew.operators.filter((o) => o.status === "alive");
}

/** Occupancy = alive hired operators + PMC (initial survivor). */
export function crewOccupancy(meta: Meta): number {
  return aliveOperators(meta).length + 1;
}

export function findOperator(meta: Meta, operatorId: string): PersistentOperator | undefined {
  return meta.crew.operators.find((o) => o.id === operatorId);
}

export function candidateFromOperator(op: PersistentOperator, cost: number): RecruitCandidate {
  const traits = resolveTraitIds(op);
  const c: RecruitCandidate = {
    candidateId: op.id,
    name: op.name,
    roleLabel: op.roleLabel,
    archetypeId: op.archetypeId,
    stats: { ...op.stats },
    potential: { ...op.potential },
    traitIds: traits.traitIds,
    perkIds: traits.perkIds,
    equipment: {
      weapon: op.equipment.weapon,
      attachments: [...op.equipment.attachments],
      armor: op.equipment.armor,
    },
    appearance: { ...op.appearance },
    cost,
  };
  if (op.uniqueId) c.uniqueId = op.uniqueId;
  if (traits.negativeTraitIds.length) c.negativeTraitIds = traits.negativeTraitIds;
  return c;
}

export function candidateToOperator(candidate: RecruitCandidate, operatorId: string): PersistentOperator {
  const traits = resolveTraitIds(candidate);
  const op: PersistentOperator = {
    id: operatorId,
    name: candidate.name,
    roleLabel: candidate.roleLabel,
    archetypeId: candidate.archetypeId,
    stats: { ...candidate.stats },
    potential: { ...candidate.potential },
    traitIds: traits.traitIds,
    perkIds: traits.perkIds,
    equipment: {
      weapon: candidate.equipment.weapon,
      attachments: [...candidate.equipment.attachments],
      armor: candidate.equipment.armor,
    },
    appearance: { ...candidate.appearance },
    progression: { level: 1, xp: 0 },
    status: "alive",
  };
  if (candidate.uniqueId) op.uniqueId = candidate.uniqueId;
  if (traits.negativeTraitIds.length) op.negativeTraitIds = traits.negativeTraitIds;
  return op;
}

export type HireResult =
  | { ok: true; meta: Meta; operator: PersistentOperator }
  | { ok: false; reason: string };

export function hireCandidate(meta: Meta, candidateId: string, operatorId = createOperatorId()): HireResult {
  const pool = meta.crew.recruitment;
  const idx = pool.candidates.findIndex((c) => c.candidateId === candidateId);
  if (idx < 0) return { ok: false, reason: "Candidate unavailable." };
  const candidate = pool.candidates[idx]!;
  const cap = capabilityFromMeta(meta);
  if (crewOccupancy(meta) >= cap.crewCapacity.effective) {
    return { ok: false, reason: "CREW CAPACITY FULL" };
  }
  if (meta.bank < candidate.cost) return { ok: false, reason: "Insufficient funds." };
  if (candidate.uniqueId) {
    const already = meta.crew.operators.some((o) => o.uniqueId === candidate.uniqueId);
    if (already) return { ok: false, reason: "Already recruited." };
  }
  meta.bank -= candidate.cost;
  const operator = candidateToOperator(candidate, operatorId);
  meta.crew.operators.push(operator);
  pool.candidates = pool.candidates.filter((c) => c.candidateId !== candidateId);
  if (candidate.uniqueId && meta.crew.radio) {
    meta.crew.radio = {
      ...meta.crew.radio,
      uniqueContacts: {
        ...meta.crew.radio.uniqueContacts,
        [candidate.uniqueId]: { lifecycle: "RECRUITED" },
      },
    };
  }
  return { ok: true, meta, operator };
}

/**
 * Hire a unique contact (e.g. Wolf) outside the procedural Radio pool.
 * Does not consume a procedural slot.
 */
export function hireUniqueContact(
  meta: Meta,
  uniqueId: string,
  operatorId = createOperatorId(),
): HireResult {
  const def = UNIQUE_OPERATOR_BY_ID[uniqueId];
  if (!def) return { ok: false, reason: "Unknown contact." };
  ensureRadio(meta);
  const radio = meta.crew.radio!;
  const prog = getUniqueContactProgress(radio, uniqueId);
  if (prog.lifecycle === "RECRUITED" || meta.crew.operators.some((o) => o.uniqueId === uniqueId)) {
    return { ok: false, reason: "Already recruited." };
  }
  if (prog.lifecycle !== "RECRUITABLE" && prog.lifecycle !== "CONTACTABLE") {
    return { ok: false, reason: "Contact not ready." };
  }
  const facts = progressionFactsFromMeta(meta);
  if (!uniqueContactRequirementsMet(def, facts)) {
    return { ok: false, reason: "Requirements not met." };
  }
  const cap = capabilityFromMeta(meta);
  if (crewOccupancy(meta) >= cap.crewCapacity.effective) {
    return { ok: false, reason: "CREW CAPACITY FULL" };
  }
  const cost = def.terms.cashCost ?? 0;
  if (meta.bank < cost) return { ok: false, reason: "Insufficient funds." };
  meta.bank -= cost;
  const operator = uniqueToOperator(def, operatorId);
  meta.crew.operators.push(operator);
  meta.crew.radio = {
    ...radio,
    uniqueContacts: {
      ...radio.uniqueContacts,
      [uniqueId]: {
        ...prog,
        lifecycle: "RECRUITED",
        distressHeard: true,
      },
    },
  };
  return { ok: true, meta, operator };
}

export function markOperatorDead(meta: Meta, operatorId: string): void {
  const op = findOperator(meta, operatorId);
  if (!op || op.status === "dead") return;
  op.status = "dead";
  op.equipment = clearOperatorEquipment();
}

export function refreshRecruitmentPoolIfNeeded(meta: Meta): boolean {
  const pool = meta.crew.recruitment;
  if (meta.runs <= pool.lastRefreshedAtRun) return false;
  const generation = pool.generation + 1;
  const seed = seedFromParts("radio", meta.runs, generation);
  const candidates = generatePoolForMeta(meta, generation, seed);
  meta.crew.recruitment = {
    seed,
    generation,
    lastRefreshedAtRun: meta.runs,
    candidates,
  };
  // Natural cycle reset for retransmission escalation.
  meta.crew.radio = resetRetransmissionCount(meta.crew.radio ?? freshRadioProgression());
  return true;
}

/** DEV-only: explicitly replace current Radio pool for testing. */
export function regenerateRecruitmentPool(meta: Meta): RecruitmentPoolState {
  const pool = meta.crew.recruitment;
  const generation = pool.generation + 1;
  const seed = seedFromParts("radio", meta.runs, generation);
  const candidates = generatePoolForMeta(meta, generation, seed);
  meta.crew.recruitment = {
    seed,
    generation,
    lastRefreshedAtRun: meta.runs,
    candidates,
  };
  return meta.crew.recruitment;
}

export type RetransmitResult =
  | { ok: true; meta: Meta; cost: number }
  | { ok: false; reason: string };

/** Player-facing REQUEST NEW TRANSMISSION. */
export function requestNewTransmission(meta: Meta): RetransmitResult {
  const radio = meta.crew.radio ?? freshRadioProgression();
  const cap = capabilityFromMeta(meta);
  const rules = CANONICAL_RETRANSMISSION;
  const attempt = canRequestRetransmission({
    unlocked: cap.retransmissionUnlocked,
    rules,
    retransmissionCount: radio.retransmissionCount,
    bank: meta.bank,
  });
  if (!attempt.ok) return attempt;
  meta.bank -= attempt.cost;
  meta.crew.radio = incrementRetransmissionCount(radio);
  regenerateRecruitmentPool(meta);
  // Retransmission does NOT reset escalation count (regenerate is intentional).
  // Escalation only resets on natural post-raid refresh.
  return { ok: true, meta, cost: attempt.cost };
}

export function normalizeCrewState(crew: Partial<CrewState> | undefined, runs: number): CrewState {
  const hadCandidates = !!crew?.recruitment?.candidates?.length;
  const hadOperators = Array.isArray(crew?.operators) && crew!.operators!.length > 0;
  if (!crew) return freshCrewState(runs);

  const radio = normalizeRadioProgression(crew.radio, {
    hadRecruitmentCandidates: hadCandidates,
    hadHiredOperators: hadOperators,
  });

  if (!crew.recruitment?.candidates) {
    return {
      operators: Array.isArray(crew.operators) ? crew.operators.filter(Boolean) : [],
      recruitment: freshRecruitmentPool(runs),
      radio,
    };
  }

  const pool = crew.recruitment;
  return {
    operators: Array.isArray(crew.operators) ? crew.operators.filter(Boolean) : [],
    radio,
    recruitment: {
      seed: Number(pool.seed) || seedFromParts("radio", runs, 0),
      generation: Number(pool.generation) || 0,
      lastRefreshedAtRun: Number(pool.lastRefreshedAtRun) || runs,
      candidates: withRecruitmentCosts(
        (pool.candidates ?? []).map((c) => {
          const stats = c.stats ?? { aim: 50, toughness: 50, handling: 50, mobility: 50 };
          const potential = normalizeCandidatePotential({ ...c, stats });
          const traits = resolveTraitIds(c);
          const next: RecruitCandidate = {
            ...c,
            stats,
            potential,
            traitIds: traits.traitIds,
            perkIds: traits.perkIds,
            equipment: c.equipment ?? clearOperatorEquipment(),
            cost: 0,
          };
          if (traits.negativeTraitIds.length) next.negativeTraitIds = traits.negativeTraitIds;
          return next;
        }),
      ),
    },
  };
}

export function ensureRadio(meta: Meta): RadioProgressionState {
  if (!meta.crew.radio) meta.crew.radio = freshRadioProgression();
  return meta.crew.radio;
}
