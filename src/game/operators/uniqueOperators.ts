/**
 * Unique operator contacts — curated people, not procedural pool slots.
 * Wolf is the first contact; presentation is generic for future uniques.
 */

import type { OperatorBaseStats, OperatorEquipment, PersistentOperator } from "./types";
import { resolveTraitIds } from "./types";
import type { RecruitmentRequirement } from "./recruitmentRequirements";
import {
  isUniqueContactRadioActive,
  type RadioProgressionState,
  type UniqueContactLifecycle,
  type UniqueContactProgress,
} from "./radioProgression";
import { isProfileEligible, type RecruitmentProgressionFacts } from "./recruitmentRequirements";

export type UniqueRevealStage =
  | "distress"
  | "identified"
  | "requirements"
  | "contact"
  | "recruited";

export interface UniqueTransmissionContent {
  title: string;
  body: string;
  /** Optional status line under the title. */
  status?: string;
  knownTraits?: string[];
  knownRoleHint?: string;
  knownLocationHint?: string;
  /** Primary action label when player can advance. */
  actionLabel?: string;
}

export interface UniqueRevealContent {
  stage: UniqueRevealStage;
  headline: string;
  body: string;
  knownTraits?: string[];
  knownRoleHint?: string;
  knownLocationHint?: string;
}

export interface UniqueRecruitmentTerms {
  cashCost?: number;
  resourceCosts?: Record<string, number>;
  requiredQuestId?: string;
}

export interface UniqueOperatorDefinition {
  id: string;
  name: string;
  callsign?: string;
  profileId?: string;
  roleLabel: string;
  appearancePresetId: string;
  stats: OperatorBaseStats;
  potential: OperatorBaseStats;
  traitIds: string[];
  equipment: OperatorEquipment;
  discoveryRequirements: readonly RecruitmentRequirement[];
  contactRequirements: readonly RecruitmentRequirement[];
  /** Lightweight narrative keyed by lifecycle stage. */
  transmissions: Partial<Record<UniqueContactLifecycle, UniqueTransmissionContent>>;
  /** @deprecated Prefer transmissions — kept for Lab preview compat. */
  revealStages: UniqueRevealContent[];
  terms: UniqueRecruitmentTerms;
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
    stats: { aim: 56, toughness: 48, handling: 50, mobility: 46 },
    potential: { aim: 98, toughness: 72, handling: 82, mobility: 68 },
    traitIds: ["marksman"],
    equipment: { weapon: "adar", attachments: [], armor: null },
    discoveryRequirements: [{ type: "RADIO_STATE", minState: "SIGNAL_RESTORED" }],
    contactRequirements: [
      { type: "QUEST_COMPLETED", questId: "wolf_help" },
      { type: "WAVES_COMPLETED", count: 3 },
    ],
    transmissions: {
      DISTRESS_SIGNAL: {
        title: "UNKNOWN CONTACT",
        status: "Signal: WEAK · INCOMING TRANSMISSION",
        body: '...static...\n\n"...anyone receiving...?"\n\n"...could use some help out here..."\n\nSIGNAL LOST',
        actionLabel: "LISTEN",
        knownRoleHint: "Experienced operator",
      },
      IDENTIFIED: {
        title: "CALLSIGN: WOLF",
        status: "Signal: STABLE",
        body:
          "Heard about your old crew.\nSorry about that.\n\nSurviving ain't easy in these parts.\nEven with numbers.\n\nPeople noticed the noise you've been making since.\nMeans they're listening.\n\nBut alone? That won't last forever.\n\nHelp me out and I'll help you get this thing talking\nto more than static.",
        knownRoleHint: "Marksman",
        knownTraits: ["Good shooter", "Experienced survivor"],
        actionLabel: "ACKNOWLEDGE",
      },
      REQUIREMENTS_VISIBLE: {
        title: "WOLF — TERMS",
        status: "Requirements visible",
        body: "Prove you can hold a line and finish what you start.\nDo that, and we talk about joining up.",
        knownRoleHint: "Marksman",
        knownTraits: ["MARKSMAN"],
        actionLabel: "REVIEW TERMS",
      },
      CONTACTABLE: {
        title: "WOLF — CHANNEL OPEN",
        status: "Contactable",
        body: "You're making the right kind of noise.\nWhen you're ready, bring me in.",
        actionLabel: "CONTACT",
      },
      RECRUITABLE: {
        title: "WOLF — READY TO JOIN",
        status: "Recruitable",
        body: "You held up your end.\nI'll hold up mine.\n\nI'm in.",
        actionLabel: "RECRUIT WOLF",
      },
      RECRUITED: {
        title: "WOLF — CREW",
        status: "Recruited",
        body:
          "This setup got you talking to me.\nThat's about all it's good for.\n\nThere are other frequencies.\nDrifters. Guns for hire. People looking for a crew.\n\nHelp me open those channels and we'll start hearing from them.",
        actionLabel: "CONTINUE",
      },
    },
    revealStages: [
      {
        stage: "distress",
        headline: "INCOMING SIGNAL",
        body: '...static...\n"...anyone receiving...?"\n"...could use some help out here..."\nSIGNAL LOST',
        knownRoleHint: "Experienced operator",
      },
      {
        stage: "identified",
        headline: "CALLSIGN: WOLF",
        body: "Heard about your old crew. Alone won't last forever.",
        knownTraits: ["MARKSMAN"],
        knownRoleHint: "Marksman",
      },
      {
        stage: "requirements",
        headline: "WOLF — TERMS",
        body: "Prove you can hold a line and finish what you start.",
      },
      {
        stage: "contact",
        headline: "WOLF — READY TO JOIN",
        body: "You held up your end. I'll hold up mine.",
      },
      {
        stage: "recruited",
        headline: "WOLF — CREW",
        body: "Help open the scav frequencies — then others will answer.",
      },
    ],
    /** Requirements already paid the price — no cash. */
    terms: {},
    initialLifecycle: "DISTRESS_SIGNAL",
  },
];

export const UNIQUE_OPERATOR_BY_ID: Record<string, UniqueOperatorDefinition> = Object.fromEntries(
  CANONICAL_UNIQUE_OPERATORS.map((u) => [u.id, u]),
);

export function uniqueTransmissionForLifecycle(
  def: UniqueOperatorDefinition,
  lifecycle: UniqueContactLifecycle,
): UniqueTransmissionContent | null {
  if (lifecycle === "HIDDEN") return null;
  return def.transmissions[lifecycle] ?? null;
}

/** @deprecated Prefer uniqueTransmissionForLifecycle */
export function uniqueRevealForLifecycle(
  def: UniqueOperatorDefinition,
  lifecycle: UniqueContactLifecycle,
): UniqueRevealContent | null {
  const tx = uniqueTransmissionForLifecycle(def, lifecycle);
  if (!tx) return null;
  const stageMap: Record<string, UniqueRevealStage> = {
    DISTRESS_SIGNAL: "distress",
    IDENTIFIED: "identified",
    REQUIREMENTS_VISIBLE: "requirements",
    CONTACTABLE: "contact",
    RECRUITABLE: "contact",
    RECRUITED: "recruited",
  };
  return {
    stage: stageMap[lifecycle] ?? "distress",
    headline: tx.title,
    body: tx.body,
    ...(tx.knownTraits ? { knownTraits: tx.knownTraits } : {}),
    ...(tx.knownRoleHint ? { knownRoleHint: tx.knownRoleHint } : {}),
    ...(tx.knownLocationHint ? { knownLocationHint: tx.knownLocationHint } : {}),
  };
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

export function getUniqueContactProgress(
  radio: RadioProgressionState,
  uniqueId: string,
): UniqueContactProgress {
  return radio.uniqueContacts[uniqueId] ?? { lifecycle: "HIDDEN" };
}

/**
 * First Radio open after SIGNAL_RESTORED: move HIDDEN → DISTRESS_SIGNAL once.
 * Idempotent — never re-triggers distress.
 */
export function maybeTriggerUniqueDistress(
  radio: RadioProgressionState,
  uniqueId: string,
  runs: number,
): { radio: RadioProgressionState; triggered: boolean } {
  if (!isUniqueContactRadioActive(radio.radioState)) {
    return { radio, triggered: false };
  }
  const def = UNIQUE_OPERATOR_BY_ID[uniqueId];
  if (!def) return { radio, triggered: false };
  const cur = getUniqueContactProgress(radio, uniqueId);
  if (cur.lifecycle !== "HIDDEN") return { radio, triggered: false };
  return {
    triggered: true,
    radio: {
      ...radio,
      uniqueContacts: {
        ...radio.uniqueContacts,
        [uniqueId]: {
          lifecycle: def.initialLifecycle,
          discoveredAtRun: runs,
          distressHeard: true,
        },
      },
    },
  };
}

export function setUniqueLifecycle(
  radio: RadioProgressionState,
  uniqueId: string,
  lifecycle: UniqueContactLifecycle,
): RadioProgressionState {
  const prev = getUniqueContactProgress(radio, uniqueId);
  return {
    ...radio,
    uniqueContacts: {
      ...radio.uniqueContacts,
      [uniqueId]: {
        ...prev,
        lifecycle,
        ...(lifecycle !== "HIDDEN" && prev.discoveredAtRun == null
          ? {}
          : prev.discoveredAtRun != null
            ? { discoveredAtRun: prev.discoveredAtRun }
            : {}),
        ...(lifecycle === "DISTRESS_SIGNAL" || prev.distressHeard
          ? { distressHeard: true }
          : {}),
      },
    },
  };
}

export function uniqueContactRequirementsMet(
  def: UniqueOperatorDefinition,
  facts: RecruitmentProgressionFacts,
): boolean {
  return isProfileEligible(def.contactRequirements, facts);
}

/** Auto-advance unique contacts to RECRUITABLE when contact requirements are met. */
export function syncUniqueEligibility(
  radio: RadioProgressionState,
  uniqueId: string,
  facts: RecruitmentProgressionFacts,
): RadioProgressionState {
  const def = UNIQUE_OPERATOR_BY_ID[uniqueId];
  if (!def) return radio;
  const cur = getUniqueContactProgress(radio, uniqueId);
  if (
    cur.lifecycle === "HIDDEN" ||
    cur.lifecycle === "DISTRESS_SIGNAL" ||
    cur.lifecycle === "IDENTIFIED" ||
    cur.lifecycle === "RECRUITED" ||
    cur.lifecycle === "RECRUITABLE"
  ) {
    return radio;
  }
  if (
    (cur.lifecycle === "REQUIREMENTS_VISIBLE" || cur.lifecycle === "CONTACTABLE") &&
    uniqueContactRequirementsMet(def, facts)
  ) {
    return setUniqueLifecycle(radio, uniqueId, "RECRUITABLE");
  }
  return radio;
}

export function uniqueToOperator(
  def: UniqueOperatorDefinition,
  operatorId: string,
): PersistentOperator {
  const traits = resolveTraitIds({ traitIds: def.traitIds, perkIds: def.traitIds });
  const op: PersistentOperator = {
    id: operatorId,
    name: def.name,
    roleLabel: def.roleLabel,
    archetypeId: def.profileId ?? "rifleman",
    uniqueId: def.id,
    stats: { ...def.stats },
    potential: { ...def.potential },
    traitIds: traits.traitIds,
    perkIds: traits.perkIds,
    equipment: {
      weapon: def.equipment.weapon,
      attachments: [...def.equipment.attachments],
      armor: def.equipment.armor,
    },
    appearance: { presetId: def.appearancePresetId },
    progression: { level: 1, xp: 0 },
    status: "alive",
  };
  if (traits.negativeTraitIds.length) op.negativeTraitIds = traits.negativeTraitIds;
  return op;
}
