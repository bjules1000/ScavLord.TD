/**
 * Unique (curated) operator contacts — separate from procedural profiles.
 * Once recruited they become the same PersistentOperator model.
 */

import type { OperatorBaseStats, OperatorEquipment } from "./types";
import type { RecruitmentRequirement } from "./recruitmentRequirements";
import type { UniqueContactLifecycle } from "./radioProgression";

export type UniqueRevealStage =
  | "distress"
  | "identified"
  | "requirements"
  | "contact";

export interface UniqueRevealContent {
  stage: UniqueRevealStage;
  headline: string;
  body: string;
  /** Partial known strengths shown to the player (no exact potential). */
  knownTraits?: string[];
  knownRoleHint?: string;
  knownLocationHint?: string;
}

export interface UniqueRecruitmentTerms {
  cashCost?: number;
  /** Future resource payments. */
  resourceCosts?: Record<string, number>;
  /** Optional quest that must be completed (in addition to contact requirements). */
  requiredQuestId?: string;
}

export interface UniqueOperatorDefinition {
  id: string;
  name: string;
  callsign?: string;
  /** Optional procedural profile used as kit/stat tendency seed. */
  profileId?: string;
  roleLabel: string;
  appearancePresetId: string;
  stats: OperatorBaseStats;
  potential: OperatorBaseStats;
  traitIds: string[];
  equipment: OperatorEquipment;
  discoveryRequirements: readonly RecruitmentRequirement[];
  contactRequirements: readonly RecruitmentRequirement[];
  revealStages: UniqueRevealContent[];
  terms: UniqueRecruitmentTerms;
  /** Starting lifecycle when discovery requirements met (usually DISTRESS_SIGNAL). */
  initialLifecycle: UniqueContactLifecycle;
}

export const CANONICAL_UNIQUE_OPERATORS: UniqueOperatorDefinition[] = [
  {
    id: "wolf",
    name: "WOLF",
    callsign: "WOLF",
    profileId: "marksman",
    roleLabel: "MARKSMAN",
    appearancePresetId: "scav_2",
    stats: { aim: 58, toughness: 48, handling: 52, mobility: 46 },
    potential: { aim: 108, toughness: 72, handling: 88, mobility: 70 },
    traitIds: ["marksman", "tough"],
    equipment: { weapon: "adar", attachments: ["optic"], armor: "paca" },
    discoveryRequirements: [{ type: "RADIO_STATE", minState: "SIGNAL_RESTORED" }],
    contactRequirements: [
      { type: "QUEST_COMPLETED", questId: "debut" },
      { type: "WAVES_COMPLETED", count: 5 },
    ],
    revealStages: [
      {
        stage: "distress",
        headline: "UNKNOWN TRANSMISSION",
        body: '"...if anyone can hear this... get me out and I\'ll make it worth your while."',
        knownRoleHint: "Experienced shooter",
        knownLocationHint: "The Works area",
      },
      {
        stage: "identified",
        headline: "CALLSIGN: WOLF",
        body: "A veteran marksman offering to join — if you prove the gang can hold ground.",
        knownTraits: ["MARKSMAN"],
        knownRoleHint: "Marksman",
      },
      {
        stage: "requirements",
        headline: "WOLF — TERMS",
        body: "Wants proof you can finish the fight and hold a line.",
      },
      {
        stage: "contact",
        headline: "WOLF — READY TO JOIN",
        body: "Channel is clear. Wolf will join the gang for a fair cut.",
      },
    ],
    terms: { cashCost: 2200 },
    initialLifecycle: "DISTRESS_SIGNAL",
  },
];

export const UNIQUE_OPERATOR_BY_ID: Record<string, UniqueOperatorDefinition> = Object.fromEntries(
  CANONICAL_UNIQUE_OPERATORS.map((u) => [u.id, u]),
);

export function uniqueRevealForLifecycle(
  def: UniqueOperatorDefinition,
  lifecycle: UniqueContactLifecycle,
): UniqueRevealContent | null {
  if (lifecycle === "HIDDEN" || lifecycle === "RECRUITED") return null;
  if (lifecycle === "DISTRESS_SIGNAL") {
    return def.revealStages.find((s) => s.stage === "distress") ?? null;
  }
  if (lifecycle === "IDENTIFIED") {
    return def.revealStages.find((s) => s.stage === "identified") ?? null;
  }
  if (lifecycle === "REQUIREMENTS_VISIBLE") {
    return def.revealStages.find((s) => s.stage === "requirements") ?? null;
  }
  return def.revealStages.find((s) => s.stage === "contact") ?? null;
}

export function advanceUniqueLifecycle(current: UniqueContactLifecycle): UniqueContactLifecycle {
  const order: UniqueContactLifecycle[] = [
    "HIDDEN",
    "DISTRESS_SIGNAL",
    "IDENTIFIED",
    "REQUIREMENTS_VISIBLE",
    "CONTACTABLE",
    "RECRUITABLE",
    "RECRUITED",
  ];
  const i = order.indexOf(current);
  if (i < 0 || i >= order.length - 1) return current;
  return order[i + 1]!;
}
