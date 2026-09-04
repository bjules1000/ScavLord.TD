/**
 * DEV-only quest force-completion helpers (no Meta/crew side effects).
 */

import {
  getQuestLifecycle,
  type QuestLifecycle,
  type QuestReward,
  type QuestSpec,
  type QuestUnlockContext,
} from "../quests";
import { questRewardToModifiers } from "../operators/questRadioRewards";
import {
  maxRadioState,
  type ProgressionModifier,
  type RadioProgressionState,
  type RadioState,
  RADIO_STATES,
} from "../operators/radioProgression";
import { DEV_TOOLS_ENABLED } from "./tools";

/** Economy / unlock-item rewards — never granted by DEV force-complete. */
const ECONOMY_REWARD_TYPES = new Set(["ROUBLES", "SKILL_POINTS", "UNLOCK"]);

export function progressionOnlyRewards(spec: QuestSpec): QuestReward[] {
  return spec.rewards.filter((r) => !ECONOMY_REWARD_TYPES.has(r.type));
}

export function effectiveClaimedQuestIds(
  canonicalClaimed: readonly string[],
  forcedCompleted: Readonly<Record<string, true>> | undefined,
  enabled = DEV_TOOLS_ENABLED,
): string[] {
  const set = new Set(canonicalClaimed);
  if (enabled && forcedCompleted) {
    for (const id of Object.keys(forcedCompleted)) {
      if (forcedCompleted[id]) set.add(id);
    }
  }
  return [...set];
}

export function isQuestForceCompleted(
  questId: string,
  forcedCompleted: Readonly<Record<string, true>> | undefined,
  enabled = DEV_TOOLS_ENABLED,
): boolean {
  return !!(enabled && forcedCompleted?.[questId]);
}

export function effectiveQuestLifecycle(
  spec: QuestSpec,
  canonicalCtx: QuestUnlockContext,
  forcedCompleted: Readonly<Record<string, true>> | undefined,
  progress?: Parameters<typeof getQuestLifecycle>[2],
  enabled = DEV_TOOLS_ENABLED,
): QuestLifecycle {
  const claimed = effectiveClaimedQuestIds(canonicalCtx.claimedQuestIds, forcedCompleted, enabled);
  return getQuestLifecycle(spec, { ...canonicalCtx, claimedQuestIds: claimed }, progress);
}

function recomputeRadioStateFromModifiers(modifiers: readonly ProgressionModifier[]): RadioState {
  let state: RadioState = "BROKEN";
  for (const m of modifiers) {
    if (m.kind === "SET_RADIO_STATE" && m.targetId && RADIO_STATES.includes(m.targetId as RadioState)) {
      state = maxRadioState(state, m.targetId as RadioState);
    }
  }
  return state;
}

/**
 * Remove progression modifiers belonging to quests that are neither legitimately
 * claimed nor DEV-forced. Recomputes radioState from remaining SET_RADIO_STATE mods.
 */
export function stripOrphanQuestProgressionModifiers(
  radio: RadioProgressionState,
  keepQuestIds: ReadonlySet<string>,
): RadioProgressionState {
  const kept: ProgressionModifier[] = [];
  const removed: ProgressionModifier[] = [];
  for (const m of radio.modifiers) {
    const match = /^quest:([^:]+):/.exec(m.id);
    if (match && !keepQuestIds.has(match[1]!)) {
      removed.push(m);
    } else {
      kept.push(m);
    }
  }
  if (removed.length === 0) return radio;

  const uniqueContacts = { ...radio.uniqueContacts };
  for (const m of removed) {
    if (m.kind !== "SET_UNIQUE_CONTACT_STATE" || !m.targetId || !m.lifecycle) continue;
    const stillSet = kept.some(
      (k) =>
        k.kind === "SET_UNIQUE_CONTACT_STATE" &&
        k.targetId === m.targetId &&
        k.lifecycle === m.lifecycle,
    );
    if (stillSet) continue;
    const cur = uniqueContacts[m.targetId];
    if (cur?.lifecycle === m.lifecycle) {
      delete uniqueContacts[m.targetId];
    }
  }

  return {
    ...radio,
    modifiers: kept,
    radioState: recomputeRadioStateFromModifiers(kept),
    uniqueContacts,
  };
}

/** Transitive prerequisites for optional bulk force-complete. */
export function collectPrerequisiteIds(
  questId: string,
  catalog: readonly QuestSpec[],
): string[] {
  const byId = new Map(catalog.map((q) => [q.id, q]));
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    const spec = byId.get(id);
    if (!spec) return;
    for (const pre of spec.prerequisites) {
      if (seen.has(pre)) continue;
      seen.add(pre);
      walk(pre);
      out.push(pre);
    }
  };
  walk(questId);
  return out;
}

export function forceCompleteModifierIds(spec: QuestSpec): string[] {
  return questRewardToModifiers(spec.id, progressionOnlyRewards(spec)).map((m) => m.id);
}
