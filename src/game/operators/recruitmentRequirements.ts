import { ENEMIES } from "../data";
import { MAP_BY_ID } from "../map";
import type { QuestProgress } from "../meta";
import { QUESTS } from "../quests";

const QUEST_BY_ID: Record<string, (typeof QUESTS)[number]> = Object.fromEntries(
  QUESTS.map((q) => [q.id, q]),
);
import type { EnemyKind } from "../types";

export type RecruitmentRequirement =
  | { type: "QUEST_COMPLETED"; questId: string }
  | { type: "TOTAL_KILLS"; count: number; enemyId?: EnemyKind; mapId?: string }
  | { type: "WAVES_COMPLETED"; count: number; mapId?: string }
  | { type: "BOSS_KILLED"; bossId: string };

/** Progression facts reused from canonical save — no duplicate settlement. */
export interface RecruitmentProgressionFacts {
  quests: QuestProgress;
  claimedQuestIds: readonly string[];
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
      const enemy = req.enemyId ? ` ${req.enemyId.toUpperCase()}S` : " enemies";
      const map = req.mapId ? ` on ${MAP_BY_ID[req.mapId]?.name ?? req.mapId}` : "";
      return `Kill ${req.count}${enemy}${map}`;
    }
    case "WAVES_COMPLETED": {
      const map = req.mapId ? ` on ${MAP_BY_ID[req.mapId]?.name ?? req.mapId}` : "";
      return `Complete ${req.count} waves${map}`;
    }
    case "BOSS_KILLED":
      return `Kill boss: ${req.bossId}`;
    default:
      return "Unknown requirement";
  }
}

function killCount(facts: RecruitmentProgressionFacts, enemyId?: EnemyKind): number {
  if (!enemyId) return facts.quests.scavKills + facts.quests.bossKills;
  if (enemyId === "scav") return facts.quests.scavKills;
  if (enemyId === "boss") return facts.quests.bossKills;
  if (enemyId === "raider") return 0;
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
      const quest = QUEST_BY_ID[req.questId] ?? QUESTS.find((q) => q.id === req.questId);
      const met = quest ? quest.done(facts.quests) : false;
      return { met, label };
    }
    case "TOTAL_KILLS": {
      const current = killCount(facts, req.enemyId);
      return { met: current >= req.count, label, current, target: req.count };
    }
    case "WAVES_COMPLETED": {
      const current = wavesCompleted(facts, req.mapId);
      return { met: current >= req.count, label, current, target: req.count };
    }
    case "BOSS_KILLED": {
      const met = facts.quests.bossKills >= 1 && req.bossId === "boss";
      return { met, label };
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
