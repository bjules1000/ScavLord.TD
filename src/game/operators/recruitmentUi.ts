import {
  playerStatRows,
  devStatRows,
  type PlayerStatRow,
  type DevStatRow,
} from "./recruitmentPresentation";
import { ARMORS, ATTACHMENTS, WEAPONS } from "../gear";
import { kitEquipmentValue } from "./generation";
import { PERKS, allTraitIds, isNegativeTraitId } from "./perks";
import { STAT_DISPLAY_MAX, STAT_KEYS, STAT_LABELS } from "./stats";
import type { OperatorBaseStats } from "./types";
import type { OperatorEquipment, RecruitCandidate } from "./types";

export { playerStatRows, devStatRows, type PlayerStatRow, type DevStatRow };

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
  if (combat.aim) lines.push(`${combat.aim > 0 ? "+" : ""}${combat.aim} ${PERK_STAT_EFFECT_LABELS["aim"]}`);
  if (combat.toughness) lines.push(`${combat.toughness > 0 ? "+" : ""}${combat.toughness} ${PERK_STAT_EFFECT_LABELS["toughness"]}`);
  if (combat.handling) lines.push(`${combat.handling > 0 ? "+" : ""}${combat.handling} ${PERK_STAT_EFFECT_LABELS["handling"]}`);
  if (combat.mobility) lines.push(`${combat.mobility > 0 ? "+" : ""}${combat.mobility} ${PERK_STAT_EFFECT_LABELS["mobility"]}`);
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

/** DEV-only exact stat rows with true potential numbers. */
export function candidateStatRows(
  stats: OperatorBaseStats,
  potential: OperatorBaseStats,
): DevStatRow[] {
  return devStatRows(stats, potential);
}

export function primaryPerkId(
  candidate: Pick<RecruitCandidate, "perkIds" | "traitIds" | "negativeTraitIds">,
): string | null {
  const traits = allTraitIds(candidate);
  const positive = traits.find((id) => !isNegativeTraitId(id));
  return positive ?? candidate.perkIds?.[0] ?? null;
}

export interface CandidateCardView {
  name: string;
  archetype: string;
  statRows: PlayerStatRow[];
  perkName: string;
  costFormatted: string;
  showsKitLine: false;
  includesStatGridInDetail: false;
}

export function buildCandidateCardView(candidate: RecruitCandidate): CandidateCardView {
  const traits = allTraitIds(candidate);
  const posNames = traits
    .filter((id) => !isNegativeTraitId(id))
    .map((id) => PERKS[id]?.name ?? id);
  return {
    name: candidate.name,
    archetype: candidate.roleLabel,
    statRows: playerStatRows(candidate.stats, candidate.potential),
    perkName: posNames.length ? posNames.join(" · ") : "—",
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
  };
}

/** Player-facing crew stat line: current number + potential bar only. */
export function formatCrewStatDisplay(
  key: keyof OperatorBaseStats,
  current: number,
  truePotential: number,
): { label: string; current: number; bar: string } {
  const barModel = statPotentialBarSegments(current, truePotential, key);
  return { label: STAT_LABELS[key], current, bar: barModel.bar };
}

/** @deprecated Use formatCrewStatDisplay — reveals exact potential. */
export function formatCrewStatLine(
  key: keyof OperatorBaseStats,
  current: number,
  potential: number,
): string {
  return `${STAT_LABELS[key]} ${current} / ${potential}`;
}

export function crewStatRows(
  stats: OperatorBaseStats,
  truePotential: OperatorBaseStats,
): PlayerStatRow[] {
  return playerStatRows(stats, truePotential);
}
