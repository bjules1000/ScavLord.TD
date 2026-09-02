/**
 * Map quest rewards → Radio progression modifiers.
 * Generic — no quest-id hard-coding in Radio UI.
 */

import type { QuestReward } from "../quests";
import {
  applyProgressionModifier,
  type ProgressionModifier,
  type RadioProgressionState,
} from "./radioProgression";

export function questRewardToModifiers(
  questId: string,
  rewards: readonly QuestReward[],
): ProgressionModifier[] {
  const out: ProgressionModifier[] = [];
  rewards.forEach((r, i) => {
    const id = `quest:${questId}:${r.type}:${i}`;
    switch (r.type) {
      case "SET_RADIO_STATE":
        out.push({ id, kind: "SET_RADIO_STATE", source: "quest", targetId: r.state });
        break;
      case "RECRUITMENT_SLOT_BONUS":
        out.push({
          id,
          kind: "RECRUITMENT_SLOT_BONUS",
          source: "quest",
          amount: r.amount,
        });
        break;
      case "RECRUITMENT_QUALITY_BONUS":
        out.push({
          id,
          kind: "RECRUITMENT_QUALITY_BONUS",
          source: "quest",
          amount: r.amount,
        });
        break;
      case "CREW_CAPACITY_BONUS":
        out.push({
          id,
          kind: "CREW_CAPACITY_BONUS",
          source: "quest",
          amount: r.amount,
        });
        break;
      case "UNLOCK_RETRANSMISSION":
        out.push({ id, kind: "UNLOCK_RETRANSMISSION", source: "quest" });
        break;
      case "UNLOCK_RECRUITMENT_PROFILE":
        out.push({
          id,
          kind: "UNLOCK_RECRUITMENT_PROFILE",
          source: "quest",
          targetId: r.profileId,
        });
        break;
      case "UNLOCK_UNIQUE_CONTACT":
        out.push({
          id,
          kind: "UNLOCK_UNIQUE_CONTACT",
          source: "quest",
          targetId: r.uniqueId,
        });
        break;
      default:
        break;
    }
  });
  return out;
}

export function applyQuestRewardsToRadio(
  radio: RadioProgressionState,
  questId: string,
  rewards: readonly QuestReward[],
): RadioProgressionState {
  const mods = questRewardToModifiers(questId, rewards);
  return mods.reduce((acc, m) => applyProgressionModifier(acc, m), radio);
}
