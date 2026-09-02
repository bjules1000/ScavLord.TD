import { DEV_TOOLS_ENABLED } from "../dev/tools";

/** Production base Radio recruitment slots. */
export const BASE_RADIO_SLOTS = 3;

/** DEV-safe and layout-safe slot bounds. */
export const RADIO_SLOT_MIN = 1;
export const RADIO_SLOT_MAX = 8;

/** Future gameplay modifiers — not implemented yet. */
export interface RadioSlotModifiers {
  signalLevelBonus?: number;
  perkBonus?: number;
  otherBonus?: number;
}

export interface RecruitmentSlotContext {
  modifiers?: RadioSlotModifiers;
  /** Applied DEV override from Recruitment Lab (absolute test value). */
  devAppliedSlotOverride?: number | null;
  devToolsEnabled?: boolean;
}

function clampSlots(n: number): number {
  return Math.max(RADIO_SLOT_MIN, Math.min(RADIO_SLOT_MAX, Math.round(n)));
}

/**
 * Centralized Radio slot count.
 *
 * Order: base + future modifiers, unless DEV applied override is active.
 * Future: Signal Level, ScavLord perks, camp upgrades feed modifiers.
 */
export function getRecruitmentSlotCount(ctx: RecruitmentSlotContext = {}): number {
  const devOn = ctx.devToolsEnabled ?? DEV_TOOLS_ENABLED;
  if (devOn && ctx.devAppliedSlotOverride != null) {
    return clampSlots(ctx.devAppliedSlotOverride);
  }
  const m = ctx.modifiers ?? {};
  const fromModifiers =
    (m.signalLevelBonus ?? 0) + (m.perkBonus ?? 0) + (m.otherBonus ?? 0);
  return clampSlots(BASE_RADIO_SLOTS + fromModifiers);
}
