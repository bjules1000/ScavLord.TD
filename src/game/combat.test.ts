import { describe, expect, it } from "bun:test";
import {
  applyHit,
  applyWireDamage,
  creditKillBook,
  leakIfAlive,
  settleRemovedEnemies,
  type KillBook,
  type KillState,
} from "./combat";
import { settleHaul } from "./extract";
import { ENEMIES, buildWave } from "./data";
import { QUESTS, type QuestProgress } from "./meta";
import type { Item } from "./gear";

function fresh(hp: number): KillState {
  return { hp, leaked: false, counted: false };
}

const scavArmor = ENEMIES.scav.armor;
const bossArmor = ENEMIES.boss.armor;

function settleOne(e: KillState) {
  return settleRemovedEnemies([e]);
}

describe("canonical death resolution", () => {
  it("credits a normal lethal projectile once", () => {
    const e = fresh(34);
    applyHit(e, 34, scavArmor, 0);
    const r = settleOne(e);
    expect(r.kills).toHaveLength(1);
    expect(r.leaks).toHaveLength(0);
    expect(r.survivors).toHaveLength(0);
    expect(settleOne(e).kills).toHaveLength(0);
  });

  it("credits extreme overkill once", () => {
    const e = fresh(34);
    applyHit(e, 999, scavArmor, 0);
    expect(e.hp).toBeLessThan(-1);
    const r = settleOne(e);
    expect(r.kills).toHaveLength(1);
    expect(r.leaks).toHaveLength(0);
  });

  it("credits shotgun/pellet lethal once", () => {
    const e = fresh(34);
    applyHit(e, 9, scavArmor, 0);
    applyHit(e, 9, scavArmor, 0);
    applyHit(e, 9, scavArmor, 0);
    applyHit(e, 9, scavArmor, 0);
    const r = settleOne(e);
    expect(r.kills).toHaveLength(1);
  });

  it("credits splash lethal once", () => {
    const e = fresh(34);
    applyHit(e, 52, scavArmor, 0);
    const r = settleOne(e);
    expect(r.kills).toHaveLength(1);
  });

  it("credits environmental/wire lethal once", () => {
    const e = fresh(10);
    applyWireDamage(e, 10);
    expect(e.hp).toBeLessThanOrEqual(0);
    const r = settleOne(e);
    expect(r.kills).toHaveLength(1);
    expect(r.leaks).toHaveLength(0);
  });

  it("credits an Enforcer overkill once", () => {
    const e = fresh(ENEMIES.boss.hp);
    applyHit(e, 400, bossArmor, 6);
    applyHit(e, 400, bossArmor, 6);
    applyHit(e, 400, bossArmor, 6);
    applyHit(e, 400, bossArmor, 6);
    const r = settleOne(e);
    expect(r.kills).toHaveLength(1);
    expect(e.counted).toBe(true);
  });

  it("does not double-credit after death", () => {
    const e = fresh(10);
    applyHit(e, 50, 0, 0);
    expect(settleOne(e).kills).toHaveLength(1);
    expect(settleOne(e).kills).toHaveLength(0);
  });

  it("treats a leak as leak, never a kill", () => {
    const e = fresh(80);
    expect(leakIfAlive(e)).toBe(true);
    const r = settleOne(e);
    expect(r.kills).toHaveLength(0);
    expect(r.leaks).toHaveLength(1);
  });

  it("does not let a corpse leak after lethal damage", () => {
    const e = fresh(34);
    applyHit(e, 150, scavArmor, 0);
    expect(leakIfAlive(e)).toBe(false);
    const r = settleOne(e);
    expect(r.kills).toHaveLength(1);
    expect(r.leaks).toHaveLength(0);
  });

  it("does not leak a wire-killed enemy", () => {
    const e = fresh(2);
    applyWireDamage(e, 5);
    expect(leakIfAlive(e)).toBe(false);
    expect(settleOne(e).kills).toHaveLength(1);
  });

  it("ignores further hits on a leaked enemy", () => {
    const e = fresh(80);
    leakIfAlive(e);
    expect(applyHit(e, 40, scavArmor, 0)).toBe(0);
    expect(applyWireDamage(e, 10)).toBe(0);
  });
});

describe("kill rewards vs leak", () => {
  const emptyBook = (): KillBook => ({ killed: 0, scavKills: 0, bossKills: 0, roubles: 0 });

  it("pays bounty, XP, and quest counters exactly once on kill", () => {
    const e = fresh(34);
    applyHit(e, 40, scavArmor, 0);
    const book = emptyBook();
    const r = settleOne(e);
    let xp = 0;
    for (const k of r.kills) xp += creditKillBook("scav", ENEMIES.scav.bounty, book);
    expect(r.kills).toHaveLength(1);
    expect(book.killed).toBe(1);
    expect(book.scavKills).toBe(1);
    expect(book.bossKills).toBe(0);
    expect(book.roubles).toBe(ENEMIES.scav.bounty);
    expect(xp).toBe(14);
    const r2 = settleOne(e);
    for (const k of r2.kills) creditKillBook("scav", ENEMIES.scav.bounty, book);
    expect(r2.kills).toHaveLength(0);
    expect(book.killed).toBe(1);
    expect(book.roubles).toBe(ENEMIES.scav.bounty);
    expect(
      QUESTS.find((q) => q.id === "debut")!.done({
        scavKills: book.scavKills,
        bossKills: 0,
        bestWave: 0,
        extracts: 0,
        trackers: { debut: { scavKills: book.scavKills, bossKills: 0, bestWave: 0, extracts: 0 } },
      }),
    ).toBe(false);
  });

  it("pays Enforcer bounty and boss quest once", () => {
    const e = fresh(ENEMIES.boss.hp);
    applyHit(e, 2000, bossArmor, 6);
    const book = emptyBook();
    const r = settleOne(e);
    let xp = 0;
    for (const k of r.kills) xp += creditKillBook("boss", ENEMIES.boss.bounty, book);
    expect(book.killed).toBe(1);
    expect(book.bossKills).toBe(1);
    expect(book.scavKills).toBe(0);
    expect(book.roubles).toBe(ENEMIES.boss.bounty);
    expect(xp).toBe(120);
    const q = QUESTS.find((x) => x.id === "bounty")!;
    expect(
      q.done({
        scavKills: 0,
        bossKills: book.bossKills,
        bestWave: 0,
        extracts: 0,
        trackers: { bounty: { scavKills: 0, bossKills: book.bossKills, bestWave: 0, extracts: 0 } },
      }),
    ).toBe(true);
  });

  it("grants no bounty, XP, or quest progress on leak", () => {
    const e = fresh(80);
    expect(leakIfAlive(e)).toBe(true);
    const book = emptyBook();
    const r = settleOne(e);
    let xp = 0;
    for (const k of r.kills) xp += creditKillBook("scav", ENEMIES.scav.bounty, book);
    expect(r.kills).toHaveLength(0);
    expect(r.leaks).toHaveLength(1);
    expect(book.killed).toBe(0);
    expect(book.scavKills).toBe(0);
    expect(book.roubles).toBe(0);
    expect(xp).toBe(0);
  });
});

describe("quest progress from kills", () => {
  const empty: QuestProgress = { scavKills: 0, bossKills: 0, bestWave: 0, extracts: 0, trackers: {} };

  it("First Blood completes at 25 scav kills", () => {
    const q = QUESTS.find((x) => x.id === "debut")!;
    expect(q.done(empty)).toBe(false);
    expect(
      q.done({
        ...empty,
        trackers: { debut: { scavKills: 25, bossKills: 0, bestWave: 0, extracts: 0 } },
      }),
    ).toBe(true);
  });

  it("Crown Kill completes on one enforcer kill", () => {
    const q = QUESTS.find((x) => x.id === "bounty")!;
    expect(q.done(empty)).toBe(false);
    expect(
      q.done({
        ...empty,
        trackers: { bounty: { scavKills: 0, bossKills: 1, bestWave: 0, extracts: 0 } },
      }),
    ).toBe(true);
  });
});

describe("wave construction", () => {
  it("wave 1 is scav-only", () => {
    const w = buildWave(1);
    expect(w.groups.every((g) => g.kind === "scav")).toBe(true);
  });

  it("wave 10 includes the elite/enforcer slot", () => {
    const w = buildWave(10);
    expect(w.groups.some((g) => g.kind === "boss")).toBe(true);
    expect(w.name).toContain("ENFORCER");
  });
});

function item(uid: number, kind: Item["kind"], value = 100): Item {
  return {
    id: `t_${uid}`,
    uid,
    kind,
    name: kind,
    rarity: "common",
    value,
    desc: "",
  };
}

describe("extraction haul settlement", () => {
  it("keeps valuables by default", () => {
    const stash = [item(1, "weapon")];
    const haul = [item(2, "valuable", 700), item(3, "meds")];
    const r = settleHaul(stash, haul, new Set(), 40);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.soldValue).toBe(0);
      expect(r.next.some((i) => i.uid === 2)).toBe(true);
      expect(r.next).toHaveLength(3);
    }
  });

  it("sells only chosen valuables at item.value", () => {
    const haul = [item(2, "valuable", 700), item(3, "valuable", 60)];
    const r = settleHaul([], haul, new Set([2]), 40);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.soldValue).toBe(700);
      expect(r.next.some((i) => i.uid === 3)).toBe(true);
      expect(r.next.some((i) => i.uid === 2)).toBe(false);
    }
  });

  it("refuses silent stash overflow", () => {
    const stash = [item(1, "weapon"), item(2, "weapon")];
    const haul = [item(3, "valuable", 100)];
    const r = settleHaul(stash, haul, new Set(), 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.room).toBe(0);
  });

  it("fits after the player explicitly leaves an incoming item", () => {
    const stash = [item(1, "weapon"), item(2, "weapon")];
    const haul = [item(3, "meds"), item(4, "valuable", 100)];
    const r = settleHaul(stash, haul, new Set(), 3, new Set([3]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.next.some((i) => i.uid === 3)).toBe(false);
      expect(r.next.some((i) => i.uid === 4)).toBe(true);
      expect(r.soldValue).toBe(0);
    }
  });
});
