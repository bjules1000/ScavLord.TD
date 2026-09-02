/**
 * Canonical quest redemption settlement — rewards only on REDEEM.
 */

import type { Meta } from "./meta";
import {
  QUEST_SPEC_BY_ID,
  QUEST_SPECS,
  getQuestLifecycle,
  listNewlyUnlockedQuestIds,
  questRoubles,
  questSkillPoints,
  type QuestSpec,
  type QuestUnlockContext,
} from "./quests";
import { applyQuestRewardsToRadio } from "./operators/questRadioRewards";
import {
  ensureRadio,
  capabilityFromMeta,
  progressionFactsFromMeta,
  regenerateRecruitmentPool,
} from "./operators/crew";
import { syncAllUniqueEligibility } from "./operators/uniqueOperators";
import { freshRadioProgression, type RadioState } from "./operators/radioProgression";
import {
  buildQuestCompleteNotice,
  summarizeUniqueState,
  type ProgressionNotice,
} from "./progressionNotifications";

export type RedeemQuestResult =
  | {
      ok: true;
      alreadySettled?: false;
      meta: Meta;
      notice: ProgressionNotice;
      newlyUnlockedQuestIds: string[];
    }
  | { ok: true; alreadySettled: true; meta: Meta; notice: null; newlyUnlockedQuestIds: [] }
  | { ok: false; reason: string };

export function unlockContextFromMeta(meta: Meta): QuestUnlockContext {
  const radio = meta.crew.radio ?? freshRadioProgression();
  return {
    claimedQuestIds: meta.claimed,
    playerLevel: meta.pmc.level,
    radioState: radio.radioState,
    uniqueContacts: radio.uniqueContacts,
  };
}

/**
 * Redeem a READY_TO_REDEEM quest. Idempotent if already claimed.
 */
export function redeemQuest(
  meta: Meta,
  questId: string,
  catalog: readonly QuestSpec[] = QUEST_SPECS,
): RedeemQuestResult {
  const spec = QUEST_SPEC_BY_ID[questId] ?? catalog.find((q) => q.id === questId);
  if (!spec) return { ok: false, reason: "Unknown quest." };

  if (meta.claimed.includes(questId)) {
    return { ok: true, alreadySettled: true, meta, notice: null, newlyUnlockedQuestIds: [] };
  }

  const beforeCtx = unlockContextFromMeta(meta);
  const life = getQuestLifecycle(spec, beforeCtx, meta.quests);
  if (life !== "READY_TO_REDEEM") {
    return { ok: false, reason: life === "ACTIVE" ? "Objectives incomplete." : "Quest not redeemable." };
  }

  const radioBefore = (meta.crew.radio ?? freshRadioProgression()).radioState;
  const uniqueBefore = { ...(meta.crew.radio?.uniqueContacts ?? {}) };

  meta.claimed = [...meta.claimed, questId];
  meta.bank += questRoubles(spec);
  meta.skillPoints += questSkillPoints(spec);

  ensureRadio(meta);
  meta.crew.radio = applyQuestRewardsToRadio(meta.crew.radio, questId, spec.rewards);
  meta.crew.radio = syncAllUniqueEligibility(meta.crew.radio, progressionFactsFromMeta(meta));

  const radioAfter = meta.crew.radio.radioState;
  const uniqueAfter = meta.crew.radio.uniqueContacts;

  let generatedPool = false;
  const cap = capabilityFromMeta(meta);
  if (cap.slots.effective > 0 && meta.crew.recruitment.candidates.length === 0) {
    regenerateRecruitmentPool(meta);
    generatedPool = true;
  }

  const afterCtx = unlockContextFromMeta(meta);
  const newlyUnlockedQuestIds = listNewlyUnlockedQuestIds(catalog, beforeCtx, afterCtx);

  const uniqueLifecycleLines: string[] = [];
  for (const [id, prog] of Object.entries(uniqueAfter)) {
    const prev = uniqueBefore[id]?.lifecycle;
    if (prog.lifecycle !== prev) {
      uniqueLifecycleLines.push(summarizeUniqueState(id, prog.lifecycle));
    }
  }

  const radioStateChangedTo: RadioState | null =
    radioAfter !== radioBefore ? radioAfter : null;

  // Signal restored → player should check Radio for an incoming contact.
  const transmissionHint = radioStateChangedTo === "SIGNAL_RESTORED";

  const notice = buildQuestCompleteNotice({
    quest: spec,
    rewards: spec.rewards,
    newlyUnlockedQuestIds,
    catalog,
    radioStateChangedTo,
    uniqueLifecycleLines,
    newTransmission: transmissionHint,
    generatedProceduralPool: generatedPool,
  });

  return {
    ok: true,
    meta,
    notice,
    newlyUnlockedQuestIds,
  };
}
