/**
 * DEV Quest Editor override layer.
 *
 * canonical QUEST_SPECS + DEV override/new quests = effective catalog.
 * Separate namespace from Balance / Economy / Wave Lab.
 *
 * TEST QUEST progress is an in-memory event log — not localStorage, not Meta.
 */

import {
  QUEST_SPECS,
  applyQuestEvent,
  cloneQuestSpec,
  duplicateQuestSpec,
  evaluateQuest,
  newQuestSpec,
  nextDevQuestId,
  questGraph,
  questRoubles,
  questSkillPoints,
  questUnlocks,
  validateQuest,
  type QuestObjective,
  type QuestProgressEvent,
  type QuestReward,
  type QuestSpec,
  type QuestValidation,
} from "../quests";
import { DEV_TOOLS_ENABLED } from "./tools";

export const QUEST_LAB_STORAGE_KEY = "scavlord.dev.questEditor.v1";

export type QuestLabOverrides = {
  quests: Record<string, QuestSpec>;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type QuestLabView = "quests" | "validation";

export function emptyQuestLabOverrides(): QuestLabOverrides {
  return { quests: {} };
}

function cloneOverrides(src: QuestLabOverrides): QuestLabOverrides {
  return {
    quests: Object.fromEntries(Object.entries(src.quests).map(([id, spec]) => [id, cloneQuestSpec(spec)])),
  };
}

export function pruneQuestLabOverrides(src: QuestLabOverrides): QuestLabOverrides {
  const quests: Record<string, QuestSpec> = {};
  for (const [id, spec] of Object.entries(src.quests)) {
    if (!spec || typeof spec !== "object") continue;
    const next = cloneQuestSpec({
      id: typeof spec.id === "string" ? spec.id : id,
      name: typeof spec.name === "string" ? spec.name : "",
      desc: typeof spec.desc === "string" ? spec.desc : "",
      objectives: Array.isArray(spec.objectives) ? spec.objectives : [],
      rewards: Array.isArray(spec.rewards) ? spec.rewards : [],
      prerequisites: Array.isArray(spec.prerequisites) ? spec.prerequisites : [],
    });
    if (spec.mapId && typeof spec.mapId === "string") next.mapId = spec.mapId;
    if (typeof spec.minLevel === "number" && spec.minLevel >= 1) next.minLevel = Math.round(spec.minLevel);
    if (spec.minRadioState) next.minRadioState = spec.minRadioState;
    if (spec.requiresUnique && typeof spec.requiresUnique === "object") {
      next.requiresUnique = { ...spec.requiresUnique };
    }
    if (spec.devCreated) next.devCreated = true;
    quests[next.id] = next;
  }
  return { quests };
}

export function canonicalQuest(id: string): QuestSpec | undefined {
  return QUEST_SPECS.find((q) => q.id === id);
}

export function isCanonicalQuestId(id: string): boolean {
  return QUEST_SPECS.some((q) => q.id === id);
}

export function effectiveQuestCatalog(
  overrides: QuestLabOverrides = getQuestLabOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): QuestSpec[] {
  if (!enabled) return QUEST_SPECS.map(cloneQuestSpec);
  const byId = new Map(QUEST_SPECS.map((q) => [q.id, cloneQuestSpec(q)]));
  for (const spec of Object.values(overrides.quests)) {
    byId.set(spec.id, cloneQuestSpec(spec));
  }
  const canonicalIds = QUEST_SPECS.map((q) => q.id);
  const extras = [...byId.keys()].filter((id) => !canonicalIds.includes(id)).sort((a, b) => a.localeCompare(b));
  return [...canonicalIds, ...extras].map((id) => byId.get(id)!);
}

export function effectiveQuest(
  id: string,
  overrides: QuestLabOverrides = getQuestLabOverrides(),
  enabled = DEV_TOOLS_ENABLED,
): QuestSpec | undefined {
  return effectiveQuestCatalog(overrides, enabled).find((q) => q.id === id);
}

export function upsertQuest(src: QuestLabOverrides, spec: QuestSpec): QuestLabOverrides {
  const next = cloneOverrides(src);
  next.quests[spec.id] = cloneQuestSpec(spec);
  return pruneQuestLabOverrides(next);
}

export function setQuestField<K extends "name" | "desc" | "mapId" | "id">(
  src: QuestLabOverrides,
  id: string,
  key: K,
  value: string,
): QuestLabOverrides {
  const live = effectiveQuest(id, src, true);
  if (!live) return src;
  if (key === "id") {
    if (isCanonicalQuestId(id)) return src;
    const copy = cloneQuestSpec(live);
    copy.id = value.trim();
    const next = cloneOverrides(src);
    delete next.quests[id];
    next.quests[copy.id] = copy;
    return pruneQuestLabOverrides(next);
  }
  const copy = cloneQuestSpec(live);
  if (key === "mapId") {
    if (!value) delete copy.mapId;
    else copy.mapId = value;
  } else {
    copy[key] = value;
  }
  return upsertQuest(src, copy);
}

export function setQuestMinLevel(src: QuestLabOverrides, id: string, minLevel: number | null): QuestLabOverrides {
  const live = effectiveQuest(id, src, true);
  if (!live) return src;
  const copy = cloneQuestSpec(live);
  if (minLevel == null || minLevel < 1) delete copy.minLevel;
  else copy.minLevel = Math.round(minLevel);
  return upsertQuest(src, copy);
}

export function setQuestMinRadioState(
  src: QuestLabOverrides,
  id: string,
  state: import("../operators/radioProgression").RadioState | null,
): QuestLabOverrides {
  const live = effectiveQuest(id, src, true);
  if (!live) return src;
  const copy = cloneQuestSpec(live);
  if (!state) delete copy.minRadioState;
  else copy.minRadioState = state;
  return upsertQuest(src, copy);
}

export function setQuestRequiresUnique(
  src: QuestLabOverrides,
  id: string,
  requiresUnique: QuestSpec["requiresUnique"] | null,
): QuestLabOverrides {
  const live = effectiveQuest(id, src, true);
  if (!live) return src;
  const copy = cloneQuestSpec(live);
  if (!requiresUnique) delete copy.requiresUnique;
  else copy.requiresUnique = { ...requiresUnique };
  return upsertQuest(src, copy);
}

export function setQuestObjectives(src: QuestLabOverrides, id: string, objectives: QuestObjective[]): QuestLabOverrides {
  const live = effectiveQuest(id, src, true);
  if (!live) return src;
  const copy = cloneQuestSpec(live);
  copy.objectives = objectives.map((o) => ({ ...o }));
  return upsertQuest(src, copy);
}

export function setQuestRewards(src: QuestLabOverrides, id: string, rewards: QuestReward[]): QuestLabOverrides {
  const live = effectiveQuest(id, src, true);
  if (!live) return src;
  const copy = cloneQuestSpec(live);
  copy.rewards = rewards.map((r) => ({ ...r }));
  return upsertQuest(src, copy);
}

export function setQuestPrerequisites(src: QuestLabOverrides, id: string, prerequisites: string[]): QuestLabOverrides {
  const live = effectiveQuest(id, src, true);
  if (!live) return src;
  const copy = cloneQuestSpec(live);
  copy.prerequisites = [...prerequisites];
  return upsertQuest(src, copy);
}

export function addDevQuest(src: QuestLabOverrides, id?: string): { overrides: QuestLabOverrides; id: string } {
  const catalog = effectiveQuestCatalog(src, true);
  const nextId = id && !catalog.some((q) => q.id === id) ? id : nextDevQuestId(catalog);
  return { overrides: upsertQuest(src, newQuestSpec(nextId)), id: nextId };
}

export function duplicateDevQuest(
  src: QuestLabOverrides,
  id: string,
): { overrides: QuestLabOverrides; id: string } | null {
  const live = effectiveQuest(id, src, true);
  if (!live) return null;
  const catalog = effectiveQuestCatalog(src, true);
  const nextId = nextDevQuestId(catalog);
  return { overrides: upsertQuest(src, duplicateQuestSpec(live, nextId)), id: nextId };
}

export function resetQuestItem(src: QuestLabOverrides, id: string): QuestLabOverrides {
  const next = cloneOverrides(src);
  delete next.quests[id];
  return pruneQuestLabOverrides(next);
}

export function modifiedQuestCount(overrides: QuestLabOverrides): number {
  return Object.keys(pruneQuestLabOverrides(overrides).quests).length;
}

export function questLabOverridesEqual(a: QuestLabOverrides, b: QuestLabOverrides): boolean {
  return JSON.stringify(pruneQuestLabOverrides(a)) === JSON.stringify(pruneQuestLabOverrides(b));
}

export function specsEqual(a: QuestSpec, b: QuestSpec): boolean {
  const aa = cloneQuestSpec(a);
  const bb = cloneQuestSpec(b);
  delete aa.devCreated;
  delete bb.devCreated;
  return JSON.stringify(aa) === JSON.stringify(bb);
}

export function validateCatalog(catalog: readonly QuestSpec[]): QuestValidation {
  const errors: QuestValidation["errors"] = [];
  const warnings: QuestValidation["warnings"] = [];
  for (const spec of catalog) {
    const v = validateQuest(spec, catalog);
    errors.push(...v.errors);
    warnings.push(...v.warnings);
  }
  return { errors, warnings };
}

export function catalogGraph(overrides: QuestLabOverrides, enabled: boolean) {
  return questGraph(effectiveQuestCatalog(overrides, enabled));
}

export type QuestPatchLine = { scope: string; field: string; from: string; to: string };

function fmt(v: unknown): string {
  if (v == null || v === "") return "(none)";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function questPatchLines(overrides: QuestLabOverrides): QuestPatchLine[] {
  const clean = pruneQuestLabOverrides(overrides);
  const lines: QuestPatchLine[] = [];
  for (const spec of Object.values(clean.quests)) {
    const base = canonicalQuest(spec.id);
    const scope = `QUEST: ${spec.id}`;
    if (!base) {
      lines.push({ scope, field: "name", from: "(none)", to: spec.name || '""' });
      lines.push({ scope, field: "desc", from: "(none)", to: spec.desc || '""' });
      if (spec.mapId) lines.push({ scope, field: "mapId", from: "(none)", to: spec.mapId });
      spec.objectives.forEach((o, i) => {
        lines.push({ scope, field: `objectives[${i}]`, from: "(none)", to: fmt(o) });
      });
      spec.rewards.forEach((r, i) => {
        lines.push({ scope, field: `rewards[${i}]`, from: "(none)", to: fmt(r) });
      });
      if (spec.prerequisites.length) {
        lines.push({ scope, field: "prerequisites", from: "(none)", to: spec.prerequisites.join(", ") });
      }
      continue;
    }
    if (spec.name !== base.name) lines.push({ scope, field: "name", from: base.name, to: spec.name });
    if (spec.desc !== base.desc) lines.push({ scope, field: "desc", from: base.desc, to: spec.desc });
    if ((spec.mapId ?? "") !== (base.mapId ?? "")) {
      lines.push({ scope, field: "mapId", from: fmt(base.mapId), to: fmt(spec.mapId) });
    }
    const nObj = Math.max(base.objectives.length, spec.objectives.length);
    for (let i = 0; i < nObj; i++) {
      if (JSON.stringify(base.objectives[i]) !== JSON.stringify(spec.objectives[i])) {
        lines.push({
          scope,
          field: `objectives[${i}]`,
          from: fmt(base.objectives[i]),
          to: fmt(spec.objectives[i]),
        });
      }
    }
    const nRw = Math.max(base.rewards.length, spec.rewards.length);
    for (let i = 0; i < nRw; i++) {
      if (JSON.stringify(base.rewards[i]) !== JSON.stringify(spec.rewards[i])) {
        lines.push({
          scope,
          field: `rewards[${i}]`,
          from: fmt(base.rewards[i]),
          to: fmt(spec.rewards[i]),
        });
      }
    }
    if (base.prerequisites.join() !== spec.prerequisites.join()) {
      lines.push({
        scope,
        field: "prerequisites",
        from: base.prerequisites.join(", ") || "(none)",
        to: spec.prerequisites.join(", ") || "(none)",
      });
    }
  }
  return lines;
}

export function formatQuestPatch(overrides: QuestLabOverrides): string {
  const lines = questPatchLines(overrides);
  if (lines.length === 0) return "QUEST PATCH\n\n(no changes)\n";
  const groups = new Map<string, QuestPatchLine[]>();
  for (const line of lines) {
    const list = groups.get(line.scope) ?? [];
    list.push(line);
    groups.set(line.scope, list);
  }
  const parts = ["QUEST PATCH", ""];
  for (const [scope, group] of groups) {
    parts.push(scope);
    parts.push("");
    for (const line of group) {
      if (line.field === "name" || line.field === "desc") {
        parts.push(`${line.field}:`);
        parts.push(`"${line.to.replace(/^"|"$/g, "")}"`);
        parts.push("");
      } else {
        parts.push(`${line.field}: ${line.from} -> ${line.to}`);
      }
    }
    parts.push("");
  }
  return parts.join("\n").trim() + "\n";
}

export function parseStoredQuestLab(raw: string | null): QuestLabOverrides {
  if (!raw) return emptyQuestLabOverrides();
  try {
    const parsed = JSON.parse(raw) as Partial<QuestLabOverrides>;
    return pruneQuestLabOverrides({
      quests: parsed.quests && typeof parsed.quests === "object" ? parsed.quests : {},
    });
  } catch {
    return emptyQuestLabOverrides();
  }
}

export function loadQuestLabOverrides(enabled: boolean, storage: StorageLike | null): QuestLabOverrides {
  if (!enabled || !storage) return emptyQuestLabOverrides();
  return parseStoredQuestLab(storage.getItem(QUEST_LAB_STORAGE_KEY));
}

export function saveQuestLabOverrides(
  overrides: QuestLabOverrides,
  enabled: boolean,
  storage: StorageLike | null,
): void {
  if (!storage) return;
  if (!enabled) {
    storage.removeItem(QUEST_LAB_STORAGE_KEY);
    return;
  }
  storage.setItem(QUEST_LAB_STORAGE_KEY, JSON.stringify(pruneQuestLabOverrides(overrides)));
}

let applied: QuestLabOverrides = emptyQuestLabOverrides();
const listeners = new Set<() => void>();

function memoryStorage(): StorageLike | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function getQuestLabOverrides(): QuestLabOverrides {
  return applied;
}

export function hydrateQuestLabOverrides(enabled: boolean, storage: StorageLike | null = memoryStorage()): void {
  applied = enabled ? loadQuestLabOverrides(true, storage) : emptyQuestLabOverrides();
  for (const fn of listeners) fn();
}

export function applyQuestLabOverrides(
  next: QuestLabOverrides,
  enabled: boolean,
  storage: StorageLike | null = memoryStorage(),
): QuestLabOverrides {
  applied = pruneQuestLabOverrides(cloneOverrides(next));
  saveQuestLabOverrides(applied, enabled, storage);
  for (const fn of listeners) fn();
  return applied;
}

export function subscribeQuestLab(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type QuestTestState = {
  activeId: string | null;
  events: Record<string, QuestProgressEvent[]>;
};

function emptyTestState(): QuestTestState {
  return { activeId: null, events: {} };
}

let testState: QuestTestState = emptyTestState();
const testListeners = new Set<() => void>();

function emitTest(): void {
  for (const fn of testListeners) fn();
}

export function getQuestTestState(): QuestTestState {
  return testState;
}

export function subscribeQuestTest(fn: () => void): () => void {
  testListeners.add(fn);
  return () => testListeners.delete(fn);
}

export function isQuestTestActive(): boolean {
  return DEV_TOOLS_ENABLED && testState.activeId != null;
}

export type TestQuestResult =
  | { ok: true; questId: string }
  | { ok: false; reason: "DEV TOOLS DISABLED" | "NOT_IN_RAID" | "UNKNOWN_QUEST" };

export function requestTestQuest(
  enabled: boolean,
  inRaid: boolean,
  questId: string,
  overrides: QuestLabOverrides = getQuestLabOverrides(),
): TestQuestResult {
  if (!enabled) return { ok: false, reason: "DEV TOOLS DISABLED" };
  if (!inRaid) return { ok: false, reason: "NOT_IN_RAID" };
  const spec = effectiveQuest(questId, overrides, true);
  if (!spec) return { ok: false, reason: "UNKNOWN_QUEST" };
  testState = {
    activeId: questId,
    events: { ...testState.events, [questId]: [] },
  };
  emitTest();
  return { ok: true, questId };
}

export function resetQuestTestProgress(questId: string, enabled = DEV_TOOLS_ENABLED): void {
  if (!enabled) return;
  testState = {
    ...testState,
    events: { ...testState.events, [questId]: [] },
  };
  emitTest();
}

export function clearQuestTestState(): void {
  testState = emptyTestState();
  emitTest();
}

export function noteQuestTestEvent(ev: QuestProgressEvent, enabled = DEV_TOOLS_ENABLED): void {
  if (!enabled || !testState.activeId) return;
  const id = testState.activeId;
  const cur = testState.events[id] ?? [];
  testState = {
    ...testState,
    events: { ...testState.events, [id]: applyQuestEvent(cur, ev) },
  };
  emitTest();
}

export function testEventsFor(questId: string): QuestProgressEvent[] {
  return testState.events[questId] ?? [];
}

export function evaluateTestQuest(spec: QuestSpec) {
  return evaluateQuest(spec, { kind: "events", events: testEventsFor(spec.id) });
}

export function questSummary(spec: QuestSpec, catalog: readonly QuestSpec[]) {
  const v = validateQuest(spec, catalog);
  return {
    objectiveCount: spec.objectives.length,
    rewardCount: spec.rewards.length,
    prerequisiteCount: spec.prerequisites.length,
    mapId: spec.mapId ?? "",
    roubles: questRoubles(spec),
    skillPoints: questSkillPoints(spec),
    unlocks: questUnlocks(spec).length,
    errors: v.errors.length,
    warnings: v.warnings.length,
    valid: v.errors.length === 0,
  };
}

if (DEV_TOOLS_ENABLED) {
  hydrateQuestLabOverrides(true);
}
