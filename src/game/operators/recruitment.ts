import { kitEquipmentValue } from "./generation";
import { PERKS } from "./perks";
import { statQualityScore } from "./stats";
import type { RecruitCandidate } from "./types";

/** Recruitment economics — tune here for future Recruitment Lab. */
export const RECRUITMENT_COST = {
  base: 650,
  min: 450,
  statFactor: 12,
  equipmentFactor: 0.92,
  perkFactor: 1,
} as const;

export function calculateRecruitmentCost(candidate: Omit<RecruitCandidate, "cost">): number {
  const statPart = statQualityScore(candidate.stats) * RECRUITMENT_COST.statFactor;
  const equipPart = kitEquipmentValue(candidate.equipment) * RECRUITMENT_COST.equipmentFactor;
  const perkPart = candidate.perkIds.reduce(
    (sum, id) => sum + (PERKS[id]?.costWeight ?? 0) * RECRUITMENT_COST.perkFactor,
    0,
  );
  const raw = RECRUITMENT_COST.base + statPart + equipPart + perkPart;
  return Math.max(RECRUITMENT_COST.min, Math.round(raw));
}

export function withRecruitmentCosts<T extends Omit<RecruitCandidate, "cost">>(
  candidates: T[],
): (T & { cost: number })[] {
  return candidates.map((c) => ({ ...c, cost: calculateRecruitmentCost(c) }));
}
