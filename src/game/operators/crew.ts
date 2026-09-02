import type { Meta } from "../meta";
import { DEV_TOOLS_ENABLED } from "../dev/tools";
import {
  effectiveSlotCount,
  eligibleProfiles,
  getRecruitmentLabOverrides,
  progressionFactsFromMeta,
} from "./recruitmentLabCore";
import { generateRecruitmentCandidates, generateRecruitmentPool } from "./generation";
import { normalizeCandidatePotential } from "./migration";
import { withRecruitmentCosts } from "./recruitment";
import { getRecruitmentSlotCount } from "./recruitmentSlots";
import { seedFromParts } from "./rng";
import { clearOperatorEquipment } from "./runtime";
import type {
  CrewState,
  PersistentOperator,
  RecruitCandidate,
  RecruitmentPoolState,
} from "./types";

let operatorSeq = 0;

export function createOperatorId(): string {
  operatorSeq += 1;
  return `op_${Date.now().toString(36)}_${operatorSeq.toString(36)}`;
}

function poolGenerationOptions(meta: Meta) {
  const overrides = DEV_TOOLS_ENABLED ? getRecruitmentLabOverrides() : { profiles: {}, previewCandidates: {} };
  const facts = progressionFactsFromMeta(meta);
  const profiles = DEV_TOOLS_ENABLED ? eligibleProfiles(facts, overrides) : eligibleProfiles(facts, { profiles: {}, previewCandidates: {} });
  const count = DEV_TOOLS_ENABLED
    ? effectiveSlotCount(overrides)
    : getRecruitmentSlotCount({ devToolsEnabled: false });
  return { profiles, count, overrides };
}

export function generatePoolForMeta(meta: Meta, generation: number, seed?: number): RecruitCandidate[] {
  const { profiles, count } = poolGenerationOptions(meta);
  const poolSeed = seed ?? seedFromParts("radio", meta.runs, generation);
  const raw =
    profiles.length > 0
      ? generateRecruitmentPool({
          seed: poolSeed,
          generation,
          count,
          existingNames: crewNames(meta),
          profiles,
        })
      : [];
  return withRecruitmentCosts(raw);
}

export function freshRecruitmentPool(runs: number, generation = 0, meta?: Meta): RecruitmentPoolState {
  const seed = seedFromParts("radio", runs, generation);
  if (!meta) {
    const candidates = withRecruitmentCosts(generateRecruitmentCandidates(seed, generation));
    return { seed, generation, lastRefreshedAtRun: runs, candidates };
  }
  const candidates = generatePoolForMeta({ ...meta, runs }, generation, seed);
  return { seed, generation, lastRefreshedAtRun: runs, candidates };
}

export function freshCrewState(runs = 0): CrewState {
  return {
    operators: [],
    recruitment: freshRecruitmentPool(runs),
  };
}

export function crewNames(meta: Meta): string[] {
  const pmcName = meta.pmc?.name;
  return [...meta.crew.operators.map((o) => o.name), ...(pmcName ? [pmcName] : [])];
}

export function aliveOperators(meta: Meta): PersistentOperator[] {
  return meta.crew.operators.filter((o) => o.status === "alive");
}

export function findOperator(meta: Meta, operatorId: string): PersistentOperator | undefined {
  return meta.crew.operators.find((o) => o.id === operatorId);
}

export function candidateFromOperator(op: PersistentOperator, cost: number): RecruitCandidate {
  return {
    candidateId: op.id,
    name: op.name,
    roleLabel: op.roleLabel,
    archetypeId: op.archetypeId,
    stats: { ...op.stats },
    potential: { ...op.potential },
    perkIds: [...op.perkIds],
    negativeTraitIds: op.negativeTraitIds ? [...op.negativeTraitIds] : [],
    equipment: {
      weapon: op.equipment.weapon,
      attachments: [...op.equipment.attachments],
      armor: op.equipment.armor,
    },
    appearance: { ...op.appearance },
    cost,
  };
}

export function candidateToOperator(candidate: RecruitCandidate, operatorId: string): PersistentOperator {
  const op: PersistentOperator = {
    id: operatorId,
    name: candidate.name,
    roleLabel: candidate.roleLabel,
    archetypeId: candidate.archetypeId,
    stats: { ...candidate.stats },
    potential: { ...candidate.potential },
    perkIds: [...candidate.perkIds],
    equipment: {
      weapon: candidate.equipment.weapon,
      attachments: [...candidate.equipment.attachments],
      armor: candidate.equipment.armor,
    },
    appearance: { ...candidate.appearance },
    progression: { level: 1, xp: 0 },
    status: "alive",
  };
  if (candidate.negativeTraitIds?.length) {
    op.negativeTraitIds = [...candidate.negativeTraitIds];
  }
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
  if (meta.bank < candidate.cost) return { ok: false, reason: "Insufficient funds." };
  meta.bank -= candidate.cost;
  const operator = candidateToOperator(candidate, operatorId);
  meta.crew.operators.push(operator);
  pool.candidates = pool.candidates.filter((c) => c.candidateId !== candidateId);
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

export function normalizeCrewState(crew: Partial<CrewState> | undefined, runs: number): CrewState {
  if (!crew?.recruitment?.candidates?.length) return freshCrewState(runs);
  const pool = crew.recruitment;
  return {
    operators: Array.isArray(crew.operators) ? crew.operators.filter(Boolean) : [],
    recruitment: {
      seed: Number(pool.seed) || seedFromParts("radio", runs, 0),
      generation: Number(pool.generation) || 0,
      lastRefreshedAtRun: Number(pool.lastRefreshedAtRun) || runs,
      candidates: withRecruitmentCosts(
        pool.candidates.map((c) => {
          const stats = c.stats ?? { aim: 50, toughness: 50, handling: 50, mobility: 50 };
          const potential = normalizeCandidatePotential({ ...c, stats });
          const next: RecruitCandidate = {
            ...c,
            stats,
            potential,
            perkIds: Array.isArray(c.perkIds) ? c.perkIds : [],
            equipment: c.equipment ?? clearOperatorEquipment(),
            cost: 0,
          };
          if (Array.isArray(c.negativeTraitIds) && c.negativeTraitIds.length) {
            next.negativeTraitIds = [...c.negativeTraitIds];
          }
          return next;
        }),
      ),
    },
  };
}
