/**
 * Apply/strip DEV forced-completion progression onto Meta (no economy rewards).
 */

import type { Meta } from "../meta";
import { QUEST_SPEC_BY_ID, type QuestSpec } from "../quests";
import { applyQuestRewardsToRadio } from "../operators/questRadioRewards";
import {
  ensureRadio,
  capabilityFromMeta,
  progressionFactsFromMeta,
  regenerateRecruitmentPool,
} from "../operators/crew";
import { syncAllUniqueEligibility } from "../operators/uniqueOperators";
import { DEV_TOOLS_ENABLED } from "./tools";
import { progressionOnlyRewards, stripOrphanQuestProgressionModifiers } from "./questForceComplete";

/**
 * Sync meta radio/crew progression to match DEV forced completions.
 * Does not mutate meta.claimed, bank, skill points, or item unlocks.
 */
export function syncDevForcedQuestProgression(
  meta: Meta,
  forcedCompleted: Readonly<Record<string, true>>,
  catalog: readonly QuestSpec[] = Object.values(QUEST_SPEC_BY_ID),
  enabled = DEV_TOOLS_ENABLED,
): Meta {
  if (!enabled) return meta;
  ensureRadio(meta);
  const forcedIds = Object.keys(forcedCompleted).filter((id) => forcedCompleted[id]);
  const keep = new Set<string>([...meta.claimed, ...forcedIds]);

  let radio = stripOrphanQuestProgressionModifiers(meta.crew.radio!, keep);

  for (const id of forcedIds) {
    if (meta.claimed.includes(id)) continue;
    const spec = QUEST_SPEC_BY_ID[id] ?? catalog.find((q) => q.id === id);
    if (!spec) continue;
    const rewards = progressionOnlyRewards(spec);
    if (rewards.length === 0) continue;
    radio = applyQuestRewardsToRadio(radio, id, rewards);
  }

  meta.crew.radio = syncAllUniqueEligibility(radio, progressionFactsFromMeta(meta));

  const cap = capabilityFromMeta(meta);
  if (cap.slots.effective > 0 && meta.crew.recruitment.candidates.length === 0) {
    regenerateRecruitmentPool(meta);
  }

  return meta;
}
