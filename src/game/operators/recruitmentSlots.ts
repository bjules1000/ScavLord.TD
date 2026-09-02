/**
 * Slot helpers — thin re-exports over radioProgression capability.
 * Prefer resolveRecruitmentCapability for full breakdowns.
 */

import { DEV_TOOLS_ENABLED } from "../dev/tools";
import {
  RADIO_SLOT_MAX,
  RADIO_SLOT_MIN,
  RADIO_SLOTS_ON_SIGNAL_RESTORE,
  clampSlots,
  resolveRecruitmentCapability,
  type RadioProgressionState,
  freshRadioProgression,
} from "./radioProgression";

/** @deprecated New-game base is 0 until SIGNAL_RESTORED. Kept for Lab labels. */
export const BASE_RADIO_SLOTS = RADIO_SLOTS_ON_SIGNAL_RESTORE;

export { RADIO_SLOT_MIN, RADIO_SLOT_MAX, clampSlots };

export interface RadioSlotModifiers {
  signalLevelBonus?: number;
  perkBonus?: number;
  otherBonus?: number;
}

export interface RecruitmentSlotContext {
  modifiers?: RadioSlotModifiers;
  radio?: RadioProgressionState;
  devAppliedSlotOverride?: number | null;
  devToolsEnabled?: boolean;
}

/**
 * Centralized Radio slot count.
 * Uses capability resolution when radio state is provided; otherwise legacy modifier sum.
 */
export function getRecruitmentSlotCount(ctx: RecruitmentSlotContext = {}): number {
  const devOn = ctx.devToolsEnabled ?? DEV_TOOLS_ENABLED;
  if (ctx.radio) {
    return resolveRecruitmentCapability({
      radio: ctx.radio,
      dev: { slotOverride: ctx.devAppliedSlotOverride ?? null },
      devToolsEnabled: devOn,
    }).slots.effective;
  }
  if (devOn && ctx.devAppliedSlotOverride != null) {
    return clampSlots(ctx.devAppliedSlotOverride);
  }
  // Without radio state (legacy callers): treat as unlocked with base 1 + modifiers.
  const m = ctx.modifiers ?? {};
  const fromModifiers =
    (m.signalLevelBonus ?? 0) + (m.perkBonus ?? 0) + (m.otherBonus ?? 0);
  return clampSlots(RADIO_SLOTS_ON_SIGNAL_RESTORE + fromModifiers);
}

export function emptyRadioForSlots(): RadioProgressionState {
  return freshRadioProgression();
}
