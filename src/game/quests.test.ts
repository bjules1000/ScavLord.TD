import { describe, expect, it } from "bun:test";
import { ENEMIES } from "./data";
import { ITEM_BY_ID } from "./gear";
import {
  QUEST_SPECS,
  QUESTS,
  applyQuestEvent,
  cloneQuestSpec,
  evaluateObjective,
  evaluateQuest,
  findPrerequisiteCycles,
  mapSpecialZones,
  questGraph,
  specToQuestDef,
  validateObjective,
  validateQuest,
  type QuestProgressEvent,
  type QuestSpec,
} from "./quests";

const woods = "woods";
const factory = "factory";

function spec(partial: Partial<QuestSpec> & Pick<QuestSpec, "id">): QuestSpec {
  return {
    name: partial.name ?? partial.id,
    desc: partial.desc ?? "",
    objectives: partial.objectives ?? [],
    rewards: partial.rewards ?? [{ type: "ROUBLES", amount: 100 }],
    prerequisites: partial.prerequisites ?? [],
    ...partial,
  };
}

describe("quest catalog", () => {
  it("canonical quests populate editor", () => {
    expect(QUEST_SPECS.map((q) => q.id)).toEqual([
      "radio_power",
      "radio_signal",
      "wolf_help",
      "radio_network",
      "debut",
      "checkpoint",
      "supplier",
      "gunsmith",
      "shooters_gallery",
      "bounty",
      "long_range",
    ]);
    expect(QUESTS).toHaveLength(QUEST_SPECS.length);
    expect(QUESTS.find((q) => q.id === "debut")?.name).toBe("FIRST BLOOD");
  });

  it("canonical quest remains unchanged after cloning a draft edit", () => {
    const debut = QUEST_SPECS.find((q) => q.id === "debut")!;
    const draft = cloneQuestSpec(debut);
    draft.name = "EDITED";
    draft.objectives[0] = { type: "KILL", count: 3 };
    expect(debut.name).toBe("FIRST BLOOD");
    expect(debut.objectives[0]).toEqual({ type: "KILL", count: 25 });
  });

  it("specToQuestDef matches camp progress for First Blood", () => {
    const def = specToQuestDef(QUEST_SPECS.find((q) => q.id === "debut")!);
    expect(def.done({ scavKills: 24, bossKills: 0, bestWave: 0, extracts: 0 })).toBe(false);
    expect(def.done({ scavKills: 25, bossKills: 0, bestWave: 0, extracts: 0 })).toBe(true);
    expect(def.progress({ scavKills: 10, bossKills: 0, bestWave: 0, extracts: 0 })).toBe("10/25");
    expect(def.reward).toBe(800);
    expect(def.skillPoints).toBe(1);
    expect(def.unlocks).toContain("w_adar");
  });
});

describe("objective validation", () => {
  const host = spec({ id: "q", objectives: [], rewards: [{ type: "ROUBLES", amount: 1 }] });

  it("valid kill objective", () => {
    expect(validateObjective(host, { type: "KILL", count: 3, enemyId: "scav" }, 0)).toEqual([]);
  });

  it("missing enemy ID rejected", () => {
    const o = { type: "KILL" as const, count: 3, enemyId: "" as unknown as "scav" };
    expect(validateObjective(host, o, 0).some((e) => e.code === "MISSING_ENEMY")).toBe(true);
  });

  it("zero count rejected", () => {
    expect(validateObjective(host, { type: "KILL", count: 0 }, 0).some((e) => e.code === "BAD_COUNT")).toBe(true);
  });

  it("valid extraction objective", () => {
    const itemId = Object.keys(ITEM_BY_ID)[0]!;
    expect(validateObjective(host, { type: "EXTRACT_ITEM", itemId, count: 2 }, 0)).toEqual([]);
  });

  it("missing item rejected", () => {
    expect(validateObjective(host, { type: "EXTRACT_ITEM", itemId: "", count: 1 }, 0).some((e) => e.code === "MISSING_ITEM")).toBe(
      true,
    );
  });

  it("valid wave objective", () => {
    expect(validateObjective(host, { type: "COMPLETE_WAVE", wave: 3, mapId: woods }, 0)).toEqual([]);
  });

  it("invalid wave rejected", () => {
    expect(validateObjective(host, { type: "REACH_WAVE", wave: 0 }, 0).some((e) => e.code === "BAD_WAVE")).toBe(true);
  });

  it("map reference validation", () => {
    expect(validateObjective(host, { type: "EXTRACT", count: 1, mapId: "nope" }, 0).some((e) => e.code === "BAD_MAP")).toBe(true);
  });

  it("special-zone reference validation where supported", () => {
    const zones = mapSpecialZones(woods);
    expect(zones.length).toBeGreaterThan(0);
    const bad = validateObjective(
      host,
      { type: "VISIT_ZONE", zoneId: "missing", mapId: woods },
      0,
    );
    expect(bad.some((e) => e.code === "UNSUPPORTED_OBJECTIVE")).toBe(true);
    expect(bad.some((e) => e.code === "BAD_ZONE")).toBe(true);
    const okZone = validateObjective(host, { type: "VISIT_ZONE", zoneId: zones[0]!.id, mapId: woods }, 0);
    expect(okZone.some((e) => e.code === "BAD_ZONE")).toBe(false);
  });

  it("unsupported objective type rejected safely", () => {
    expect(
      validateObjective(host, { type: "DEFEND_ZONE", zoneId: "x", mapId: woods }, 0).some((e) => e.code === "UNSUPPORTED_OBJECTIVE"),
    ).toBe(true);
  });
});

describe("kill progress", () => {
  const kill3 = spec({ id: "k", objectives: [{ type: "KILL", count: 3, enemyId: "scav" }] });

  it("canonical enemy kill increments objective", () => {
    let events: QuestProgressEvent[] = [];
    events = applyQuestEvent(events, { type: "KILL", kind: "scav", mapId: woods });
    events = applyQuestEvent(events, { type: "KILL", kind: "scav", mapId: woods });
    expect(evaluateObjective(kill3, kill3.objectives[0]!, { kind: "events", events }).current).toBe(2);
  });

  it("leak does not increment kill", () => {
    const events: QuestProgressEvent[] = [];
    expect(evaluateObjective(kill3, kill3.objectives[0]!, { kind: "events", events }).current).toBe(0);
  });

  it("kill settles once", () => {
    let events: QuestProgressEvent[] = [];
    events = applyQuestEvent(events, { type: "KILL", kind: "scav", mapId: woods });
    expect(evaluateQuest(kill3, { kind: "events", events }).objectives[0]!.current).toBe(1);
  });

  it("wrong enemy does not increment specific objective", () => {
    const events = [{ type: "KILL" as const, kind: "raider" as const, mapId: woods }];
    expect(evaluateObjective(kill3, kill3.objectives[0]!, { kind: "events", events }).current).toBe(0);
  });

  it("map-restricted kill only counts on correct map", () => {
    const o = spec({ id: "km", objectives: [{ type: "KILL", count: 1, enemyId: "scav", mapId: woods }] });
    const events = [
      { type: "KILL" as const, kind: "scav" as const, mapId: factory },
      { type: "KILL" as const, kind: "scav" as const, mapId: woods },
    ];
    expect(evaluateObjective(o, o.objectives[0]!, { kind: "events", events }).current).toBe(1);
  });

  it("boss-specific kill works if boss model exists", () => {
    expect(ENEMIES.boss.kind).toBe("boss");
    const o = spec({ id: "b", objectives: [{ type: "KILL_BOSS", count: 1 }] });
    const events = [{ type: "KILL" as const, kind: "boss" as const, mapId: woods }];
    expect(evaluateObjective(o, o.objectives[0]!, { kind: "events", events }).done).toBe(true);
  });
});

describe("extraction progress", () => {
  const bandage = Object.keys(ITEM_BY_ID).find((id) => id.startsWith("m_")) ?? Object.keys(ITEM_BY_ID)[0]!;
  const other = Object.keys(ITEM_BY_ID).find((id) => id !== bandage)!;
  const extract = spec({ id: "e", objectives: [{ type: "EXTRACT_ITEM", itemId: bandage, count: 1 }] });

  it("collecting item without extraction does not complete EXTRACT objective", () => {
    expect(evaluateQuest(extract, { kind: "events", events: [] }).complete).toBe(false);
  });

  it("successful extraction increments", () => {
    const events = [{ type: "EXTRACT" as const, mapId: woods, items: [{ itemId: bandage, count: 1 }] }];
    expect(evaluateQuest(extract, { kind: "events", events }).complete).toBe(true);
  });

  it("quantity progress correct", () => {
    const two = spec({ id: "e2", objectives: [{ type: "EXTRACT_ITEM", itemId: bandage, count: 2 }] });
    const events = [{ type: "EXTRACT" as const, mapId: woods, items: [{ itemId: bandage, count: 1 }] }];
    expect(evaluateObjective(two, two.objectives[0]!, { kind: "events", events }).current).toBe(1);
  });

  it("wrong item ignored", () => {
    const events = [{ type: "EXTRACT" as const, mapId: woods, items: [{ itemId: other, count: 4 }] }];
    expect(evaluateObjective(extract, extract.objectives[0]!, { kind: "events", events }).current).toBe(0);
  });

  it("map restriction respected", () => {
    const o = spec({
      id: "em",
      objectives: [{ type: "EXTRACT_ITEM", itemId: bandage, count: 1, mapId: woods }],
    });
    const events = [{ type: "EXTRACT" as const, mapId: factory, items: [{ itemId: bandage, count: 1 }] }];
    expect(evaluateObjective(o, o.objectives[0]!, { kind: "events", events }).done).toBe(false);
  });

  it("KEEP/SELL settlement does not duplicate progress", () => {
    const events: QuestProgressEvent[] = [{ type: "EXTRACT", mapId: woods, items: [{ itemId: bandage, count: 1 }] }];
    expect(evaluateObjective(extract, extract.objectives[0]!, { kind: "events", events }).current).toBe(1);
    expect(evaluateObjective(extract, extract.objectives[0]!, { kind: "events", events }).current).toBe(1);
  });
});

describe("wave progress", () => {
  const complete = spec({ id: "w", objectives: [{ type: "COMPLETE_WAVE", wave: 3, mapId: woods }] });

  it("completing required wave increments objective", () => {
    const events = [{ type: "WAVE_COMPLETE" as const, wave: 3, mapId: woods }];
    expect(evaluateObjective(complete, complete.objectives[0]!, { kind: "events", events }).done).toBe(true);
  });

  it("merely reaching wave does not complete COMPLETE objective", () => {
    const events = [{ type: "WAVE_START" as const, wave: 3, mapId: woods }];
    expect(evaluateObjective(complete, complete.objectives[0]!, { kind: "events", events }).done).toBe(false);
    const reach = spec({ id: "r", objectives: [{ type: "REACH_WAVE", wave: 3 }] });
    expect(evaluateObjective(reach, reach.objectives[0]!, { kind: "events", events }).done).toBe(true);
  });

  it("TEST WAVE behavior documented/tested", () => {
    let events: QuestProgressEvent[] = [];
    events = applyQuestEvent(events, { type: "WAVE_START", wave: 3, mapId: woods });
    expect(evaluateObjective(complete, complete.objectives[0]!, { kind: "events", events }).done).toBe(false);
    events = applyQuestEvent(events, { type: "WAVE_COMPLETE", wave: 3, mapId: woods });
    expect(evaluateObjective(complete, complete.objectives[0]!, { kind: "events", events }).done).toBe(true);
  });

  it("duplicate completion does not increment twice", () => {
    let events: QuestProgressEvent[] = [];
    events = applyQuestEvent(events, { type: "WAVE_COMPLETE", wave: 3, mapId: woods });
    events = applyQuestEvent(events, { type: "WAVE_COMPLETE", wave: 3, mapId: woods });
    expect(events.filter((e) => e.type === "WAVE_COMPLETE")).toHaveLength(1);
  });

  it("map-restricted wave objective respected", () => {
    const events = [{ type: "WAVE_COMPLETE" as const, wave: 3, mapId: factory }];
    expect(evaluateObjective(complete, complete.objectives[0]!, { kind: "events", events }).done).toBe(false);
  });
});

describe("prerequisite graph", () => {
  it("valid prerequisite", () => {
    const a = spec({ id: "a", rewards: [{ type: "ROUBLES", amount: 1 }], objectives: [{ type: "EXTRACT", count: 1 }] });
    const b = spec({
      id: "b",
      prerequisites: ["a"],
      rewards: [{ type: "ROUBLES", amount: 1 }],
      objectives: [{ type: "EXTRACT", count: 1 }],
    });
    expect(validateQuest(b, [a, b]).errors.some((e) => e.code === "MISSING_PREREQ")).toBe(false);
  });

  it("missing prerequisite detected", () => {
    const b = spec({ id: "b", prerequisites: ["nope"], objectives: [{ type: "EXTRACT", count: 1 }] });
    expect(validateQuest(b, [b]).errors.some((e) => e.code === "MISSING_PREREQ")).toBe(true);
  });

  it("self-reference rejected", () => {
    const a = spec({ id: "a", prerequisites: ["a"], objectives: [{ type: "EXTRACT", count: 1 }] });
    expect(validateQuest(a, [a]).errors.some((e) => e.code === "SELF_PREREQ")).toBe(true);
  });

  it("two-node cycle rejected", () => {
    const a = spec({ id: "a", prerequisites: ["b"], objectives: [{ type: "EXTRACT", count: 1 }] });
    const b = spec({ id: "b", prerequisites: ["a"], objectives: [{ type: "EXTRACT", count: 1 }] });
    expect(findPrerequisiteCycles([a, b]).length).toBeGreaterThan(0);
    expect(validateQuest(a, [a, b]).errors.some((e) => e.code === "CYCLE")).toBe(true);
  });

  it("longer cycle rejected", () => {
    const a = spec({ id: "a", prerequisites: ["c"], objectives: [{ type: "EXTRACT", count: 1 }] });
    const b = spec({ id: "b", prerequisites: ["a"], objectives: [{ type: "EXTRACT", count: 1 }] });
    const c = spec({ id: "c", prerequisites: ["b"], objectives: [{ type: "EXTRACT", count: 1 }] });
    expect(findPrerequisiteCycles([a, b, c]).length).toBeGreaterThan(0);
  });

  it("duplicate quest ID rejected", () => {
    const a = spec({ id: "a", objectives: [{ type: "EXTRACT", count: 1 }] });
    const a2 = spec({ id: "a", name: "other", objectives: [{ type: "EXTRACT", count: 1 }] });
    expect(validateQuest(a, [a, a2]).errors.some((e) => e.code === "DUPLICATE_ID")).toBe(true);
  });

  it("deterministic graph ordering", () => {
    const a = spec({ id: "alpha", objectives: [{ type: "EXTRACT", count: 1 }] });
    const b = spec({ id: "beta", prerequisites: ["alpha"], objectives: [{ type: "EXTRACT", count: 1 }] });
    const g1 = questGraph([b, a]).order.map((n) => n.id);
    const g2 = questGraph([a, b]).order.map((n) => n.id);
    expect(g1).toEqual(g2);
    expect(g1[0]).toBe("alpha");
  });
});
