/**
 * Canonical Radio / recruitment progression.
 *
 * New game: Radio BROKEN, 0 recruitment slots.
 * Restored signal unlocks the first slot. Further slots/quality come from
 * generic progression modifiers (quests, upgrades, future perks) — not
 * hard-coded quest-id checks in Radio UI.
 */

import { DEV_TOOLS_ENABLED } from "../dev/tools";

export const RADIO_STATES = ["BROKEN", "POWERED_STATIC", "SIGNAL_RESTORED", "NETWORKED"] as const;
export type RadioState = (typeof RADIO_STATES)[number];

export const RECRUITMENT_QUALITY_MIN = 1;
export const RECRUITMENT_QUALITY_MAX = 5;
export type RecruitmentQuality = 1 | 2 | 3 | 4 | 5;

/** Layout / DEV-safe Radio slot bounds. 0 allowed for broken/static. */
export const RADIO_SLOT_MIN = 0;
export const RADIO_SLOT_MAX = 8;

/** Slots granted when Radio first reaches SIGNAL_RESTORED (before other bonuses). */
export const RADIO_SLOTS_ON_SIGNAL_RESTORE = 1;

export const BASE_CREW_CAPACITY = 2;
export const CREW_CAPACITY_MAX = 12;

export type ProgressionModifierSource =
  | "radio_state"
  | "quest"
  | "upgrade"
  | "camp"
  | "perk"
  | "reputation"
  | "dev";

export type ProgressionModifierKind =
  | "RECRUITMENT_SLOT_BONUS"
  | "RECRUITMENT_QUALITY_BONUS"
  | "CREW_CAPACITY_BONUS"
  | "UNLOCK_RETRANSMISSION"
  | "UNLOCK_RECRUITMENT_PROFILE"
  | "UNLOCK_UNIQUE_CONTACT"
  | "SET_RADIO_STATE";

export interface ProgressionModifier {
  id: string;
  kind: ProgressionModifierKind;
  source: ProgressionModifierSource;
  /** Numeric delta for bonus kinds; radio state uses value as ordinal via SET_RADIO_STATE. */
  amount?: number;
  /** Target id for unlock kinds / SET_RADIO_STATE payload. */
  targetId?: string;
}

export interface RadioProgressionState {
  radioState: RadioState;
  /** Explicit modifiers granted by quests/upgrades (persisted). */
  modifiers: ProgressionModifier[];
  /** Retransmissions used since last natural recruitment cycle. */
  retransmissionCount: number;
  /** Unique contact progress keyed by unique operator id. */
  uniqueContacts: Record<string, UniqueContactProgress>;
}

export type UniqueContactLifecycle =
  | "HIDDEN"
  | "DISTRESS_SIGNAL"
  | "IDENTIFIED"
  | "REQUIREMENTS_VISIBLE"
  | "CONTACTABLE"
  | "RECRUITABLE"
  | "RECRUITED";

export interface UniqueContactProgress {
  lifecycle: UniqueContactLifecycle;
  discoveredAtRun?: number;
}

export function freshRadioProgression(): RadioProgressionState {
  return {
    radioState: "BROKEN",
    modifiers: [],
    retransmissionCount: 0,
    uniqueContacts: {},
  };
}

export function radioStateOrdinal(state: RadioState): number {
  return RADIO_STATES.indexOf(state);
}

export function maxRadioState(a: RadioState, b: RadioState): RadioState {
  return radioStateOrdinal(a) >= radioStateOrdinal(b) ? a : b;
}

export function isRecruitmentUnlocked(state: RadioState): boolean {
  return state === "SIGNAL_RESTORED" || state === "NETWORKED";
}

/** Slots contributed by radio state alone (before quest/upgrade bonuses). */
export function radioStateBaseSlots(state: RadioState): number {
  if (!isRecruitmentUnlocked(state)) return 0;
  return RADIO_SLOTS_ON_SIGNAL_RESTORE;
}

export function clampSlots(n: number): number {
  return Math.max(RADIO_SLOT_MIN, Math.min(RADIO_SLOT_MAX, Math.round(n)));
}

export function clampQuality(n: number): RecruitmentQuality {
  return Math.max(
    RECRUITMENT_QUALITY_MIN,
    Math.min(RECRUITMENT_QUALITY_MAX, Math.round(n)),
  ) as RecruitmentQuality;
}

export function clampCrewCapacity(n: number): number {
  return Math.max(1, Math.min(CREW_CAPACITY_MAX, Math.round(n)));
}

export interface CapabilityBreakdown {
  radioState: RadioState;
  slots: {
    stateBase: number;
    quest: number;
    upgrade: number;
    camp: number;
    perk: number;
    reputation: number;
    dev: number | null;
    effective: number;
  };
  quality: {
    base: number;
    quest: number;
    upgrade: number;
    perk: number;
    reputation: number;
    dev: number | null;
    effective: RecruitmentQuality;
  };
  crewCapacity: {
    base: number;
    quest: number;
    camp: number;
    perk: number;
    reputation: number;
    dev: number | null;
    effective: number;
  };
  retransmissionUnlocked: boolean;
  unlockedProfileIds: string[];
  unlockedUniqueIds: string[];
}

export interface CapabilityContext {
  radio: RadioProgressionState;
  /** Absolute DEV overrides (Recruitment Lab). */
  dev?: {
    radioState?: RadioState;
    slotOverride?: number | null;
    qualityOverride?: number | null;
    crewCapacityOverride?: number | null;
    retransmissionUnlocked?: boolean | null;
  };
  /** Future reputation/influence threshold bonus — hook only. */
  reputationCrewBonus?: number;
  reputationQualityBonus?: number;
  reputationSlotBonus?: number;
  devToolsEnabled?: boolean;
}

function sumBonuses(
  modifiers: readonly ProgressionModifier[],
  kind: ProgressionModifierKind,
  sources?: ProgressionModifierSource[],
): number {
  return modifiers
    .filter((m) => m.kind === kind && (!sources || sources.includes(m.source)))
    .reduce((s, m) => s + (m.amount ?? 0), 0);
}

function unlockedTargets(
  modifiers: readonly ProgressionModifier[],
  kind: ProgressionModifierKind,
): string[] {
  const ids = new Set<string>();
  for (const m of modifiers) {
    if (m.kind === kind && m.targetId) ids.add(m.targetId);
  }
  return [...ids];
}

/**
 * Effective recruitment capability.
 *
 * Slots = radioStateBase + quest/upgrade/camp/perk/reputation bonuses
 *         (or absolute DEV override when set).
 * Quality base starts at 1 once recruitment is unlocked, else 0 contribution (clamped to 1 min only when unlocked).
 */
export function resolveRecruitmentCapability(ctx: CapabilityContext): CapabilityBreakdown {
  const devOn = ctx.devToolsEnabled ?? DEV_TOOLS_ENABLED;
  const mods = ctx.radio.modifiers;
  let radioState = ctx.radio.radioState;
  if (devOn && ctx.dev?.radioState) radioState = ctx.dev.radioState;

  const stateBase = radioStateBaseSlots(radioState);
  const slotQuest = sumBonuses(mods, "RECRUITMENT_SLOT_BONUS", ["quest"]);
  const slotUpgrade = sumBonuses(mods, "RECRUITMENT_SLOT_BONUS", ["upgrade"]);
  const slotCamp = sumBonuses(mods, "RECRUITMENT_SLOT_BONUS", ["camp"]);
  const slotPerk = sumBonuses(mods, "RECRUITMENT_SLOT_BONUS", ["perk"]);
  const slotRep = (ctx.reputationSlotBonus ?? 0) + sumBonuses(mods, "RECRUITMENT_SLOT_BONUS", ["reputation"]);
  const slotDev =
    devOn && ctx.dev?.slotOverride != null ? ctx.dev.slotOverride : null;

  let effectiveSlots = clampSlots(stateBase + slotQuest + slotUpgrade + slotCamp + slotPerk + slotRep);
  if (slotDev != null) effectiveSlots = clampSlots(slotDev);
  if (!isRecruitmentUnlocked(radioState) && slotDev == null) effectiveSlots = 0;

  const qualityUnlocked = isRecruitmentUnlocked(radioState);
  const qualityBase = qualityUnlocked ? 1 : 0;
  const qQuest = sumBonuses(mods, "RECRUITMENT_QUALITY_BONUS", ["quest"]);
  const qUpgrade = sumBonuses(mods, "RECRUITMENT_QUALITY_BONUS", ["upgrade"]);
  const qPerk = sumBonuses(mods, "RECRUITMENT_QUALITY_BONUS", ["perk"]);
  const qRep =
    (ctx.reputationQualityBonus ?? 0) + sumBonuses(mods, "RECRUITMENT_QUALITY_BONUS", ["reputation"]);
  const qDev = devOn && ctx.dev?.qualityOverride != null ? ctx.dev.qualityOverride : null;
  let effectiveQuality = clampQuality(qualityBase + qQuest + qUpgrade + qPerk + qRep);
  if (!qualityUnlocked && qDev == null) effectiveQuality = 1;
  if (qDev != null) effectiveQuality = clampQuality(qDev);

  const crewBase = BASE_CREW_CAPACITY;
  const cQuest = sumBonuses(mods, "CREW_CAPACITY_BONUS", ["quest"]);
  const cCamp = sumBonuses(mods, "CREW_CAPACITY_BONUS", ["camp"]);
  const cPerk = sumBonuses(mods, "CREW_CAPACITY_BONUS", ["perk"]);
  const cRep =
    (ctx.reputationCrewBonus ?? 0) + sumBonuses(mods, "CREW_CAPACITY_BONUS", ["reputation"]);
  const cDev =
    devOn && ctx.dev?.crewCapacityOverride != null ? ctx.dev.crewCapacityOverride : null;
  let effectiveCrew = clampCrewCapacity(crewBase + cQuest + cCamp + cPerk + cRep);
  if (cDev != null) effectiveCrew = clampCrewCapacity(cDev);

  let retransmissionUnlocked = mods.some((m) => m.kind === "UNLOCK_RETRANSMISSION");
  if (devOn && ctx.dev?.retransmissionUnlocked != null) {
    retransmissionUnlocked = ctx.dev.retransmissionUnlocked;
  }

  return {
    radioState,
    slots: {
      stateBase,
      quest: slotQuest,
      upgrade: slotUpgrade,
      camp: slotCamp,
      perk: slotPerk,
      reputation: slotRep,
      dev: slotDev,
      effective: effectiveSlots,
    },
    quality: {
      base: qualityBase,
      quest: qQuest,
      upgrade: qUpgrade,
      perk: qPerk,
      reputation: qRep,
      dev: qDev,
      effective: effectiveQuality,
    },
    crewCapacity: {
      base: crewBase,
      quest: cQuest,
      camp: cCamp,
      perk: cPerk,
      reputation: cRep,
      dev: cDev,
      effective: effectiveCrew,
    },
    retransmissionUnlocked,
    unlockedProfileIds: unlockedTargets(mods, "UNLOCK_RECRUITMENT_PROFILE"),
    unlockedUniqueIds: unlockedTargets(mods, "UNLOCK_UNIQUE_CONTACT"),
  };
}

/** Apply a progression modifier (idempotent by id). */
export function applyProgressionModifier(
  radio: RadioProgressionState,
  modifier: ProgressionModifier,
): RadioProgressionState {
  if (radio.modifiers.some((m) => m.id === modifier.id)) return radio;
  const next: RadioProgressionState = {
    ...radio,
    modifiers: [...radio.modifiers, modifier],
    uniqueContacts: { ...radio.uniqueContacts },
  };
  if (modifier.kind === "SET_RADIO_STATE" && modifier.targetId) {
    const state = modifier.targetId as RadioState;
    if (RADIO_STATES.includes(state)) {
      next.radioState = maxRadioState(radio.radioState, state);
    }
  }
  if (modifier.kind === "UNLOCK_UNIQUE_CONTACT" && modifier.targetId) {
    if (!next.uniqueContacts[modifier.targetId]) {
      next.uniqueContacts[modifier.targetId] = { lifecycle: "DISTRESS_SIGNAL" };
    }
  }
  return next;
}

export function applyProgressionModifiers(
  radio: RadioProgressionState,
  modifiers: readonly ProgressionModifier[],
): RadioProgressionState {
  return modifiers.reduce((acc, m) => applyProgressionModifier(acc, m), radio);
}

/** Reset retransmission escalation after a natural recruitment cycle (post-raid pool refresh). */
export function resetRetransmissionCount(radio: RadioProgressionState): RadioProgressionState {
  if (radio.retransmissionCount === 0) return radio;
  return { ...radio, retransmissionCount: 0 };
}

export function incrementRetransmissionCount(radio: RadioProgressionState): RadioProgressionState {
  return { ...radio, retransmissionCount: radio.retransmissionCount + 1 };
}

/** Normalize legacy / partial radio progression. */
export function normalizeRadioProgression(
  raw: Partial<RadioProgressionState> | undefined,
  opts?: { hadRecruitmentCandidates?: boolean; hadHiredOperators?: boolean },
): RadioProgressionState {
  if (!raw) {
    // Compatibility: existing saves that already had recruitment stay playable.
    if (opts?.hadHiredOperators || opts?.hadRecruitmentCandidates) {
      return {
        radioState: "SIGNAL_RESTORED",
        modifiers: [
          {
            id: "migrate_compat_slot",
            kind: "RECRUITMENT_SLOT_BONUS",
            source: "quest",
            amount: 2,
          },
        ],
        retransmissionCount: 0,
        uniqueContacts: {},
      };
    }
    return freshRadioProgression();
  }
  const state = RADIO_STATES.includes(raw.radioState as RadioState)
    ? (raw.radioState as RadioState)
    : "BROKEN";
  return {
    radioState: state,
    modifiers: Array.isArray(raw.modifiers) ? raw.modifiers.filter(Boolean) : [],
    retransmissionCount: Math.max(0, Number(raw.retransmissionCount) || 0),
    uniqueContacts:
      raw.uniqueContacts && typeof raw.uniqueContacts === "object" ? { ...raw.uniqueContacts } : {},
  };
}

/** Player-facing Radio copy for camp UI. */
export function radioStatePresentation(state: RadioState): {
  title: string;
  subtitle: string;
  body: string;
} {
  switch (state) {
    case "BROKEN":
      return {
        title: "RADIO",
        subtitle: "NO POWER",
        body: "The set is dead. Maybe it can be repaired.",
      };
    case "POWERED_STATIC":
      return {
        title: "RADIO",
        subtitle: "POWER RESTORED",
        body: "...static...\nA weak transmission fades in and out.\nThe antenna / tower needs repair.",
      };
    case "SIGNAL_RESTORED":
      return {
        title: "RADIO",
        subtitle: "SIGNAL RESTORED",
        body: "A clear channel opens. Someone is listening.",
      };
    case "NETWORKED":
      return {
        title: "RADIO",
        subtitle: "NETWORKED",
        body: "The network is live. More frequencies answer.",
      };
  }
}
