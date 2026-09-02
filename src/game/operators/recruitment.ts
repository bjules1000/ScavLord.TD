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
 *      + negative trait discounts
 */
export const RECRUITMENT_COST = {
  base: 650,
  min: 450,
  currentStatFactor: 12,
  potentialStatFactor: 4,
  equipmentFactor: 0.92,
  perkFactor: 1,
} as const;

export interface RecruitmentCostBreakdown {
  base: number;
  currentStats: number;
  potential: number;
  positivePerks: number;
  negativeTraits: number;
  startingKit: number;
  total: number;
}

export function currentStatCostContribution(stats: RecruitCandidate["stats"]): number {
  return statQualityScore(stats) * RECRUITMENT_COST.currentStatFactor;
}

export function potentialStatCostContribution(
  stats: RecruitCandidate["stats"],
  potential: RecruitCandidate["potential"],
): number {
  return potentialUpsideScore(stats, potential) * RECRUITMENT_COST.potentialStatFactor;
}

export function traitCostContribution(candidate: Pick<RecruitCandidate, "perkIds" | "negativeTraitIds">): {
  positive: number;
  negative: number;
} {
  let positive = 0;
  let negative = 0;
  for (const id of candidate.perkIds) {
    const w = PERKS[id]?.costWeight ?? 0;
    if (w >= 0) positive += w * RECRUITMENT_COST.perkFactor;
    else negative += w * RECRUITMENT_COST.perkFactor;
  }
  for (const id of candidate.negativeTraitIds ?? []) {
    const w = PERKS[id]?.costWeight ?? 0;
    if (w < 0) negative += w * RECRUITMENT_COST.perkFactor;
    else positive += w * RECRUITMENT_COST.perkFactor;
  }
  return { positive, negative };
}

export function recruitmentCostBreakdown(
  candidate: Omit<RecruitCandidate, "cost">,
): RecruitmentCostBreakdown {
  const currentStats = currentStatCostContribution(candidate.stats);
  const potential = potentialStatCostContribution(candidate.stats, candidate.potential);
  const equipPart = kitEquipmentValue(candidate.equipment) * RECRUITMENT_COST.equipmentFactor;
  const traits = traitCostContribution(candidate);
  const raw =
    RECRUITMENT_COST.base + currentStats + potential + equipPart + traits.positive + traits.negative;
  return {
    base: RECRUITMENT_COST.base,
    currentStats,
    potential,
    positivePerks: traits.positive,
    negativeTraits: traits.negative,
    startingKit: equipPart,
    total: Math.max(RECRUITMENT_COST.min, Math.round(raw)),
  };
}

export function calculateRecruitmentCost(candidate: Omit<RecruitCandidate, "cost">): number {
  return recruitmentCostBreakdown(candidate).total;
}

export function withRecruitmentCosts<T extends Omit<RecruitCandidate, "cost">>(
  candidates: T[],
): (T & { cost: number })[] {
  return candidates.map((c) => ({ ...c, cost: calculateRecruitmentCost(c) }));
}
