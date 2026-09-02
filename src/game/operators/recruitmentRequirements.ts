import { ENEMIES } from "../data";
import { MAP_BY_ID } from "../map";
import type { QuestProgress } from "../quests";
import { QUESTS } from "../quests";
import type { EnemyKind } from "../types";
import {
  RADIO_STATES,
  isRecruitmentUnlocked,
  radioStateOrdinal,
  type RadioState,
  type RecruitmentQuality,
} from "./radioProgression";

export type RecruitmentRequirement =
  | { type: "QUEST_COMPLETED"; questId: string }
  | { type: "TOTAL_KILLS"; count: number; enemyId?: EnemyKind; mapId?: string }
  | { type: "WAVES_COMPLETED"; count: number; mapId?: string }
  | { type: "BOSS_KILLED"; bossId: string }
  | { type: "RADIO_STATE"; minState: RadioState }
  | { type: "RECRUITMENT_QUALITY"; minQuality: number };

const QUEST_BY_ID: Record<string, (typeof QUESTS)[number]> = Object.fromEntries(
  QUESTS.map((q) => [q.id, q]),
);

/** Progression facts for eligibility — reuse canonical settlement, no duplicate counters. */
export interface RecruitmentProgressionFacts {
  quests: QuestProgress;
  claimedQuestIds: readonly string[];
  radioState: RadioState;
  effectiveQuality: RecruitmentQuality | number;
}

export interface RequirementEval {
  met: boolean;
  label: string;
  current?: number;
  target?: number;
}

export const CANONICAL_BOSS_IDS = Object.entries(ENEMIES)
  .filter(([, def]) => def.kind === "boss")
  .map(([id]) => id);

export function requirementLabel(req: RecruitmentRequirement): string {
  switch (req.type) {
    case "QUEST_COMPLETED":
      return `Complete "${QUEST_BY_ID[req.questId]?.name ?? req.questId}"`;
    case "TOTAL_KILLS": {
      const enemy = req.enemyId ? ` ${String(req.enemyId).toUpperCase()}S` : " enemies";
      const map = req.mapId ? ` on ${MAP_BY_ID[req.mapId]?.name ?? req.mapId}` : "";
      return `Kill ${req.count}${enemy}${map}`;
    }
    case "WAVES_COMPLETED": {
      const map = req.mapId ? ` on ${MAP_BY_ID[req.mapId]?.name ?? req.mapId}` : "";
      return `Complete ${req.count} waves${map}`;
    }
    case "BOSS_KILLED":
      return `Kill boss: ${ENEMIES[req.bossId as keyof typeof ENEMIES]?.name ?? req.bossId}`;
    case "RADIO_STATE":
      return `Radio ${req.minState.replace(/_/g, " ")}`;
    case "RECRUITMENT_QUALITY":
      return `Recruitment quality ≥ ${req.minQuality}`;
    default:
      return "Unknown requirement";
  }
}

function killCount(facts: RecruitmentProgressionFacts, enemyId?: EnemyKind, mapId?: string): number {
  // Per-map kill attribution when available; otherwise lifetime totals.
  const byMap = facts.quests.killsByMap ?? {};
  if (mapId) {
    const entry = byMap[mapId];
    if (!entry) return 0;
    if (!enemyId) return (entry.scav ?? 0) + (entry.boss ?? 0) + (entry.raider ?? 0);
    if (enemyId === "scav") return entry.scav ?? 0;
    if (enemyId === "boss") return entry.boss ?? 0;
    if (enemyId === "raider") return entry.raider ?? 0;
    return 0;
  }
  if (!enemyId) return facts.quests.scavKills + facts.quests.bossKills;
  if (enemyId === "scav") return facts.quests.scavKills;
  if (enemyId === "boss") return facts.quests.bossKills;
  if (enemyId === "raider") return facts.quests.raiderKills ?? 0;
  return 0;
}

function wavesCompleted(facts: RecruitmentProgressionFacts, mapId?: string): number {
  const byMap = facts.quests.wavesCompletedByMap ?? {};
  if (mapId) return byMap[mapId] ?? 0;
  return Object.values(byMap).reduce((sum, n) => sum + n, 0);
}

export function evaluateRequirement(
  req: RecruitmentRequirement,
  facts: RecruitmentProgressionFacts,
): RequirementEval {
  const label = requirementLabel(req);
  switch (req.type) {
    case "QUEST_COMPLETED": {
      // COMPLETED only — READY_TO_REDEEM / objective-complete does not count.
      const claimed = facts.claimedQuestIds.includes(req.questId);
      return { met: claimed, label };
    }
    case "TOTAL_KILLS": {
      const current = killCount(facts, req.enemyId, req.mapId);
      return { met: current >= req.count, label, current, target: req.count };
    }
    case "WAVES_COMPLETED": {
      const current = wavesCompleted(facts, req.mapId);
      return { met: current >= req.count, label, current, target: req.count };
    }
    case "BOSS_KILLED": {
      const met =
        CANONICAL_BOSS_IDS.includes(req.bossId) &&
        (req.bossId === "boss"
          ? facts.quests.bossKills >= 1
          : (facts.quests.bossKillsById?.[req.bossId] ?? 0) >= 1 ||
            (req.bossId === "boss" && facts.quests.bossKills >= 1));
      // Sole canonical boss id is "boss" — count lifetime boss kills.
      const current = facts.quests.bossKillsById?.[req.bossId] ?? facts.quests.bossKills;
      return { met: CANONICAL_BOSS_IDS.includes(req.bossId) && current >= 1, label, current, target: 1 };
    }
    case "RADIO_STATE": {
      const met = radioStateOrdinal(facts.radioState) >= radioStateOrdinal(req.minState);
      return { met, label };
    }
    case "RECRUITMENT_QUALITY": {
      const current = facts.effectiveQuality;
      return { met: current >= req.minQuality, label, current, target: req.minQuality };
    }
    default:
      return { met: false, label: "Unsupported requirement" };
  }
}

export function isProfileEligible(
  requirements: readonly RecruitmentRequirement[],
  facts: RecruitmentProgressionFacts,
): boolean {
  if (!requirements.length) return true;
  return requirements.every((req) => evaluateRequirement(req, facts).met);
}

export function validateRequirement(req: RecruitmentRequirement): string | null {
  switch (req.type) {
    case "QUEST_COMPLETED":
      if (!QUEST_BY_ID[req.questId] && !QUESTS.some((q) => q.id === req.questId)) {
        return `Unknown quest: ${req.questId}`;
      }
      return null;
    case "TOTAL_KILLS":
      if (req.count <= 0) return "Kill count must be > 0";
      if (req.mapId && !MAP_BY_ID[req.mapId]) return `Unknown map: ${req.mapId}`;
      return null;
    case "WAVES_COMPLETED":
      if (req.count <= 0) return "Wave count must be > 0";
      if (req.mapId && !MAP_BY_ID[req.mapId]) return `Unknown map: ${req.mapId}`;
      return null;
    case "BOSS_KILLED":
      if (!CANONICAL_BOSS_IDS.includes(req.bossId)) return `Unknown boss: ${req.bossId}`;
      return null;
    case "RADIO_STATE":
      if (!RADIO_STATES.includes(req.minState)) return `Unknown radio state: ${req.minState}`;
      return null;
    case "RECRUITMENT_QUALITY":
      if (req.minQuality < 1 || req.minQuality > 5) return "Quality must be 1–5";
      return null;
    default:
      return "Unsupported requirement type";
  }
}

export function validateRequirements(requirements: readonly RecruitmentRequirement[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const req of requirements) {
    const key = JSON.stringify(req);
    if (seen.has(key)) errors.push(`Duplicate requirement: ${requirementLabel(req)}`);
    seen.add(key);
    const err = validateRequirement(req);
    if (err) errors.push(err);
  }
  return errors;
}

export function recruitmentAvailable(facts: RecruitmentProgressionFacts, effectiveSlots: number): boolean {
  return isRecruitmentUnlocked(facts.radioState) && effectiveSlots > 0;
}
