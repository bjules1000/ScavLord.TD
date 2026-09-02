import { ARMORS, ATTACHMENTS, WEAPONS } from "../gear";
import { kitEquipmentValue } from "./generation";
import { PERKS } from "./perks";
import {
  STAT_DISPLAY_MAX,
  STAT_KEYS,
  STAT_LABELS,
  growthGap,
  growthGaps,
} from "./stats";
import type { OperatorBaseStats } from "./types";
import type { OperatorEquipment, RecruitCandidate } from "./types";

export const RECRUITMENT_SUBTITLE =
  "Incoming transmissions. Stats, perks and kit affect hiring cost.";

export const STAT_BAR_SEGMENTS = 8;

export interface StatBarModel {
  currentFilled: number;
  potentialFilled: number;
  totalSegments: number;
  bar: string;
}

/** Absolute-scale bar: solid = current, ▒ = unrealized potential, ░ = empty. */
export function statPotentialBarSegments(
  current: number,
  potential: number,
  statKey: keyof OperatorBaseStats,
): StatBarModel {
  const displayMax = STAT_DISPLAY_MAX[statKey];
  const totalSegments = STAT_BAR_SEGMENTS;
  const currentFilled = Math.max(
    0,
    Math.min(totalSegments, Math.round((current / displayMax) * totalSegments)),
  );
  const potentialFilled = Math.max(
    currentFilled,
    Math.min(totalSegments, Math.round((potential / displayMax) * totalSegments)),
  );
  let bar = "";
  for (let i = 0; i < totalSegments; i++) {
    if (i < currentFilled) bar += "█";
    else if (i < potentialFilled) bar += "▒";
    else bar += "░";
  }
  return { currentFilled, potentialFilled, totalSegments, bar };
}

export function recruitmentDeficit(bank: number, cost: number): number {
  return Math.max(0, cost - bank);
}

export function canAffordRecruitment(bank: number, cost: number): boolean {
  return bank >= cost;
}

export function formatRecruitmentRoubles(amount: number): string {
  return `${amount.toLocaleString()} ₽`;
}

export function recruitmentAffordabilityMessage(bank: number, cost: number): string | null {
  const deficit = recruitmentDeficit(bank, cost);
  if (deficit <= 0) return null;
  return `INSUFFICIENT FUNDS · NEED ${formatRecruitmentRoubles(deficit)} MORE`;
}

const PERK_STAT_EFFECT_LABELS: Record<keyof OperatorBaseStats, string> = {
  aim: "Aim",
  toughness: "Toughness",
  handling: "Handling",
  mobility: "Mobility",
};

export function perkRecruitmentDetail(perkId: string): { name: string; lines: string[] } {
  const perk = PERKS[perkId];
  if (!perk) return { name: perkId.toUpperCase(), lines: [] };
  const lines: string[] = [];
  const combat = perk.combat;
  if (combat.aim) lines.push(`+${combat.aim} ${PERK_STAT_EFFECT_LABELS["aim"]}`);
  if (combat.toughness) lines.push(`+${combat.toughness} ${PERK_STAT_EFFECT_LABELS["toughness"]}`);
  if (combat.handling) lines.push(`+${combat.handling} ${PERK_STAT_EFFECT_LABELS["handling"]}`);
  if (combat.mobility) lines.push(`+${combat.mobility} ${PERK_STAT_EFFECT_LABELS["mobility"]}`);
  if (lines.length) lines.push(perk.desc);
  else lines.push(`Future: ${perk.desc}`);
  return { name: perk.name, lines };
}

export interface StartingKitDisplay {
  weapon: string;
  armor: string;
  attachments: string;
  kitValue: number;
}

export function startingKitDisplay(equipment: OperatorEquipment): StartingKitDisplay {
  return {
    weapon: WEAPONS[equipment.weapon]?.name ?? equipment.weapon.toUpperCase(),
    armor: equipment.armor ? (ARMORS[equipment.armor]?.name ?? equipment.armor.toUpperCase()) : "None",
    attachments: equipment.attachments.length
      ? equipment.attachments.map((a) => ATTACHMENTS[a]?.name ?? a.toUpperCase()).join(", ")
      : "None",
    kitValue: kitEquipmentValue(equipment),
  };
}

export function candidateStatRows(
  stats: OperatorBaseStats,
  potential: OperatorBaseStats,
): Array<{
  key: keyof OperatorBaseStats;
  label: string;
  current: number;
  potential: number;
  growthGap: number;
  bar: string;
}> {
  return STAT_KEYS.map((key) => {
    const barModel = statPotentialBarSegments(stats[key], potential[key], key);
    return {
      key,
      label: STAT_LABELS[key],
      current: stats[key],
      potential: potential[key],
      growthGap: growthGap(stats[key], potential[key]),
      bar: barModel.bar,
    };
  });
}

export function largestGrowthGapLabel(
  stats: OperatorBaseStats,
  potential: OperatorBaseStats,
): string | null {
  const gaps = growthGaps(stats, potential);
  let best: keyof OperatorBaseStats | null = null;
  let bestGap = 0;
  for (const key of STAT_KEYS) {
    if (gaps[key] > bestGap) {
      bestGap = gaps[key];
      best = key;
    }
  }
  if (!best || bestGap <= 0) return null;
  return `DEVELOPMENT: +${bestGap} ${STAT_LABELS[best]} AVAILABLE`;
}

export function primaryPerkId(candidate: Pick<RecruitCandidate, "perkIds">): string | null {
  return candidate.perkIds[0] ?? null;
}

export interface CandidateCardView {
  name: string;
  archetype: string;
  statRows: ReturnType<typeof candidateStatRows>;
  perkName: string;
  costFormatted: string;
  showsKitLine: false;
  includesStatGridInDetail: false;
}

export function buildCandidateCardView(candidate: RecruitCandidate): CandidateCardView {
  const perkId = primaryPerkId(candidate);
  return {
    name: candidate.name,
    archetype: candidate.roleLabel,
    statRows: candidateStatRows(candidate.stats, candidate.potential),
    perkName: perkId ? (PERKS[perkId]?.name ?? perkId) : "—",
    costFormatted: formatRecruitmentRoubles(candidate.cost),
    showsKitLine: false,
    includesStatGridInDetail: false,
  };
}

export interface SelectedDetailView {
  identity: string;
  perk: ReturnType<typeof perkRecruitmentDetail> | null;
  kit: StartingKitDisplay;
  bankFormatted: string;
  costFormatted: string;
  affordMsg: string | null;
  affordable: boolean;
  developmentLine: string | null;
}

export function buildSelectedDetailView(candidate: RecruitCandidate, bank: number): SelectedDetailView {
  const perkId = primaryPerkId(candidate);
  return {
    identity: `${candidate.name} · ${candidate.roleLabel}`,
    perk: perkId ? perkRecruitmentDetail(perkId) : null,
    kit: startingKitDisplay(candidate.equipment),
    bankFormatted: formatRecruitmentRoubles(bank),
    costFormatted: formatRecruitmentRoubles(candidate.cost),
    affordMsg: recruitmentAffordabilityMessage(bank, candidate.cost),
    affordable: canAffordRecruitment(bank, candidate.cost),
    developmentLine: largestGrowthGapLabel(candidate.stats, candidate.potential),
  };
}

export function formatCrewStatLine(
  key: keyof OperatorBaseStats,
  current: number,
  potential: number,
): string {
  return `${STAT_LABELS[key]} ${current} / ${potential}`;
}
