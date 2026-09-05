import { BACKPACKS, ITEM_BY_ID, WEAPONS, makeItem, type Item } from "./gear";
import { freshCrewState, migrateV5ToV6, normalizeMetaV6 } from "./operators";
import { STARTING_OPERATOR } from "./operators/startingOperator";
import { QUESTS, emptyQuestProgress, type QuestProgress } from "./quests";

export type { QuestDef, QuestProgress } from "./quests";
export { QUESTS } from "./quests";

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
}

/** Permanent perks bought with skill points earned from quests. */
export const SKILLS: SkillDef[] = [
  { id: "charisma", name: "CHARISMA", cost: 1, desc: "Black market prices -10%, sell value +10%." },
  { id: "mule", name: "MULE", cost: 1, desc: "+2 backpack slots in raid." },
  { id: "commando", name: "COMMANDO", cost: 2, desc: "+2 raid loadout slots." },
  { id: "happy_camper", name: "HAPPY CAMPER", cost: 1, desc: "+40% roubles when scrapping loot in raid." },
  { id: "hoarder", name: "HOARDER", cost: 1, desc: "+8 stash slots." },
  { id: "quartermaster", name: "QUARTERMASTER", cost: 2, desc: "+250₽ starting raid funds." },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s]),
);

export interface SkillMods {
  buyMult: number;
  sellMult: number;
  backpackBonus: number;
  loadoutBonus: number;
  scrapMult: number;
  stashBonus: number;
  startRoubles: number;
}

export function skillMods(ids: string[]): SkillMods {
  const has = (id: string) => ids.includes(id);
  return {
    buyMult: has("charisma") ? 0.9 : 1,
    sellMult: has("charisma") ? 1.1 : 1,
    backpackBonus: has("mule") ? 2 : 0,
    loadoutBonus: has("commando") ? 2 : 0,
    scrapMult: has("happy_camper") ? 1.4 : 1,
    stashBonus: has("hoarder") ? 8 : 0,
    startRoubles: has("quartermaster") ? 250 : 0,
  };
}

export interface DebuffDef {
  id: string;
  name: string;
  desc: string;
}

/** Permanent scars your operator picks up as they level. They never go away while they live. */
export const DEBUFFS: DebuffDef[] = [
  { id: "old_wound", name: "OLD WOUND", desc: "-12% max health on your operator." },
  { id: "shaky_hands", name: "SHAKY HANDS", desc: "-6% hit chance on your operator." },
  { id: "bad_knee", name: "BAD KNEE", desc: "Repositioning costs a longer firing pause." },
  { id: "notoriety", name: "NOTORIETY", desc: "+10% enemy health region-wide." },
  { id: "blacklisted", name: "BLACKLISTED", desc: "-15% raid start funds." },
  { id: "heavy_breath", name: "HEAVY BREATHER", desc: "-8% rate of fire on your operator." },
];

export const DEBUFF_BY_ID: Record<string, DebuffDef> = Object.fromEntries(
  DEBUFFS.map((d) => [d.id, d]),
);

export interface PmcState {
  name: string;
  level: number;
  xp: number;
  debuffs: string[];
  weapon: string;
  attachments: string[];
  armor: string | null;
  /** Improvised Bench visual/build state for the leader's equipped gun. */
  scavMods?: import("./weaponVisuals").WeaponVisualState | null;
  deaths: number;
}

export function freshPmc(): PmcState {
  return {
    name: STARTING_OPERATOR.defaultName,
    level: 1,
    xp: 0,
    debuffs: [],
    weapon: "pm",
    attachments: [],
    armor: null,
    deaths: 0,
  };
}

export const xpForLevel = (level: number) => 140 + (level - 1) * 120;
export const XP_PER_LEVEL = xpForLevel;

/** Every level-up marks the operator. Returns null once they have collected them all. */
export function rollDebuff(current: string[]): DebuffDef | null {
  const pool = DEBUFFS.filter((d) => !current.includes(d.id));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export interface StashEntry {
  defId: string;
  installed?: string[];
  /** Persisted scav Bench build when this stash entry is a packed weapon. */
  scavMods?: import("./weaponVisuals").WeaponVisualState | null;
}

export interface Meta {
  bank: number;
  claimed: string[];
  stash: StashEntry[];
  quests: QuestProgress;
  runs: number;
  pmc: PmcState;
  skills: string[];
  skillPoints: number;
  /** owned backpack id from gear.ts BACKPACKS */
  backpack: string;
  crew: import("./operators").CrewState;
}

const KEY_V6 = "kolkhoz-meta-v6";
const KEY_V5 = "kolkhoz-meta-v5";

export function freshMeta(): Meta {
  return {
    bank: 0,
    claimed: [],
    stash: [{ defId: "a_grip" }, { defId: "m_ifak" }],
    quests: emptyQuestProgress(),
    runs: 0,
    pmc: freshPmc(),
    skills: [],
    skillPoints: 0,
    backpack: "sling",
    crew: freshCrewState(0),
  };
}

function normalizeLegacyMeta(p: Partial<Meta>): Meta {
  const base = freshPmc();
  const runs = Number(p.runs) || 0;
  const emptyQuests = emptyQuestProgress();
  const meta: Meta = {
    bank: Number(p.bank) || 0,
    claimed: Array.isArray(p.claimed) ? p.claimed.filter((c) => typeof c === "string") : [],
    stash: Array.isArray(p.stash)
      ? p.stash
          .filter((s) => s && !!ITEM_BY_ID[s.defId])
          .map((s) => {
            const entry: StashEntry = { defId: s.defId };
            if (Array.isArray(s.installed) && s.installed.length) entry.installed = [...s.installed];
            return entry;
          })
      : [],
    quests: {
      scavKills: Number(p.quests?.scavKills) || 0,
      bossKills: Number(p.quests?.bossKills) || 0,
      bestWave: Number(p.quests?.bestWave) || 0,
      extracts: Number(p.quests?.extracts) || 0,
      wavesCompletedByMap:
        p.quests?.wavesCompletedByMap && typeof p.quests.wavesCompletedByMap === "object"
          ? { ...p.quests.wavesCompletedByMap }
          : { ...emptyQuests.wavesCompletedByMap },
      killsByMap:
        p.quests?.killsByMap && typeof p.quests.killsByMap === "object"
          ? { ...p.quests.killsByMap }
          : { ...emptyQuests.killsByMap },
      raiderKills: Number(p.quests?.raiderKills) || 0,
      bossKillsById:
        p.quests?.bossKillsById && typeof p.quests.bossKillsById === "object"
          ? { ...p.quests.bossKillsById }
          : { ...emptyQuests.bossKillsById },
      trackers:
        p.quests?.trackers && typeof p.quests.trackers === "object"
          ? Object.fromEntries(
              Object.entries(p.quests.trackers).map(([id, t]) => [
                id,
                {
                  scavKills: Number(t?.scavKills) || 0,
                  bossKills: Number(t?.bossKills) || 0,
                  bestWave: Number(t?.bestWave) || 0,
                  extracts: Number(t?.extracts) || 0,
                  wavesCompletedByMap:
                    t?.wavesCompletedByMap && typeof t.wavesCompletedByMap === "object"
                      ? { ...t.wavesCompletedByMap }
                      : {},
                  killsByMap:
                    t?.killsByMap && typeof t.killsByMap === "object" ? { ...t.killsByMap } : {},
                  raiderKills: Number(t?.raiderKills) || 0,
                  bossKillsById:
                    t?.bossKillsById && typeof t.bossKillsById === "object"
                      ? { ...t.bossKillsById }
                      : {},
                },
              ]),
            )
          : {},
    },
    runs,
    pmc: {
      name: p.pmc?.name && p.pmc.name !== "BEAR-01" ? p.pmc.name : base.name,
      level: Math.max(1, Number(p.pmc?.level) || 1),
      xp: Math.max(0, Number(p.pmc?.xp) || 0),
      debuffs: Array.isArray(p.pmc?.debuffs) ? p.pmc.debuffs.filter((d) => !!DEBUFF_BY_ID[d]) : [],
      weapon: WEAPONS[p.pmc?.weapon ?? ""] ? p.pmc!.weapon : base.weapon,
      attachments: Array.isArray(p.pmc?.attachments) ? p.pmc.attachments : [],
      armor: p.pmc?.armor ?? null,
      deaths: Number(p.pmc?.deaths) || 0,
    },
    skills: Array.isArray(p.skills) ? p.skills.filter((x) => !!SKILL_BY_ID[x]) : [],
    skillPoints: Math.max(0, Number(p.skillPoints) || 0),
    backpack: BACKPACKS[p.backpack ?? ""] ? p.backpack! : "sling",
    // Always normalize through normalizeMetaV6 so crew.radio is present.
    crew: p.crew ?? freshCrewState(runs),
  };
  return normalizeMetaV6(meta, runs);
}

export function loadMeta(): Meta {
  if (typeof window === "undefined") return freshMeta();
  try {
    const rawV6 = window.localStorage.getItem(KEY_V6);
    if (rawV6) return normalizeLegacyMeta(JSON.parse(rawV6) as Meta);
    const rawV5 = window.localStorage.getItem(KEY_V5);
    if (rawV5) return migrateV5ToV6(normalizeLegacyMeta(JSON.parse(rawV5) as Meta));
    return freshMeta();
  } catch {
    return freshMeta();
  }
}

export function saveMeta(m: Meta) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_V6, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function unlockedIds(claimed: string[]): string[] {
  const out = new Set<string>(["w_pm", "w_toz", "m_ifak", "g_frag", "bp_scav", "bp_pilgrim", "bp_trizip"]);
  for (const quest of QUESTS)
    if (claimed.includes(quest.id)) quest.unlocks.forEach((u) => out.add(u));
  return [...out];
}

export function stashItems(m: Meta, uidStart: number): Item[] {
  return m.stash
    .map((s, i) => {
      const item = makeItem(s.defId, uidStart + i);
      if (item && s.installed?.length) item.installed = [...s.installed];
      if (item && s.scavMods) item.scavMods = { ...s.scavMods, parts: { ...s.scavMods.parts } };
      return item;
    })
    .filter((x): x is Item => x !== null);
}
