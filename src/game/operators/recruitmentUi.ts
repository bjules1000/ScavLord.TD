import { ARMORS, ATTACHMENTS, WEAPONS } from "../gear";
import { kitEquipmentValue } from "./generation";
import { PERKS } from "./perks";
import {
  STAT_LABELS,
  STAT_MAX,
  STAT_MIN,
  clampStat,
  type OperatorBaseStats,
} from "./stats";
import type { OperatorEquipment, RecruitCandidate } from "./types";

export const RECRUITMENT_SUBTITLE =
  "Incoming transmissions. Stats, perks and kit affect hiring cost.";

export const STAT_DISPLAY_KEYS = ["aim", "toughness", "handling", "mobility"] as const satisfies ReadonlyArray<
  keyof OperatorBaseStats
>;

export const STAT_BAR_SEGMENTS = 6;

/** Shared scale for all candidates — normalized against canonical stat bounds. */
export function statBarFilledSegments(value: number): number {
  const clamped = clampStat(value);
  const ratio = (clamped - STAT_MIN) / (STAT_MAX - STAT_MIN);
  return Math.max(0, Math.min(STAT_BAR_SEGMENTS, Math.round(ratio * STAT_BAR_SEGMENTS)));
}

export function statBarString(value: number): string {
  const filled = statBarFilledSegments(value);
  return `${"█".repeat(filled)}${"░".repeat(STAT_BAR_SEGMENTS - filled)}`;
}

export function recruitmentDeficit(bank: number, cost: number): number {
  return Math.max(0, cost - bank);
}

export function canAffordRecruitment(bank: number, cost: number): boolean {
  return bank >= cost;
}

export function recruitmentAffordabilityMessage(bank: number, cost: number): string | null {
  const deficit = recruitmentDeficit(bank, cost);
  if (deficit <= 0) return null;
  return `INSUFFICIENT FUNDS · NEED ${deficit} ₽ MORE`;
}

export function perkRecruitmentDetail(perkId: string): { name: string; lines: string[] } {
  const perk = PERKS[perkId];
  if (!perk) return { name: perkId.toUpperCase(), lines: [] };
  const lines: string[] = [];
  const combat = perk.combat;
  if (combat.aim) lines.push(`+${combat.aim} aim`);
  if (combat.toughness) lines.push(`+${combat.toughness} toughness`);
  if (combat.handling) lines.push(`+${combat.handling} handling`);
  if (combat.mobility) lines.push(`+${combat.mobility} mobility`);
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

export function compactKitLine(equipment: OperatorEquipment): string {
  return `KIT · ${WEAPONS[equipment.weapon]?.name ?? equipment.weapon.toUpperCase()}`;
}

/** Read-only stat rows for cards — does not mutate candidate stats. */
export function candidateStatRows(stats: OperatorBaseStats): Array<{
  key: keyof OperatorBaseStats;
  label: string;
  value: number;
  bar: string;
}> {
  return STAT_DISPLAY_KEYS.map((key) => ({
    key,
    label: STAT_LABELS[key],
    value: stats[key],
    bar: statBarString(stats[key]),
  }));
}

export function primaryPerkId(candidate: Pick<RecruitCandidate, "perkIds">): string | null {
  return candidate.perkIds[0] ?? null;
}
