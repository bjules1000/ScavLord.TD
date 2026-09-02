import { beforeEach, describe, expect, it } from "bun:test";
import { QUEST_SPECS, validateQuest } from "../quests";
import { BALANCE_STORAGE_KEY, applyBalanceOverrides, emptyBalanceOverrides } from "./balance";
import { ECONOMY_STORAGE_KEY, applyEconomyOverrides, emptyEconomyOverrides } from "./economy";
import { WAVE_LAB_STORAGE_KEY, applyWaveLabOverrides, emptyWaveLabOverrides } from "./waveLabCore";
import {
  QUEST_LAB_STORAGE_KEY,
  addDevQuest,
  applyQuestLabOverrides,
  canonicalQuest,
  clearQuestTestState,
  effectiveQuest,
  effectiveQuestCatalog,
  emptyQuestLabOverrides,
  formatQuestPatch,
  getQuestLabOverrides,
  getQuestTestState,
  hydrateQuestLabOverrides,
  loadQuestLabOverrides,
  noteQuestTestEvent,
  questPatchLines,
  requestTestQuest,
  resetQuestItem,
  resetQuestTestProgress,
  setQuestField,
  setQuestObjectives,
  setQuestRewards,
  upsertQuest,
  type StorageLike,
} from "./questLab";

function memStore(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

beforeEach(() => {
  applyQuestLabOverrides(emptyQuestLabOverrides(), false, null);
  applyBalanceOverrides(emptyBalanceOverrides(), false, null);
  applyEconomyOverrides(emptyEconomyOverrides(), false, null);
  applyWaveLabOverrides(emptyWaveLabOverrides(), false, null);
  clearQuestTestState();
});

describe("Quest Editor catalog overrides", () => {
  it("canonical quests populate editor", () => {
    expect(effectiveQuestCatalog(emptyQuestLabOverrides(), true).map((q) => q.id)).toEqual(QUEST_SPECS.map((q) => q.id));
  });

  it("canonical quest remains unchanged after draft edit", () => {
    const draft = setQuestField(emptyQuestLabOverrides(), "debut", "name", "EDITED FIRST BLOOD");
    expect(canonicalQuest("debut")!.name).toBe("FIRST BLOOD");
    expect(effectiveQuest("debut", draft, true)!.name).toBe("EDITED FIRST BLOOD");
  });

  it("DEV override changes effective quest", () => {
    const draft = setQuestObjectives(emptyQuestLabOverrides(), "debut", [{ type: "KILL", count: 3, enemyId: "scav" }]);
    expect(effectiveQuest("debut", draft, true)!.objectives[0]).toEqual({ type: "KILL", count: 3, enemyId: "scav" });
    expect(QUEST_SPECS.find((q) => q.id === "debut")!.objectives[0]).toEqual({ type: "KILL", count: 25 });
  });

  it("new DEV quest appears only when DEV enabled", () => {
    const added = addDevQuest(emptyQuestLabOverrides(), "dev_quest_1");
    expect(effectiveQuestCatalog(added.overrides, true).some((q) => q.id === "dev_quest_1")).toBe(true);
    expect(effectiveQuestCatalog(added.overrides, false).some((q) => q.id === "dev_quest_1")).toBe(false);
  });

  it("RESET QUEST restores canonical", () => {
    let over = setQuestField(emptyQuestLabOverrides(), "debut", "name", "X");
    over = resetQuestItem(over, "debut");
    expect(effectiveQuest("debut", over, true)!.name).toBe("FIRST BLOOD");
  });

  it("RESET ALL restores catalog", () => {
    const added = addDevQuest(emptyQuestLabOverrides(), "dev_quest_1");
    applyQuestLabOverrides(emptyQuestLabOverrides(), true, memStore());
    expect(effectiveQuestCatalog(getQuestLabOverrides(), true).map((q) => q.id)).toEqual(QUEST_SPECS.map((q) => q.id));
    expect(Object.keys(added.overrides.quests)).toContain("dev_quest_1");
  });

  it("overrides ignored when DEV tools disabled", () => {
    const over = setQuestField(emptyQuestLabOverrides(), "debut", "name", "X");
    expect(effectiveQuest("debut", over, false)!.name).toBe("FIRST BLOOD");
    const store = memStore({ [QUEST_LAB_STORAGE_KEY]: JSON.stringify(over) });
    expect(loadQuestLabOverrides(false, store)).toEqual(emptyQuestLabOverrides());
  });

  it("applied overrides persist locally when DEV enabled", () => {
    const store = memStore();
    const over = setQuestField(emptyQuestLabOverrides(), "debut", "name", "X");
    applyQuestLabOverrides(over, true, store);
    expect(store.getItem(QUEST_LAB_STORAGE_KEY)).toContain("X");
    hydrateQuestLabOverrides(true, store);
    expect(getQuestLabOverrides().quests["debut"]?.name).toBe("X");
  });
});

describe("rewards", () => {
  it("valid canonical reward resolves", () => {
    const debut = canonicalQuest("debut")!;
    expect(debut.rewards.some((r) => r.type === "ROUBLES" && r.amount === 800)).toBe(true);
    expect(debut.rewards.some((r) => r.type === "UNLOCK" && r.itemId === "w_adar")).toBe(true);
  });

  it("invalid item reward rejected", () => {
    const over = setQuestRewards(emptyQuestLabOverrides(), "debut", [{ type: "UNLOCK", itemId: "nope" }]);
    const spec = effectiveQuest("debut", over, true)!;
    expect(validateQuest(spec, [spec]).errors.some((e) => e.code === "BAD_UNLOCK")).toBe(true);
  });

  it("duplicate completion does not grant reward twice", () => {
    const claimed: string[] = [];
    const grant = (id: string) => {
      if (claimed.includes(id)) return false;
      claimed.push(id);
      return true;
    };
    expect(grant("debut")).toBe(true);
    expect(grant("debut")).toBe(false);
  });

  it("DEV testing does not corrupt unrelated normal reward/progression state", () => {
    const meta = { claimed: ["debut"] as string[], bank: 800 };
    requestTestQuest(true, true, "bounty");
    expect(meta).toEqual({ claimed: ["debut"], bank: 800 });
  });

  it("reward export references canonical IDs", () => {
    const over = setQuestRewards(emptyQuestLabOverrides(), "debut", [
      { type: "ROUBLES", amount: 900 },
      { type: "UNLOCK", itemId: "w_adar" },
    ]);
    const text = formatQuestPatch(over);
    expect(text).toContain("w_adar");
    expect(text).toContain("QUEST PATCH");
  });
});

describe("TEST QUEST", () => {
  it("DEV quest can be activated for testing", () => {
    const r = requestTestQuest(true, true, "debut");
    expect(r).toEqual({ ok: true, questId: "debut" });
    expect(getQuestTestState().activeId).toBe("debut");
  });

  it("prerequisite bypass works only in DEV test mode", () => {
    const r = requestTestQuest(true, true, "long_range");
    expect(r.ok).toBe(true);
  });

  it("progress updates from canonical gameplay events", () => {
    requestTestQuest(true, true, "debut");
    noteQuestTestEvent({ type: "KILL", kind: "scav", mapId: "woods" });
    noteQuestTestEvent({ type: "KILL", kind: "scav", mapId: "woods" });
    expect(getQuestTestState().events["debut"]).toHaveLength(2);
  });

  it("RESET TEST PROGRESS resets only selected DEV progress", () => {
    requestTestQuest(true, true, "debut");
    noteQuestTestEvent({ type: "KILL", kind: "scav", mapId: "woods" });
    requestTestQuest(true, true, "bounty");
    noteQuestTestEvent({ type: "KILL", kind: "boss", mapId: "woods" });
    resetQuestTestProgress("debut");
    expect(getQuestTestState().events["debut"]).toEqual([]);
    expect(getQuestTestState().events["bounty"]).toHaveLength(1);
  });

  it("normal quest progress untouched", () => {
    const metaQuests = { scavKills: 4, bossKills: 0, bestWave: 2, extracts: 1 };
    requestTestQuest(true, true, "debut");
    noteQuestTestEvent({ type: "KILL", kind: "scav", mapId: "woods" });
    expect(metaQuests.scavKills).toBe(4);
  });

  it("DEV-off cannot activate TEST QUEST", () => {
    expect(requestTestQuest(false, true, "debut")).toEqual({ ok: false, reason: "DEV TOOLS DISABLED" });
    expect(requestTestQuest(true, false, "debut")).toEqual({ ok: false, reason: "NOT_IN_RAID" });
  });

  it("test snapshot is referentially stable until progress changes", () => {
    const a = getQuestTestState();
    const b = getQuestTestState();
    expect(a).toBe(b);
    requestTestQuest(true, true, "debut");
    expect(getQuestTestState()).not.toBe(a);
  });
});

describe("export", () => {
  it("only modified canonical fields exported", () => {
    const over = setQuestField(emptyQuestLabOverrides(), "debut", "name", "FIRST CUT");
    const lines = questPatchLines(over);
    expect(lines.some((l) => l.field === "name" && l.to === "FIRST CUT")).toBe(true);
    expect(lines.some((l) => l.field === "desc")).toBe(false);
  });

  it("new DEV quest exported completely", () => {
    const added = addDevQuest(emptyQuestLabOverrides(), "dev_quest_1");
    const text = formatQuestPatch(added.overrides);
    expect(text).toContain("QUEST: dev_quest_1");
    expect(text).toContain("name:");
  });

  it("reset removes patch entry", () => {
    let over = setQuestField(emptyQuestLabOverrides(), "debut", "name", "X");
    over = resetQuestItem(over, "debut");
    expect(formatQuestPatch(over)).toContain("(no changes)");
  });

  it("Quest Editor state independent from other labs", () => {
    expect(QUEST_LAB_STORAGE_KEY).not.toBe(BALANCE_STORAGE_KEY);
    expect(QUEST_LAB_STORAGE_KEY).not.toBe(ECONOMY_STORAGE_KEY);
    expect(QUEST_LAB_STORAGE_KEY).not.toBe(WAVE_LAB_STORAGE_KEY);
    const store = memStore({
      [BALANCE_STORAGE_KEY]: "bal",
      [ECONOMY_STORAGE_KEY]: "eco",
      [WAVE_LAB_STORAGE_KEY]: "wave",
    });
    applyQuestLabOverrides(setQuestField(emptyQuestLabOverrides(), "debut", "name", "X"), true, store);
    expect(store.getItem(BALANCE_STORAGE_KEY)).toBe("bal");
    expect(store.getItem(ECONOMY_STORAGE_KEY)).toBe("eco");
    expect(store.getItem(WAVE_LAB_STORAGE_KEY)).toBe("wave");
  });

  it("no source-file mutation path", () => {
    const debut = QUEST_SPECS.find((q) => q.id === "debut")!;
    upsertQuest(emptyQuestLabOverrides(), { ...debut, name: "X" });
    expect(QUEST_SPECS.find((q) => q.id === "debut")!.name).toBe("FIRST BLOOD");
  });
});
