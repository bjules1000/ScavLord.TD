import type { Meta } from "../meta";
import { generateRecruitmentCandidates } from "./generation";
import { withRecruitmentCosts } from "./recruitment";
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

export function freshRecruitmentPool(runs: number, generation = 0): RecruitmentPoolState {
  const seed = seedFromParts("radio", runs, generation);
  const candidates = withRecruitmentCosts(generateRecruitmentCandidates(seed, generation));
  return { seed, generation, lastRefreshedAtRun: runs, candidates };
}

export function freshCrewState(runs = 0): CrewState {
  return {
    operators: [],
    recruitment: freshRecruitmentPool(runs),
  };
}

export function crewNames(meta: Meta): string[] {
  return [...meta.crew.operators.map((o) => o.name), meta.pmc.name];
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
    perkIds: [...op.perkIds],
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
  return {
    id: operatorId,
    name: candidate.name,
    roleLabel: candidate.roleLabel,
    archetypeId: candidate.archetypeId,
    stats: { ...candidate.stats },
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
  const candidates = withRecruitmentCosts(
    generateRecruitmentCandidates(seed, generation, undefined, crewNames(meta)),
  );
  meta.crew.recruitment = {
    seed,
    generation,
    lastRefreshedAtRun: meta.runs,
    candidates,
  };
  return true;
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
        pool.candidates.map((c) => ({
          ...c,
          perkIds: Array.isArray(c.perkIds) ? c.perkIds : [],
          equipment: c.equipment ?? clearOperatorEquipment(),
        })),
      ),
    },
  };
}
