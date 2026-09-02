import { kitEquipmentValue } from "./generation";
import { PERKS } from "./perks";
import { potentialUpsideScore, statQualityScore } from "./stats";
import type { RecruitCandidate } from "./types";

/**
 * Recruitment economics — tune in Recruitment Lab.
 *
 * Cost = base
 *      + currentQuality × currentStatFactor   (realized capability — strongest)
 *      + potentialUpside × potentialStatFactor  (unrealized ceiling — weaker)
 *      + kitValue × equipmentFactor
 *      + perkWeights × perkFactor
 */
export const RECRUITMENT_COST = {
  base: 650,
  min: 450,
  currentStatFactor: 12,
  potentialStatFactor: 4,
  equipmentFactor: 0.92,
  perkFactor: 1,
} as const;

export function currentStatCostContribution(stats: RecruitCandidate["stats"]): number {
  return statQualityScore(stats) * RECRUITMENT_COST.currentStatFactor;
}

export function potentialStatCostContribution(
  stats: RecruitCandidate["stats"],
  potential: RecruitCandidate["potential"],
): number {
  return potentialUpsideScore(stats, potential) * RECRUITMENT_COST.potentialStatFactor;
}

export function calculateRecruitmentCost(candidate: Omit<RecruitCandidate, "cost">): number {
  const currentPart = currentStatCostContribution(candidate.stats);
  const potentialPart = potentialStatCostContribution(candidate.stats, candidate.potential);
  const equipPart = kitEquipmentValue(candidate.equipment) * RECRUITMENT_COST.equipmentFactor;
  const perkPart = candidate.perkIds.reduce(
    (sum, id) => sum + (PERKS[id]?.costWeight ?? 0) * RECRUITMENT_COST.perkFactor,
    0,
  );
  const raw = RECRUITMENT_COST.base + currentPart + potentialPart + equipPart + perkPart;
  return Math.max(RECRUITMENT_COST.min, Math.round(raw));
}

export function withRecruitmentCosts<T extends Omit<RecruitCandidate, "cost">>(
  candidates: T[],
): (T & { cost: number })[] {
  return candidates.map((c) => ({ ...c, cost: calculateRecruitmentCost(c) }));
}
