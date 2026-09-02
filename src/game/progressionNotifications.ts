/**
 * Generic progression notifications — quest redemption and non-quest unlocks.
 */

import type { QuestReward, QuestSpec } from "./quests";
import { ITEM_BY_ID } from "./gear";
import type { RadioState } from "./operators/radioProgression";

export type ProgressionNoticeKind = "QUEST_COMPLETE" | "NEW_QUEST" | "PROGRESSION";

export interface ProgressionNoticeSection {
  heading: string;
  lines: string[];
}

export interface ProgressionNotice {
  id: string;
  kind: ProgressionNoticeKind;
  title: string;
  subtitle?: string;
  body?: string;
  sections: ProgressionNoticeSection[];
}

export function summarizeQuestReward(r: QuestReward): string | null {
  switch (r.type) {
    case "ROUBLES":
      return r.amount > 0 ? `+${r.amount.toLocaleString()} ₽` : null;
    case "SKILL_POINTS":
      return r.amount > 0 ? `+${r.amount} Skill Point${r.amount === 1 ? "" : "s"}` : null;
    case "UNLOCK": {
      const name = ITEM_BY_ID[r.itemId]?.name ?? r.itemId;
      return `Unlocked ${name}`;
    }
    case "SET_RADIO_STATE":
      return summarizeRadioState(r.state);
    case "RECRUITMENT_SLOT_BONUS":
      return `+${r.amount} Recruitment Slot${r.amount === 1 ? "" : "s"}`;
    case "RECRUITMENT_QUALITY_BONUS":
      return `+${r.amount} Recruitment Quality`;
    case "CREW_CAPACITY_BONUS":
      return `+${r.amount} Crew Capacity`;
    case "UNLOCK_RETRANSMISSION":
      return "Retransmission unlocked";
    case "UNLOCK_RECRUITMENT_PROFILE":
      return `Profile unlocked: ${r.profileId}`;
    case "UNLOCK_UNIQUE_CONTACT":
      return `Unique contact: ${r.uniqueId.toUpperCase()}`;
    case "SET_UNIQUE_CONTACT_STATE":
      return summarizeUniqueState(r.uniqueId, r.lifecycle);
    default:
      return null;
  }
}

export function summarizeRadioState(state: RadioState): string {
  switch (state) {
    case "POWERED_STATIC":
      return "Radio Power Restored";
    case "SIGNAL_RESTORED":
      return "Radio Signal Restored";
    case "NETWORKED":
      return "Scav Network Unlocked";
    case "BROKEN":
      return "Radio Offline";
    default:
      return `Radio ${state}`;
  }
}

export function summarizeUniqueState(uniqueId: string, lifecycle: string): string {
  const name = uniqueId.toUpperCase();
  switch (lifecycle) {
    case "DISTRESS_SIGNAL":
      return `Incoming transmission (${name})`;
    case "IDENTIFIED":
      return `${name} identified`;
    case "REQUIREMENTS_VISIBLE":
      return `${name} terms revealed`;
    case "CONTACTABLE":
      return `${name} is ready to talk`;
    case "RECRUITABLE":
      return `${name} ready to join`;
    case "RECRUITED":
      return `${name} recruited`;
    default:
      return `${name}: ${lifecycle}`;
  }
}

export function buildQuestCompleteNotice(opts: {
  quest: QuestSpec;
  rewards: readonly QuestReward[];
  newlyUnlockedQuestIds: readonly string[];
  catalog: readonly QuestSpec[];
  radioStateChangedTo?: RadioState | null;
  uniqueLifecycleLines?: string[];
  newTransmission?: boolean;
  generatedProceduralPool?: boolean;
}): ProgressionNotice {
  const rewardLines = opts.rewards
    .map(summarizeQuestReward)
    .filter((x): x is string => !!x);
  // Deduplicate (SET_RADIO_STATE already summarized; avoid double if also passed)
  const unlockLines: string[] = [];
  const seen = new Set<string>();
  const push = (line: string) => {
    if (seen.has(line)) return;
    seen.add(line);
    unlockLines.push(line);
  };
  for (const line of rewardLines) {
    if (
      line.startsWith("Radio ") ||
      line.startsWith("Scav Network") ||
      line.startsWith("+") && (line.includes("Slot") || line.includes("Capacity") || line.includes("Quality")) ||
      line.startsWith("Unique") ||
      line.includes("ready to talk") ||
      line.includes("Retransmission") ||
      line.startsWith("Profile")
    ) {
      push(line);
    }
  }
  // Currency/skill/item stay in REWARDS; progression effects also listed under UNLOCKED when relevant
  const moneySkillItem = rewardLines.filter(
    (l) =>
      l.includes("₽") ||
      l.includes("Skill Point") ||
      l.startsWith("Unlocked "),
  );

  if (opts.radioStateChangedTo) push(summarizeRadioState(opts.radioStateChangedTo));
  for (const line of opts.uniqueLifecycleLines ?? []) push(line);
  if (opts.newTransmission) push("Incoming Transmission");
  if (opts.generatedProceduralPool) push("New transmissions available");
  for (const id of opts.newlyUnlockedQuestIds) {
    const q = opts.catalog.find((x) => x.id === id);
    push(`NEW QUEST: ${q?.name ?? id}`);
  }

  const sections: ProgressionNoticeSection[] = [];
  if (moneySkillItem.length) sections.push({ heading: "REWARDS", lines: moneySkillItem });
  if (unlockLines.length) sections.push({ heading: "UNLOCKED", lines: unlockLines });

  return {
    id: `quest-complete:${opts.quest.id}:${Date.now()}`,
    kind: "QUEST_COMPLETE",
    title: "QUEST COMPLETE",
    subtitle: opts.quest.name,
    sections,
  };
}

export function buildNewQuestNotice(quest: QuestSpec): ProgressionNotice {
  return {
    id: `new-quest:${quest.id}:${Date.now()}`,
    kind: "NEW_QUEST",
    title: "NEW QUEST",
    subtitle: quest.name,
    body: quest.desc,
    sections: [],
  };
}

export function buildNewQuestsNotice(quests: readonly QuestSpec[]): ProgressionNotice | null {
  if (quests.length === 0) return null;
  if (quests.length === 1) return buildNewQuestNotice(quests[0]!);
  return {
    id: `new-quests:${quests.map((q) => q.id).join(",")}:${Date.now()}`,
    kind: "NEW_QUEST",
    title: "NEW QUESTS",
    sections: [
      {
        heading: "UNLOCKED",
        lines: quests.map((q) => q.name),
      },
    ],
  };
}
