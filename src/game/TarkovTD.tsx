import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BOARD_GUTTER, COLS, ROWS, SCALE, TILE, waveScale } from "./data";
import {
  MAP_DEFS,
  MAP_BY_ID,
  adjacentCover,
  bestCoverAt,
  buildMap,
  isBuildable,
  isMountain,
  isRoad,
  isWater,
  laneRoute,
  pathPoint,
  type CoverPiece,
  type GameMap,
} from "./map";
import { lanePathProgress } from "./lanes";
import { scheduleWave, spawnedEnemyHp, type WaveSpawnEvent } from "./waves";
import {
  canPlaceOperator,
  enemyLaneSurface,
  applyHighGroundCombat,
  clampAccuracy,
  hasSuspendedBridge,
  operatorPlacementSurface,
  partitionBySurface,
} from "./surfaces";
import {
  clearOperatorMove,
  findOperatorPath,
  isOperatorMoving,
  issueOperatorMove,
  logicalNode,
  operatorCanFire,
  operatorMoveSpeedPx,
  operatorWorldPos,
  getOperatorMoveSpeed,
  resolveMoveDestination,
  stepOperatorMove,
} from "./movement";
import { absorbWithArmor, getEquippedWeight } from "./armor";
import {
  BARRICADE_BUILD_COST,
  BARRICADE_HP,
  BARRICADE_COST,
  COVER_MISS_FACTOR,
  EDGE_LABEL,
  MAX_BARRICADE_LEVEL,
  WIRE_BUILD_COST,
  WIRE_COST,
  WIRE_HP,
  WIRE_SLOW_DURATION,
  WIRE_SPEED_MULT,
  WIRE_TICK_DAMAGE,
  applyWireCrossing,
  barricadeCoverCell,
  barricadeEdgeMidpoint,
  barricadeOnEdge,
  canPlaceBarricade,
  canPlaceWire,
  canRepairDefense,
  clearWireContact,
  coveredDamage,
  edgeFromCursor,
  incomingCoverProtection,
  liveWireAt,
  payDefense,
  repairCost,
  repairDefense,
  upgradeCost,
  type BarricadeEdge,
  type DefensePiece,
} from "./defenses";
import {
  ARMORS,
  ATTACHMENTS,
  BACKPACKS,
  ITEMS,
  ITEM_BY_ID,
  RARITY_COLOR,
  WEAPONS,
  applyAttachmentMods,
  makeItem,
  rollChoices,
  rollCrate,
  type Item,
} from "./gear";
import {
  DEBUFFS,
  DEBUFF_BY_ID,
  QUESTS,
  SKILLS,
  SKILL_BY_ID,
  skillMods,
  XP_PER_LEVEL,
  freshPmc,
  loadMeta,
  rollDebuff,
  saveMeta,
  stashItems,
  unlockedIds,
  xpForLevel,
  type Meta,
} from "./meta";

import {
  drawCrate,
  drawDropBag,
  drawElevatedSurfaces,
  drawEnemy,
  drawObstacle,
  drawOperator,
  drawTerrain,
  drawTower,
} from "./draw";
import type { Bullet, Enemy, EnemyKind, FloatText, Particle, Tower } from "./types";
import {
  applyHit,
  applyWireDamage,
  creditKillBook,
  isSettledOut,
  leakIfAlive,
  settleRemovedEnemies,
  type KillBook,
} from "./combat";
import { settleHaul } from "./extract";
import {
  TARGET_MODES,
  hitTestEnemy,
  inRange,
  pickManualTarget,
  selectTarget,
} from "./targeting";
import {
  HIRED_WEAPON_ID,
  STARTER_WEAPON_ID,
  attachmentDef,
  canShoot,
  combatStatus,
  consumeRound,
  maybeStartReload,
  reloadProgress,
  tickReload,
  weaponDef,
  weaponRuntimeFields,
} from "./weapons";
import {
  PELLET_HIT_RADIUS,
  isShotgunWeapon,
  resolveShotgunBlast,
  shotgunMaxHits,
  shotgunPelletCount,
  shotgunSecondaryMult,
} from "./shotgun";
import {
  bridgeDeckSeparates,
  clipWorldSegment,
  hasLineOfSight,
  wallAlongLimit,
} from "./los";
import {
  SLOT_LABEL,
  armorItemId,
  detachArmor,
  detachAttachment,
  dropEquippedGear,
  equippedMagSize,
  equipArmor,
  equipAttachment,
  expandPackedWeapon,
  slotOf,
  swapRaidWeapon,
  type AttachSlot,
} from "./raidGear";
import CampHub from "./hub/CampHub";
import { CAMP_IMAGE_H, CAMP_IMAGE_W, type HubAction } from "./hub/hotspots";
import { raidPrepActions, type RaidPrepAction } from "./hub/prep";
import { RAID_SCRAP_MULT } from "./loot";
import { DEV_TOOLS_ENABLED } from "./dev/tools";
import { confirmLeaveRaidForMapBuilder, type DevToolId } from "./dev/menu";
import DevToolsMenu from "./dev/DevToolsMenu";
import {
  clampLiveKit,
  getBalanceOverrides,
} from "./dev/balance";
import BalanceLab from "./dev/BalanceLab";
import EconomyLab from "./dev/EconomyLab";
import WaveLab from "./dev/WaveLab";
import {
  effectiveEnemy,
  effectiveWave,
  requestTestWave,
} from "./dev/waveLabCore";
import {
  effectiveItemDef,
  effectiveLootMult,
  lootRuntime,
  saleValueOf,
} from "./dev/economy";
import { clearRaidBackpack, devAddToBackpack } from "./dev/inventory";
import DevItemPicker from "./dev/DevItemPicker";

const PLAYABLE_W = COLS * TILE;
const PLAYABLE_H = ROWS * TILE;
const W = PLAYABLE_W + BOARD_GUTTER * 2;
const H = PLAYABLE_H + BOARD_GUTTER * 2;
const START_ROUBLES = 500;
const START_LIVES = 20;
const BASE_BACKPACK_SLOTS = 5;
const BASE_LOADOUT_SLOTS = 3;
const BASE_STASH_SLOTS = 40;

const STASH_KIND_ORDER: Record<string, number> = {
  weapon: 0,
  attachment: 1,
  armor: 2,
  backpack: 3,
  meds: 4,
  valuable: 5,
};
const RARITY_ORDER: Record<string, number> = { epic: 0, rare: 1, common: 2 };

const RECRUIT_BASE = 160;
const CRATE_TIME = 10; // seconds an operator must hold the crate


type Phase = "hideout" | "prep" | "combat" | "loot" | "dead" | "extracted";

type SpawnEvent = WaveSpawnEvent;
interface Drop {
  id: number;
  tx: number;
  ty: number;
  items: Item[];
}
type PlaceMode = null | "operator" | "barricade" | "wire";
type Obstacle = DefensePiece;
interface CrateState {
  tx: number;
  ty: number;
  progress: number;
  opened: boolean;
}

interface GameState {
  towers: Tower[];
  enemies: Enemy[];
  bullets: Bullet[];
  particles: Particle[];
  floats: FloatText[];
  drops: Drop[];
  obstacles: Obstacle[];
  crates: CrateState[];
  queue: SpawnEvent[];
  clock: number;
  nextId: number;
  roubles: number;
  lives: number;
  wave: number;
  phase: Phase;
  hoverTx: number;
  hoverTy: number;
  hoverEdge: BarricadeEdge | null;
  selectedId: number | null;
  selectedObstacle: number | null;
  place: PlaceMode;
  shake: number;
  killed: number;
  scavKills: number;
  bossKills: number;
  backpack: Item[];
  payout: number;
  recovered: Item[];
  pmcDown: boolean;
  newDebuff: string | null;
}

function freshState(loadout: Item[], phase: Phase, map: GameMap, startRoubles = START_ROUBLES): GameState {
  return {
    towers: [],
    enemies: [],
    bullets: [],
    particles: [],
    floats: [],
    drops: [],
    obstacles: [],
    crates: map.CRATES.map((c) => ({ tx: c.tx, ty: c.ty, progress: 0, opened: false })),
    queue: [],
    clock: 0,
    nextId: 5000,
    roubles: startRoubles,
    lives: START_LIVES,
    wave: 0,
    phase,
    hoverTx: -1,
    hoverTy: -1,
    hoverEdge: null,
    selectedId: null,
    selectedObstacle: null,
    place: null,
    shake: 0,
    killed: 0,
    scavKills: 0,
    bossKills: 0,
    backpack: loadout,
    payout: 0,
    recovered: [],
    pmcDown: false,
    newDebuff: null,
  };
}

const TOWER_BASE_HP = 110;

export interface DebuffMods {
  pmcHp: number;
  pmcAcc: number;
  pmcRof: number;
  moveLock: number;
  enemyHp: number;
  startRoubles: number;
}

export function debuffMods(ids: string[]): DebuffMods {
  return {
    pmcHp: ids.includes("old_wound") ? 0.88 : 1,
    pmcAcc: ids.includes("shaky_hands") ? -0.06 : 0,
    pmcRof: ids.includes("heavy_breath") ? 0.92 : 1,
    moveLock: ids.includes("bad_knee") ? 900 : 350,
    enemyHp: ids.includes("notoriety") ? 1.1 : 1,
    startRoubles: ids.includes("blacklisted") ? 0.85 : 1,
  };
}

export const pmcMaxHp = (level: number, mods: DebuffMods) =>
  Math.round((TOWER_BASE_HP * 1.4 + (level - 1) * 16) * mods.pmcHp);

function barricadePlaceableAt(map: GameMap, s: GameState, tx: number, ty: number, edge: BarricadeEdge) {
  return canPlaceBarricade(
    tx,
    ty,
    edge,
    (x, y) => isRoad(map, x, y) || isWater(map, x, y) || isMountain(map, x, y),
    (x, y) => isBuildable(map, x, y),
    s.obstacles,
    (x, y) => hasSuspendedBridge(map, x, y),
  );
}

/** Operator hire/reposition. HIGH bridge decks are legal even over ROAD/WATER. Edge barricades do not occupy the cell. */
function operatorPlaceableFor(map: GameMap, s: GameState, tx: number, ty: number) {
  if (!canPlaceOperator(map, tx, ty)) return false;
  if (s.towers.some((t) => t.tx === tx && t.ty === ty)) return false;
  return true;
}

function towerPos(t: Tower) {
  return operatorWorldPos(t);
}

function towerAtTile(towers: Tower[], tx: number, ty: number) {
  return towers.find((t) => {
    if (t.tx === tx && t.ty === ty) return true;
    const p = operatorWorldPos(t);
    return Math.floor(p.x / TILE) === tx && Math.floor(p.y / TILE) === ty;
  });
}

function coverList(map: GameMap, s: GameState): CoverPiece[] {
  return [
    ...map.COVER,
    ...s.obstacles
      .filter((o) => o.kind === "barricade" && o.hp > 0 && o.edge)
      .map((o) => {
        const cell = barricadeCoverCell(o.tx, o.ty, o.edge!);
        return { tx: cell.tx, ty: cell.ty, type: "full" as const };
      }),
  ];
}

export function towerStats(t: Tower, mods?: DebuffMods, map?: GameMap) {
  const w = weaponDef(t.weapon);
  const folded = applyAttachmentMods(w, t.attachments, attachmentDef);
  let damage = folded.damage;
  let range = folded.range * SCALE;
  let cooldown = folded.cooldown;
  let accuracy = folded.accuracy;
  let pen = folded.pen;
  const splash = folded.splash * SCALE;
  if (t.pmc) {
    const lvl = t.level ?? 1;
    damage *= 1 + (lvl - 1) * 0.05;
    accuracy += (lvl - 1) * 0.02;
    if (mods) {
      accuracy += mods.pmcAcc;
      cooldown /= mods.pmcRof;
    }
  }
  if (map) {
    const boosted = applyHighGroundCombat(range, accuracy, map, t.tx, t.ty);
    range = boosted.range;
    accuracy = boosted.accuracy;
  } else {
    accuracy = clampAccuracy(accuracy);
  }
  return {
    weapon: w,
    damage,
    range,
    cooldown,
    accuracy,
    pen,
    splash,
    slots: folded.slots,
    magSize: folded.magSize,
    reloadMs: folded.reloadMs,
    reloadType: folded.reloadType,
  };
}


const weaponItemId = (weaponId: string) =>
  ITEMS.find((i) => i.kind === "weapon" && i.ref === weaponId)?.id ?? null;
const attachItemId = (attId: string) =>
  ITEMS.find((i) => i.kind === "attachment" && i.ref === attId)?.id ?? null;

/** Where the player's operator sets up when the raid starts: safest tile nearest the road head. */
function pmcSpawnTile(map: GameMap, s: GameState) {
  const [sx, sy] = map.PIX[0]!;
  let best: { tx: number; ty: number; score: number } | null = null;
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (!operatorPlaceableFor(map, s, tx, ty)) continue;
      const d = Math.hypot(tx * TILE + TILE / 2 - sx, ty * TILE + TILE / 2 - sy);
      const score = bestCoverAt(map.COVER, tx, ty) * 400 - d;
      if (!best || score > best.score) best = { tx, ty, score };
    }
  }
  return best ?? { tx: 1, ty: 1 };
}


export default function TarkovTD() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const metaRef = useRef<Meta>(loadMeta());
  const uidRef = useRef(1);
  const [mapId, setMapId] = useState<string>("kolkhoz");
  const [screen, setScreen] = useState<"hideout" | "region" | "skills" | "gear" | "supplies">("hideout");
  const [editMode, setEditMode] = useState(false);
  const [suppliesTab, setSuppliesTab] = useState<"stash" | "market">("stash");
  const [scavTab, setScavTab] = useState<"overview" | "skills" | "quests">("overview");
  const [shopTab, setShopTab] = useState<"weapon" | "attachment" | "armor" | "backpack" | "meds">("weapon");
  const [stashTab, setStashTab] = useState<
    "all" | "weapon" | "attachment" | "armor" | "meds" | "valuable"
  >("all");
  const [questFilter, setQuestFilter] = useState<"all" | "open" | "done">("all");
  const [devPickerOpen, setDevPickerOpen] = useState(false);
  const [balanceLabOpen, setBalanceLabOpen] = useState(false);
  const [economyLabOpen, setEconomyLabOpen] = useState(false);
  const [waveLabOpen, setWaveLabOpen] = useState(false);
  const labOpenRef = useRef(false);
  const mapRef = useRef<GameMap>(buildMap(MAP_BY_ID["kolkhoz"]!));
  const gs = useRef<GameState>(freshState([], "hideout", mapRef.current));
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const [choices, setChoices] = useState<Item[]>([]);
  const [pendingLoot, setPendingLoot] = useState<Item | null>(null);
  const [swapUid, setSwapUid] = useState<number | null>(null);
  const [sellValuableUids, setSellValuableUids] = useState<Set<number>>(() => new Set());
  const [leaveUids, setLeaveUids] = useState<Set<number>>(() => new Set());
  const [loadout, setLoadout] = useState<Item[]>([]);
  const [stash, setStash] = useState<Item[]>(() => {
    const m = loadMeta();
    const items = stashItems(m, 1);
    return items;
  });
  const [log, setLog] = useState<string[]>(["Prep your kit in the hideout, then deploy."]);
  const dragUid = useRef<number | null>(null);

  const pushLog = useCallback((msg: string) => setLog((l) => [msg, ...l].slice(0, 6)), []);
  const mods = skillMods(metaRef.current.skills);
  const backpackSlots = useCallback(
    () =>
      BASE_BACKPACK_SLOTS +
      (BACKPACKS[metaRef.current.backpack]?.bonus ?? 0) +
      skillMods(metaRef.current.skills).backpackBonus,
    [],
  );
  const loadoutSlots = BASE_LOADOUT_SLOTS + mods.loadoutBonus;
  const stashSlots = BASE_STASH_SLOTS + mods.stashBonus;
  const sortedStash = useMemo(
    () =>
      stash
        .filter((i) => stashTab === "all" || i.kind === stashTab)
        .slice()
        .sort(
          (a, b) =>
            (STASH_KIND_ORDER[a.kind] ?? 9) - (STASH_KIND_ORDER[b.kind] ?? 9) ||
            (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9) ||
            b.value - a.value ||
            a.name.localeCompare(b.name),
        ),
    [stash, stashTab],
  );
  const newUid = () => 100000 + uidRef.current++;

  const persist = useCallback((nextStash: Item[], nextLoadout: Item[]) => {
    const m = metaRef.current;
    m.stash = [...nextStash, ...nextLoadout].map((i) => ({ defId: i.id }));
    saveMeta(m);
  }, []);

  useEffect(() => {
    const def = MAP_BY_ID[mapId] ?? MAP_DEFS[1]!;
    mapRef.current = buildMap(def);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0a0c08";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(BOARD_GUTTER, BOARD_GUTTER);
    drawTerrain(ctx, mapRef.current);
    ctx.restore();
    terrainRef.current = c;
    if (gs.current.phase === "hideout") gs.current = freshState([], "hideout", mapRef.current);
    rerender();
  }, [mapId, rerender]);

  /* ---------------- hideout ---------------- */

  const deploy = useCallback(() => {
    const m = metaRef.current;
    const mods = debuffMods(m.pmc.debuffs);
    const s = freshState(
      loadout.map((i) => ({ ...i })),
      "prep",
      mapRef.current,
      Math.round(START_ROUBLES * mods.startRoubles) + skillMods(m.skills).startRoubles,
    );
    const spot = pmcSpawnTile(mapRef.current, s);
    const hp = pmcMaxHp(m.pmc.level, mods);
    const armorDef = m.pmc.armor ? ARMORS[m.pmc.armor] : undefined;
    s.towers.push({
      id: s.nextId++,
      tx: spot.tx,
      ty: spot.ty,
      surface: operatorPlacementSurface(mapRef.current, spot.tx, spot.ty) ?? "GROUND",
      weapon: m.pmc.weapon,
      attachments: [...m.pmc.attachments],
      cd: 0,
      angle: 0,
      flash: 0,
      kills: 0,
      hp,
      maxHp: hp,
      hurt: 0,
      pmc: true,
      level: m.pmc.level,
      xp: m.pmc.xp,
      armor: m.pmc.armor,
      armorHp: armorDef ? armorDef.durability : 0,
      ...weaponRuntimeFields(m.pmc.weapon),
    });
    gs.current = s;
    setChoices([]);
    setPendingLoot(null);
    setSwapUid(null);
    setSellValuableUids(new Set());
    setLeaveUids(new Set());
    setLoadout([]);
    setScreen("hideout");
    persist(stash, []);
    setLog([
      `${m.pmc.name} inserted at ${mapRef.current.def.name}. Keep them alive — if they die, the run is over for good.`,
    ]);
    rerender();
  }, [loadout, persist, rerender, stash]);

  const toHideout = useCallback(
    (keepBackpack: boolean) => {
      const s = gs.current;
      const m = metaRef.current;
      let next = [...stash];
      if (keepBackpack) {
        const haul = [...s.backpack, ...s.recovered];
        const settled = settleHaul(stash, haul, sellValuableUids, stashSlots, leaveUids, saleValueOf);
        if (!settled.ok) {
          pushLog(
            `STASH FULL — ${settled.keptCount} recovered item(s), ${settled.room} free slot(s). Sell or leave items first.`,
          );
          rerender();
          return;
        }
        m.bank += settled.soldValue;
        next = settled.next;
      }
      m.quests.bestWave = Math.max(m.quests.bestWave, s.wave);
      m.quests.scavKills += s.scavKills;
      m.quests.bossKills += s.bossKills;
      // Operator bookkeeping: they keep kit on extract, lose it on death / wipe
      const pmc = s.towers.find((t) => t.pmc);
      if (s.pmcDown) {
        const deaths = m.pmc.deaths + 1;
        m.pmc = { ...freshPmc(), deaths };
      } else if (pmc) {
        m.pmc.level = pmc.level ?? m.pmc.level;
        m.pmc.xp = pmc.xp ?? m.pmc.xp;
        m.pmc.weapon = keepBackpack ? pmc.weapon : STARTER_WEAPON_ID;
        m.pmc.attachments = keepBackpack ? [...pmc.attachments] : [];
        m.pmc.armor = keepBackpack ? (pmc.armor ?? null) : null;
      }
      setStash(next);
      m.stash = next.map((i) => ({ defId: i.id }));
      m.runs += 1;
      saveMeta(m);
      gs.current = freshState([], "hideout", mapRef.current);
      setLoadout([]);
      setChoices([]);
      setPendingLoot(null);
      setSwapUid(null);
      setSellValuableUids(new Set());
      setLeaveUids(new Set());
      setScreen("hideout");
      rerender();
    },
    [leaveUids, pushLog, rerender, sellValuableUids, stash, stashSlots],
  );


  const buy = useCallback(
    (defId: string) => {
      const def = effectiveItemDef(defId) ?? ITEM_BY_ID[defId];
      const m = metaRef.current;
      if (!def?.price) return;
      const price = Math.round(def.price * skillMods(m.skills).buyMult);
      if (m.bank < price) return pushLog("Not enough banked roubles.");
      if (def.kind === "backpack" && def.ref) {
        const own = BACKPACKS[m.backpack]?.bonus ?? 0;
        if ((BACKPACKS[def.ref]?.bonus ?? 0) <= own) return pushLog("You already carry a bigger rig.");
        m.bank -= price;
        m.backpack = def.ref;
        saveMeta(m);
        pushLog(`${def.name} bought — backpack now ${BASE_BACKPACK_SLOTS + BACKPACKS[def.ref]!.bonus} slots.`);
        rerender();
        return;
      }
      if (stash.length >= stashSlots) return pushLog("Stash is full.");
      m.bank -= price;
      const item = makeItem(defId, newUid())!;
      const next = [...stash, item];
      setStash(next);
      m.stash = [...next, ...loadout].map((i) => ({ defId: i.id }));
      saveMeta(m);
      pushLog(`Bought ${def.name} for ${price}₽.`);
      rerender();
    },
    [loadout, pushLog, rerender, stash, stashSlots],
  );

  /** Right-click in the stash: sell straight to the bank. */
  const sellFromStash = useCallback(
    (uid: number) => {
      const m = metaRef.current;
      const item = stash.find((i) => i.uid === uid);
      if (!item) return;
      const paid = Math.round(saleValueOf(item) * skillMods(m.skills).sellMult);
      const next = stash.filter((i) => i.uid !== uid);
      setStash(next);
      m.bank += paid;
      m.stash = [...next, ...loadout].map((i) => ({ defId: i.id }));
      saveMeta(m);
      pushLog(`Sold ${item.name} on the black market for ${paid}₽ (bank).`);
      rerender();
    },
    [loadout, pushLog, rerender, stash],
  );

  /** Right-click in the raid backpack: scrap for raid funds at a premium. */
  const scrapInRaid = useCallback(
    (uid: number) => {
      const s2 = gs.current;
      const item = s2.backpack.find((i) => i.uid === uid);
      if (!item) return;
      const sm = skillMods(metaRef.current.skills);
      const paid = Math.round(saleValueOf(item) * RAID_SCRAP_MULT * sm.scrapMult * sm.sellMult);
      s2.backpack = s2.backpack.filter((i) => i.uid !== uid);
      s2.roubles += paid;
      pushLog(`Scrapped ${item.name} on site for ${paid}₽ raid funds.`);
      rerender();
    },
    [pushLog, rerender],
  );

  const buySkill = useCallback(
    (skillId: string) => {
      const m = metaRef.current;
      const sk = SKILL_BY_ID[skillId];
      if (!sk || m.skills.includes(skillId)) return;
      if (m.skillPoints < sk.cost) return pushLog("Not enough skill points.");
      m.skillPoints -= sk.cost;
      m.skills = [...m.skills, skillId];
      saveMeta(m);
      pushLog(`${sk.name} unlocked.`);
      rerender();
    },
    [pushLog, rerender],
  );

  const redeem = useCallback(
    (questId: string) => {
      const m = metaRef.current;
      const q = QUESTS.find((x) => x.id === questId);
      if (!q || !q.done(m.quests) || m.claimed.includes(q.id)) return;
      m.claimed = [...m.claimed, q.id];
      m.bank += q.reward;
      m.skillPoints += q.skillPoints ?? 0;
      saveMeta(m);
      pushLog(
        `${q.name} redeemed: +${q.reward}₽${q.skillPoints ? `, +${q.skillPoints} skill point(s)` : ""} and new market stock.`,
      );
      rerender();
    },
    [pushLog, rerender],
  );

  const toLoadout = useCallback(
    (uid: number) => {
      if (loadout.length >= loadoutSlots) return pushLog("Loadout is full.");
      const item = stash.find((i) => i.uid === uid);
      if (!item) return;
      const ns = stash.filter((i) => i.uid !== uid);
      const nl = [...loadout, item];
      setStash(ns);
      setLoadout(nl);
      persist(ns, nl);
    },
    [loadout, loadoutSlots, persist, pushLog, stash],
  );

  const fromLoadout = useCallback(
    (uid: number) => {
      const item = loadout.find((i) => i.uid === uid);
      if (!item) return;
      const nl = loadout.filter((i) => i.uid !== uid);
      const ns = [...stash, item];
      setLoadout(nl);
      setStash(ns);
      persist(ns, nl);
    },
    [loadout, persist, stash],
  );

  /* ---------------- operator equipment (hideout) ---------------- */

  const pmcSlots = () => WEAPONS[metaRef.current.pmc.weapon]?.slots ?? 1;

  const equipOnPmc = useCallback(
    (uid: number) => {
      const m = metaRef.current;
      const item = stash.find((i) => i.uid === uid);
      if (!item) return;
      let ns = stash.filter((i) => i.uid !== uid);
      const back: Item[] = [];
      if (item.kind === "weapon" && item.ref) {
        const oldId = weaponItemId(m.pmc.weapon);
        if (oldId) back.push(makeItem(oldId, newUid())!);
        m.pmc.weapon = item.ref;
        const slots = WEAPONS[item.ref]?.slots ?? 1;
        while (m.pmc.attachments.length > slots) {
          const popped = m.pmc.attachments.pop()!;
          const aid = attachItemId(popped);
          if (aid) back.push(makeItem(aid, newUid())!);
        }
      } else if (item.kind === "attachment" && item.ref) {
        if (m.pmc.attachments.length >= pmcSlots()) return pushLog("No free mod slots on that gun.");
        if (m.pmc.attachments.includes(item.ref)) return pushLog("That mod is already fitted.");
        m.pmc.attachments.push(item.ref);
      } else if (item.kind === "armor" && item.ref) {
        const oldId = m.pmc.armor ? armorItemId(m.pmc.armor) : null;
        if (oldId) back.push(makeItem(oldId, newUid())!);
        m.pmc.armor = item.ref;
      } else {
        return pushLog("Your operator can only wear guns, mods and armor.");
      }
      ns = [...ns, ...back].slice(0, stashSlots);
      setStash(ns);
      m.stash = [...ns, ...loadout].map((i) => ({ defId: i.id }));
      saveMeta(m);
      pushLog(`${item.name} fitted to ${m.pmc.name}.`);
      rerender();
    },
    [loadout, pushLog, rerender, stash, stashSlots],
  );

  const unequipPmc = useCallback(
    (slot: "weapon" | "armor" | number) => {
      const m = metaRef.current;
      let defId: string | null = null;
      if (slot === "weapon") {
        if (m.pmc.weapon === STARTER_WEAPON_ID) return pushLog("They keep a sidearm as a fallback.");
        defId = weaponItemId(m.pmc.weapon);
        m.pmc.weapon = STARTER_WEAPON_ID;
        const slots = WEAPONS[STARTER_WEAPON_ID]!.slots;
        const spill: Item[] = [];
        while (m.pmc.attachments.length > slots) {
          const popped = m.pmc.attachments.pop()!;
          const aid = attachItemId(popped);
          if (aid) spill.push(makeItem(aid, newUid())!);
        }
        if (spill.length) {
          const ns = [...stash, ...spill].slice(0, stashSlots);
          setStash(ns);
        }
      } else if (slot === "armor") {
        if (!m.pmc.armor) return;
        defId = armorItemId(m.pmc.armor);
        m.pmc.armor = null;
      } else {
        const att = m.pmc.attachments[slot];
        if (!att) return;
        m.pmc.attachments.splice(slot, 1);
        defId = attachItemId(att);
      }
      setStash((cur) => {
        const back = defId ? makeItem(defId, newUid()) : null;
        const ns = (back ? [...cur, back] : cur).slice(0, stashSlots);
        m.stash = [...ns, ...loadout].map((i) => ({ defId: i.id }));
        saveMeta(m);
        return ns;
      });
      rerender();
    },
    [loadout, pushLog, rerender, stash, stashSlots],
  );


  /* ---------------- in-raid item handling ---------------- */

  const addToBackpack = useCallback(
    (items: Item[]) => {
      const s = gs.current;
      const room = Math.max(0, backpackSlots() - s.backpack.length);
      s.backpack.push(...items.slice(0, room));
      if (items.length > room) pushLog("Backpack full — gear left behind.");
    },
    [backpackSlots, pushLog],
  );

  const addDevBackpackItem = useCallback(
    (defId: string) => {
      const s = gs.current;
      const result = devAddToBackpack(defId, s.backpack, backpackSlots(), newUid(), DEV_TOOLS_ENABLED);
      if (!result.ok) {
        pushLog(result.reason === "BACKPACK FULL" ? "BACKPACK FULL" : result.reason);
        return;
      }
      s.backpack = result.backpack;
      pushLog(`DEV + ${result.item.name}`);
      rerender();
    },
    [backpackSlots, pushLog, rerender],
  );

  const clearDevBackpack = useCallback(() => {
    const s = gs.current;
    const result = clearRaidBackpack(s.backpack, DEV_TOOLS_ENABLED);
    if (!result.ok) return;
    s.backpack = result.backpack;
    pushLog("DEV backpack cleared");
    rerender();
  }, [pushLog, rerender]);

  const setLabs = useCallback((which: "balance" | "economy" | "wave" | "none") => {
    const balance = which === "balance";
    const economy = which === "economy";
    const wave = which === "wave";
    setBalanceLabOpen(balance);
    setEconomyLabOpen(economy);
    setWaveLabOpen(wave);
    labOpenRef.current = balance || economy || wave;
  }, []);

  const onDevTool = useCallback(
    (id: DevToolId) => {
      if (id === "ui-editor") {
        setEditMode((on) => !on);
        return;
      }
      if (id === "map-builder") {
        if (gs.current.phase !== "hideout" && !confirmLeaveRaidForMapBuilder()) return;
        window.location.assign(`/dev/map-editor?map=${encodeURIComponent(mapId)}`);
        return;
      }
      if (id === "economy-lab") {
        setLabs("economy");
        return;
      }
      if (id === "wave-lab") {
        setLabs("wave");
        return;
      }
      setLabs("balance");
    },
    [mapId, setLabs],
  );

  const onBalanceApplied = useCallback(
    (overrides: ReturnType<typeof getBalanceOverrides>) => {
      const s = gs.current;
      for (const t of s.towers) {
        const next = clampLiveKit(
          {
            weapon: t.weapon,
            attachments: t.attachments,
            ammo: t.ammo,
            armor: t.armor ?? null,
            armorHp: t.armorHp ?? 0,
          },
          overrides,
          DEV_TOOLS_ENABLED,
          equippedMagSize,
        );
        t.ammo = next.ammo;
        if (typeof next.armorHp === "number") t.armorHp = next.armorHp;
      }
      rerender();
    },
    [rerender],
  );

  const equipOnTower = useCallback(
    (uid: number, towerId: number) => {
      const s = gs.current;
      const item = s.backpack.find((i) => i.uid === uid);
      const tower = s.towers.find((t) => t.id === towerId);
      if (!item || !tower) return;
      if (item.kind === "weapon" && item.ref) {
        const result = swapRaidWeapon(item, tower.weapon, tower.attachments, s.backpack, tower.ammo);
        if (!result.ok) return pushLog(result.reason);
        tower.weapon = result.weapon;
        tower.attachments = result.attachments;
        s.backpack = result.backpack;
        Object.assign(tower, weaponRuntimeFields(result.weapon));
        tower.ammo = equippedMagSize(result.weapon, result.attachments);
        pushLog(result.message);
      } else if (item.kind === "attachment" && item.ref) {
        const result = equipAttachment(
          item,
          tower.attachments,
          s.backpack,
          towerStats(tower).slots,
          tower.ammo,
          tower.weapon,
        );
        if (!result.ok) return pushLog(result.reason);
        tower.attachments = result.attachments;
        s.backpack = result.backpack;
        tower.ammo = result.ammo;
        pushLog(result.message);
      } else if (item.kind === "armor" && item.ref) {
        const result = equipArmor(item, tower.armor ?? null, s.backpack);
        if (!result.ok) return pushLog(result.reason);
        tower.armor = result.armor ?? item.ref;
        tower.armorHp = result.armorHp ?? ARMORS[item.ref]!.durability;
        s.backpack = result.backpack;
        pushLog(result.message);
      } else if (item.kind === "meds") {
        if (tower.hp >= tower.maxHp) return pushLog("Operator is at full health.");
        tower.hp = Math.min(tower.maxHp, tower.hp + (item.heal ?? 50));
        s.backpack = s.backpack.filter((i) => i.uid !== uid);
        pushLog(`${item.name} used.`);
      } else {
        return pushLog("Valuables can only be extracted.");
      }

      rerender();
    },
    [addToBackpack, pushLog, rerender],
  );

  const detachFromTower = useCallback(
    (towerId: number, attachId: string) => {
      const s = gs.current;
      const tower = s.towers.find((t) => t.id === towerId);
      if (!tower) return;
      const result = detachAttachment(
        attachId,
        tower.attachments,
        s.backpack,
        backpackSlots(),
        newUid(),
        tower.ammo,
        tower.weapon,
      );
      if (!result.ok) return pushLog(result.reason);
      tower.attachments = result.attachments;
      s.backpack = result.backpack;
      tower.ammo = result.ammo;
      pushLog(result.message);
      rerender();
    },
    [backpackSlots, pushLog, rerender],
  );

  const stripArmor = useCallback(
    (towerId: number) => {
      const s = gs.current;
      const tower = s.towers.find((t) => t.id === towerId);
      if (!tower) return;
      const result = detachArmor(tower.armor, s.backpack, backpackSlots(), newUid());
      if (!result.ok) return pushLog(result.reason);
      tower.armor = result.armor ?? null;
      tower.armorHp = result.armorHp ?? 0;
      s.backpack = result.backpack;
      pushLog(result.message);
      rerender();
    },
    [backpackSlots, pushLog, rerender],
  );

  /* ---------------- game loop ---------------- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const spawnParticles = (x: number, y: number, color: string, n: number, power = 60) => {
      const s = gs.current;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = power * (0.3 + Math.random());
        s.particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.35 + Math.random() * 0.35,
          maxLife: 0.7,
          color,
          size: Math.random() > 0.6 ? 3 : 2,
        });
      }
    };

    const hurtEnemy = (e: Enemy, amount: number, pen: number) => {
      const def = effectiveEnemy(e.kind);
      const dealt = applyHit(e, amount, def.armor, pen);
      e.hitFlash = 0.07;
      return dealt;
    };

    const killEnemy = (e: Enemy, s: GameState) => {
      const def = effectiveEnemy(e.kind);
      const book: KillBook = s;
      const xp = creditKillBook(e.kind, def.bounty, book);
      const money = def.bounty;
      const pmc = s.towers.find((t) => t.pmc);
      if (pmc) {
        pmc.xp = (pmc.xp ?? 0) + xp;
        const need = XP_PER_LEVEL(pmc.level ?? 1);
        if (pmc.xp >= need) {
          pmc.xp -= need;
          pmc.level = (pmc.level ?? 1) + 1;
          const mods = debuffMods(metaRef.current.pmc.debuffs);
          pmc.maxHp = pmcMaxHp(pmc.level, mods);
          pmc.hp = pmc.maxHp;
          const scar = rollDebuff(metaRef.current.pmc.debuffs);
          if (scar) {
            metaRef.current.pmc.debuffs.push(scar.id);
            s.newDebuff = scar.id;
            s.floats.push({ x: pmc.tx * TILE + TILE / 2, y: pmc.ty * TILE - 24, life: 2, text: scar.name, color: "#ff5a3c" });
            pushLog(`LEVEL ${pmc.level}. New scar: ${scar.name} — ${scar.desc}`);
          } else {
            pushLog(`LEVEL ${pmc.level}. Your operator is tougher.`);
          }
          s.floats.push({ x: pmc.tx * TILE + TILE / 2, y: pmc.ty * TILE - 8, life: 1.6, text: `LVL ${pmc.level}`, color: "#f0b400" });
        }
      }
      s.floats.push({ x: e.x, y: e.y - 12, life: 0.9, text: `+${money}₽`, color: "#f0b400" });
      spawnParticles(e.x, e.y, def.body, e.kind === "boss" ? 40 : 10, e.kind === "boss" ? 140 : 70);
      spawnParticles(e.x, e.y, "#8c2f2f", 6, 50);
      if (e.kind === "boss") s.shake = 12;
    };

    const paySettledKills = (s: GameState) => {
      const settled = settleRemovedEnemies(s.enemies);
      s.enemies = settled.survivors;
      for (const e of settled.kills) killEnemy(e, s);
    };


    const dropGear = (t: Tower, s: GameState) => {
      const items = dropEquippedGear(t.weapon, t.attachments, newUid, t.armor ?? null);
      if (items.length) s.drops.push({ id: s.nextId++, tx: t.tx, ty: t.ty, items });
    };

    const tick = (dt: number) => {
      if (labOpenRef.current) return;
      const s = gs.current;
      if (s.phase === "hideout") return;
      if (s.phase === "dead" || s.phase === "loot" || s.phase === "extracted") {
        s.particles = s.particles.filter((p) => (p.life -= dt) > 0);
        return;
      }
      s.clock += dt * 1000;
      s.shake = Math.max(0, s.shake - dt * 30);
      const mods = debuffMods(metaRef.current.pmc.debuffs);

      while (s.queue.length && s.queue[0]!.at <= s.clock) {
        const ev = s.queue.shift()!;
        const def = effectiveEnemy(ev.kind);
        // HP is snapshotted here. Later Wave Lab HP APPLY does not rewrite live hp/maxHp.
        const hp = spawnedEnemyHp(def.hp, s.wave, mapRef.current.def.hpMult, mods.enemyHp);

        s.enemies.push({
          id: s.nextId++,
          kind: ev.kind,
          hp,
          maxHp: hp,
          lane: ev.lane,
          seg: 0,
          t: 0,
          x: laneRoute(mapRef.current, ev.lane).PIX[0]![0],
          y: laneRoute(mapRef.current, ev.lane).PIX[0]![1],
          surface: enemyLaneSurface(),
          contactingWireId: null,
          slow: 0,
          hitFlash: 0,
          step: Math.random() * 4,
          fireCd: 600 + Math.random() * 900,
          aim: 0,
          muzzle: 0,
          leaked: false,
          counted: false,
        });
      }

      // enemies — corpses do not walk, leak, or fight
      for (const e of s.enemies) {
        const def = effectiveEnemy(e.kind);
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.slow = Math.max(0, e.slow - dt);
        if (isSettledOut(e)) continue;
        const route = laneRoute(mapRef.current, e.lane);
        const sp = def.speed * SCALE * waveScale(s.wave).speed * (e.slow > 0 ? WIRE_SPEED_MULT : 1);
        let move = sp * dt;
        while (move > 0 && e.seg < route.SEG_LEN.length) {
          const len = route.SEG_LEN[e.seg]!;
          const remain = (1 - e.t) * len;
          if (move < remain) {
            e.t += move / len;
            move = 0;
          } else {
            move -= remain;
            e.seg++;
            e.t = 0;
          }
        }
        e.step += sp * dt * 0.25;
        if (e.seg >= route.SEG_LEN.length) {
          if (leakIfAlive(e)) {
            s.lives -= def.damage;
            s.shake = 8;
            const end = route.PIX[route.PIX.length - 1]!;
            s.floats.push({
              x: end[0],
              y: end[1] - 16,
              life: 1,
              text: `-${def.damage} HP`,
              color: "#ff5a3c",
            });
          }
          continue;
        }
        const [x, y] = pathPoint(mapRef.current, e.seg, e.t, e.lane);
        e.x = x;
        e.y = y;

        const etx = Math.floor(e.x / TILE);
        const ety = Math.floor(e.y / TILE);
        const wire = liveWireAt(s.obstacles, etx, ety);
        if (wire) {
          const cross = applyWireCrossing(wire, e);
          if (cross.slowed) e.slow = WIRE_SLOW_DURATION;
          if (wire.hp > 0) applyWireDamage(e, dt * WIRE_TICK_DAMAGE);
          if (Math.random() < dt * 3) spawnParticles(e.x, e.y, "#9a9484", 1, 25);
        } else {
          clearWireContact(e, null);
        }
        if (isSettledOut(e)) continue;

        // All current enemy attacks are ranged (fireRange + hostile bullet).
        // Melee/contact damage does not exist; leak/wire stay LOS-free.
        e.muzzle = Math.max(0, e.muzzle - dt);
        e.fireCd -= dt * 1000;
        let tgt: Tower | null = null;
        let tgtD = Infinity;
        const mapNow = mapRef.current;
        for (const t of s.towers) {
          const pos = towerPos(t);
          const d = Math.hypot(pos.x - e.x, pos.y - e.y);
          if (d >= def.fireRange * SCALE || d >= tgtD) continue;
          if (
            !hasLineOfSight(
              mapNow,
              { x: e.x, y: e.y, surface: e.surface ?? "GROUND" },
              { x: pos.x, y: pos.y, surface: t.surface ?? "GROUND" },
            )
          ) {
            continue;
          }
          tgtD = d;
          tgt = t;
        }
        if (tgt) {
          const pos = towerPos(tgt);
          e.aim = Math.atan2(pos.y - e.y, pos.x - e.x);
          if (e.fireCd <= 0) {
            e.fireCd = def.fireCooldown * (0.75 + Math.random() * 0.5);
            e.muzzle = 0.07;
            s.bullets.push({
              id: s.nextId++,
              x: e.x + Math.cos(e.aim) * 8,
              y: e.y - 2 + Math.sin(e.aim) * 8,
              tx: pos.x,
              ty: pos.y,
              targetId: -1,
              speed: 520 * SCALE,
              damage: def.towerDamage * (1 + (s.wave - 1) * 0.05),
              splash: 0,
              color: "#ff6b4a",
              trail: 0,
              hostile: true,
              towerId: tgt.id,
              sx: e.x,
              sy: e.y,
            });
          }
        } else {
          const [nx, ny] = pathPoint(mapRef.current, e.seg, Math.min(1, e.t + 0.05), e.lane);
          e.aim = Math.atan2(ny - e.y, nx - e.x);
        }
      }

      if (s.lives <= 0) {
        paySettledKills(s);
        s.lives = 0;
        s.phase = "dead";
        rerender();
        return;
      }

      // crate looting — only while a wave is running
      for (const c of s.phase === "combat" ? s.crates : []) {
        if (c.opened) continue;
        const ccx = c.tx * TILE + TILE / 2;
        const ccy = c.ty * TILE + TILE / 2;
        const near = s.towers.some((t) => {
          const p = towerPos(t);
          return Math.hypot(p.x - ccx, p.y - ccy) < TILE * 1.6;
        });
        if (near) {
          c.progress += dt / CRATE_TIME;
          if (c.progress >= 1) {
            c.opened = true;
            const loot = rollCrate(
              s.wave,
              s.nextId,
              effectiveLootMult(mapRef.current.def),
              lootRuntime(),
            );
            s.nextId += loot.length;
            addToBackpack(loot.map((l) => ({ ...l, uid: newUid() })));
            s.floats.push({ x: ccx, y: ccy - 18, life: 1.4, text: "CRATE OPENED", color: "#f0b400" });
            pushLog(`Supply crate cracked: ${loot.map((l) => l.name).join(", ")}.`);
            rerender();
          }
        } else if (c.progress > 0) {
          c.progress = Math.max(0, c.progress - dt / (CRATE_TIME * 2));
        }
      }

      // towers move, then fire (moving operators cannot shoot)
      for (const t of s.towers) {
        if (isOperatorMoving(t)) stepOperatorMove(t, dt, mapRef.current, operatorMoveSpeedPx(t));
        const st = towerStats(t, mods, mapRef.current);
        t.cd -= dt * 1000;
        t.flash = Math.max(0, t.flash - dt);
        t.hurt = Math.max(0, t.hurt - dt);
        const pos = towerPos(t);
        const cx = pos.x;
        const cy = pos.y;
        const moving = isOperatorMoving(t);
        const live = s.enemies
          .filter((e) => !isSettledOut(e))
          .map((e) => ({
            ...e,
            pathProgress: lanePathProgress(e.seg, e.t, laneRoute(mapRef.current, e.lane).SEG_LEN.length),
          }));
        const origin = { x: cx, y: cy };
        const shooter = { x: cx, y: cy, surface: t.surface ?? "GROUND" };
        const visible = (e: (typeof live)[number]) =>
          hasLineOfSight(mapRef.current, shooter, {
            x: e.x,
            y: e.y,
            surface: e.surface ?? "GROUND",
          });
        const locked =
          t.targetMode === "MANUAL" ? pickManualTarget(t.manualTargetId, origin, st.range, live) : null;
        const best = selectTarget(t.targetMode, origin, st.range, live, t.manualTargetId, visible);
        const hasTarget = !!best;
        if (!moving && t.targetMode === "MANUAL" && t.manualTargetId != null && !locked) {
          t.manualTargetId = null;
        }
        const reloaded = tickReload(
          t.ammo,
          t.reloadLeft,
          dt * 1000,
          st.magSize,
          st.reloadMs,
          st.reloadType,
          hasTarget,
        );
        t.ammo = reloaded.ammo;
        t.reloadLeft = reloaded.reloadLeft;
        t.engageTargetId = t.targetMode === "MANUAL" ? (locked?.id ?? null) : (best?.id ?? null);
        if (t.targetMode === "MANUAL" && locked) {
          t.angle = Math.atan2(locked.y - cy - 4, locked.x - cx);
        } else if (best) {
          t.angle = Math.atan2(best.y - cy - 4, best.x - cx);
        }
        if (best && t.cd <= 0 && canShoot(t.ammo, t.reloadLeft) && operatorCanFire(t)) {
            t.cd = st.cooldown;
            t.flash = 0.06;
            t.ammo = consumeRound(t.ammo);
            const ox = cx + Math.cos(t.angle) * 12;
            const oy = cy - 4 + Math.sin(t.angle) * 12;
            if (isShotgunWeapon(st.weapon)) {
              const pelletOrigin = { x: ox, y: oy, surface: t.surface ?? "GROUND" };
              const { strikes, angles, clipAlong } = resolveShotgunBlast({
                origin: { x: ox, y: oy },
                aim: t.angle,
                range: st.range,
                hitRadius: PELLET_HIT_RADIUS,
                pelletCount: shotgunPelletCount(st.weapon),
                spread: st.weapon.spread ?? 0,
                primaryDamage: st.damage,
                secondaryMult: shotgunSecondaryMult(st.weapon),
                maxHits: shotgunMaxHits(st.weapon),
                enemies: s.enemies,
                armorOf: (e) => effectiveEnemy(e.kind).armor,
                pen: st.pen,
                maxAlongOf: (angle) =>
                  wallAlongLimit(
                    mapRef.current,
                    pelletOrigin,
                    ox + Math.cos(angle) * st.range,
                    oy + Math.sin(angle) * st.range,
                  ),
                ignoreEnemy: (e) =>
                  bridgeDeckSeparates(mapRef.current, pelletOrigin, {
                    x: e.x,
                    y: e.y,
                    surface: e.surface ?? "GROUND",
                  }),
              });
              for (const strike of strikes) {
                const e = s.enemies.find((en) => en.id === strike.enemyId);
                if (!e) continue;
                e.hitFlash = 0.07;
                spawnParticles(e.x, e.y, "#c94b3a", 2, 36);
              }
              for (let i = 0; i < angles.length; i++) {
                const ang = angles[i]!;
                const along = clipAlong[i] ?? st.range;
                s.bullets.push({
                  id: s.nextId++,
                  x: ox,
                  y: oy,
                  tx: ox + Math.cos(ang) * along,
                  ty: oy + Math.sin(ang) * along,
                  targetId: 0,
                  speed: 540 * SCALE,
                  damage: 0,
                  splash: 0,
                  pen: 0,
                  tracer: true,
                  color: st.weapon.accent,
                  trail: 0,
                });
              }
            } else {
              const miss = Math.random() > st.accuracy;
              const scatter = miss ? (Math.random() - 0.5) * TILE * 1.6 : 0;
              const aimX = best.x + scatter;
              const aimY = best.y + (miss ? (Math.random() - 0.5) * TILE * 1.6 : 0);
              const clipped = clipWorldSegment(mapRef.current, { x: ox, y: oy }, aimX, aimY);
              s.bullets.push({
                id: s.nextId++,
                x: ox,
                y: oy,
                tx: clipped.x,
                ty: clipped.y,
                targetId: miss ? 0 : best.id,
                speed:
                  (st.weapon.cls === "sniper"
                    ? 900
                    : st.weapon.cls === "launcher"
                      ? 340
                      : 620) * SCALE,
                damage: st.damage,
                splash: st.splash,
                pen: st.pen,
                miss,
                color: st.weapon.accent,
                trail: 0,
              });
            }
            spawnParticles(cx + Math.cos(t.angle) * 14, cy - 4 + Math.sin(t.angle) * 14, "#d8c98a", 2, 30);
        }
        t.reloadLeft = maybeStartReload(
          t.ammo,
          t.reloadLeft,
          st.magSize,
          st.reloadMs,
          st.reloadType,
          hasTarget,
        );
      }

      // bullets
      const liveBullets: Bullet[] = [];
      for (const b of s.bullets) {
        if (b.hostile) {
          const tw = s.towers.find((t) => t.id === b.towerId);
          const dxh = b.tx - b.x;
          const dyh = b.ty - b.y;
          const dh = Math.hypot(dxh, dyh);
          const steph = b.speed * dt;
          if (!tw || dh <= steph || dh < 4) {
            if (tw) {
              const srcX = b.sx ?? b.x;
              const srcY = b.sy ?? b.y;
              const coverHit = incomingCoverProtection(
                mapRef.current.COVER,
                s.obstacles,
                tw.tx,
                tw.ty,
                srcX,
                srcY,
                TILE,
              );
              const prot = coverHit.prot;
              if (prot > 0 && coverHit.shield) {
                coverHit.shield.hp -= b.damage * prot;
              }
              const missed = Math.random() < prot * COVER_MISS_FACTOR;
              if (!missed) {
                let dmg = coveredDamage(b.damage, prot);
                const soaked = absorbWithArmor(dmg, tw.armor, tw.armorHp ?? 0);
                tw.armorHp = soaked.armorHp;
                dmg = soaked.damage;
                if (soaked.broke)
                  s.floats.push({ x: b.tx, y: b.ty - 18, life: 1.1, text: "ARMOR BROKEN", color: "#ff9d3c" });
                tw.hp -= dmg;
                tw.hurt = 0.12;
                spawnParticles(b.tx, b.ty, "#ff6b4a", 4, 45);
                if (tw.hp <= 0) {
                  if (tw.pmc) {
                    s.pmcDown = true;
                    s.phase = "dead";
                    s.shake = 16;
                    spawnParticles(b.tx, b.ty, "#ff3c3c", 40, 150);
                    clearOperatorMove(tw);
                    s.towers = s.towers.filter((t) => t.id !== tw.id);
                    pushLog(`${metaRef.current.pmc.name} is dead. Everything they carried is gone.`);
                    paySettledKills(s);
                    rerender();
                    return;
                  }
                  dropGear(tw, s);
                  clearOperatorMove(tw);
                  s.towers = s.towers.filter((t) => t.id !== tw.id);
                  if (s.selectedId === tw.id) s.selectedId = null;
                  spawnParticles(b.tx, b.ty, "#ff8a3c", 22, 110);
                  s.shake = Math.max(s.shake, 9);
                  s.floats.push({ x: b.tx, y: b.ty - 16, life: 1.4, text: "KIA — GEAR DROPPED", color: "#ff5a3c" });
                  pushLog("Operator down. His kit is on the ground — grab it.");
                  rerender();
                }
              } else {
                const edgePt =
                  coverHit.shield && coverHit.shield.edge
                    ? barricadeEdgeMidpoint(
                        coverHit.shield.tx,
                        coverHit.shield.ty,
                        coverHit.shield.edge,
                        TILE,
                      )
                    : { x: b.tx, y: b.ty };
                spawnParticles(edgePt.x, edgePt.y, "#c9c2a6", 3, 40);
              }

            }
            continue;
          }
          b.x += (dxh / dh) * steph;
          b.y += (dyh / dh) * steph;
          liveBullets.push(b);
          continue;
        }
        if (b.tracer) {
          const dxt = b.tx - b.x;
          const dyt = b.ty - b.y;
          const dtm = Math.hypot(dxt, dyt);
          const stepT = b.speed * dt;
          if (dtm <= stepT || dtm < 4) continue;
          b.x += (dxt / dtm) * stepT;
          b.y += (dyt / dtm) * stepT;
          liveBullets.push(b);
          continue;
        }
        if (b.pellet && !b.miss) {
          const hit = s.enemies.find(
            (e) => !isSettledOut(e) && Math.hypot(e.x - b.x, e.y - b.y) < TILE * 0.36,
          );
          if (hit) {
            hurtEnemy(hit, b.damage, b.pen ?? 0);
            spawnParticles(hit.x, hit.y, "#c94b3a", 3, 50);
            continue;
          }
        }
        const target = b.miss ? undefined : s.enemies.find((e) => e.id === b.targetId);
        if (target) {
          b.tx = target.x;
          b.ty = target.y;
        }
        const dx = b.tx - b.x;
        const dy = b.ty - b.y;
        const d = Math.hypot(dx, dy);
        const step = b.speed * dt;
        if (d <= step || d < 4) {
          if (b.splash > 0) {
            spawnParticles(b.tx, b.ty, "#ffb347", 18, 120);
            spawnParticles(b.tx, b.ty, "#5a5142", 10, 90);
            s.shake = Math.max(s.shake, 4);
            for (const e of s.enemies) {
              const dd = Math.hypot(e.x - b.tx, e.y - b.ty);
              if (dd <= b.splash) hurtEnemy(e, b.damage * (1 - (dd / b.splash) * 0.5), b.pen ?? 0);
            }
          } else if (target) {
            hurtEnemy(target, b.damage, b.pen ?? 0);
            spawnParticles(target.x, target.y, "#c94b3a", 4, 55);
          } else if (b.miss) {
            spawnParticles(b.tx, b.ty, "#8a8570", 3, 40);
            s.floats.push({ x: b.tx, y: b.ty - 10, life: 0.4, text: "miss", color: "#9a9484" });
          }
          continue;
        }
        b.x += (dx / d) * step;
        b.y += (dy / d) * step;
        liveBullets.push(b);
      }
      s.bullets = liveBullets;
      paySettledKills(s);

      for (const o of s.obstacles) {
        if (o.hp <= 0) {
          spawnParticles(o.tx * TILE + TILE / 2, o.ty * TILE + TILE / 2, "#8a7449", 10, 70);
        }
      }
      s.obstacles = s.obstacles.filter((o) => o.hp > 0);

      s.particles = s.particles.filter((p) => {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 90 * dt;
        return p.life > 0;
      });
      s.floats = s.floats.filter((f) => {
        f.life -= dt;
        f.y -= dt * 18;
        return f.life > 0;
      });

      if (s.clock % (s.selectedId != null ? 120 : 1000) < dt * 1000) rerender();

      if (s.phase === "combat" && s.queue.length === 0 && s.enemies.length === 0) {
        s.phase = "loot";
        s.roubles += Math.round((120 + s.wave * 30) * effectiveLootMult(mapRef.current.def));
        const found = rollChoices(
          s.wave,
          s.nextId,
          effectiveLootMult(mapRef.current.def),
          lootRuntime(),
        );
        s.nextId += 3;
        setChoices(found.map((f) => ({ ...f, uid: newUid() })));
        setPendingLoot(null);
        setSwapUid(null);
        pushLog(`Wave ${s.wave} cleared. Pick your find.`);
        rerender();
      }
    };

    const render = () => {
      const canvas = canvasRef.current;
      const terrain = terrainRef.current;
      if (!canvas || !terrain) return;
      const ctx = canvas.getContext("2d")!;
      const s = gs.current;
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
      ctx.drawImage(terrain, 0, 0);
      ctx.save();
      ctx.translate(BOARD_GUTTER, BOARD_GUTTER);

      for (const c of s.crates) drawCrate(ctx, c.tx, c.ty, c.progress, c.opened);
      for (const o of s.obstacles)
        drawObstacle(ctx, o.tx, o.ty, o.kind, o.hp / o.maxHp, o.level, o.edge ?? "N");

      for (const d of s.drops) drawDropBag(ctx, d.tx, d.ty, performance.now());

      const now = performance.now();
      const towersByY = [...s.towers].sort((a, b) => a.ty - b.ty);
      const enemiesByY = [...s.enemies].sort((a, b) => a.y - b.y);
      const towersBySurface = partitionBySurface(towersByY);
      const enemiesBySurface = partitionBySurface(enemiesByY);
      for (const t of towersBySurface.low) drawTower(ctx, t, now);
      for (const e of enemiesBySurface.low) drawEnemy(ctx, e);
      drawElevatedSurfaces(ctx, mapRef.current);
      for (const t of towersBySurface.high) drawTower(ctx, t, now);
      for (const e of enemiesBySurface.high) drawEnemy(ctx, e);

      if (s.place === "operator") {
        const seen = new Set<string>();
        for (const c of coverList(mapRef.current, s)) {
          for (let ox = -1; ox <= 1; ox++)
            for (let oy = -1; oy <= 1; oy++) {
              const tx = c.tx + ox;
              const ty = c.ty + oy;
              const key = `${tx},${ty}`;
              if (seen.has(key)) continue;
              if (!operatorPlaceableFor(mapRef.current, s, tx, ty)) continue;
              if (s.towers.some((t) => t.tx === tx && t.ty === ty)) continue;
              seen.add(key);
              const strong = c.type === "full";
              ctx.fillStyle = strong ? "rgba(110,220,255,0.14)" : "rgba(240,180,0,0.11)";
              ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
              ctx.strokeStyle = strong ? "rgba(110,220,255,0.45)" : "rgba(240,180,0,0.38)";
              ctx.lineWidth = 1;
              ctx.strokeRect(tx * TILE + 1.5, ty * TILE + 1.5, TILE - 3, TILE - 3);
            }
        }
        if (s.hoverTx >= 0) {
          const ok = operatorPlaceableFor(mapRef.current, s, s.hoverTx, s.hoverTy);
          ctx.fillStyle = ok ? "rgba(125,220,90,0.25)" : "rgba(255,70,50,0.25)";
          ctx.fillRect(s.hoverTx * TILE, s.hoverTy * TILE, TILE, TILE);
          ctx.strokeStyle = ok ? "#7ddc5a" : "#ff5a3c";
          ctx.lineWidth = 2;
          ctx.strokeRect(s.hoverTx * TILE + 1, s.hoverTy * TILE + 1, TILE - 2, TILE - 2);
        }
      }

      if (s.place === "barricade" && s.hoverTx >= 0 && s.hoverEdge) {
        const ok = barricadePlaceableAt(mapRef.current, s, s.hoverTx, s.hoverTy, s.hoverEdge);
        drawObstacle(ctx, s.hoverTx, s.hoverTy, "barricade", 1, 1, s.hoverEdge, {
          ghost: true,
          invalid: !ok,
        });
      } else if ((s.place === "barricade" || s.place === "wire") && s.hoverTx >= 0) {
        const ok =
          s.place === "wire"
            ? canPlaceWire(s.hoverTx, s.hoverTy, (x, y) => isRoad(mapRef.current, x, y), s.obstacles)
            : false;
        ctx.fillStyle = ok ? "rgba(240,180,0,0.22)" : "rgba(255,70,50,0.25)";
        ctx.fillRect(s.hoverTx * TILE, s.hoverTy * TILE, TILE, TILE);
        ctx.strokeStyle = ok ? "#f0b400" : "#ff5a3c";
        ctx.lineWidth = 2;
        ctx.strokeRect(s.hoverTx * TILE + 1, s.hoverTy * TILE + 1, TILE - 2, TILE - 2);
      }

      const sel = s.towers.find((t) => t.id === s.selectedId);
      if (sel) {
        const st = towerStats(sel, undefined, mapRef.current);
        const pos = towerPos(sel);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, st.range, 0, Math.PI * 2);
        ctx.strokeStyle = sel.targetMode === "MANUAL" ? "rgba(232,140,48,0.75)" : "rgba(110,220,255,0.7)";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = sel.targetMode === "MANUAL" ? "#e88c30" : "#6edcff";
        ctx.strokeRect(pos.x - TILE / 2 + 1, pos.y - TILE / 2 + 1, TILE - 2, TILE - 2);
        for (const c of adjacentCover(coverList(mapRef.current, s), sel.tx, sel.ty)) {
          const a = Math.atan2(c.ty - sel.ty, c.tx - sel.tx);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, TILE * 0.62, a - 0.6, a + 0.6);
          ctx.strokeStyle = c.type === "full" ? "rgba(110,220,255,0.9)" : "rgba(240,180,0,0.9)";
          ctx.lineWidth = 4;
          ctx.stroke();
        }
        ctx.lineWidth = 1;
        if (sel.move?.path.length) {
          ctx.fillStyle = "rgba(110,220,255,0.35)";
          for (const step of sel.move.path) {
            const c = { x: step.tx * TILE + TILE / 2, y: step.ty * TILE + TILE / 2 };
            ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
          }
        }
        if (!s.place && s.hoverTx >= 0) {
          const dest = resolveMoveDestination(mapRef.current, logicalNode(sel), s.hoverTx, s.hoverTy);
          const path = dest ? findOperatorPath(mapRef.current, logicalNode(sel), dest) : null;
          const ok = !!dest && !!path;
          ctx.strokeStyle = ok ? "rgba(125,220,90,0.8)" : "rgba(255,70,50,0.55)";
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(s.hoverTx * TILE + 2, s.hoverTy * TILE + 2, TILE - 4, TILE - 4);
          ctx.setLineDash([]);
        }
      }

      if (sel) {
        const mark = s.enemies.find((e) => e.id === sel.engageTargetId && !isSettledOut(e));
        if (mark) {
          const r = 7;
          ctx.strokeStyle = sel.targetMode === "MANUAL" ? "#f0b400" : "#c94b3a";
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(mark.x) - r, Math.round(mark.y) - r, r * 2, r * 2);
        }
      }

      for (const b of s.bullets) {
        ctx.fillStyle = b.hostile ? "#ff6b4a" : b.color;
        const sz = b.splash > 0 ? 5 : 3;
        ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, sz, sz);
      }
      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;

      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      for (const f of s.floats) {
        ctx.globalAlpha = Math.min(1, f.life * 2);
        ctx.fillStyle = "#000";
        ctx.fillText(f.text, f.x + 1, f.y + 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      ctx.fillStyle = "rgba(0,0,0,0.14)";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tick(dt);
      render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [addToBackpack, pushLog, rerender]);

  /* ---------------- input ---------------- */
  const toWorld = (ev: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * W - BOARD_GUTTER,
      y: ((ev.clientY - rect.top) / rect.height) * H - BOARD_GUTTER,
    };
  };

  const toTile = (ev: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    const w = toWorld(ev);
    return [Math.floor(w.x / TILE), Math.floor(w.y / TILE)] as const;
  };

  const recruitCost = () => Math.round(RECRUIT_BASE * Math.pow(1.4, gs.current.towers.length));

  const onClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const s = gs.current;
    const [tx, ty] = toTile(ev);

    const bag = s.drops.find((d) => d.tx === tx && d.ty === ty);
    if (bag) {
      addToBackpack(bag.items);
      s.drops = s.drops.filter((d) => d.id !== bag.id);
      pushLog("Recovered the dropped kit.");
      rerender();
      return;
    }

    if (s.place === "barricade") {
      const world = toWorld(ev);
      const edge = edgeFromCursor(world.x, world.y, tx, ty, TILE);
      if (!barricadePlaceableAt(mapRef.current, s, tx, ty, edge))
        return pushLog("Barricades go on a free ground or high-ground edge — not road, water, mountain, or bridges.");
      const paid = payDefense(s.roubles, BARRICADE_BUILD_COST);
      if (!paid.ok) return pushLog(paid.reason);
      s.roubles = paid.roubles;
      s.obstacles.push({
        id: s.nextId++,
        tx,
        ty,
        kind: "barricade",
        hp: BARRICADE_HP,
        maxHp: BARRICADE_HP,
        level: 1,
        edge,
      });
      pushLog(`Barricade set on the ${EDGE_LABEL[edge]} edge.`);
      rerender();
      return;
    }

    if (s.place === "wire") {
      if (!canPlaceWire(tx, ty, (x, y) => isRoad(mapRef.current, x, y), s.obstacles))
        return pushLog("Barbed wire goes on the road.");
      const paid = payDefense(s.roubles, WIRE_BUILD_COST);
      if (!paid.ok) return pushLog(paid.reason);
      s.roubles = paid.roubles;
      s.obstacles.push({ id: s.nextId++, tx, ty, kind: "wire", hp: WIRE_HP, maxHp: WIRE_HP, level: 1 });
      pushLog("Barbed wire strung across the road.");
      rerender();
      return;
    }

    const existing = towerAtTile(s.towers, tx, ty);
    if (existing) {
      s.selectedId = existing.id === s.selectedId ? null : existing.id;
      s.selectedObstacle = null;
      s.place = null;
      rerender();
      return;
    }

    const selManual = s.towers.find((t) => t.id === s.selectedId);
    if (selManual && selManual.targetMode === "MANUAL" && !s.place) {
      const world = toWorld(ev);
      const live = s.enemies.filter((e) => !isSettledOut(e));
      const clicked = hitTestEnemy(world.x, world.y, live, TILE * 0.6);
      if (clicked) {
        selManual.manualTargetId = clicked.id;
        rerender();
        return;
      }
    }

    const worldClick = toWorld(ev);
    const clickEdge = edgeFromCursor(worldClick.x, worldClick.y, tx, ty, TILE);
    const edgeBag = barricadeOnEdge(s.obstacles, tx, ty, clickEdge);
    if (edgeBag && !s.place) {
      s.selectedObstacle = edgeBag.id === s.selectedObstacle ? null : edgeBag.id;
      s.selectedId = null;
      rerender();
      return;
    }
    const wirePick = s.obstacles.find((o) => o.kind === "wire" && o.tx === tx && o.ty === ty);
    if (wirePick && !s.place) {
      s.selectedObstacle = wirePick.id === s.selectedObstacle ? null : wirePick.id;
      s.selectedId = null;
      rerender();
      return;
    }

    if (s.place === "operator") {
      if (!operatorPlaceableFor(mapRef.current, s, tx, ty))
        return pushLog("Can't deploy on the road, props, crates or cover.");
      const cost = recruitCost();
      if (s.roubles < cost) return pushLog("Not enough roubles to hire.");
      s.roubles -= cost;
      s.towers.push({
        id: s.nextId++,
        tx,
        ty,
        surface: operatorPlacementSurface(mapRef.current, tx, ty) ?? "GROUND",
        weapon: HIRED_WEAPON_ID,
        attachments: [],
        cd: 0,
        angle: 0,
        flash: 0,
        kills: 0,
        hp: TOWER_BASE_HP,
        maxHp: TOWER_BASE_HP,
        hurt: 0,
        ...weaponRuntimeFields(HIRED_WEAPON_ID),
      });
      s.place = null;
      pushLog("Operator hired with a stock sawed-off. Find them a better gun.");
      rerender();
      return;
    }

    const sel = s.towers.find((t) => t.id === s.selectedId);
    if (sel && !s.place) {
      const result = issueOperatorMove(mapRef.current, s.towers, sel, tx, ty);
      if (!result.ok) {
        pushLog(result.reason);
        rerender();
        return;
      }
      if (!result.alreadyThere) rerender();
      return;
    }

    s.selectedObstacle = null;


    s.selectedId = null;
    rerender();
  };

  const startWave = useCallback(() => {
    const s = gs.current;
    if (s.phase !== "prep") return;
    if (!s.towers.length) return pushLog("Hire at least one operator first.");
    s.wave += 1;
    const wave = effectiveWave(mapRef.current.def, s.wave);
    s.queue = scheduleWave(wave.groups, mapRef.current.lanes.length);
    s.clock = 0;
    s.phase = "combat";
    pushLog(`WAVE ${s.wave} — ${wave.name}`);
    rerender();
  }, [pushLog, rerender]);

  /** TEST WAVE: replace spawn queue for the selected wave. Does not increment past it, does not clear live enemies, does not touch meta/stash. */
  const onTestWave = useCallback(
    (waveN: number) => {
      const s = gs.current;
      const inRaid = s.phase !== "hideout" && s.phase !== "dead" && s.phase !== "extracted";
      const r = requestTestWave(DEV_TOOLS_ENABLED, inRaid, mapId, waveN);
      if (!r.ok) return r;
      s.wave = r.wave;
      s.queue = r.events;
      s.clock = 0;
      s.phase = "combat";
      pushLog(`TEST WAVE ${r.wave} — ${r.name}`);
      rerender();
      return { ok: true as const };
    },
    [mapId, pushLog, rerender],
  );

  const onResetTest = useCallback(() => {
    if (!DEV_TOOLS_ENABLED) return;
    const s = gs.current;
    if (s.phase === "hideout" || s.phase === "dead" || s.phase === "extracted") return;
    s.queue = [];
    s.enemies = [];
    s.clock = 0;
    s.phase = "prep";
    pushLog("TEST WAVE reset — back to prep");
    rerender();
  }, [pushLog, rerender]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = gs.current;
      if (e.key === "Escape") {
        s.place = null;
        s.selectedId = null;
        rerender();
      }
      if (e.code === "Space") {
        e.preventDefault();
        startWave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rerender, startWave]);

  const s = gs.current;
  const selected = s.towers.find((t) => t.id === s.selectedId) ?? null;
  const selBarricade = s.obstacles.find((o) => o.id === s.selectedObstacle) ?? null;
  const nextWaveName = useMemo(
    () => effectiveWave(mapRef.current.def, s.wave + 1).name,
    [s.wave],
  );
  const meta = metaRef.current;
  const shopIds = unlockedIds(meta.claimed).filter((id) => (effectiveItemDef(id) ?? ITEM_BY_ID[id])?.price);

  const upgradeBarricade = () => {
    if (!selBarricade) return;
    if (selBarricade.level >= MAX_BARRICADE_LEVEL) return pushLog("Barricade is fully reinforced.");
    const cost = upgradeCost(selBarricade.level);
    if (s.roubles < cost) return pushLog("Not enough roubles.");
    s.roubles -= cost;
    selBarricade.level += 1;
    const bonus = BARRICADE_HP * 0.6;
    selBarricade.maxHp += bonus;
    selBarricade.hp += bonus;
    pushLog(`Barricade reinforced to level ${selBarricade.level}.`);
    rerender();
  };

  const repairSelectedDefense = () => {
    if (!selBarricade) return;
    const paid = repairDefense(selBarricade, s.phase, s.roubles, selBarricade.kind);
    if (!paid.ok) return pushLog(paid.reason);
    s.roubles = paid.roubles;
    pushLog(`${selBarricade.kind === "wire" ? "Wire" : "Barricade"} repaired.`);
    rerender();
  };

  const takeChoice = (item: Item) => {
    const cap = backpackSlots();
    if (gs.current.backpack.length >= cap) {
      setPendingLoot(item);
      setSwapUid(null);
      pushLog("BACKPACK FULL — swap one item out, or cancel.");
      rerender();
      return;
    }
    gs.current.backpack.push(item);
    setPendingLoot(null);
    setSwapUid(null);
    setChoices([]);
    gs.current.phase = "prep";
    pushLog(`Secured ${item.name}.`);
    rerender();
  };

  const confirmLootSwap = () => {
    if (!pendingLoot || swapUid == null) return;
    const pack = gs.current.backpack;
    const idx = pack.findIndex((i) => i.uid === swapUid);
    if (idx < 0) return;
    const dropped = pack[idx]!;
    pack.splice(idx, 1);
    pack.push(pendingLoot);
    pushLog(`Secured ${pendingLoot.name}. Left ${dropped.name} behind.`);
    setPendingLoot(null);
    setSwapUid(null);
    setChoices([]);
    gs.current.phase = "prep";
    rerender();
  };

  const cancelLootSwap = () => {
    setPendingLoot(null);
    setSwapUid(null);
    pushLog("Reward not taken. Backpack unchanged.");
    rerender();
  };

  const toggleUidSet = (uid: number, setter: (fn: (cur: Set<number>) => Set<number>) => void) => {
    setter((cur) => {
      const next = new Set(cur);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const doExtract = () => {
    if (s.phase !== "prep") return pushLog("Extract only between waves.");
    // living operators walk out with everything they carry
    const carried: Item[] = [];
    for (const t of s.towers) {
      const wid = weaponItemId(t.weapon);
      if (wid && t.weapon !== "toz") carried.push(makeItem(wid, newUid())!);
      for (const a of t.attachments) {
        const aid = attachItemId(a);
        if (aid) carried.push(makeItem(aid, newUid())!);
      }
      if (t.armor) {
        const aid = armorItemId(t.armor);
        if (aid) carried.push(makeItem(aid, newUid())!);
      }
    }
    s.recovered = carried;
    s.backpack = s.backpack.flatMap((item) => expandPackedWeapon(item, newUid));
    const value = [...s.backpack, ...carried].reduce(
      (a, i) => a + (i.kind === "valuable" ? saleValueOf(i) : 0),
      0,
    );
    s.payout = value;
    setSellValuableUids(new Set());
    setLeaveUids(new Set());
    metaRef.current.quests.extracts += 1;
    s.phase = "extracted";
    pushLog(`Extracted with ${s.backpack.length + carried.length} item(s). Decide what to keep.`);
    rerender();
  };

  const doDismiss = () => {
    if (!selected) return;
    const st = towerStats(selected);
    const items = dropEquippedGear(selected.weapon, selected.attachments, newUid, selected.armor ?? null);
    addToBackpack(items);
    clearOperatorMove(selected);
    s.towers = s.towers.filter((t) => t.id !== selected.id);
    s.selectedId = null;
    pushLog(`Operator dismissed, ${st.weapon.name} back in the pack.`);
    rerender();
  };

  const canvasDrop = (ev: React.DragEvent<HTMLCanvasElement>) => {
    ev.preventDefault();
    const uid = dragUid.current;
    if (uid == null) return;
    const [tx, ty] = toTile({ clientX: ev.clientX, clientY: ev.clientY, currentTarget: ev.currentTarget });
    const tower = towerAtTile(gs.current.towers, tx, ty);
    dragUid.current = null;
    if (!tower) return pushLog("Drop gear directly on an operator.");
    equipOnTower(uid, tower.id);
  };

  const inRaid = s.phase !== "hideout";
  const extractHaul = [...s.backpack, ...s.recovered];
  const extractValuables = extractHaul.filter((i) => i.kind === "valuable");
  const extractGear = extractHaul.filter((i) => i.kind !== "valuable");
  const extractPreview = settleHaul(stash, extractHaul, sellValuableUids, stashSlots, leaveUids, saleValueOf);
  const extractSoldPreview = extractValuables
    .filter((i) => sellValuableUids.has(i.uid) && !leaveUids.has(i.uid))
    .reduce((a, i) => a + saleValueOf(i), 0);

  const campScar = meta.pmc.debuffs[0] ? DEBUFF_BY_ID[meta.pmc.debuffs[0]] : null;
  const kitActions = {
    attachments: meta.pmc.attachments,
    attachmentSlots: WEAPONS[meta.pmc.weapon]?.slots ?? 1,
  };

  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground">
      <div
        className={`mx-auto max-w-[1400px] px-2 ${
          s.phase === "hideout" ? "py-2 sm:px-4 sm:py-3" : "py-3 sm:px-4 sm:py-6"
        }`}
      >

        {s.phase === "hideout" ? (
          <header className="mb-1.5 border-b-2 border-border pb-1.5">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <div className="min-w-0">
                <h1 className="font-display text-xs tracking-tight text-primary sm:text-sm">SCAV CAMP</h1>
                <div className="mt-1 font-display text-[11px] leading-tight text-foreground sm:text-xs">
                  {meta.pmc.name} · LVL {meta.pmc.level}
                </div>
              </div>
              <div className="min-w-[148px] flex-1 basis-[148px] sm:max-w-[240px]">
                <div className="font-mono text-[10px] text-muted-foreground sm:text-[11px]">
                  XP <span className="text-foreground">{meta.pmc.xp} / {xpForLevel(meta.pmc.level)}</span>
                </div>
                <div className="mt-1 h-2.5 border-2 border-border bg-background">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${Math.min(100, xpForLevel(meta.pmc.level) ? (meta.pmc.xp / xpForLevel(meta.pmc.level)) * 100 : 0)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] sm:text-xs">
                <span className={campScar ? "text-destructive" : "text-accent"}>
                  {campScar ? campScar.name : "STABLE"}
                </span>
                <span className="text-foreground">{meta.skillPoints} SP</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Stat label="BANK" value={meta.bank.toLocaleString()} tone="gold" />
                <DevToolsMenu enabled={DEV_TOOLS_ENABLED} onSelect={onDevTool} />
              </div>
            </div>
          </header>
        ) : (
          <header className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-b-2 border-border pb-2 sm:mb-4 sm:gap-3 sm:pb-3">
            <div className="min-w-0">
              <h1 className="truncate font-display text-sm tracking-tight text-primary sm:text-2xl">
                {mapRef.current.def.name}
              </h1>
              <p className="mt-1 hidden font-mono text-xs uppercase tracking-widest text-muted-foreground sm:block td-hide-short">
                8-bit extraction tower defense · loot, kit, extract
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-1 font-mono text-[10px] sm:gap-2 sm:text-xs">
              <Stat label="SCRIP" value={s.roubles.toLocaleString()} tone="gold" />
              <Stat label="BANK" value={meta.bank.toLocaleString()} tone="gold" />
              <Stat label="HEALTH" value={`${s.lives}/${START_LIVES}`} tone={s.lives < 7 ? "bad" : "good"} />
              <Stat label="WAVE" value={`${s.wave}`} />
              <Stat label="KILLS" value={`${s.killed}`} />
              <DevToolsMenu enabled={DEV_TOOLS_ENABLED} onSelect={onDevTool} />
            </div>
          </header>
        )}


        <div
          className={
            s.phase === "hideout"
              ? ""
              : "grid gap-3 sm:gap-4 td-grid lg:grid-cols-[minmax(0,1fr)_340px]"
          }
        >
          <div className="relative">
            <div
              className="pixel-frame relative mx-auto w-full overflow-hidden"
              style={{
                maxWidth: `min(100%, calc((100dvh - ${
                  s.phase === "hideout" ? "8.25rem" : "var(--td-chrome, 13rem)"
                }) * ${s.phase === "hideout" ? CAMP_IMAGE_W / CAMP_IMAGE_H : W / H}))`,
              }}
            >

              {s.phase === "hideout" ? (
                /* M2A camp home. Pre-M2A box-menu dashboard is replaced by hotspots + the overlays below. */
                <CampHub
                  editMode={editMode}
                  controlsEnabled={editMode && screen === "hideout"}
                  onAction={(action: HubAction) => {
                    if (action === "supplies") setSuppliesTab("stash");
                    if (action === "skills") setScavTab("overview");
                    setScreen(action);
                  }}
                />
              ) : (
                <canvas
                  ref={canvasRef}
                  width={W}
                  height={H}
                  onMouseMove={(ev) => {
                    const [tx, ty] = toTile(ev);
                    const world = toWorld(ev);
                    gs.current.hoverTx = tx;
                    gs.current.hoverTy = ty;
                    gs.current.hoverEdge =
                      gs.current.place === "barricade" ? edgeFromCursor(world.x, world.y, tx, ty, TILE) : null;
                  }}
                  onMouseLeave={() => {
                    gs.current.hoverTx = -1;
                    gs.current.hoverEdge = null;
                  }}
                  onClick={onClick}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={canvasDrop}
                  className="block w-full cursor-crosshair"
                  style={{ imageRendering: "pixelated", aspectRatio: `${W} / ${H}` }}
                />
              )}

              {s.phase === "hideout" && screen === "skills" && (
                <Overlay
                  title="SCAVLORD"
                  subtitle={`${meta.pmc.name} · LVL ${meta.pmc.level} · ${meta.skillPoints} skill point(s)`}
                >
                  <div className="mb-2 flex flex-wrap gap-1">
                    {(["overview", "skills", "quests"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setScavTab(tab)}
                        className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                          scavTab === tab
                            ? "border-primary text-primary"
                            : "border-border/60 text-muted-foreground"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  {scavTab === "overview" && (
                    <div className="pixel-card text-left font-mono text-[10px]">
                      <div className="font-display text-[10px] text-primary">
                        {meta.pmc.name} · LVL {meta.pmc.level}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {BACKPACKS[meta.backpack]?.name ?? "SLING BAG"} ({backpackSlots()} slots) · XP {meta.pmc.xp}/
                        {xpForLevel(meta.pmc.level)} · Deaths {meta.pmc.deaths}
                      </div>
                      <div className="mt-2 text-muted-foreground">CONDITION</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {meta.pmc.debuffs.length === 0 ? (
                          <span className="text-accent">STABLE</span>
                        ) : (
                          meta.pmc.debuffs.map((d) => (
                            <span
                              key={d}
                              title={DEBUFF_BY_ID[d]?.desc}
                              className="border border-destructive/70 px-1 text-destructive"
                            >
                              {DEBUFF_BY_ID[d]?.name ?? d}
                            </span>
                          ))
                        )}
                      </div>
                      <div className="mt-2 text-muted-foreground">SKILL POINTS {meta.skillPoints}</div>
                    </div>
                  )}
                  {scavTab === "skills" && (
                    <div className="grid gap-2 text-left sm:grid-cols-2">
                      {SKILLS.map((sk) => {
                        const owned = meta.skills.includes(sk.id);
                        const afford = meta.skillPoints >= sk.cost;
                        return (
                          <button
                            key={sk.id}
                            onClick={() => buySkill(sk.id)}
                            disabled={owned || !afford}
                            className={`pixel-card text-left disabled:opacity-60 ${
                              owned ? "border-accent" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between font-display text-[10px]">
                              <span className={owned ? "text-accent" : "text-primary"}>{sk.name}</span>
                              <span className="text-muted-foreground">
                                {owned ? "TRAINED" : `${sk.cost} PT`}
                              </span>
                            </div>
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground">{sk.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {scavTab === "quests" && (
                    <div className="pixel-card pixel-scrollbar max-h-[280px] overflow-auto text-left">
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(["all", "open", "done"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setQuestFilter(t)}
                            className={`border px-1 py-[2px] font-mono text-[9px] uppercase ${
                              questFilter === t
                                ? "border-primary text-primary"
                                : "border-border/60 text-muted-foreground"
                            }`}
                          >
                            {t === "open" ? "not completed" : t === "done" ? "completed" : "all"}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 space-y-1 font-mono text-[10px]">
                        {QUESTS.filter((q) => {
                          const d = q.done(meta.quests);
                          return questFilter === "all" || (questFilter === "done" ? d : !d);
                        }).map((q) => {
                          const done = q.done(meta.quests);
                          const claimed = meta.claimed.includes(q.id);
                          return (
                            <div
                              key={q.id}
                              className={`flex items-center justify-between gap-2 border-b border-border/40 pb-1 ${
                                claimed ? "text-muted-foreground" : done ? "text-accent" : "text-muted-foreground"
                              }`}
                            >
                              <span>
                                [{claimed ? "✓" : done ? "!" : q.progress(meta.quests)}] {q.name} — {q.desc}
                              </span>
                              {done && !claimed && (
                                <button
                                  onClick={() => redeem(q.id)}
                                  className="pixel-btn pixel-btn-primary shrink-0 px-2 py-1 text-[9px]"
                                >
                                  REDEEM +{q.reward}₽{q.skillPoints ? ` +${q.skillPoints}SP` : ""}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <button onClick={() => setScreen("hideout")} className="pixel-btn pixel-btn-primary mt-3 w-full">
                    BACK TO CAMP
                  </button>
                </Overlay>
              )}

              {s.phase === "hideout" && screen === "region" && (
                <Overlay title="DESTINATIONS" subtitle="Pick your insertion point. Higher threat, better loot.">
                  <RegionMap
                    mapId={mapId}
                    onPick={(id) => setMapId(id)}
                    showBack={false}
                  />
                  <div className="mt-3 font-mono text-[10px] text-muted-foreground">
                    PRIMARY: {WEAPONS[meta.pmc.weapon]?.name ?? "SIDEARM"} · ARMOR:{" "}
                    {meta.pmc.armor ? (ARMORS[meta.pmc.armor]?.name ?? "ARMOR") : "None"} · LOADOUT:{" "}
                    {loadout.length}/{loadoutSlots}
                  </div>
                  {DEV_TOOLS_ENABLED && (
                    <Link
                      to="/dev/map-editor"
                      search={{ map: mapId }}
                      className="pixel-btn mt-3 flex w-full items-center justify-center"
                    >
                      EDIT THIS MAP
                    </Link>
                  )}
                  <button onClick={deploy} className="pixel-btn pixel-btn-primary mt-2 w-full">
                    DEPLOY TO {(MAP_BY_ID[mapId] ?? MAP_DEFS[1]!).name}
                  </button>
                  <button onClick={() => setScreen("hideout")} className="pixel-btn mt-2 w-full">
                    BACK TO CAMP
                  </button>
                </Overlay>
              )}

              {s.phase === "hideout" && screen === "gear" && (
                <Overlay
                  title="EQUIPMENT / RAID PREP"
                  subtitle="Worn kit · carried loadout · owned stash. EQUIP and PACK are chosen per item."
                  layout="fill"
                >
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    <div className="grid min-h-0 flex-1 gap-3 text-left sm:grid-cols-2 lg:grid-cols-[minmax(190px,0.28fr)_minmax(150px,0.22fr)_minmax(0,1fr)] lg:items-stretch">
                    <div className="pixel-card lg:self-start">
                      <div className="font-display text-[10px] text-primary">SCAVLORD KIT</div>
                      <p className="mt-1 font-mono text-[9px] text-muted-foreground">Worn · tap a slot to return it to stash</p>
                      <div className="mt-2 grid gap-2 font-mono text-[10px]">
                        <button
                          onClick={() => unequipPmc("weapon")}
                          className="pixel-card text-left hover:-translate-y-[2px]"
                        >
                          <div className="text-muted-foreground">PRIMARY</div>
                          <div className="text-primary">{WEAPONS[meta.pmc.weapon]?.name ?? "SIDEARM"}</div>
                        </button>
                        <button
                          onClick={() => unequipPmc("armor")}
                          className="pixel-card text-left hover:-translate-y-[2px]"
                        >
                          <div className="text-muted-foreground">BODY ARMOR</div>
                          <div className={meta.pmc.armor ? "text-primary" : "text-muted-foreground"}>
                            {meta.pmc.armor ? (ARMORS[meta.pmc.armor]?.name ?? "ARMOR") : "EMPTY"}
                          </div>
                        </button>
                        <div>
                          <div className="text-muted-foreground">
                            MODS {meta.pmc.attachments.length}/{WEAPONS[meta.pmc.weapon]?.slots ?? 1}
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-1">
                            {Array.from({ length: WEAPONS[meta.pmc.weapon]?.slots ?? 1 }).map((_, i) => {
                              const att = meta.pmc.attachments[i];
                              if (!att)
                                return (
                                  <div
                                    key={`pa-${i}`}
                                    className="h-[42px] border border-dashed border-border/60 bg-background/40"
                                  />
                                );
                              return (
                                <button
                                  key={`pa-${i}-${att}`}
                                  onClick={() => unequipPmc(i)}
                                  title={ATTACHMENTS[att]?.name}
                                  className="h-[42px] overflow-hidden border-2 border-accent bg-background/70 p-1 text-left font-mono text-[8px] leading-tight text-accent hover:-translate-y-[2px]"
                                >
                                  {ATTACHMENTS[att]?.name ?? att}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pixel-card lg:self-start">
                      <div className="font-display text-[10px] text-primary">
                        RAID LOADOUT {loadout.length}/{loadoutSlots}
                      </div>
                      <p className="mt-1 font-mono text-[9px] text-muted-foreground">Carried in · tap a slot to return it to stash</p>
                      <div className="mt-2 grid grid-cols-3 gap-1">
                        {Array.from({ length: loadoutSlots }).map((_, i) => {
                          const item = loadout[i];
                          if (!item)
                            return (
                              <div
                                key={`empty-${i}`}
                                className="h-[42px] border border-dashed border-border/60 bg-background/40"
                              />
                            );
                          return <ItemCell key={item.uid} item={item} onClick={() => fromLoadout(item.uid)} />;
                        })}
                      </div>
                    </div>
                    <div className="pixel-card flex min-h-0 flex-col sm:col-span-2 lg:col-span-1 lg:h-full">
                      <div className="shrink-0">
                        <div className="font-display text-[10px] text-primary">
                          STASH {stash.length}/{stashSlots}
                        </div>
                        <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                          EQUIP → ScavLord kit · PACK → raid loadout
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(["all", "weapon", "attachment", "armor", "meds", "valuable"] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => setStashTab(t)}
                              className={`border px-1 py-[2px] font-mono text-[9px] uppercase ${
                                stashTab === t
                                  ? "border-primary text-primary"
                                  : "border-border/60 text-muted-foreground"
                              }`}
                            >
                              {t === "all" ? "all" : t + "s"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="pixel-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto max-h-[36vh] lg:max-h-none">
                        {sortedStash.length === 0 ? (
                          <div className="font-mono text-[9px] text-muted-foreground">Nothing in this category.</div>
                        ) : (
                          sortedStash.map((item) => (
                            <PrepItemRow
                              key={item.uid}
                              item={item}
                              actions={raidPrepActions(item, kitActions)}
                              onEquip={() => equipOnPmc(item.uid)}
                              onPack={() => toLoadout(item.uid)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                    </div>
                    <button onClick={() => setScreen("hideout")} className="pixel-btn pixel-btn-primary w-full shrink-0">
                      BACK TO CAMP
                    </button>
                  </div>
                </Overlay>
              )}

              {s.phase === "hideout" && screen === "supplies" && (
                <Overlay
                  title="SUPPLIES"
                  subtitle={`What you own / what you need · BANK ${meta.bank.toLocaleString()}₽`}
                  layout="fill"
                >
                  <div className="flex h-full min-h-0 flex-col">
                  <div className="mb-2 flex shrink-0 gap-1 md:hidden">
                    {(["stash", "market"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setSuppliesTab(tab)}
                        className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                          suppliesTab === tab
                            ? "border-primary text-primary"
                            : "border-border/60 text-muted-foreground"
                        }`}
                      >
                        {tab === "stash" ? "stash" : "black market"}
                      </button>
                    ))}
                  </div>
                  <div className="grid min-h-0 flex-1 gap-3 text-left md:grid-cols-2">
                    <div className={suppliesTab === "stash" ? "min-h-0" : "hidden min-h-0 md:block"}>
                      <StashPanel
                        stashSlots={stashSlots}
                        stashCount={stash.length}
                        sortedStash={sortedStash}
                        stashTab={stashTab}
                        setStashTab={setStashTab}
                        onSell={sellFromStash}
                      />
                    </div>
                    <div className={suppliesTab === "market" ? "min-h-0" : "hidden min-h-0 md:block"}>
                      <MarketPanel
                        shopIds={shopIds}
                        shopTab={shopTab}
                        setShopTab={setShopTab}
                        buyMult={mods.buyMult}
                        backpack={meta.backpack}
                        onBuy={buy}
                      />
                    </div>
                  </div>
                  <div className="mt-2 shrink-0 font-display text-[10px] text-primary">BANK {meta.bank.toLocaleString()}₽</div>
                  <button onClick={() => setScreen("hideout")} className="pixel-btn pixel-btn-primary mt-2 w-full shrink-0">
                    BACK TO CAMP
                  </button>
                  </div>
                </Overlay>
              )}


              {s.phase === "loot" && (
                <Overlay
                  title={pendingLoot ? "BACKPACK FULL" : "LOOT FOUND"}
                  subtitle={
                    pendingLoot
                      ? `No free slots (${s.backpack.length}/${backpackSlots()}). Choose an item to replace, or cancel.`
                      : `Wave ${s.wave} cleared — take one · BACKPACK ${s.backpack.length}/${backpackSlots()}${
                          s.backpack.length >= backpackSlots() ? " FULL" : ""
                        }`
                  }
                >
                  {pendingLoot ? (
                    <div className="space-y-3 text-left">
                      <div className="pixel-card">
                        <div className="font-mono text-[9px] uppercase text-muted-foreground">Selected reward</div>
                        <div className="font-display text-[11px]" style={{ color: RARITY_COLOR[pendingLoot.rarity] }}>
                          {pendingLoot.name}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground">{pendingLoot.desc}</div>
                      </div>
                      <div className="font-mono text-[9px] uppercase text-muted-foreground">
                        Current backpack — pick one to discard
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {s.backpack.map((item) => (
                          <button
                            key={item.uid}
                            onClick={() => setSwapUid(item.uid)}
                            className={`pixel-card text-left ${swapUid === item.uid ? "ring-2 ring-primary" : ""}`}
                          >
                            <div className="font-display text-[10px]" style={{ color: RARITY_COLOR[item.rarity] }}>
                              {item.name}
                            </div>
                            <div className="mt-1 font-mono text-[9px] uppercase text-muted-foreground">{item.kind}</div>
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          onClick={confirmLootSwap}
                          disabled={swapUid == null}
                          className="pixel-btn pixel-btn-primary disabled:opacity-40"
                        >
                          CONFIRM SWAP
                        </button>
                        <button onClick={cancelLootSwap} className="pixel-btn">
                          CANCEL
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {choices.map((c) => (
                        <button
                          key={c.uid}
                          onClick={() => takeChoice(c)}
                          className="pixel-card text-left transition-transform hover:-translate-y-1"
                        >
                          <div className="font-display text-[10px]" style={{ color: RARITY_COLOR[c.rarity] }}>
                            {c.name}
                          </div>
                          <div className="mt-1 font-mono text-[9px] uppercase text-muted-foreground">
                            {c.kind}
                          </div>
                          <div className="mt-2 font-mono text-[11px] leading-snug text-muted-foreground">
                            {c.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </Overlay>
              )}

              {s.phase === "extracted" && (
                <Overlay
                  title="RAID EXTRACTED"
                  subtitle={`Out on wave ${s.wave}. Recovered ${extractHaul.length} item(s). Valuables default to KEEP.`}
                >
                  <div className="space-y-3 text-left">
                    <div className="pixel-card">
                      <div className="font-mono text-[9px] uppercase text-muted-foreground">
                        Equipment & loot · {extractGear.length}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-foreground">
                        {extractGear.length
                          ? extractGear.map((i) => i.name).join(" · ")
                          : "None"}
                      </div>
                    </div>
                    <div className="pixel-card">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-[9px] uppercase text-muted-foreground">
                          Valuables · {extractValuables.length}
                        </div>
                        {extractValuables.length > 0 && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => setSellValuableUids(new Set())}
                              className="pixel-btn px-2 py-1 text-[9px]"
                            >
                              KEEP ALL
                            </button>
                            <button
                              onClick={() => setSellValuableUids(new Set(extractValuables.map((i) => i.uid)))}
                              className="pixel-btn px-2 py-1 text-[9px]"
                            >
                              SELL ALL
                            </button>
                          </div>
                        )}
                      </div>
                      {extractValuables.length === 0 ? (
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground">None recovered.</div>
                      ) : (
                        <div className="pixel-scrollbar mt-2 max-h-[180px] space-y-1 overflow-y-auto">
                          {extractValuables.map((i) => {
                            const selling = sellValuableUids.has(i.uid);
                            return (
                              <div
                                key={i.uid}
                                className="flex items-center justify-between gap-2 border-b border-border/40 pb-1"
                              >
                                <span className="font-display text-[10px]" style={{ color: RARITY_COLOR[i.rarity] }}>
                                  {i.name} · {saleValueOf(i).toLocaleString()}₽
                                </span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() =>
                                      setSellValuableUids((cur) => {
                                        const next = new Set(cur);
                                        next.delete(i.uid);
                                        return next;
                                      })
                                    }
                                    className={`pixel-btn px-2 py-1 text-[9px] ${selling ? "" : "pixel-btn-primary"}`}
                                  >
                                    KEEP
                                  </button>
                                  <button
                                    onClick={() =>
                                      setSellValuableUids((cur) => {
                                        const next = new Set(cur);
                                        next.add(i.uid);
                                        return next;
                                      })
                                    }
                                    className={`pixel-btn px-2 py-1 text-[9px] ${selling ? "pixel-btn-primary" : ""}`}
                                  >
                                    SELL
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {!extractPreview.ok && (
                      <div className="pixel-card">
                        <div className="font-display text-[10px] text-destructive">STASH FULL</div>
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                          Need {extractPreview.keptCount} slot(s), {extractPreview.room} free. Sell valuables or leave
                          an incoming item — nothing is deleted automatically.
                        </div>
                        <div className="mt-2 space-y-1">
                          {extractHaul
                            .filter((i) => i.kind !== "valuable" || !sellValuableUids.has(i.uid))
                            .map((i) => (
                              <button
                                key={i.uid}
                                onClick={() => toggleUidSet(i.uid, setLeaveUids)}
                                className={`pixel-btn w-full px-2 py-1 text-left text-[9px] ${
                                  leaveUids.has(i.uid) ? "pixel-btn-primary" : ""
                                }`}
                              >
                                {leaveUids.has(i.uid) ? "LEAVING" : "LEAVE"} · {i.name}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                    <div className="font-mono text-[10px] text-muted-foreground">
                      Selling now: {extractSoldPreview.toLocaleString()}₽ · stash {stash.length}/{stashSlots}
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => toHideout(true)}
                        disabled={!extractPreview.ok}
                        className="pixel-btn pixel-btn-primary disabled:opacity-40"
                      >
                        BACK TO CAMP
                      </button>
                    </div>
                  </div>
                </Overlay>
              )}

              {s.phase === "dead" && (
                <Overlay
                  title={s.pmcDown ? "GAME OVER" : "CHECKPOINT LOST"}
                  subtitle={
                    s.pmcDown
                      ? `${meta.pmc.name} died on wave ${s.wave}. Level, scars and every piece of kit they carried are gone. A new operator takes the contract.`
                      : `Checkpoint fell on wave ${s.wave}. Everything in the pack is gone, your operator crawled out with nothing.`
                  }
                >
                  <button onClick={() => toHideout(false)} className="pixel-btn pixel-btn-primary">
                    BACK TO CAMP
                  </button>
                </Overlay>
              )}

            </div>

            {inRaid && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    gs.current.place = gs.current.place === "operator" ? null : "operator";
                    gs.current.selectedId = null;
                    rerender();
                  }}
                  className={`pixel-btn ${s.place === "operator" ? "pixel-btn-primary" : ""}`}
                >
                  HIRE OPERATOR {recruitCost()}₽
                </button>
                <button
                  onClick={() => {
                    gs.current.place = gs.current.place === "barricade" ? null : "barricade";
                    gs.current.selectedId = null;
                    rerender();
                  }}
                  className={`pixel-btn ${s.place === "barricade" ? "pixel-btn-primary" : ""}`}
                >
                  BARRICADE {BARRICADE_COST}₽
                </button>
                <button
                  onClick={() => {
                    gs.current.place = gs.current.place === "wire" ? null : "wire";
                    gs.current.selectedId = null;
                    rerender();
                  }}
                  className={`pixel-btn ${s.place === "wire" ? "pixel-btn-primary" : ""}`}
                >
                  BARBED WIRE {WIRE_COST}₽
                </button>
                <button onClick={startWave} disabled={s.phase !== "prep"} className="pixel-btn disabled:opacity-40">
                  START WAVE {s.wave + 1} [SPACE]
                </button>
                <button onClick={doExtract} disabled={s.phase !== "prep"} className="pixel-btn disabled:opacity-40">
                  EXTRACT
                </button>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Click an operator to select · click a free tile to move him · drag gear onto him to equip
                </span>
              </div>
            )}
          </div>

          {s.phase !== "hideout" && (
          <aside className="pixel-scrollbar flex flex-col gap-3 lg:max-h-[calc(100dvh-var(--td-chrome,13rem))] lg:overflow-y-auto lg:pr-1 td-side">
            <div className="pixel-card">
              <div className="font-display text-[10px] text-primary">RAID CONTROL</div>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                {s.phase === "prep"
                  ? `Next: WAVE ${s.wave + 1} — ${nextWaveName}`
                  : s.phase === "combat"
                    ? `Contact! ${s.enemies.length} hostiles, ${s.queue.length} inbound.`
                    : s.phase === "loot"
                      ? "Choose your find."
                      : "Raid over."}
              </p>
            </div>

            <div className="pixel-card">
              <div className="font-display text-[10px] text-primary">
                {selected?.pmc ? `${meta.pmc.name} · YOUR OPERATOR` : "OPERATOR"}
              </div>
              {selected ? (
                <div className="mt-2 space-y-2 font-mono text-[11px]">
                  {(() => {
                    const st = towerStats(selected, undefined, mapRef.current);
                    const selPos = towerPos(selected);
                    const lock =
                      selected.manualTargetId != null
                        ? s.enemies.find((e) => e.id === selected.manualTargetId && !isSettledOut(e))
                        : undefined;
                    const losBlocked =
                      selected.targetMode === "MANUAL" &&
                      !!lock &&
                      inRange(selPos, st.range, lock) &&
                      !hasLineOfSight(
                        mapRef.current,
                        { x: selPos.x, y: selPos.y, surface: selected.surface ?? "GROUND" },
                        { x: lock.x, y: lock.y, surface: lock.surface ?? "GROUND" },
                      );
                    const status = combatStatus(
                      selected.reloadLeft,
                      selected.engageTargetId != null && !losBlocked,
                      selected.targetMode === "MANUAL" && selected.manualTargetId == null,
                      isOperatorMoving(selected),
                    );
                    const mag = st.magSize;
                    return (
                      <>
                  <div className="flex justify-between text-foreground">
                    <span>{st.weapon.name}</span>
                    <span className="text-primary">{status}</span>
                  </div>
                  {selected.pmc && (
                    <StatRow
                      label="LEVEL"
                      value={`${selected.level ?? 1} (${selected.xp ?? 0}/${xpForLevel(selected.level ?? 1)} XP)`}
                    />
                  )}
                  <StatRow label="HP" value={`${Math.max(0, Math.round(selected.hp))}/${selected.maxHp}`} />
                  <StatRow label="AMMO" value={`${selected.ammo} / ${mag}`} />
                  {selected.reloadLeft > 0 && st.reloadType === "MAGAZINE" && (
                    <div>
                      <StatRow label="RELOAD" value={`${Math.ceil(selected.reloadLeft / 100) / 10}s`} />
                      <div className="mt-1 h-1 border border-border bg-transparent">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.round(reloadProgress(selected.reloadLeft, st.reloadMs) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {selected.reloadLeft > 0 && st.reloadType === "PER_ROUND" && (
                    <StatRow
                      label="LOADING"
                      value={`SHELL ${Math.min(mag, selected.ammo + 1)} / ${mag}`}
                    />
                  )}
                  <StatRow
                    label="TARGET"
                    value={
                      selected.targetMode === "MANUAL" && selected.manualTargetId == null
                        ? "SELECT TARGET"
                        : selected.engageTargetId != null
                          ? `#${selected.engageTargetId}`
                          : "NONE"
                    }
                  />
                  {losBlocked && <StatRow label="LOS" value="BLOCKED" />}
                  <StatRow label="DMG" value={st.damage.toFixed(1)} />
                  <StatRow label="RANGE" value={st.range.toFixed(0)} />
                  <StatRow label="ACC" value={`${Math.round(st.accuracy * 100)}%`} />
                  <StatRow label="FIRE" value={`${(60000 / st.cooldown).toFixed(0)} RPM`} />
                  <StatRow
                    label="CYCLE"
                    value={
                      st.reloadType === "PER_ROUND"
                        ? `${(st.reloadMs / 1000).toFixed(1)}s / SHELL`
                        : `${(st.reloadMs / 1000).toFixed(1)}s MAG`
                    }
                  />
                  {selected.armor ? (
                    <>
                      <StatRow
                        label="ARMOR"
                        value={`${ARMORS[selected.armor]?.name ?? "ARMOR"} · ${Math.round((ARMORS[selected.armor]?.reduction ?? 0) * 100)}%`}
                      />
                      <StatRow
                        label="DURABILITY"
                        value={`${Math.round(selected.armorHp ?? 0)}/${ARMORS[selected.armor]?.durability ?? 0}`}
                      />
                      <button type="button" className="pixel-btn w-full" onClick={() => stripArmor(selected.id)}>
                        DETACH ARMOR
                      </button>
                    </>
                  ) : (
                    <StatRow label="ARMOR" value="NONE" />
                  )}
                  <StatRow
                    label="MOVE"
                    value={`${getOperatorMoveSpeed(selected).toFixed(2)} T/S`}
                  />
                  <StatRow label="LOAD" value={getEquippedWeight(selected).toFixed(1)} />
                  <StatRow
                    label="COVER"
                    value={
                      bestCoverAt(coverList(mapRef.current, s), selected.tx, selected.ty) >= 0.7
                        ? "HARD SIDE (-70%)"
                        : bestCoverAt(coverList(mapRef.current, s), selected.tx, selected.ty) >= 0.4
                          ? "HALF SIDE (-40%)"
                          : "EXPOSED"
                    }
                  />
                  <div className="pt-1">
                    <div className="mb-1 text-[9px] tracking-wide text-muted-foreground">TARGETING</div>
                    <div className="flex flex-wrap gap-1">
                      {TARGET_MODES.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`pixel-btn px-1 py-0 text-[9px] ${
                            selected.targetMode === mode ? "text-primary" : "text-muted-foreground"
                          }`}
                          onClick={() => {
                            selected.targetMode = mode;
                            if (mode !== "MANUAL") selected.manualTargetId = null;
                            rerender();
                          }}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pt-1">
                    <div className="mb-1 text-[9px] tracking-wide text-muted-foreground">ATTACHMENTS</div>
                    {(["optic", "barrel", "magazine"] as AttachSlot[]).map((slot) => {
                      const fitted = selected.attachments.find((a) => slotOf(a) === slot);
                      return (
                        <div key={slot} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1">
                          <span className="text-muted-foreground">{SLOT_LABEL[slot]}</span>
                          <span className="flex items-center gap-1 text-foreground">
                            {fitted ? (ATTACHMENTS[fitted]?.name ?? fitted) : "EMPTY"}
                            {fitted && (
                              <button
                                type="button"
                                className="pixel-btn px-1 py-0 text-[8px]"
                                onClick={() => detachFromTower(selected.id, fitted)}
                              >
                                DETACH
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {selected.attachments
                      .filter((a) => slotOf(a) === "mod")
                      .map((a) => (
                        <div key={a} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1">
                          <span className="text-muted-foreground">MOD</span>
                          <span className="flex items-center gap-1 text-foreground">
                            {ATTACHMENTS[a]?.name ?? a}
                            <button
                              type="button"
                              className="pixel-btn px-1 py-0 text-[8px]"
                              onClick={() => detachFromTower(selected.id, a)}
                            >
                              DETACH
                            </button>
                          </span>
                        </div>
                      ))}
                  </div>
                  {selected.pmc ? (
                    <p className="text-[10px] text-destructive">
                      If they die the run ends for good — level, scars and kit are wiped.
                    </p>
                  ) : (
                    <button onClick={doDismiss} className="pixel-btn w-full">
                      DISMISS (KEEP GEAR)
                    </button>
                  )}
                      </>
                    );
                  })()}
                </div>
              ) : selBarricade ? (
                <div className="mt-2 space-y-2 font-mono text-[11px]">
                  <div className="text-foreground">
                    {selBarricade.kind === "wire"
                      ? "BARBED WIRE"
                      : `BARRICADE · ${selBarricade.edge ? EDGE_LABEL[selBarricade.edge] : "EDGE"} · LVL ${selBarricade.level}`}
                  </div>
                  <StatRow
                    label="HP"
                    value={`${Math.max(0, Math.round(selBarricade.hp))}/${Math.round(selBarricade.maxHp)}`}
                  />
                  {selBarricade.kind === "barricade" && (
                    <button
                      onClick={upgradeBarricade}
                      disabled={selBarricade.level >= MAX_BARRICADE_LEVEL}
                      className="pixel-btn w-full disabled:opacity-40"
                    >
                      {selBarricade.level >= MAX_BARRICADE_LEVEL
                        ? "FULLY REINFORCED"
                        : `REINFORCE ${upgradeCost(selBarricade.level)}₽`}
                    </button>
                  )}
                  <button
                    onClick={repairSelectedDefense}
                    disabled={!canRepairDefense(s.phase, selBarricade.hp, selBarricade.maxHp)}
                    className="pixel-btn w-full disabled:opacity-40"
                  >
                    {s.phase !== "prep"
                      ? "REPAIR BETWEEN WAVES"
                      : selBarricade.hp >= selBarricade.maxHp
                        ? "INTACT"
                        : `REPAIR ${repairCost(selBarricade.kind)}₽`}
                  </button>
                </div>
              ) : (
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  Your operator deploys with a sidearm. Hired guns start with a sawed-off —
                  loot better weapons, mods and armor, then drag them on.
                </p>
              )}
            </div>


            <div className="pixel-card">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display text-[10px] text-primary">
                  BACKPACK {s.backpack.length}/{backpackSlots()}
                  {s.backpack.length >= backpackSlots() ? " FULL" : ""}
                </div>
                {s.backpack.length >= backpackSlots() && (
                  <span className="font-mono text-[10px] text-destructive">FULL</span>
                )}
              </div>
              {DEV_TOOLS_ENABLED && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    className="pixel-btn pixel-btn-primary w-full"
                    onClick={() => setDevPickerOpen((open) => !open)}
                  >
                    DEV ADD
                  </button>
                  <button type="button" className="pixel-btn w-full" onClick={clearDevBackpack}>
                    DEV CLEAR
                  </button>
                </div>
              )}
              {DEV_TOOLS_ENABLED && devPickerOpen && (
                <DevItemPicker onPick={addDevBackpackItem} onClose={() => setDevPickerOpen(false)} />
              )}
              <div className="mt-2 grid grid-cols-2 gap-1">
                {Array.from({ length: backpackSlots() }).map((_, i) => {
                  const item = s.backpack[i];
                  if (!item)
                    return <div key={`empty-${i}`} className="h-[46px] border border-dashed border-border/60 bg-background/40" />;
                  return (
                    <BackpackCell
                      key={item.uid}
                      item={item}
                      onDragStart={() => {
                        dragUid.current = item.uid;
                      }}
                      onClick={() => {
                        if (s.selectedId) equipOnTower(item.uid, s.selectedId);
                        else pushLog("Select an operator first, or drag the item onto him.");
                      }}
                      onContext={() => scrapInRaid(item.uid)}
                    />
                  );
                })}
              </div>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                Extract to move this gear to the stash. Valuables can be kept or sold after extract.
                Tap an item to equip it, hold (or right-click) to scrap it on site for raid funds at a
                much better rate.
              </p>
            </div>

            <div className="pixel-card">
              <div className="font-display text-[10px] text-primary">FIELD NOTES</div>
              <div className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
                <div>Hired guns are identical — the weapon makes the difference.</div>
                <div>Crates only crack open during a wave — hold one for {CRATE_TIME}s.</div>
                <div>Barricades give hard cover; barbed wire on the road cripples runners.</div>
                <div>KIA operators drop their weapon and mods on the ground — click the bag.</div>
                <div>Cover blocks fire only from its own side. Stand beside it.</div>
              </div>
            </div>

            <div className="pixel-card">
              <div className="font-display text-[10px] text-primary">RADIO</div>
              <ul className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
                {log.map((l, i) => (
                  <li key={i} className={i === 0 ? "text-foreground" : ""}>
                    &gt; {l}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
          )}
        </div>
      </div>
      {DEV_TOOLS_ENABLED && balanceLabOpen && (
        <BalanceLab enabled={DEV_TOOLS_ENABLED} onClose={() => setLabs("none")} onApplied={onBalanceApplied} />
      )}
      {DEV_TOOLS_ENABLED && economyLabOpen && (
        <EconomyLab enabled={DEV_TOOLS_ENABLED} onClose={() => setLabs("none")} onApplied={() => rerender()} />
      )}
      {DEV_TOOLS_ENABLED && waveLabOpen && (
        <WaveLab
          enabled={DEV_TOOLS_ENABLED}
          inRaid={s.phase !== "hideout" && s.phase !== "dead" && s.phase !== "extracted"}
          mapId={mapId}
          onClose={() => setLabs("none")}
          onApplied={() => rerender()}
          onTestWave={onTestWave}
          onResetTest={onResetTest}
        />
      )}
    </div>
  );
}

function RegionMap({
  mapId,
  onPick,
  onBack,
  showBack = true,
}: {
  mapId: string;
  onPick: (id: string) => void;
  onBack?: () => void;
  showBack?: boolean;
}) {
  const active = MAP_BY_ID[mapId] ?? MAP_DEFS[1]!;
  return (
    <div className="space-y-3">
      <div className="pixel-frame relative h-[300px] w-full overflow-hidden bg-[#1d2318]">
        {/* terrain wash */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 35%, #2f3a26 0 18%, transparent 19%), radial-gradient(circle at 72% 62%, #2a3122 0 22%, transparent 23%), linear-gradient(180deg,#232a1d,#1a1f16)",
          }}
        />
        {/* grid */}
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "linear-gradient(to right,#6f7f52 1px,transparent 1px),linear-gradient(to bottom,#6f7f52 1px,transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* river */}
        <div className="absolute left-0 top-[70%] h-[8px] w-full -rotate-6 bg-[#2b4a58]" />
        {MAP_DEFS.map((m) => {
          const on = m.id === mapId;
          const tone =
            m.threat === 3 ? "#ff5a3c" : m.threat === 2 ? "#f0b400" : "#8fd14f";
          return (
            <button
              key={m.id}
              onClick={() => onPick(m.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-left"
              style={{ left: `${m.geo.x}%`, top: `${m.geo.y}%` }}
            >
              <span
                className="block h-[14px] w-[14px] border-2"
                style={{
                  borderColor: tone,
                  background: on ? tone : "transparent",
                  boxShadow: on ? `0 0 0 6px ${tone}22` : "none",
                }}
              />
              <span
                className="mt-1 block whitespace-nowrap font-display text-[9px]"
                style={{ color: on ? tone : "#c9c2a6" }}
              >
                {m.name}
              </span>
              <span className="block whitespace-nowrap font-mono text-[8px] text-muted-foreground">
                {m.sector} · {"■".repeat(m.threat)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="pixel-card text-left font-mono text-[11px]">
        <div className="font-display text-[10px] text-primary">
          {active.name} · {active.sector}
        </div>
        <div className="mt-1 text-muted-foreground">{active.desc}</div>
        <div className="mt-1 text-muted-foreground">
          Enemy HP x{active.hpMult} · Loot x{active.lootMult}
        </div>
      </div>

      {showBack && (
        <button onClick={onBack} className="pixel-btn pixel-btn-primary w-full">
          BACK TO CAMP
        </button>
      )}
    </div>
  );
}

function BackpackCell({
  item,
  onClick,
  onContext,
  onDragStart,
}: {
  item: Item;
  onClick: () => void;
  onContext: () => void;
  onDragStart: () => void;
}) {
  const lp = useLongPress(onContext);
  return (
    <button
      draggable
      onDragStart={onDragStart}
      {...lp.handlers}
      onClick={() => {
        if (lp.firedRef.current) {
          lp.firedRef.current = false;
          return;
        }
        onClick();
      }}
      onContextMenu={(ev) => {
        ev.preventDefault();
        onContext();
      }}
      title={`${item.desc} · tap to equip, hold to scrap for raid funds`}
      className="h-[46px] touch-none select-none border-2 bg-background/70 p-1 text-left font-mono text-[9px] leading-tight hover:-translate-y-[2px]"
      style={{ borderColor: RARITY_COLOR[item.rarity], color: RARITY_COLOR[item.rarity] }}
    >
      {item.name}
      <div className="mt-1 text-[8px] uppercase text-muted-foreground">{item.kind}</div>
    </button>
  );
}

function useLongPress(onLong?: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    firedRef: fired,
    handlers: {
      onPointerDown: () => {
        if (!onLong) return;
        fired.current = false;
        clear();
        timer.current = setTimeout(() => {
          fired.current = true;
          onLong();
        }, ms);
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
  };
}

function PrepItemRow({
  item,
  actions,
  onEquip,
  onPack,
}: {
  item: Item;
  actions: RaidPrepAction[];
  onEquip: () => void;
  onPack: () => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border/40 py-1">
      <div className="min-w-0 flex-1 text-left font-mono text-[9px] leading-tight" style={{ color: RARITY_COLOR[item.rarity] }}>
        <div className="truncate">{item.name}</div>
        <div className="uppercase text-muted-foreground">{item.kind}</div>
      </div>
      {actions.includes("equip") && (
        <button type="button" onClick={onEquip} className="pixel-btn shrink-0 px-1 py-1 text-[8px]">
          EQUIP
        </button>
      )}
      {actions.includes("pack") && (
        <button type="button" onClick={onPack} className="pixel-btn shrink-0 px-1 py-1 text-[8px]">
          PACK
        </button>
      )}
    </div>
  );
}

type StashKindTab = "all" | "weapon" | "attachment" | "armor" | "meds" | "valuable";
type ShopKindTab = "weapon" | "attachment" | "armor" | "backpack" | "meds";

function StashPanel({
  stashSlots,
  stashCount,
  sortedStash,
  stashTab,
  setStashTab,
  onSell,
}: {
  stashSlots: number;
  stashCount: number;
  sortedStash: Item[];
  stashTab: StashKindTab;
  setStashTab: (tab: StashKindTab) => void;
  onSell: (uid: number) => void;
}) {
  return (
    <div className="pixel-card flex max-h-[min(360px,50dvh)] min-h-0 flex-col text-left md:max-h-[min(440px,58dvh)]">
      <div className="shrink-0">
        <div className="font-display text-[10px] text-primary">
          STASH {stashCount}/{stashSlots}
        </div>
        <p className="mt-1 font-mono text-[9px] text-muted-foreground">Hold / right-click to sell</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {(["all", "weapon", "attachment", "armor", "meds", "valuable"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setStashTab(t)}
              className={`border px-1 py-[2px] font-mono text-[9px] uppercase ${
                stashTab === t ? "border-primary text-primary" : "border-border/60 text-muted-foreground"
              }`}
            >
              {t === "all" ? "all" : t + "s"}
            </button>
          ))}
        </div>
      </div>
      <div className="pixel-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
          {Array.from({ length: stashSlots }).map((_, i) => {
            const item = sortedStash[i];
            if (!item)
              return (
                <div key={`empty-${i}`} className="h-[42px] border border-dashed border-border/60 bg-background/40" />
              );
            return <ItemCell key={item.uid} item={item} onContext={() => onSell(item.uid)} />;
          })}
        </div>
      </div>
    </div>
  );
}

function MarketPanel({
  shopIds,
  shopTab,
  setShopTab,
  buyMult,
  backpack,
  onBuy,
}: {
  shopIds: string[];
  shopTab: ShopKindTab;
  setShopTab: (tab: ShopKindTab) => void;
  buyMult: number;
  backpack: string;
  onBuy: (id: string) => void;
}) {
  const rows = shopIds.filter((id) => ITEM_BY_ID[id]!.kind === shopTab);
  return (
    <div className="pixel-card flex max-h-[min(360px,50dvh)] min-h-0 flex-col text-left md:max-h-[min(440px,58dvh)]">
      <div className="shrink-0">
        <div className="font-display text-[10px] text-primary">BLACK MARKET</div>
        <p className="mt-1 font-mono text-[9px] text-muted-foreground">Buy into stash · quests unlock stock</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {(["weapon", "attachment", "armor", "backpack", "meds"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setShopTab(t)}
              className={`border px-1 py-[2px] font-mono text-[9px] uppercase ${
                shopTab === t ? "border-primary text-primary" : "border-border/60 text-muted-foreground"
              }`}
            >
              {t === "backpack" ? "packs" : t + "s"}
            </button>
          ))}
        </div>
      </div>
      <div className="pixel-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-1">
          {rows.map((id) => {
            const def = effectiveItemDef(id) ?? ITEM_BY_ID[id]!;
            const price = Math.round(def.price! * buyMult);
            const owned =
              def.kind === "backpack" && (BACKPACKS[def.ref!]?.bonus ?? 0) <= (BACKPACKS[backpack]?.bonus ?? 0);
            return (
              <button
                key={id}
                onClick={() => onBuy(id)}
                disabled={owned}
                title={def.desc}
                className="flex w-full items-center justify-between border border-border/60 px-2 py-1 font-mono text-[10px] hover:border-primary disabled:opacity-40"
              >
                <span style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}</span>
                <span className="text-primary">{owned ? "OWNED" : `${price}₽`}</span>
              </button>
            );
          })}
          {rows.length === 0 && (
            <div className="font-mono text-[9px] text-muted-foreground">Nothing unlocked in this section yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemCell({
  item,
  onClick,
  onContext,
}: {
  item: Item;
  onClick?: () => void;
  onContext?: () => void;
}) {
  const lp = useLongPress(onContext);
  return (
    <button
      {...lp.handlers}
      onClick={() => {
        if (lp.firedRef.current) {
          lp.firedRef.current = false;
          return;
        }
        onClick?.();
      }}
      onContextMenu={
        onContext
          ? (ev) => {
              ev.preventDefault();
              onContext();
            }
          : undefined
      }
      title={`${item.name} — ${item.desc} · ${saleValueOf(item)}₽${onContext ? " · hold / right-click to sell" : ""}`}
      className="h-[42px] touch-none select-none overflow-hidden border-2 bg-background/70 p-1 text-left font-mono text-[8px] leading-tight hover:-translate-y-[2px]"
      style={{ borderColor: RARITY_COLOR[item.rarity], color: RARITY_COLOR[item.rarity] }}
    >
      {item.name}
      <div className="mt-[2px] text-[7px] uppercase text-muted-foreground">{item.kind}</div>
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gold" | "good" | "bad" }) {
  const color =
    tone === "gold"
      ? "text-primary"
      : tone === "bad"
        ? "text-destructive"
        : tone === "good"
          ? "text-accent"
          : "text-foreground";
  return (
    <div className="pixel-chip">
      <span className="text-muted-foreground">{label}</span>
      <span className={`ml-2 ${color}`}>{value}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/60 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function Overlay({
  title,
  subtitle,
  children,
  layout = "center",
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  layout?: "center" | "fill";
}) {
  const fill = layout === "fill";
  return (
    <div
      className={`absolute inset-0 z-10 flex flex-col items-center gap-2 bg-background/90 p-3 text-center backdrop-blur-[2px] pixel-scrollbar sm:p-4 ${
        fill ? "overflow-hidden" : "justify-center overflow-auto"
      }`}
    >
      <h2 className="shrink-0 font-display text-base text-primary sm:text-lg">{title}</h2>
      <p className="shrink-0 font-mono text-[11px] text-muted-foreground">{subtitle}</p>
      <div
        className={`w-full ${
          fill ? "flex min-h-0 flex-1 flex-col overflow-hidden max-w-6xl" : "max-w-4xl"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
