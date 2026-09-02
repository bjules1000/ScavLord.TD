/**
 * Canonical quest definitions and evaluation.
 *
 * Production progress is four persistent counters on Meta.quests
 * (scavKills, bossKills, bestWave, extracts). Typed QuestSpec is the
 * authoring model; QuestDef.done/progress stay compatible with camp UI.
 *
 * Richer per-kind / per-map / item-extract / COMPLETE_WAVE tracking is
 * event-based and used by DEV Quest Editor test mode. It is not persisted
 * to the player save.
 */

import { ENEMIES } from "./data";
import { ITEM_BY_ID } from "./gear";
import { MAP_BY_ID, MAP_DEFS } from "./map";
import type { EnemyKind } from "./types";

export const QUEST_ID_RE = /^[a-z][a-z0-9_]{1,39}$/;
export const MAX_WAVE_OBJECTIVE = 99;

export interface MapKillCounts {
  scav?: number;
  boss?: number;
  raider?: number;
}

export interface QuestProgress {
  scavKills: number;
  bossKills: number;
  bestWave: number;
  extracts: number;
  /** Cumulative waves completed per map (successful extracts). */
  wavesCompletedByMap?: Record<string, number>;
  /** Lifetime kills attributed by map (leaks excluded at settlement). */
  killsByMap?: Record<string, MapKillCounts>;
  /** Optional raider lifetime kills when tracked. */
  raiderKills?: number;
  /** Per-boss kill counts when multiple bosses exist. */
  bossKillsById?: Record<string, number>;
}

export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  reward: number;
  skillPoints?: number;
  unlocks: string[];
  done: (q: QuestProgress) => boolean;
  progress: (q: QuestProgress) => string;
}

export const SUPPORTED_OBJECTIVE_TYPES = [
  "KILL",
  "KILL_BOSS",
  "REACH_WAVE",
  "COMPLETE_WAVE",
  "EXTRACT",
  "EXTRACT_ITEM",
] as const;

export type SupportedObjectiveType = (typeof SUPPORTED_OBJECTIVE_TYPES)[number];

/** Architecture hooks. Not evaluable by current raid gameplay. */
export const FUTURE_OBJECTIVE_TYPES = ["VISIT_ZONE", "DEFEND_ZONE", "USE_DEFENSE"] as const;

export type FutureObjectiveType = (typeof FUTURE_OBJECTIVE_TYPES)[number];

export type QuestObjective =
  | { type: "KILL"; count: number; enemyId?: EnemyKind; mapId?: string }
  | { type: "KILL_BOSS"; count: number; mapId?: string }
  | { type: "REACH_WAVE"; wave: number; mapId?: string }
  | { type: "COMPLETE_WAVE"; wave: number; mapId?: string }
  | { type: "EXTRACT"; count: number; mapId?: string }
  | { type: "EXTRACT_ITEM"; itemId: string; count: number; mapId?: string }
  | { type: "VISIT_ZONE"; zoneId: string; mapId: string }
  | { type: "DEFEND_ZONE"; zoneId: string; mapId: string }
  | { type: "USE_DEFENSE"; count: number };

export type QuestReward =
  | { type: "ROUBLES"; amount: number }
  | { type: "SKILL_POINTS"; amount: number }
  | { type: "UNLOCK"; itemId: string }
  | { type: "SET_RADIO_STATE"; state: import("./operators/radioProgression").RadioState }
  | { type: "RECRUITMENT_SLOT_BONUS"; amount: number }
  | { type: "RECRUITMENT_QUALITY_BONUS"; amount: number }
  | { type: "CREW_CAPACITY_BONUS"; amount: number }
  | { type: "UNLOCK_RETRANSMISSION" }
  | { type: "UNLOCK_RECRUITMENT_PROFILE"; profileId: string }
  | { type: "UNLOCK_UNIQUE_CONTACT"; uniqueId: string }
  | {
      type: "SET_UNIQUE_CONTACT_STATE";
      uniqueId: string;
      lifecycle: import("./operators/radioProgression").UniqueContactLifecycle;
    };

export type QuestSpec = {
  id: string;
  name: string;
  desc: string;
  mapId?: string;
  objectives: QuestObjective[];
  rewards: QuestReward[];
  prerequisites: string[];
  /**
   * Soft gate: quest is listed / redeemable only when this unique contact
   * has reached at least the given lifecycle (e.g. network quest after Wolf hired).
   */
  requiresUnique?: {
    uniqueId: string;
    minLifecycle: import("./operators/radioProgression").UniqueContactLifecycle;
  };
  /** True when created in DEV and not present in QUEST_SPECS. */
  devCreated?: boolean;
};

export function emptyQuestProgress(): QuestProgress {
  return {
    scavKills: 0,
    bossKills: 0,
    bestWave: 0,
    extracts: 0,
    wavesCompletedByMap: {},
    killsByMap: {},
    raiderKills: 0,
    bossKillsById: {},
  };
}

export const QUEST_REWARD_TYPES = [
  "ROUBLES",
  "SKILL_POINTS",
  "UNLOCK",
  "SET_RADIO_STATE",
  "RECRUITMENT_SLOT_BONUS",
  "RECRUITMENT_QUALITY_BONUS",
  "CREW_CAPACITY_BONUS",
  "UNLOCK_RETRANSMISSION",
  "UNLOCK_RECRUITMENT_PROFILE",
  "UNLOCK_UNIQUE_CONTACT",
  "SET_UNIQUE_CONTACT_STATE",
] as const;

export function questDropSourceId(questId: string): string {
  return `quest:${questId}`;
}

export function isSupportedObjectiveType(type: string): type is SupportedObjectiveType {
  return (SUPPORTED_OBJECTIVE_TYPES as readonly string[]).includes(type);
}

export function cloneObjective(o: QuestObjective): QuestObjective {
  return { ...o };
}

export function cloneReward(r: QuestReward): QuestReward {
  return { ...r };
}

export function cloneQuestSpec(spec: QuestSpec): QuestSpec {
  const next: QuestSpec = {
    id: spec.id,
    name: spec.name,
    desc: spec.desc,
    objectives: spec.objectives.map(cloneObjective),
    rewards: spec.rewards.map(cloneReward),
    prerequisites: [...spec.prerequisites],
  };
  if (spec.mapId) next.mapId = spec.mapId;
  if (spec.requiresUnique) next.requiresUnique = { ...spec.requiresUnique };
  if (spec.devCreated) next.devCreated = true;
  return next;
}

export function questUnlocks(spec: QuestSpec): string[] {
  return spec.rewards.filter((r): r is Extract<QuestReward, { type: "UNLOCK" }> => r.type === "UNLOCK").map((r) => r.itemId);
}

export function questRoubles(spec: QuestSpec): number {
  return spec.rewards.reduce((a, r) => a + (r.type === "ROUBLES" ? r.amount : 0), 0);
}

export function questSkillPoints(spec: QuestSpec): number {
  return spec.rewards.reduce((a, r) => a + (r.type === "SKILL_POINTS" ? r.amount : 0), 0);
}

export function specToQuestDef(spec: QuestSpec): QuestDef {
  const reward = questRoubles(spec);
  const skillPoints = questSkillPoints(spec);
  const unlocks = questUnlocks(spec);
  const def: QuestDef = {
    id: spec.id,
    name: spec.name,
    desc: spec.desc,
    reward,
    unlocks,
    done: (q) => evaluateQuest(spec, { kind: "meta", progress: q }).complete,
    progress: (q) => formatQuestProgress(spec, { kind: "meta", progress: q }),
  };
  if (skillPoints > 0) def.skillPoints = skillPoints;
  return def;
}

function obj(partial: QuestObjective): QuestObjective {
  return partial;
}

function reward(partial: QuestReward): QuestReward {
  return partial;
}

/** Canonical authored quests. Functions on QuestDef are derived from these specs. */
export const QUEST_SPECS: QuestSpec[] = [
  {
    id: "radio_power",
    name: "DEAD CHANNEL",
    desc: "Find a way to restore power to the Radio. Extract after surviving a raid with scavs down.",
    objectives: [obj({ type: "KILL", count: 10 }), obj({ type: "EXTRACT", count: 1 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 400 }),
      reward({ type: "SET_RADIO_STATE", state: "POWERED_STATIC" }),
    ],
    prerequisites: [],
  },
  {
    id: "radio_signal",
    name: "RAISE THE TOWER",
    desc: "Repair the antenna path. Reach wave 3 and extract to lock in a clear signal.",
    objectives: [obj({ type: "REACH_WAVE", wave: 3 }), obj({ type: "EXTRACT", count: 1 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 600 }),
      reward({ type: "SET_RADIO_STATE", state: "SIGNAL_RESTORED" }),
      reward({ type: "SKILL_POINTS", amount: 1 }),
    ],
    prerequisites: ["radio_power"],
  },
  {
    id: "wolf_help",
    name: "HELP WOLF",
    desc: "Prove you can hold a line. Clear scavs and extract — Wolf is listening.",
    objectives: [obj({ type: "KILL", count: 12 }), obj({ type: "EXTRACT", count: 1 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 500 }),
      reward({
        type: "SET_UNIQUE_CONTACT_STATE",
        uniqueId: "wolf",
        lifecycle: "CONTACTABLE",
      }),
    ],
    prerequisites: ["radio_signal"],
  },
  {
    id: "radio_network",
    name: "OPEN FREQUENCIES",
    desc: "With Wolf in the crew, open the broader scav channels. Reach wave 2 and extract.",
    objectives: [obj({ type: "REACH_WAVE", wave: 2 }), obj({ type: "EXTRACT", count: 1 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 700 }),
      reward({ type: "SET_RADIO_STATE", state: "NETWORKED" }),
      reward({ type: "SKILL_POINTS", amount: 1 }),
    ],
    prerequisites: ["wolf_help"],
    requiresUnique: { uniqueId: "wolf", minLifecycle: "RECRUITED" },
  },
  {
    id: "debut",
    name: "FIRST BLOOD",
    desc: "Kill 25 scavs.",
    objectives: [obj({ type: "KILL", count: 25 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 800 }),
      reward({ type: "SKILL_POINTS", amount: 1 }),
      reward({ type: "UNLOCK", itemId: "w_adar" }),
      reward({ type: "UNLOCK", itemId: "a_grip" }),
      reward({ type: "UNLOCK", itemId: "m_ifak" }),
      reward({ type: "UNLOCK", itemId: "ar_paca" }),
      reward({ type: "CREW_CAPACITY_BONUS", amount: 1 }),
    ],
    prerequisites: [],
  },
  {
    id: "checkpoint",
    name: "HOLD THE LINE",
    desc: "Reach wave 5 in a single raid.",
    objectives: [obj({ type: "REACH_WAVE", wave: 5 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 1500 }),
      reward({ type: "SKILL_POINTS", amount: 1 }),
      reward({ type: "UNLOCK", itemId: "a_optic" }),
      reward({ type: "UNLOCK", itemId: "a_brake" }),
      reward({ type: "UNLOCK", itemId: "m_salewa" }),
    ],
    prerequisites: [],
  },
  {
    id: "supplier",
    name: "WALK OUT",
    desc: "Extract once with loot.",
    objectives: [obj({ type: "EXTRACT", count: 1 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 2000 }),
      reward({ type: "SKILL_POINTS", amount: 1 }),
      reward({ type: "UNLOCK", itemId: "w_ak74" }),
      reward({ type: "UNLOCK", itemId: "a_mag" }),
      reward({ type: "UNLOCK", itemId: "a_laser" }),
    ],
    prerequisites: [],
  },
  {
    id: "gunsmith",
    name: "ARMORY RUN",
    desc: "Extract 3 times.",
    objectives: [obj({ type: "EXTRACT", count: 3 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 3500 }),
      reward({ type: "SKILL_POINTS", amount: 2 }),
      reward({ type: "UNLOCK", itemId: "w_pkm" }),
      reward({ type: "UNLOCK", itemId: "w_m4" }),
      reward({ type: "UNLOCK", itemId: "a_supp" }),
      reward({ type: "UNLOCK", itemId: "m_grizzly" }),
      reward({ type: "UNLOCK", itemId: "ar_6b23" }),
    ],
    prerequisites: [],
  },
  {
    id: "shooters_gallery",
    name: "DEEP RAID",
    desc: "Reach wave 8 in a single raid.",
    objectives: [obj({ type: "REACH_WAVE", wave: 8 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 2500 }),
      reward({ type: "SKILL_POINTS", amount: 1 }),
      reward({ type: "UNLOCK", itemId: "w_mp133" }),
      reward({ type: "UNLOCK", itemId: "a_brake" }),
    ],
    prerequisites: [],
  },
  {
    id: "bounty",
    name: "CROWN KILL",
    desc: "Kill the Enforcer.",
    objectives: [obj({ type: "KILL_BOSS", count: 1 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 6000 }),
      reward({ type: "SKILL_POINTS", amount: 3 }),
      reward({ type: "UNLOCK", itemId: "w_sv98" }),
      reward({ type: "UNLOCK", itemId: "w_m32" }),
      reward({ type: "UNLOCK", itemId: "a_m995" }),
      reward({ type: "UNLOCK", itemId: "a_thermal" }),
      reward({ type: "UNLOCK", itemId: "ar_slick" }),
    ],
    prerequisites: [],
  },
  {
    id: "long_range",
    name: "BLOOD CONTRACT",
    desc: "Kill 2 Enforcers and extract 6 times.",
    objectives: [obj({ type: "KILL_BOSS", count: 2 }), obj({ type: "EXTRACT", count: 6 })],
    rewards: [
      reward({ type: "ROUBLES", amount: 9000 }),
      reward({ type: "SKILL_POINTS", amount: 3 }),
      reward({ type: "UNLOCK", itemId: "w_m700" }),
      reward({ type: "UNLOCK", itemId: "w_dvl10" }),
      reward({ type: "UNLOCK", itemId: "a_thermal" }),
    ],
    prerequisites: [],
  },
];

export const QUESTS: QuestDef[] = QUEST_SPECS.map(specToQuestDef);

export const QUEST_SPEC_BY_ID: Record<string, QuestSpec> = Object.fromEntries(QUEST_SPECS.map((s) => [s.id, s]));

export type QuestProgressEvent =
  | { type: "KILL"; kind: EnemyKind; mapId: string }
  | { type: "WAVE_START"; wave: number; mapId: string }
  | { type: "WAVE_COMPLETE"; wave: number; mapId: string }
  | { type: "EXTRACT"; mapId: string; items: { itemId: string; count: number }[] };

export type QuestEvalSource =
  | { kind: "meta"; progress: QuestProgress }
  | { kind: "events"; events: readonly QuestProgressEvent[] };

export type ObjectiveProgress = {
  current: number;
  required: number;
  done: boolean;
  label: string;
};

function mapMatches(required: string | undefined, eventMap: string): boolean {
  if (!required) return true;
  return required === eventMap;
}

function objectiveMap(spec: QuestSpec, objective: QuestObjective): string | undefined {
  if ("mapId" in objective && objective.mapId) return objective.mapId;
  return spec.mapId;
}

export function applyQuestEvent(
  events: readonly QuestProgressEvent[],
  ev: QuestProgressEvent,
): QuestProgressEvent[] {
  if (ev.type === "WAVE_COMPLETE") {
    const dup = events.some(
      (e) => e.type === "WAVE_COMPLETE" && e.wave === ev.wave && e.mapId === ev.mapId,
    );
    if (dup) return [...events];
  }
  return [...events, ev];
}

export function emptyEventLog(): QuestProgressEvent[] {
  return [];
}

function countKills(
  events: readonly QuestProgressEvent[],
  enemyId: EnemyKind | undefined,
  mapId: string | undefined,
): number {
  let n = 0;
  for (const e of events) {
    if (e.type !== "KILL") continue;
    if (!mapMatches(mapId, e.mapId)) continue;
    if (enemyId) {
      if (e.kind === enemyId) n += 1;
    } else if (e.kind !== "boss") {
      n += 1;
    }
  }
  return n;
}

function reachedWave(events: readonly QuestProgressEvent[], mapId: string | undefined): number {
  let best = 0;
  for (const e of events) {
    if (e.type !== "WAVE_START" && e.type !== "WAVE_COMPLETE") continue;
    if (!mapMatches(mapId, e.mapId)) continue;
    if (e.wave > best) best = e.wave;
  }
  return best;
}

function completedWave(
  events: readonly QuestProgressEvent[],
  wave: number,
  mapId: string | undefined,
): number {
  return events.some((e) => e.type === "WAVE_COMPLETE" && e.wave === wave && mapMatches(mapId, e.mapId))
    ? 1
    : 0;
}

function extractCount(events: readonly QuestProgressEvent[], mapId: string | undefined): number {
  let n = 0;
  for (const e of events) {
    if (e.type !== "EXTRACT") continue;
    if (!mapMatches(mapId, e.mapId)) continue;
    n += 1;
  }
  return n;
}

function extractedItemCount(
  events: readonly QuestProgressEvent[],
  itemId: string,
  mapId: string | undefined,
): number {
  let n = 0;
  for (const e of events) {
    if (e.type !== "EXTRACT") continue;
    if (!mapMatches(mapId, e.mapId)) continue;
    for (const it of e.items) {
      if (it.itemId === itemId) n += it.count;
    }
  }
  return n;
}

export function objectiveLabel(o: QuestObjective): string {
  if (o.type === "KILL") {
    const who = o.enemyId ? (ENEMIES[o.enemyId]?.name ?? o.enemyId) : "Scavs";
    return `Kill ${who}`;
  }
  if (o.type === "KILL_BOSS") return "Kill Enforcer";
  if (o.type === "REACH_WAVE") return `Reach wave ${o.wave}`;
  if (o.type === "COMPLETE_WAVE") return `Complete wave ${o.wave}`;
  if (o.type === "EXTRACT") return "Extract";
  if (o.type === "EXTRACT_ITEM") {
    const item = ITEM_BY_ID[o.itemId];
    return `Extract ${item?.name ?? o.itemId}`;
  }
  if (o.type === "VISIT_ZONE") return `Visit ${o.zoneId}`;
  if (o.type === "DEFEND_ZONE") return `Defend ${o.zoneId}`;
  return "Use defense";
}

export function evaluateObjective(
  spec: QuestSpec,
  objective: QuestObjective,
  source: QuestEvalSource,
): ObjectiveProgress {
  const mapId = objectiveMap(spec, objective);
  const required =
    objective.type === "REACH_WAVE" || objective.type === "COMPLETE_WAVE"
      ? objective.type === "COMPLETE_WAVE"
        ? 1
        : objective.wave
      : "count" in objective
        ? objective.count
        : 1;
  const label = objectiveLabel(objective);

  if (!isSupportedObjectiveType(objective.type)) {
    return { current: 0, required, done: false, label };
  }

  if (source.kind === "meta") {
    const q = source.progress;
    if (objective.type === "KILL") {
      if (objective.enemyId && objective.enemyId !== "boss") {
        return { current: 0, required: objective.count, done: false, label };
      }
      const current = objective.enemyId === "boss" ? q.bossKills : q.scavKills;
      return { current, required: objective.count, done: current >= objective.count, label };
    }
    if (objective.type === "KILL_BOSS") {
      return { current: q.bossKills, required: objective.count, done: q.bossKills >= objective.count, label };
    }
    if (objective.type === "REACH_WAVE") {
      return { current: q.bestWave, required: objective.wave, done: q.bestWave >= objective.wave, label };
    }
    if (objective.type === "COMPLETE_WAVE") {
      return { current: 0, required: 1, done: false, label };
    }
    if (objective.type === "EXTRACT") {
      return { current: q.extracts, required: objective.count, done: q.extracts >= objective.count, label };
    }
    if (objective.type === "EXTRACT_ITEM") {
      return { current: 0, required: objective.count, done: false, label };
    }
  }

  const events = source.kind === "events" ? source.events : [];
  if (objective.type === "KILL") {
    const current = countKills(events, objective.enemyId, mapId);
    return { current, required: objective.count, done: current >= objective.count, label };
  }
  if (objective.type === "KILL_BOSS") {
    const current = countKills(events, "boss", mapId);
    return { current, required: objective.count, done: current >= objective.count, label };
  }
  if (objective.type === "REACH_WAVE") {
    const current = reachedWave(events, mapId);
    return { current, required: objective.wave, done: current >= objective.wave, label };
  }
  if (objective.type === "COMPLETE_WAVE") {
    const current = completedWave(events, objective.wave, mapId);
    return { current, required: 1, done: current >= 1, label };
  }
  if (objective.type === "EXTRACT") {
    const current = extractCount(events, mapId);
    return { current, required: objective.count, done: current >= objective.count, label };
  }
  if (objective.type === "EXTRACT_ITEM") {
    const current = extractedItemCount(events, objective.itemId, mapId);
    return { current, required: objective.count, done: current >= objective.count, label };
  }
  return { current: 0, required, done: false, label };
}

export function evaluateQuest(
  spec: QuestSpec,
  source: QuestEvalSource,
): { complete: boolean; objectives: ObjectiveProgress[] } {
  const objectives = spec.objectives.map((o) => evaluateObjective(spec, o, source));
  const complete = objectives.length > 0 && objectives.every((o) => o.done);
  return { complete, objectives };
}

export function formatQuestProgress(spec: QuestSpec, source: QuestEvalSource): string {
  const rows = evaluateQuest(spec, source).objectives;
  if (rows.length === 0) return "0/0";
  return rows.map((r) => `${Math.min(r.current, r.required)}/${r.required}`).join(" · ");
}

export type QuestIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

export type QuestValidation = {
  errors: QuestIssue[];
  warnings: QuestIssue[];
};

function issue(level: QuestIssue["level"], code: string, message: string): QuestIssue {
  return { level, code, message };
}

export function mapSpecialZones(mapId: string): { id: string; name: string; type: string }[] {
  const map = MAP_BY_ID[mapId];
  if (!map?.zones?.length) return [];
  return map.zones.map((z, i) => ({
    id: `${map.id}:zone:${i}`,
    name: z.name,
    type: z.type,
  }));
}

export function allSpecialZones(): { id: string; name: string; type: string; mapId: string }[] {
  return MAP_DEFS.flatMap((m) => mapSpecialZones(m.id).map((z) => ({ ...z, mapId: m.id })));
}

export function validateQuestId(id: string): QuestIssue | null {
  if (!id.trim()) return issue("error", "MISSING_ID", "Missing quest ID");
  if (!QUEST_ID_RE.test(id)) return issue("error", "INVALID_ID", "Quest ID must be snake_case starting with a letter");
  return null;
}

export function validateObjective(spec: QuestSpec, o: QuestObjective, index: number): QuestIssue[] {
  const out: QuestIssue[] = [];
  const prefix = `objectives[${index}]`;
  if (!isSupportedObjectiveType(o.type)) {
    out.push(issue("error", "UNSUPPORTED_OBJECTIVE", `${prefix}: ${o.type} is not evaluable by current gameplay`));
    if (o.type === "VISIT_ZONE" || o.type === "DEFEND_ZONE") {
      if (!MAP_BY_ID[o.mapId]) out.push(issue("error", "BAD_MAP", `${prefix}: unknown map ${o.mapId}`));
      else if (!mapSpecialZones(o.mapId).some((z) => z.id === o.zoneId)) {
        out.push(issue("error", "BAD_ZONE", `${prefix}: unknown zone ${o.zoneId}`));
      }
    }
    return out;
  }
  const mapId = objectiveMap(spec, o);
  if (mapId && !MAP_BY_ID[mapId]) {
    out.push(issue("error", "BAD_MAP", `${prefix}: unknown map ${mapId}`));
  }
  if (o.type === "KILL") {
    if (!Number.isInteger(o.count) || o.count <= 0) {
      out.push(issue("error", "BAD_COUNT", `${prefix}: kill count must be a positive integer`));
    }
    if ("enemyId" in o && !o.enemyId) {
      out.push(issue("error", "MISSING_ENEMY", `${prefix}: missing enemy ID`));
    } else if (o.enemyId && !ENEMIES[o.enemyId]) {
      out.push(issue("error", "BAD_ENEMY", `${prefix}: unknown enemy ${o.enemyId}`));
    }
  }
  if (o.type === "KILL_BOSS") {
    if (!Number.isInteger(o.count) || o.count <= 0) {
      out.push(issue("error", "BAD_COUNT", `${prefix}: boss kill count must be a positive integer`));
    }
  }
  if (o.type === "REACH_WAVE" || o.type === "COMPLETE_WAVE") {
    if (!Number.isInteger(o.wave) || o.wave < 1 || o.wave > MAX_WAVE_OBJECTIVE) {
      out.push(issue("error", "BAD_WAVE", `${prefix}: wave must be an integer 1–${MAX_WAVE_OBJECTIVE}`));
    }
  }
  if (o.type === "EXTRACT") {
    if (!Number.isInteger(o.count) || o.count <= 0) {
      out.push(issue("error", "BAD_COUNT", `${prefix}: extract count must be a positive integer`));
    }
  }
  if (o.type === "EXTRACT_ITEM") {
    if (!o.itemId) out.push(issue("error", "MISSING_ITEM", `${prefix}: missing item ID`));
    else if (!ITEM_BY_ID[o.itemId]) out.push(issue("error", "BAD_ITEM", `${prefix}: unknown item ${o.itemId}`));
    if (!Number.isInteger(o.count) || o.count <= 0) {
      out.push(issue("error", "BAD_COUNT", `${prefix}: item count must be a positive integer`));
    }
  }
  return out;
}

export function validateReward(r: QuestReward, index: number): QuestIssue[] {
  const out: QuestIssue[] = [];
  const prefix = `rewards[${index}]`;
  if (r.type === "ROUBLES" || r.type === "SKILL_POINTS") {
    if (!Number.isFinite(r.amount) || r.amount < 0) {
      out.push(issue("error", "BAD_REWARD", `${prefix}: amount must be ≥ 0`));
    }
  }
  if (r.type === "UNLOCK") {
    if (!r.itemId) out.push(issue("error", "MISSING_UNLOCK", `${prefix}: missing item ID`));
    else if (!ITEM_BY_ID[r.itemId]) out.push(issue("error", "BAD_UNLOCK", `${prefix}: unknown item ${r.itemId}`));
  }
  if (r.type === "SET_RADIO_STATE") {
    if (!["BROKEN", "POWERED_STATIC", "SIGNAL_RESTORED", "NETWORKED"].includes(r.state)) {
      out.push(issue("error", "BAD_RADIO_STATE", `${prefix}: unknown radio state`));
    }
  }
  if (
    r.type === "RECRUITMENT_SLOT_BONUS" ||
    r.type === "RECRUITMENT_QUALITY_BONUS" ||
    r.type === "CREW_CAPACITY_BONUS"
  ) {
    if (!Number.isFinite(r.amount) || r.amount < 1) {
      out.push(issue("error", "BAD_REWARD", `${prefix}: amount must be ≥ 1`));
    }
  }
  if (r.type === "UNLOCK_RECRUITMENT_PROFILE" && !r.profileId) {
    out.push(issue("error", "BAD_REWARD", `${prefix}: missing profileId`));
  }
  if (r.type === "UNLOCK_UNIQUE_CONTACT" && !r.uniqueId) {
    out.push(issue("error", "BAD_REWARD", `${prefix}: missing uniqueId`));
  }
  if (r.type === "SET_UNIQUE_CONTACT_STATE") {
    if (!r.uniqueId) out.push(issue("error", "BAD_REWARD", `${prefix}: missing uniqueId`));
    const lives = [
      "HIDDEN",
      "DISTRESS_SIGNAL",
      "IDENTIFIED",
      "REQUIREMENTS_VISIBLE",
      "CONTACTABLE",
      "RECRUITABLE",
      "RECRUITED",
    ];
    if (!lives.includes(r.lifecycle)) {
      out.push(issue("error", "BAD_REWARD", `${prefix}: unknown unique lifecycle`));
    }
  }
  return out;
}

export function validateQuest(spec: QuestSpec, catalog: readonly QuestSpec[]): QuestValidation {
  const errors: QuestIssue[] = [];
  const warnings: QuestIssue[] = [];
  const idErr = validateQuestId(spec.id);
  if (idErr) errors.push(idErr);
  const dup = catalog.filter((q) => q.id === spec.id);
  if (dup.length > 1) errors.push(issue("error", "DUPLICATE_ID", `Duplicate quest ID ${spec.id}`));
  if (spec.mapId && !MAP_BY_ID[spec.mapId]) {
    errors.push(issue("error", "BAD_MAP", `Unknown map ${spec.mapId}`));
  }
  // No map / no prereq are valid for introductory / map-agnostic quests — do not warn.
  if (spec.objectives.length === 0) errors.push(issue("error", "NO_OBJECTIVES", "Quest has no objectives"));
  spec.objectives.forEach((o, i) => errors.push(...validateObjective(spec, o, i)));
  spec.rewards.forEach((r, i) => errors.push(...validateReward(r, i)));
  if (
    spec.rewards.length === 0 ||
    (questRoubles(spec) === 0 &&
      questSkillPoints(spec) === 0 &&
      questUnlocks(spec).length === 0 &&
      !spec.rewards.some((r) =>
        [
          "SET_RADIO_STATE",
          "RECRUITMENT_SLOT_BONUS",
          "RECRUITMENT_QUALITY_BONUS",
          "CREW_CAPACITY_BONUS",
          "UNLOCK_RETRANSMISSION",
          "UNLOCK_RECRUITMENT_PROFILE",
          "UNLOCK_UNIQUE_CONTACT",
          "SET_UNIQUE_CONTACT_STATE",
        ].includes(r.type),
      ))
  ) {
    warnings.push(issue("warning", "NO_REWARD", "Quest has no reward"));
  }
  for (const pre of spec.prerequisites) {
    if (pre === spec.id) errors.push(issue("error", "SELF_PREREQ", "Quest cannot require itself"));
    else if (!catalog.some((q) => q.id === pre)) {
      errors.push(issue("error", "MISSING_PREREQ", `Missing prerequisite ${pre}`));
    }
  }
  const cycles = findPrerequisiteCycles(catalog);
  if (cycles.some((c) => c.includes(spec.id))) {
    errors.push(issue("error", "CYCLE", "Prerequisite cycle"));
  }
  return { errors, warnings };
}

export function findPrerequisiteCycles(catalog: readonly QuestSpec[]): string[][] {
  const ids = catalog.map((q) => q.id);
  const byId = new Map(catalog.map((q) => [q.id, q]));
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const visit = (id: string) => {
    if (onStack.has(id)) {
      const i = stack.indexOf(id);
      cycles.push(stack.slice(i));
      return;
    }
    if (seen.has(id)) return;
    seen.add(id);
    onStack.add(id);
    stack.push(id);
    const spec = byId.get(id);
    for (const pre of spec?.prerequisites ?? []) {
      if (ids.includes(pre)) visit(pre);
    }
    stack.pop();
    onStack.delete(id);
  };

  for (const id of ids) visit(id);
  return cycles;
}

export type QuestGraphNode = {
  id: string;
  name: string;
  depth: number;
  prerequisites: string[];
};

export function questGraph(catalog: readonly QuestSpec[]): {
  order: QuestGraphNode[];
  cycles: string[][];
  missing: string[];
  duplicates: string[];
} {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  for (const q of catalog) {
    seen.set(q.id, (seen.get(q.id) ?? 0) + 1);
  }
  for (const [id, n] of seen) if (n > 1) duplicates.push(id);

  const unique: QuestSpec[] = [];
  const used = new Set<string>();
  for (const q of catalog) {
    if (used.has(q.id)) continue;
    used.add(q.id);
    unique.push(q);
  }
  const byId = new Map(unique.map((q) => [q.id, q]));
  const missing: string[] = [];
  for (const q of unique) {
    for (const pre of q.prerequisites) {
      if (!byId.has(pre) && !missing.includes(pre)) missing.push(pre);
    }
  }
  const cycles = findPrerequisiteCycles(unique);
  const cyclic = new Set(cycles.flat());

  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const walk = (id: string): number => {
    const cached = depth.get(id);
    if (cached != null) return cached;
    if (visiting.has(id) || cyclic.has(id)) {
      depth.set(id, 0);
      return 0;
    }
    visiting.add(id);
    const spec = byId.get(id);
    const d = spec?.prerequisites.length
      ? 1 + Math.max(0, ...spec.prerequisites.filter((p) => byId.has(p)).map(walk))
      : 0;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const q of unique) walk(q.id);

  const order = [...unique]
    .sort((a, b) => {
      const dd = (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0);
      if (dd !== 0) return dd;
      return a.id.localeCompare(b.id);
    })
    .map((q) => ({
      id: q.id,
      name: q.name || q.id,
      depth: depth.get(q.id) ?? 0,
      prerequisites: [...q.prerequisites],
    }));

  return { order, cycles, missing, duplicates };
}

export function defaultObjective(): QuestObjective {
  return { type: "KILL", count: 1 };
}

export function defaultReward(): QuestReward {
  return { type: "ROUBLES", amount: 0 };
}

const UNIQUE_LIFECYCLE_ORDER = [
  "HIDDEN",
  "DISTRESS_SIGNAL",
  "IDENTIFIED",
  "REQUIREMENTS_VISIBLE",
  "CONTACTABLE",
  "RECRUITABLE",
  "RECRUITED",
] as const;

/** True when quest has no unique gate, or the contact has reached the required lifecycle. */
export function questUniqueGateMet(
  spec: QuestSpec,
  uniqueContacts: Record<string, { lifecycle: string }> | undefined,
): boolean {
  if (!spec.requiresUnique) return true;
  const life = uniqueContacts?.[spec.requiresUnique.uniqueId]?.lifecycle ?? "HIDDEN";
  const have = UNIQUE_LIFECYCLE_ORDER.indexOf(life as (typeof UNIQUE_LIFECYCLE_ORDER)[number]);
  const need = UNIQUE_LIFECYCLE_ORDER.indexOf(spec.requiresUnique.minLifecycle);
  if (need < 0) return false;
  return have >= need;
}

export function newQuestSpec(id: string): QuestSpec {
  return {
    id,
    name: "",
    desc: "",
    objectives: [],
    rewards: [],
    prerequisites: [],
    devCreated: true,
  };
}

export function nextDevQuestId(existing: readonly { id: string }[]): string {
  let n = 1;
  const ids = new Set(existing.map((q) => q.id));
  while (ids.has(`dev_quest_${n}`)) n += 1;
  return `dev_quest_${n}`;
}

export function duplicateQuestSpec(spec: QuestSpec, newId: string): QuestSpec {
  const copy = cloneQuestSpec(spec);
  copy.id = newId;
  copy.devCreated = true;
  copy.name = spec.name ? `${spec.name} COPY` : "";
  return copy;
}
