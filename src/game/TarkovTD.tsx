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
  logicalNode,
  operatorCanFire,
  operatorMoveSpeedPx,
  operatorWorldPos,
  getOperatorMoveSpeed,
  resolveMoveDestination,
  stepOperatorMove,
} from "./movement";
import {
  BATTLE_TIME_MODE_ORDER,
  battleTimeModeLabel,
  battleTimeModeTitle,
  createBattleTimeState,
  resetBattleTimeState,
  resolveEffectiveBattleTimeScale,
  setBattleTimeMode,
  simulationStepsFromWallDt,
  toggleBattleTimePause,
  type BattleTimeMode,
  type BattleTimeState,
} from "./battleTime";
import { clearOperatorOrders, dispatchOperatorCommand } from "./operatorCommands";
import {
  beginPauseReloadSession,
  canCancelPausedReload,
  createPauseReloadSession,
  noteReloadAuthoredInPause,
  type PauseReloadSession,
} from "./tacticalCommandUi";
import {
  appendOrder,
  beginPlanExecution,
  clearAllPlans,
  clearFutureOrders,
  clearPlan,
  createEmptyPlan,
  onMoveStepComplete,
  onReloadTickComplete,
  planMoveWaypoints,
  planSummary,
  removeOrderAt,
  replaceOrderAt,
  resolveLeftClickMovePlan,
  setPlan,
  startAllPlanned,
  type OperatorPlan,
  type OperatorPlanBook,
} from "./operatorPlans";
import { OrdersPanel, type OrdersEditorMode } from "./OrdersPanel";
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
  type SightPos,
} from "./los";
import {
  armorItemId,
  detachArmor,
  detachAttachment,
  dropEquippedGear,
  equippedMagSize,
  equipArmor,
  equipAttachment,
  expandPackedWeapon,
  swapRaidWeapon,
} from "./raidGear";
import { fittedWeaponStats, mountRowsForWeapon } from "./weaponAttachments";
import { scavVisualMods } from "./weaponVisuals";
import {
  DEFAULT_BULLET_SPEED,
  ENEMY_HIT_RADIUS,
  getShotDispersion,
  isInFiringSector,
  spawnRifleShot,
  spawnShotgunBlast,
  tickProjectile,
  type Projectile,
  type ProjectileHitEvent,
  type ProjectileTickEnemy,
} from "./shooting";
import {
  enemyBroadphaseRadius,
  enemyWorldBounds,
  resolveEnemyHitZones,
  resolveHitZoneAtPoint,
} from "./enemyHitZones";
import {
  applyDamageReaction,
  canFireNow,
  freshBehaviorRuntime,
  movementSpeedMult,
  tickBehaviorRuntime,
} from "./enemyBehavior";
import {
  aliveOperators,
  capabilityFromMeta,
  crewOccupancy,
  ensureRadio,
  findOperator,
  hireCandidate,
  hireUniqueContact,
  markOperatorDead,
  progressionFactsFromMeta,
  refreshRecruitmentPoolIfNeeded,
  regenerateRecruitmentPool,
  requestNewTransmission,
} from "./operators/crew";
import {
  QUEST_SPEC_BY_ID,
  QUEST_SPECS,
  applyRaidQuestProgress,
  listAvailableQuestIds,
  listNewlyUnlockedQuestIds,
  type QuestUnlockContext,
} from "./quests";
import PlayerQuestsPanel, { type PlayerQuestFilter } from "./PlayerQuestsPanel";
import ProgressionNoticeModal from "./ProgressionNoticeModal";
import { redeemQuest, unlockContextFromMeta } from "./questRedeem";
import {
  buildNewQuestsNotice,
  type ProgressionNotice,
} from "./progressionNotifications";
import { nextRetransmissionCashCost, CANONICAL_RETRANSMISSION } from "./operators/retransmission";
import {
  advanceUniqueLifecycle,
  getUniqueContactProgress,
  isUniqueContactActiveTransmission,
  maybeTriggerUniqueDistress,
  setUniqueLifecycle,
  settleUniqueTransmission,
  syncUniqueEligibility,
  uniqueContactRequirementsMet,
  uniqueTransmissionForLifecycle,
  UNIQUE_OPERATOR_BY_ID,
  getUniqueOperatorDisplayName,
} from "./operators/uniqueOperators";
import { freshRadioProgression, radioStatePresentation } from "./operators/radioProgression";
import { evaluateRequirement } from "./operators/recruitmentRequirements";
import {
  stashEntriesFromItems,
} from "./operators/equipment";
import {
  LEADER_EQUIPMENT_OWNER_ID,
  coerceEquipmentOwnerId,
  equipOnEquipmentOwner,
  unequipFromEquipmentOwner,
  setOwnerScavMods,
  type EquipmentOwnerId,
} from "./operators/crewEquipment";
import { getRaidOperatorTitle, getRaidOperatorDisplayName } from "./operators/raidIdentity";
import CrewEquipmentPanel from "./CrewEquipmentPanel";
import ArmoryPanel from "./ArmoryPanel";
import { PERKS, crewStatRows, type PersistentOperator } from "./operators";
import RecruitmentPanel, { RECRUITMENT_SUBTITLE } from "./operators/RecruitmentPanel";
import {
  operatorAccuracyBonus,
  operatorEffectiveWeight,
  operatorMaxHp as persistentOperatorMaxHp,
  operatorReloadMult,
  resolveCombatMods,
  syncOperatorEquipmentFromTower,
} from "./operators/runtime";
import { operatorSpeedMultiplier, OPERATOR_MOVE_SPEED_TILES } from "./movement";
import CampHub from "./hub/CampHub";
import { CAMP_IMAGE_H, CAMP_IMAGE_W, type HubAction } from "./hub/hotspots";

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
import QuestEditor from "./dev/QuestEditor";
import RecruitmentLab from "./dev/RecruitmentLab";
import { initRecruitmentLab } from "./operators/recruitmentLabCore";
import {
  effectiveEnemy,
  effectiveWave,
  requestTestWave,
} from "./dev/waveLabCore";
import {
  getQuestLabOverrides,
  isQuestTestActive,
  noteQuestTestEvent,
  requestTestQuest,
  resetQuestTestProgress,
} from "./dev/questLab";
import { syncDevForcedQuestProgression } from "./dev/questForceCompleteSync";
import { effectiveClaimedQuestIds } from "./dev/questForceComplete";
import {
  effectiveItemDef,
  effectiveLootMult,
  lootRuntimeForSource,
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
  /** Traveling physical projectiles (damage on impact). */
  projectiles: Projectile[];
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
    projectiles: [],
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

export function towerStats(t: Tower, mods?: DebuffMods, map?: GameMap, meta?: Meta) {
  const w = weaponDef(t.weapon);
  const fitted = fittedWeaponStats(t.weapon, t.attachments, t.scavMods);
  let damage = fitted.damage;
  let range = fitted.range * SCALE;
  let cooldown = fitted.cooldown;
  let accuracy = fitted.accuracy;
  let pen = applyAttachmentMods(w, t.attachments, attachmentDef).pen;
  const splash = w.splash * SCALE;
  const operatorMods = t.operatorId && meta ? resolveCombatMods(findOperator(meta, t.operatorId) ?? { stats: { aim: 50, toughness: 50, handling: 50, mobility: 50 }, traitIds: [], perkIds: [] }) : null;
  if (t.pmc) {
    const lvl = t.level ?? 1;
    damage *= 1 + (lvl - 1) * 0.05;
    accuracy += (lvl - 1) * 0.02;
    if (mods) {
      accuracy += mods.pmcAcc;
      cooldown /= mods.pmcRof;
    }
  }
  if (operatorMods) {
    accuracy += operatorAccuracyBonus(operatorMods);
    cooldown *= operatorReloadMult(operatorMods);
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
    slots: w.slots,
    magSize: fitted.magSize,
    reloadMs: fitted.reloadMs,
    reloadType: w.reloadType,
    spread: fitted.spread,
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

function towerMoveSpeedPx(t: Tower, meta?: Meta): number {
  const kit = { weapon: t.weapon, attachments: t.attachments, armor: t.armor ?? null };
  const scav = scavVisualMods(t.weapon, t.scavMods);
  let weight = getEquippedWeight(kit) + scav.weightAdd;
  if (t.operatorId && meta) {
    const op = findOperator(meta, t.operatorId);
    if (op) weight = operatorEffectiveWeight(kit, resolveCombatMods(op)) + scav.weightAdd;
  }
  return OPERATOR_MOVE_SPEED_TILES * operatorSpeedMultiplier(weight) * scav.moveMult * TILE;
}

function findDeployTiles(map: GameMap, s: GameState, count: number) {
  const primary = pmcSpawnTile(map, s);
  const tiles = [primary];
  const steps = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
  ];
  for (const d of steps) {
    if (tiles.length >= count) break;
    const tx = primary.tx + d.dx;
    const ty = primary.ty + d.dy;
    if (operatorPlaceableFor(map, s, tx, ty)) tiles.push({ tx, ty, score: 0 });
  }
  while (tiles.length < count) tiles.push(primary);
  return tiles;
}

function spawnPersistentOperatorTower(
  s: GameState,
  map: GameMap,
  op: PersistentOperator,
  spot: { tx: number; ty: number },
  debuffHpMult: number,
) {
  const hp = persistentOperatorMaxHp(op, debuffHpMult);
  const armorDef = op.equipment.armor ? ARMORS[op.equipment.armor] : undefined;
  s.towers.push({
    id: s.nextId++,
    tx: spot.tx,
    ty: spot.ty,
    surface: operatorPlacementSurface(map, spot.tx, spot.ty) ?? "GROUND",
    weapon: op.equipment.weapon,
    attachments: [...op.equipment.attachments],
    cd: 0,
    angle: 0,
    flash: 0,
    kills: 0,
    hp,
    maxHp: hp,
    hurt: 0,
    operatorId: op.id,
    armor: op.equipment.armor,
    armorHp: armorDef ? armorDef.durability : 0,
    scavMods: op.equipment.scavMods
      ? { ...op.equipment.scavMods, parts: { ...op.equipment.scavMods.parts } }
      : null,
    ...weaponRuntimeFields(op.equipment.weapon),
  });
}


export default function TarkovTD() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const metaRef = useRef<Meta>(loadMeta());
  const uidRef = useRef(1);
  const [mapId, setMapId] = useState<string>("kolkhoz");
  const [screen, setScreen] = useState<"hideout" | "region" | "skills" | "gear" | "armory" | "supplies" | "radio">("hideout");
  const [editMode, setEditMode] = useState(false);
  const [suppliesTab, setSuppliesTab] = useState<"stash" | "market">("stash");
  const [scavTab, setScavTab] = useState<"overview" | "skills" | "quests" | "crew">("overview");
  const [selectedRecruitId, setSelectedRecruitId] = useState<string | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const [selectedEquipOwnerId, setSelectedEquipOwnerId] = useState<EquipmentOwnerId>(
    LEADER_EQUIPMENT_OWNER_ID,
  );
  const [deployOperatorIds, setDeployOperatorIds] = useState<string[]>(() =>
    aliveOperators(loadMeta()).map((o) => o.id),
  );
  const [shopTab, setShopTab] = useState<"weapon" | "attachment" | "armor" | "backpack" | "meds">("weapon");
  const [stashTab, setStashTab] = useState<
    "all" | "weapon" | "attachment" | "armor" | "meds" | "valuable"
  >("all");
  const [questFilter, setQuestFilter] = useState<PlayerQuestFilter>("active");
  const [progressionNotices, setProgressionNotices] = useState<ProgressionNotice[]>([]);
  const [devPickerOpen, setDevPickerOpen] = useState(false);
  const [balanceLabOpen, setBalanceLabOpen] = useState(false);
  const [economyLabOpen, setEconomyLabOpen] = useState(false);
  const [waveLabOpen, setWaveLabOpen] = useState(false);
  const [questLabOpen, setQuestLabOpen] = useState(false);
  const [recruitmentLabOpen, setRecruitmentLabOpen] = useState(false);
  const labOpenRef = useRef(false);
  const mapRef = useRef<GameMap>(buildMap(MAP_BY_ID["kolkhoz"]!));
  const gs = useRef<GameState>(freshState([], "hideout", mapRef.current));
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const [choices, setChoices] = useState<Item[]>([]);
  const [pendingLoot, setPendingLoot] = useState<Item | null>(null);
  const [swapUid, setSwapUid] = useState<number | null>(null);
  const [ordersOpenFor, setOrdersOpenFor] = useState<number | null>(null);
  const [ordersDraft, setOrdersDraft] = useState<OperatorPlan>(() => createEmptyPlan());
  const [ordersEditorMode, setOrdersEditorMode] = useState<OrdersEditorMode>({ kind: "idle" });
  const ordersEditorModeRef = useRef<OrdersEditorMode>({ kind: "idle" });
  const planBookRef = useRef<OperatorPlanBook>(new Map());
  const battleTimeRef = useRef<BattleTimeState>(createBattleTimeState());
  const pauseReloadSessionRef = useRef<PauseReloadSession>(createPauseReloadSession());
  const [battleTimeMode, setBattleTimeModeUi] = useState<BattleTimeMode>("NORMAL");
  const syncBattleTimeUi = useCallback(() => {
    setBattleTimeModeUi(battleTimeRef.current.mode);
  }, []);
  const setOrdersMode = useCallback((mode: OrdersEditorMode) => {
    ordersEditorModeRef.current = mode;
    setOrdersEditorMode(mode);
  }, []);
  const closeOrdersUi = useCallback(() => {
    setOrdersOpenFor(null);
    setOrdersMode({ kind: "idle" });
  }, [setOrdersMode]);
  const applyBattleTimeMode = useCallback(
    (mode: BattleTimeMode) => {
      const prev = battleTimeRef.current.mode;
      battleTimeRef.current = setBattleTimeMode(battleTimeRef.current, mode);
      if (mode === "PAUSED" && prev !== "PAUSED") {
        pauseReloadSessionRef.current = beginPauseReloadSession(pauseReloadSessionRef.current);
      }
      if (prev === "PAUSED" && mode !== "PAUSED") {
        startAllPlanned(planBookRef.current, gs.current.towers, mapRef.current);
        closeOrdersUi();
      }
      if (mode !== "PAUSED") setOrdersMode({ kind: "idle" });
      syncBattleTimeUi();
      rerender();
    },
    [closeOrdersUi, rerender, setOrdersMode, syncBattleTimeUi],
  );
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
    m.stash = stashEntriesFromItems([...nextStash, ...nextLoadout]);
    saveMeta(m);
  }, []);

  useEffect(() => {
    initRecruitmentLab(DEV_TOOLS_ENABLED);
    if (DEV_TOOLS_ENABLED) {
      syncDevForcedQuestProgression(metaRef.current, getQuestLabOverrides().forcedCompleted);
      saveMeta(metaRef.current);
    }
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
    const debuffs = debuffMods(m.pmc.debuffs);
    const s = freshState(
      loadout.map((i) => ({ ...i })),
      "prep",
      mapRef.current,
      Math.round(START_ROUBLES * debuffs.startRoubles) + skillMods(m.skills).startRoubles,
    );
    const spot = pmcSpawnTile(mapRef.current, s);
    const hp = pmcMaxHp(m.pmc.level, debuffs);
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
      scavMods: m.pmc.scavMods
        ? { ...m.pmc.scavMods, parts: { ...m.pmc.scavMods.parts } }
        : null,
      ...weaponRuntimeFields(m.pmc.weapon),
    });
    const crewDeploy = aliveOperators(m).filter((o) => deployOperatorIds.includes(o.id));
    const tiles = findDeployTiles(mapRef.current, s, crewDeploy.length + 1);
    crewDeploy.forEach((op, i) => {
      spawnPersistentOperatorTower(s, mapRef.current, op, tiles[i + 1] ?? tiles[0]!, debuffs.pmcHp);
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
    const crewNote = crewDeploy.length ? ` + ${crewDeploy.length} crew` : "";
    setLog([
      `${m.pmc.name} inserted at ${mapRef.current.def.name}${crewNote}. Keep them alive — if they die, the run is over for good.`,
    ]);
    battleTimeRef.current = resetBattleTimeState(true);
    clearAllPlans(planBookRef.current);
    closeOrdersUi();
    syncBattleTimeUi();
    rerender();
  }, [closeOrdersUi, deployOperatorIds, loadout, persist, rerender, stash, syncBattleTimeUi]);

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
      if (!isQuestTestActive()) {
        const unlockCtx: QuestUnlockContext = {
          claimedQuestIds: m.claimed,
          playerLevel: m.pmc.level,
          radioState: (m.crew.radio ?? freshRadioProgression()).radioState,
          uniqueContacts: m.crew.radio?.uniqueContacts,
        };
        // Snapshot AVAILABLE before applying this raid — newly unlocked quests get 0 from this event.
        const availableAtStart = listAvailableQuestIds(QUEST_SPECS, unlockCtx, m.quests);
        const mapKey = mapRef.current.def.id;
        m.quests = applyRaidQuestProgress(m.quests, availableAtStart, {
          scavKills: s.scavKills,
          bossKills: s.bossKills,
          wave: s.wave,
          mapId: mapKey,
          extracted: keepBackpack,
        });
      }
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
        m.pmc.scavMods =
          keepBackpack && pmc.scavMods
            ? { ...pmc.scavMods, parts: { ...pmc.scavMods.parts } }
            : null;
      }
      for (const t of s.towers) {
        if (!t.operatorId) continue;
        const idx = m.crew.operators.findIndex((o) => o.id === t.operatorId);
        if (idx < 0 || m.crew.operators[idx]!.status === "dead") continue;
        if (keepBackpack) {
          m.crew.operators[idx] = syncOperatorEquipmentFromTower(m.crew.operators[idx]!, t);
        }
      }
      setStash(next);
      m.stash = stashEntriesFromItems(next);
      m.runs += 1;
      refreshRecruitmentPoolIfNeeded(m);
      saveMeta(m);
      gs.current = freshState([], "hideout", mapRef.current);
      setLoadout([]);
      setChoices([]);
      setPendingLoot(null);
      setSwapUid(null);
      setSellValuableUids(new Set());
      setLeaveUids(new Set());
      setScreen("hideout");
      battleTimeRef.current = resetBattleTimeState(true);
      clearAllPlans(planBookRef.current);
      closeOrdersUi();
      syncBattleTimeUi();
      rerender();
    },
    [closeOrdersUi, leaveUids, pushLog, rerender, sellValuableUids, stash, stashSlots, syncBattleTimeUi],
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
      m.stash = stashEntriesFromItems([...next, ...loadout]);
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
      m.stash = stashEntriesFromItems([...next, ...loadout]);
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

  const enqueueNotices = useCallback((...notices: (ProgressionNotice | null | undefined)[]) => {
    const next = notices.filter((n): n is ProgressionNotice => !!n);
    if (!next.length) return;
    setProgressionNotices((cur) => [...cur, ...next]);
  }, []);

  const dismissProgressionNotice = useCallback(() => {
    setProgressionNotices((cur) => cur.slice(1));
  }, []);

  const redeem = useCallback(
    (questId: string) => {
      const m = metaRef.current;
      const result = redeemQuest(m, questId, QUEST_SPECS);
      if (!result.ok) return pushLog(result.reason);
      if (result.alreadySettled) return;
      saveMeta(m);
      enqueueNotices(result.notice);
      rerender();
    },
    [pushLog, rerender, enqueueNotices],
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

  const equipOnSelectedOwner = useCallback(
    (uid: number) => {
      const m = metaRef.current;
      const ownerId = coerceEquipmentOwnerId(m, selectedEquipOwnerId);
      const result = equipOnEquipmentOwner(m, ownerId, stash, newUid(), uid, stashSlots);
      if (!result.ok) return pushLog(result.reason);
      const ns = result.stash.slice(0, stashSlots);
      setStash(ns);
      m.stash = stashEntriesFromItems([...ns, ...loadout]);
      saveMeta(m);
      pushLog(result.message);
      rerender();
    },
    [loadout, pushLog, rerender, selectedEquipOwnerId, stash, stashSlots],
  );

  const unequipSelectedOwner = useCallback(
    (slot: "weapon" | "armor" | number) => {
      const m = metaRef.current;
      const ownerId = coerceEquipmentOwnerId(m, selectedEquipOwnerId);
      const result = unequipFromEquipmentOwner(m, ownerId, stash, newUid(), slot, stashSlots);
      if (!result.ok) return pushLog(result.reason);
      const ns = result.stash.slice(0, stashSlots);
      setStash(ns);
      m.stash = stashEntriesFromItems([...ns, ...loadout]);
      saveMeta(m);
      pushLog(result.message);
      rerender();
    },
    [loadout, pushLog, rerender, selectedEquipOwnerId, stash, stashSlots],
  );

  /** Buy a shop attachment into stash, then install it on the selected operator. */
  const armoryBuyAndInstall = useCallback(
    (defId: string) => {
      const def = effectiveItemDef(defId) ?? ITEM_BY_ID[defId];
      const m = metaRef.current;
      if (!def?.price || def.kind !== "attachment") return pushLog("Not a buyable attachment.");
      const price = Math.round(def.price * skillMods(m.skills).buyMult);
      if (m.bank < price) return pushLog("Not enough banked roubles.");
      if (stash.length >= stashSlots) return pushLog("Stash is full.");
      m.bank -= price;
      const item = makeItem(defId, newUid())!;
      const withPurchase = [...stash, item];
      const ownerId = coerceEquipmentOwnerId(m, selectedEquipOwnerId);
      const result = equipOnEquipmentOwner(m, ownerId, withPurchase, newUid(), item.uid, stashSlots);
      if (!result.ok) {
        // Purchase succeeded but install failed — keep item in stash.
        setStash(withPurchase);
        m.stash = stashEntriesFromItems([...withPurchase, ...loadout]);
        saveMeta(m);
        pushLog(`Bought ${def.name} for ${price}₽. ${result.reason}`);
        rerender();
        return;
      }
      const ns = result.stash.slice(0, stashSlots);
      setStash(ns);
      m.stash = stashEntriesFromItems([...ns, ...loadout]);
      saveMeta(m);
      pushLog(`Bought & installed ${def.name} for ${price}₽.`);
      rerender();
    },
    [loadout, pushLog, rerender, selectedEquipOwnerId, stash, stashSlots],
  );

  const hireRecruit = useCallback(
    (candidateId: string) => {
      const m = metaRef.current;
      const candidate = m.crew.recruitment.candidates.find((c) => c.candidateId === candidateId);
      const cost = candidate?.cost ?? 0;
      const result = hireCandidate(m, candidateId);
      if (!result.ok) return pushLog(result.reason);
      saveMeta(m);
      setDeployOperatorIds((ids) => [...ids, result.operator.id]);
      setSelectedRecruitId(null);
      pushLog(`${result.operator.name} hired for ${cost}₽.`);
      rerender();
    },
    [pushLog, rerender],
  );

  // First Radio open after SIGNAL_RESTORED: Wolf distress once + eligibility sync.
  useEffect(() => {
    if (screen !== "radio") return;
    const m = metaRef.current;
    ensureRadio(m);
    let radio = m.crew.radio!;
    let dirty = false;
    const distress = maybeTriggerUniqueDistress(radio, "wolf", m.runs);
    if (distress.triggered) {
      radio = distress.radio;
      dirty = true;
    }
    const synced = syncUniqueEligibility(radio, "wolf", progressionFactsFromMeta(m));
    if (synced !== radio) {
      radio = synced;
      dirty = true;
    }
    if (dirty) {
      m.crew.radio = radio;
      saveMeta(m);
      rerender();
    }
  }, [screen, rerender]);

  const equipOnCrew = useCallback(
    (operatorId: string, uid: number) => {
      const m = metaRef.current;
      const result = equipOnEquipmentOwner(m, operatorId, stash, newUid(), uid, stashSlots);
      if (!result.ok) return pushLog(result.reason);
      const ns = result.stash.slice(0, stashSlots);
      setStash(ns);
      m.stash = stashEntriesFromItems([...ns, ...loadout]);
      saveMeta(m);
      pushLog(result.message);
      rerender();
    },
    [loadout, pushLog, rerender, stash, stashSlots],
  );

  const unequipCrew = useCallback(
    (operatorId: string, slot: "weapon" | "armor" | number) => {
      const m = metaRef.current;
      const result = unequipFromEquipmentOwner(m, operatorId, stash, newUid(), slot, stashSlots);
      if (!result.ok) return pushLog(result.reason);
      const ns = result.stash.slice(0, stashSlots);
      setStash(ns);
      m.stash = stashEntriesFromItems([...ns, ...loadout]);
      saveMeta(m);
      pushLog(result.message);
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

  const setLabs = useCallback((which: "balance" | "economy" | "wave" | "quest" | "recruitment" | "none") => {
    const balance = which === "balance";
    const economy = which === "economy";
    const wave = which === "wave";
    const quest = which === "quest";
    const recruitment = which === "recruitment";
    setBalanceLabOpen(balance);
    setEconomyLabOpen(economy);
    setWaveLabOpen(wave);
    setQuestLabOpen(quest);
    setRecruitmentLabOpen(recruitment);
    labOpenRef.current = balance || economy || wave || quest || recruitment;
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
      if (id === "quest-editor") {
        setLabs("quest");
        return;
      }
      if (id === "recruitment-lab") {
        setLabs("recruitment");
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
      if (dealt > 0 && def.behavior) {
        if (!e.behaviorRuntime) e.behaviorRuntime = freshBehaviorRuntime();
        applyDamageReaction(def.behavior, e.behaviorRuntime);
      }
      return dealt;
    };

    const killEnemy = (e: Enemy, s: GameState) => {
      const def = effectiveEnemy(e.kind);
      const book: KillBook = s;
      const xp = creditKillBook(e.kind, def.bounty, book);
      noteQuestTestEvent({ type: "KILL", kind: e.kind, mapId: mapRef.current.def.id });
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
          lastHitZoneId: null,
          behaviorRuntime: freshBehaviorRuntime(),
        });
      }

      // enemies — corpses do not walk, leak, or fight
      for (const e of s.enemies) {
        const def = effectiveEnemy(e.kind);
        const behavior = def.behavior!;
        if (!e.behaviorRuntime) e.behaviorRuntime = freshBehaviorRuntime();
        const br = e.behaviorRuntime;
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.slow = Math.max(0, e.slow - dt);
        if (isSettledOut(e)) continue;
        tickBehaviorRuntime(br, dt * 1000);

        // Target acquisition (sight range + optional LOS)
        const mapNow = mapRef.current;
        const sightPx = (behavior.canShoot ? behavior.sightRange || def.fireRange : 0) * SCALE;
        let tgt: Tower | null = null;
        let tgtD = Infinity;
        let hasLos = false;
        if (behavior.canShoot && sightPx > 0) {
          for (const t of s.towers) {
            const pos = towerPos(t);
            const d = Math.hypot(pos.x - e.x, pos.y - e.y);
            if (d >= sightPx || d >= tgtD) continue;
            const los = hasLineOfSight(
              mapNow,
              { x: e.x, y: e.y, surface: e.surface ?? "GROUND" },
              { x: pos.x, y: pos.y, surface: t.surface ?? "GROUND" },
            );
            if (behavior.requireLosToShoot && !los) continue;
            tgtD = d;
            tgt = t;
            hasLos = los;
          }
        }

        if (tgt) {
          br.targetTowerId = tgt.id;
          br.memoryLeftMs = behavior.targetMemoryMs;
          if (br.state !== "REACTION" || br.reactionLeftMs <= 0) br.state = "ENGAGED";
        } else if (br.memoryLeftMs > 0) {
          br.targetTowerId = null;
          if (br.state !== "REACTION" || br.reactionLeftMs <= 0) br.state = "ENGAGED";
        } else {
          br.targetTowerId = null;
          if (br.state !== "REACTION" || br.reactionLeftMs <= 0) br.state = "ADVANCING";
        }

        const moveMult = movementSpeedMult(behavior, br);
        const route = laneRoute(mapRef.current, e.lane);
        const sp =
          def.speed * SCALE * waveScale(s.wave).speed * (e.slow > 0 ? WIRE_SPEED_MULT : 1) * moveMult;
        let move = sp * dt;
        const wasMoving = move > 0.0001;
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
        e.step += Math.max(sp, 0.01) * dt * 0.25;
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

        e.muzzle = Math.max(0, e.muzzle - dt);
        e.fireCd -= dt * 1000;

        // Prefer current engaged target within fire range
        let fireTgt = tgt;
        let fireLos = hasLos;
        if (behavior.canShoot) {
          let best: Tower | null = null;
          let bestD = Infinity;
          let bestLos = false;
          for (const t of s.towers) {
            const pos = towerPos(t);
            const d = Math.hypot(pos.x - e.x, pos.y - e.y);
            if (d >= def.fireRange * SCALE || d >= bestD) continue;
            const los = hasLineOfSight(
              mapNow,
              { x: e.x, y: e.y, surface: e.surface ?? "GROUND" },
              { x: pos.x, y: pos.y, surface: t.surface ?? "GROUND" },
            );
            if (behavior.requireLosToShoot && !los) continue;
            bestD = d;
            best = t;
            bestLos = los;
          }
          fireTgt = best;
          fireLos = bestLos;
        }

        if (fireTgt && canFireNow(behavior, br, fireLos, wasMoving && moveMult > 0.05)) {
          const pos = towerPos(fireTgt);
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
              towerId: fireTgt.id,
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
              lootRuntimeForSource(`${mapRef.current.def.id}:crate`),
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
        const wasMoving = isOperatorMoving(t);
        if (wasMoving) stepOperatorMove(t, dt, mapRef.current, towerMoveSpeedPx(t, metaRef.current));
        {
          const plan = planBookRef.current.get(t.id);
          if (plan) {
            const step = onMoveStepComplete(t, plan, { map: mapRef.current, towers: s.towers }, wasMoving);
            if (step.advanced || step.plan !== plan) setPlan(planBookRef.current, t.id, step.plan);
          }
        }
        const st = towerStats(t, mods, mapRef.current, metaRef.current);
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

        // HOLD_ANGLE: check if any enemy is in the held sector
        let holdAngleCanFire = false;
        if (t.targetMode === "HOLD_ANGLE" && t.holdAngle != null) {
          const halfCone = getShotDispersion(st.accuracy) + 0.15; // sector = dispersion + base sector width
          for (const e of live) {
            if (!inRange(origin, st.range, e)) continue;
            if (!visible(e)) continue;
            if (isInFiringSector(cx, cy - 4, t.holdAngle, halfCone, e.x, e.y)) {
              holdAngleCanFire = true;
              break;
            }
          }
        }

        const hasTarget = !!best || holdAngleCanFire;
        if (!moving && t.targetMode === "MANUAL" && t.manualTargetId != null && !locked) {
          t.manualTargetId = null;
        }
        const prevReloadLeft = t.reloadLeft;
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
        {
          const plan = planBookRef.current.get(t.id);
          if (plan) {
            const step = onReloadTickComplete(
              t,
              plan,
              { map: mapRef.current, towers: s.towers },
              prevReloadLeft,
            );
            if (step.advanced || step.plan !== plan) setPlan(planBookRef.current, t.id, step.plan);
          }
        }
        t.engageTargetId = t.targetMode === "MANUAL" ? (locked?.id ?? null) : (best?.id ?? null);

        // Update aim direction
        if (t.targetMode === "HOLD_ANGLE" && t.holdAngle != null) {
          t.angle = t.holdAngle;
        } else if (t.targetMode === "MANUAL" && locked) {
          t.angle = Math.atan2(locked.y - cy - 4, locked.x - cx);
        } else if (best) {
          t.angle = Math.atan2(best.y - cy - 4, best.x - cx);
        }

        const canFire = (best || holdAngleCanFire) && t.cd <= 0 && canShoot(t.ammo, t.reloadLeft) && operatorCanFire(t);
        if (canFire) {
            t.cd = st.cooldown;
            t.flash = 0.06;
            t.ammo = consumeRound(t.ammo);
            const ox = cx + Math.cos(t.angle) * 12;
            const oy = cy - 4 + Math.sin(t.angle) * 12;
            const nextProjId = () => s.nextId++;

            if (isShotgunWeapon(st.weapon)) {
              const pellets = spawnShotgunBlast({
                nextId: nextProjId,
                shooterId: t.id,
                origin: { x: ox, y: oy },
                aimAngle: t.angle,
                accuracy: st.accuracy,
                range: st.range,
                damage: st.damage,
                pen: st.pen,
                pelletCount: shotgunPelletCount(st.weapon),
                pelletSpread: st.spread ?? st.weapon.spread ?? 0,
                maxPenHits: shotgunMaxHits(st.weapon),
                secondaryHitMult: shotgunSecondaryMult(st.weapon),
                color: st.weapon.accent,
                surface: t.surface ?? "GROUND",
              });
              s.projectiles.push(...pellets);
            } else {
              // Rifle / sniper / splash — all become traveling projectiles
              const proj = spawnRifleShot({
                nextId: nextProjId,
                shooterId: t.id,
                origin: { x: ox, y: oy },
                aimAngle: t.angle,
                accuracy: st.accuracy,
                range: st.range,
                damage: st.damage,
                pen: st.pen,
                splash: st.splash,
                maxPenHits: st.pen > 0 ? 2 : 1,
                color: st.weapon.accent,
                surface: t.surface ?? "GROUND",
                speed: st.weapon.cls === "sniper" ? DEFAULT_BULLET_SPEED * 1.4
                  : st.weapon.cls === "launcher" ? DEFAULT_BULLET_SPEED * 0.55
                  : DEFAULT_BULLET_SPEED,
              });
              s.projectiles.push(proj);
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

      // physical projectiles (traveling bullets — damage on impact)
      {
        const armorOfEnemy = (e: ProjectileTickEnemy) =>
          effectiveEnemy((e as unknown as { kind: EnemyKind }).kind).armor;
        const radiusOf = (e: ProjectileTickEnemy) => {
          const def = effectiveEnemy((e as unknown as { kind: EnemyKind }).kind);
          return enemyBroadphaseRadius(def.size, SCALE);
        };
        const hitZoneOf = (e: ProjectileTickEnemy, hitX: number, hitY: number) => {
          const def = effectiveEnemy((e as unknown as { kind: EnemyKind }).kind);
          const zones = resolveEnemyHitZones(def.hitZones);
          const bounds = enemyWorldBounds(e.x, e.y, def.size, SCALE);
          const hit = resolveHitZoneAtPoint(zones, bounds, hitX, hitY);
          if (!hit) return null;
          return { damageMult: hit.damageMult, zoneId: hit.zone.id };
        };
        const liveProjectiles: Projectile[] = [];
        for (const p of s.projectiles) {
          const result = tickProjectile(
            p,
            dt,
            s.enemies,
            armorOfEnemy,
            mapRef.current,
            ENEMY_HIT_RADIUS,
            hitZoneOf,
            radiusOf,
          );
          for (const hit of result.hits) {
            const e = s.enemies.find((en) => en.id === hit.enemyId);
            if (e) {
              e.hitFlash = 0.07;
              e.lastHitZoneId = hit.hitZoneId ?? null;
              const def = effectiveEnemy(e.kind);
              if (def.behavior) {
                if (!e.behaviorRuntime) e.behaviorRuntime = freshBehaviorRuntime();
                applyDamageReaction(def.behavior, e.behaviorRuntime);
              }
              spawnParticles(e.x, e.y, "#c94b3a", p.pellet ? 2 : 4, p.pellet ? 36 : 55);
              if (DEV_TOOLS_ENABLED && hit.hitZoneId === "head") {
                s.floats.push({
                  x: e.x,
                  y: e.y - 18,
                  life: 0.55,
                  text: "HEAD",
                  color: "#f0b400",
                });
              }
            }
          }
          for (const splash of result.splashes) {
            spawnParticles(splash.x, splash.y, "#ffb347", 18, 120);
            spawnParticles(splash.x, splash.y, "#5a5142", 10, 90);
            s.shake = Math.max(s.shake, 4);
            for (const e of s.enemies) {
              const dd = Math.hypot(e.x - splash.x, e.y - splash.y);
              if (dd <= splash.radius) {
                hurtEnemy(e, splash.damage * (1 - (dd / splash.radius) * 0.5), splash.pen);
              }
            }
          }
          for (const miss of result.misses) {
            if (p.hitIds.length === 0 && !p.pellet) {
              spawnParticles(miss.x, miss.y, "#8a8570", 3, 40);
              s.floats.push({ x: miss.x, y: miss.y - 10, life: 0.4, text: "miss", color: "#9a9484" });
            }
          }
          if (!p.dead) liveProjectiles.push(p);
        }
        s.projectiles = liveProjectiles;
      }

      // bullets (legacy: hostile enemy bullets + old tracers)
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
                  if (tw.operatorId) {
                    markOperatorDead(metaRef.current, tw.operatorId);
                    saveMeta(metaRef.current);
                    dropGear(tw, s);
                    clearOperatorMove(tw);
                    s.towers = s.towers.filter((t) => t.id !== tw.id);
                    if (s.selectedId === tw.id) s.selectedId = null;
                    spawnParticles(b.tx, b.ty, "#ff8a3c", 22, 110);
                    s.shake = Math.max(s.shake, 9);
                    s.floats.push({
                      x: b.tx,
                      y: b.ty - 16,
                      life: 1.4,
                      text: "KIA — GEAR DROPPED",
                      color: "#ff5a3c",
                    });
                    pushLog(
                      `${getRaidOperatorDisplayName(tw, metaRef.current)} is KIA. Kit dropped — grab it or it's gone.`,
                    );
                    rerender();
                    continue;
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
        noteQuestTestEvent({ type: "WAVE_COMPLETE", wave: s.wave, mapId: mapRef.current.def.id });
        s.roubles += Math.round((120 + s.wave * 30) * effectiveLootMult(mapRef.current.def));
        const found = rollChoices(
          s.wave,
          s.nextId,
          effectiveLootMult(mapRef.current.def),
          lootRuntimeForSource(`${mapRef.current.def.id}:reward`),
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
        // Aim cone visualization (selected) — subdued during tactical pause if HOLD; full otherwise
        const coneHalf = getShotDispersion(st.accuracy);
        const aimAngle = sel.angle;
        const coneLen = st.range;
        {
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.arc(pos.x, pos.y, coneLen, aimAngle - coneHalf, aimAngle + coneHalf);
          ctx.closePath();
          ctx.fillStyle = sel.targetMode === "HOLD_ANGLE"
            ? "rgba(232,140,48,0.10)"
            : "rgba(110,220,255,0.08)";
          ctx.fill();
          ctx.strokeStyle = sel.targetMode === "HOLD_ANGLE"
            ? "rgba(232,140,48,0.45)"
            : "rgba(110,220,255,0.35)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(pos.x + Math.cos(aimAngle) * coneLen, pos.y + Math.sin(aimAngle) * coneLen);
          ctx.strokeStyle = sel.targetMode === "HOLD_ANGLE"
            ? "rgba(232,140,48,0.6)"
            : "rgba(110,220,255,0.5)";
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        const oMode = ordersEditorModeRef.current;
        if (oMode.kind === "author_move" && !s.place && s.hoverTx >= 0) {
          const dest = resolveMoveDestination(mapRef.current, logicalNode(sel), s.hoverTx, s.hoverTy);
          const path = dest ? findOperatorPath(mapRef.current, logicalNode(sel), dest) : null;
          const ok = !!dest && !!path;
          ctx.strokeStyle = ok ? "rgba(125,220,90,0.8)" : "rgba(255,70,50,0.55)";
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(s.hoverTx * TILE + 2, s.hoverTy * TILE + 2, TILE - 4, TILE - 4);
          ctx.setLineDash([]);
        }
        if (oMode.kind === "author_hold" && s.hoverTx >= 0) {
          const worldX = s.hoverTx * TILE + TILE / 2;
          const worldY = s.hoverTy * TILE + TILE / 2;
          const ang = Math.atan2(worldY - pos.y + 4, worldX - pos.x);
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(pos.x + Math.cos(ang) * TILE * 3, pos.y + Math.sin(ang) * TILE * 3);
          ctx.strokeStyle = "rgba(232,140,48,0.85)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Squad order-plan overlays — detailed while PAUSED; selected subtle while live
      {
        const pausedNow = battleTimeRef.current.mode === "PAUSED";
        for (const t of s.towers) {
          const plan = planBookRef.current.get(t.id);
          if (!plan || plan.orders.length === 0) continue;
          if (!pausedNow && t.id !== s.selectedId) continue;
          if (!pausedNow && plan.state === "DONE") continue;
          const pos = towerPos(t);
          const strong = pausedNow && t.id === s.selectedId;
          const subdued = pausedNow && t.id !== s.selectedId;
          const subtle = !pausedNow && t.id === s.selectedId;
          const moves = planMoveWaypoints(plan);
          let prevX = pos.x;
          let prevY = pos.y;
          let moveNum = 0;
          for (const order of plan.orders) {
            if (order.type === "MOVE") {
              moveNum += 1;
              const dx = order.tx * TILE + TILE / 2;
              const dy = order.ty * TILE + TILE / 2;
              ctx.beginPath();
              ctx.moveTo(prevX, prevY);
              ctx.lineTo(dx, dy);
              ctx.strokeStyle = strong
                ? "rgba(125,220,90,0.9)"
                : subtle
                  ? "rgba(110,220,255,0.35)"
                  : "rgba(125,220,90,0.35)";
              ctx.setLineDash(subtle || subdued ? [4, 4] : []);
              ctx.lineWidth = strong ? 2 : 1.25;
              ctx.stroke();
              ctx.setLineDash([]);
              const mark = strong ? 5 : 3;
              ctx.fillStyle = strong ? "rgba(125,220,90,0.95)" : "rgba(125,220,90,0.45)";
              ctx.fillRect(dx - mark, dy - mark, mark * 2, mark * 2);
              ctx.fillStyle = strong ? "#0a0c08" : "rgba(10,12,8,0.7)";
              ctx.font = "bold 8px monospace";
              ctx.textAlign = "center";
              ctx.fillText(String(moveNum), dx, dy + 3);
              prevX = dx;
              prevY = dy;
            } else if (order.type === "RELOAD" && pausedNow) {
              ctx.fillStyle = strong ? "rgba(240,180,0,0.95)" : "rgba(240,180,0,0.5)";
              ctx.font = "bold 8px monospace";
              ctx.textAlign = "left";
              ctx.fillText("RLD", prevX + 6, prevY - 8);
            } else if (order.type === "HOLD_ANGLE") {
              const len = TILE * (strong ? 2.6 : 2);
              ctx.beginPath();
              ctx.moveTo(prevX, prevY);
              ctx.lineTo(prevX + Math.cos(order.angle) * len, prevY + Math.sin(order.angle) * len);
              ctx.strokeStyle = strong ? "rgba(232,140,48,0.85)" : "rgba(232,140,48,0.4)";
              ctx.lineWidth = strong ? 2 : 1.25;
              ctx.stroke();
            }
          }
          if (pausedNow && moves.length === 0 && plan.orders.some((o) => o.type === "RELOAD")) {
            ctx.fillStyle = strong ? "rgba(240,180,0,0.95)" : "rgba(240,180,0,0.5)";
            ctx.font = "bold 8px monospace";
            ctx.fillText("RLD", pos.x - 8, pos.y - TILE / 2 - 6);
          }
          const sum = planSummary(plan);
          if (sum && pausedNow) {
            ctx.fillStyle = strong ? "rgba(200,220,180,0.95)" : "rgba(160,180,140,0.55)";
            ctx.font = "7px monospace";
            ctx.textAlign = "center";
            ctx.fillText(sum, pos.x, pos.y - TILE / 2 - 14);
          }
        }
        if (!pausedNow) {
          const selLive = s.towers.find((t) => t.id === s.selectedId);
          if (selLive?.move?.dest) {
            const pos = towerPos(selLive);
            const dest = selLive.move.dest;
            const dx = dest.tx * TILE + TILE / 2;
            const dy = dest.ty * TILE + TILE / 2;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(dx, dy);
            ctx.strokeStyle = "rgba(110,220,255,0.35)";
            ctx.setLineDash([3, 5]);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
          }
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
      for (const proj of s.projectiles) {
        ctx.fillStyle = proj.color;
        const sz = proj.splash > 0 ? 5 : proj.pellet ? 2 : 3;
        ctx.fillRect(Math.round(proj.x) - 1, Math.round(proj.y) - 1, sz, sz);
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
      const wallDt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const scale = resolveEffectiveBattleTimeScale(battleTimeRef.current);
      const steps = simulationStepsFromWallDt(wallDt, scale);
      // PAUSED (scale 0): skip tick entirely so fire/spawn cannot advance on a zero-dt frame.
      for (const step of steps) tick(step);
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
      setOrdersMode({ kind: "idle" });
      rerender();
      return;
    }

    // Orders editor authoring: MOVE destination / HOLD direction
    const oMode = ordersEditorModeRef.current;
    if (oMode.kind === "author_hold" && ordersOpenFor != null) {
      const sel = s.towers.find((t) => t.id === ordersOpenFor);
      if (sel) {
        const world = toWorld(ev);
        const pos = towerPos(sel);
        const angle = Math.atan2(world.y - pos.y + 4, world.x - pos.x);
        const order = { type: "HOLD_ANGLE" as const, angle, point: { x: world.x, y: world.y } };
        let draft = ordersDraft;
        if (oMode.editIndex != null) {
          const r = replaceOrderAt(draft, oMode.editIndex, order);
          if (!r.ok) pushLog(r.reason);
          else draft = r.plan!;
        } else {
          const r = appendOrder(draft, order);
          if (!r.ok) pushLog(r.reason);
          else draft = r.plan!;
        }
        setOrdersDraft(draft);
        setPlan(planBookRef.current, ordersOpenFor, draft);
        setOrdersMode({ kind: "idle" });
      }
      rerender();
      return;
    }
    if (oMode.kind === "author_move" && ordersOpenFor != null) {
      const sel = s.towers.find((t) => t.id === ordersOpenFor);
      if (sel) {
        const dest = resolveMoveDestination(mapRef.current, logicalNode(sel), tx, ty);
        if (!dest) {
          pushLog("NO ROUTE");
          rerender();
          return;
        }
        const order = { type: "MOVE" as const, tx: dest.tx, ty: dest.ty };
        let draft = ordersDraft;
        if (oMode.editIndex != null) {
          const r = replaceOrderAt(draft, oMode.editIndex, order);
          if (!r.ok) pushLog(r.reason);
          else draft = r.plan!;
        } else {
          const r = appendOrder(draft, order);
          if (!r.ok) pushLog(r.reason);
          else draft = r.plan!;
        }
        setOrdersDraft(draft);
        setPlan(planBookRef.current, ordersOpenFor, draft);
        setOrdersMode({ kind: "idle" });
      }
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
      closeOrdersUi();
      rerender();
      return;
    }
    const wirePick = s.obstacles.find((o) => o.kind === "wire" && o.tx === tx && o.ty === ty);
    if (wirePick && !s.place) {
      s.selectedObstacle = wirePick.id === s.selectedObstacle ? null : wirePick.id;
      s.selectedId = null;
      closeOrdersUi();
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
    const paused = battleTimeRef.current.mode === "PAUSED";
    // LEFT-CLICK always means MOVE when an operator is selected (no MOVE mode required).
    if (sel && !s.place) {
      const dest = resolveMoveDestination(mapRef.current, logicalNode(sel), tx, ty);
      if (!dest) {
        pushLog("NO ROUTE");
        rerender();
        return;
      }
      const decision = resolveLeftClickMovePlan(planBookRef.current.get(sel.id), dest.tx, dest.ty, paused);
      if (decision.kind === "refuse") {
        pushLog(decision.reason);
        const existingPlan = planBookRef.current.get(sel.id) ?? createEmptyPlan();
        setOrdersDraft(existingPlan);
        setOrdersOpenFor(sel.id);
        setOrdersMode({ kind: "idle" });
        rerender();
        return;
      }
      setPlan(planBookRef.current, sel.id, decision.plan);
      if (decision.executeNow) {
        const r = beginPlanExecution(sel, decision.plan, { map: mapRef.current, towers: s.towers });
        setPlan(planBookRef.current, sel.id, r.plan);
        if (!r.ok && r.reason) pushLog(r.reason);
      }
      closeOrdersUi();
      rerender();
      return;
    }

    s.selectedObstacle = null;

    s.selectedId = null;
    closeOrdersUi();
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
    noteQuestTestEvent({ type: "WAVE_START", wave: s.wave, mapId: mapRef.current.def.id });
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
      noteQuestTestEvent({ type: "WAVE_START", wave: r.wave, mapId: mapId });
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
        if (ordersEditorModeRef.current.kind !== "idle" || ordersOpenFor != null) {
          if (ordersEditorModeRef.current.kind !== "idle") {
            setOrdersMode({ kind: "idle" });
          } else {
            closeOrdersUi();
          }
          rerender();
          return;
        }
        s.place = null;
        s.selectedId = null;
        rerender();
      }
      if (e.code === "Space") {
        e.preventDefault();
        const s = gs.current;
        if (s.phase === "prep") {
          startWave();
          return;
        }
        if (s.phase === "combat" && battleTimeRef.current.controlsEnabled) {
          const prev = battleTimeRef.current.mode;
          battleTimeRef.current = toggleBattleTimePause(battleTimeRef.current);
          if (battleTimeRef.current.mode === "PAUSED" && prev !== "PAUSED") {
            pauseReloadSessionRef.current = beginPauseReloadSession(pauseReloadSessionRef.current);
          }
          if (prev === "PAUSED" && battleTimeRef.current.mode !== "PAUSED") {
            startAllPlanned(planBookRef.current, s.towers, mapRef.current);
            closeOrdersUi();
          }
          syncBattleTimeUi();
          rerender();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeOrdersUi, ordersOpenFor, rerender, setOrdersMode, startWave, syncBattleTimeUi]);

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
      if (t.operatorId) continue;
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
    const haul = [...s.backpack, ...carried];
    const items: { itemId: string; count: number }[] = [];
    const counts = new Map<string, number>();
    for (const it of haul) counts.set(it.id, (counts.get(it.id) ?? 0) + 1);
    for (const [itemId, count] of counts) items.push({ itemId, count });
    noteQuestTestEvent({ type: "EXTRACT", mapId, items });
    // Extract count for quest trackers is applied in toHideout via applyRaidQuestProgress.
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
              {inRaid && battleTimeRef.current.controlsEnabled && (
                <div className="flex flex-col items-end gap-0.5">
                  {battleTimeMode === "PAUSED" && (
                    <span className="font-mono text-[9px] tracking-wide text-primary">
                      PAUSED · ISSUE ORDERS
                    </span>
                  )}
                  <div className="flex items-center gap-0.5 border-2 border-border bg-secondary/40 px-1 py-0.5">
                  {BATTLE_TIME_MODE_ORDER.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      title={battleTimeModeTitle(mode)}
                      className={`pixel-btn min-w-[1.75rem] px-1.5 py-0.5 text-[10px] ${
                        battleTimeMode === mode ? "pixel-btn-primary" : "text-muted-foreground"
                      }`}
                      onClick={() => applyBattleTimeMode(mode)}
                    >
                      {battleTimeModeLabel(mode)}
                    </button>
                  ))}
                  </div>
                </div>
              )}
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
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    const s = gs.current;
                    const [tx, ty] = toTile(ev);
                    if (ordersEditorModeRef.current.kind !== "idle") {
                      setOrdersMode({ kind: "idle" });
                      rerender();
                      return;
                    }
                    const sel = s.towers.find((t) => t.id === s.selectedId);
                    if (!sel || s.place) return;
                    const dest = resolveMoveDestination(mapRef.current, logicalNode(sel), tx, ty);
                    if (!dest) {
                      pushLog("NO ROUTE");
                      rerender();
                      return;
                    }
                    const existing = planBookRef.current.get(sel.id);
                    if (existing?.state === "EXECUTING") {
                      setOrdersDraft(existing);
                      setOrdersOpenFor(sel.id);
                      setOrdersMode({ kind: "idle" });
                      rerender();
                      return;
                    }
                    const seeded: OperatorPlan = {
                      orders: [{ type: "MOVE", tx: dest.tx, ty: dest.ty }],
                      currentIndex: 0,
                      state: "PLANNED",
                      awaiting: null,
                    };
                    setPlan(planBookRef.current, sel.id, seeded);
                    setOrdersDraft(seeded);
                    setOrdersOpenFor(sel.id);
                    setOrdersMode({ kind: "idle" });
                    rerender();
                  }}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={canvasDrop}
                  className="block w-full cursor-crosshair"
                  style={{ imageRendering: "pixelated", aspectRatio: `${W} / ${H}` }}
                />
              )}
              {inRaid && ordersOpenFor != null && (() => {
                const op = s.towers.find((t) => t.id === ordersOpenFor);
                if (!op) return null;
                return (
                  <div className="pointer-events-none absolute left-2 top-2 z-30 sm:left-4 sm:top-4">
                    <OrdersPanel
                      operatorName={getRaidOperatorDisplayName(op, meta)}
                      plan={ordersDraft}
                      editorMode={ordersEditorMode}
                      onRequestAddMenu={() => setOrdersMode({ kind: "pick_add" })}
                      onCancelAddMenu={() => setOrdersMode({ kind: "idle" })}
                      onAddPick={(type) => {
                        if (type === "RELOAD") {
                          const r = appendOrder(ordersDraft, { type: "RELOAD" });
                          if (!r.ok) pushLog(r.reason);
                          else {
                            setOrdersDraft(r.plan!);
                            setPlan(planBookRef.current, ordersOpenFor, r.plan!);
                          }
                          setOrdersMode({ kind: "idle" });
                          rerender();
                          return;
                        }
                        if (type === "MOVE") {
                          setOrdersMode({ kind: "author_move", editIndex: null });
                          rerender();
                          return;
                        }
                        setOrdersMode({ kind: "author_hold", editIndex: null });
                        rerender();
                      }}
                      onEdit={(index) => {
                        const order = ordersDraft.orders[index];
                        if (!order || order.type === "RELOAD") return;
                        if (order.type === "MOVE") setOrdersMode({ kind: "author_move", editIndex: index });
                        else setOrdersMode({ kind: "author_hold", editIndex: index });
                        rerender();
                      }}
                      onRemove={(index) => {
                        const next = removeOrderAt(ordersDraft, index);
                        setOrdersDraft(next);
                        setPlan(planBookRef.current, ordersOpenFor, next);
                        rerender();
                      }}
                      onClearAll={() => {
                        const plan = planBookRef.current.get(ordersOpenFor);
                        if (plan?.state === "EXECUTING") {
                          const next = clearFutureOrders(plan);
                          setOrdersDraft(next);
                          setPlan(planBookRef.current, ordersOpenFor, next);
                        } else {
                          clearPlan(planBookRef.current, ordersOpenFor);
                          setOrdersDraft(createEmptyPlan());
                        }
                        setOrdersMode({ kind: "idle" });
                        rerender();
                      }}
                      onDone={() => {
                        const paused = battleTimeRef.current.mode === "PAUSED";
                        setPlan(planBookRef.current, ordersOpenFor, ordersDraft);
                        if (!paused && ordersDraft.orders.length > 0 && ordersDraft.state !== "EXECUTING") {
                          const r = beginPlanExecution(op, ordersDraft, {
                            map: mapRef.current,
                            towers: gs.current.towers,
                          });
                          setPlan(planBookRef.current, ordersOpenFor, r.plan);
                          if (!r.ok && r.reason) pushLog(r.reason);
                        }
                        closeOrdersUi();
                        rerender();
                      }}
                      onClose={() => {
                        closeOrdersUi();
                        rerender();
                      }}
                    />
                  </div>
                );
              })()}

              {s.phase === "hideout" && screen === "skills" && (
                <Overlay
                  title={meta.pmc.name}
                  subtitle={`LEADER · LVL ${meta.pmc.level} · ${meta.skillPoints} skill point(s)`}
                  layout={scavTab === "quests" ? "wide" : "center"}
                >
                  <div className="mb-2 flex flex-wrap gap-1">
                    {(["overview", "crew", "skills", "quests"] as const).map((tab) => (
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
                  {scavTab === "crew" && (
                    <div className="pixel-card text-left font-mono text-[10px]">
                      <div className="text-muted-foreground">HIRED OPERATORS</div>
                      {meta.crew.operators.length === 0 ? (
                        <div className="mt-2 text-muted-foreground">No crew yet — check the Radio.</div>
                      ) : (
                        <div className="mt-2 space-y-1">
                          {meta.crew.operators.map((op) => (
                            <button
                              key={op.id}
                              onClick={() => setSelectedCrewId(op.id === selectedCrewId ? null : op.id)}
                              className={`w-full border px-2 py-1 text-left ${
                                selectedCrewId === op.id ? "border-primary text-primary" : "border-border/50"
                              }`}
                            >
                              <div className="flex justify-between gap-2">
                                <span>
                                  {op.name} · {op.roleLabel}
                                </span>
                                <span className={op.status === "dead" ? "text-destructive" : "text-accent"}>
                                  {op.status === "dead" ? "DEAD" : "ALIVE"}
                                </span>
                              </div>
                              <div className="text-[9px] text-muted-foreground">
                                {WEAPONS[op.equipment.weapon]?.name ?? "SIDEARM"} ·{" "}
                                {op.perkIds.map((id) => PERKS[id]?.name ?? id).join(", ") || "—"}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedCrewId && (() => {
                        const op = meta.crew.operators.find((o) => o.id === selectedCrewId);
                        if (!op) return null;
                        return (
                          <div className="mt-3 border-t border-border/40 pt-2">
                            <div className="font-display text-[10px] text-primary">
                              {op.name} · {op.roleLabel}
                            </div>
                            <div className="mt-1 space-y-0.5 text-[9px]">
                              {crewStatRows(op.stats, op.potential).map((row) => (
                                <div key={row.key} className="grid grid-cols-[3rem_1.5rem_1fr] items-center gap-1">
                                  <span className="text-muted-foreground">{row.label}</span>
                                  <span className="text-foreground">{row.current}</span>
                                  <span className="font-mono text-[8px] text-primary/90">{row.bar}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-1 text-[9px] text-muted-foreground">
                              PERKS: {op.perkIds.map((id) => PERKS[id]?.name ?? id).join(", ") || "—"}
                            </div>
                            <div className="mt-2 text-[9px] text-muted-foreground">
                              Full kit editing: open Equipment / Raid Prep and select this operator.
                            </div>
                            <div className="mt-2 grid gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEquipOwnerId(op.id);
                                  setScreen("gear");
                                }}
                                className="pixel-btn w-full"
                              >
                                OPEN EQUIPMENT
                              </button>
                              <button onClick={() => unequipCrew(op.id, "weapon")} className="pixel-card text-left">
                                WEAPON: {WEAPONS[op.equipment.weapon]?.name ?? "SIDEARM"}
                              </button>
                              <button onClick={() => unequipCrew(op.id, "armor")} className="pixel-card text-left">
                                ARMOR: {op.equipment.armor ? (ARMORS[op.equipment.armor]?.name ?? "ARMOR") : "EMPTY"}
                              </button>
                              {op.equipment.attachments.map((att, i) => (
                                <button key={att} onClick={() => unequipCrew(op.id, i)} className="pixel-card text-left">
                                  MOD: {ATTACHMENTS[att]?.name ?? att}
                                </button>
                              ))}
                            </div>
                            <div className="mt-2 text-[9px] text-muted-foreground">QUICK EQUIP FROM STASH</div>
                            <div className="mt-1 max-h-[100px] space-y-1 overflow-auto">
                              {stash
                                .filter((i) => i.kind === "weapon" || i.kind === "armor" || i.kind === "attachment")
                                .slice(0, 12)
                                .map((item) => (
                                  <button
                                    key={item.uid}
                                    onClick={() => equipOnCrew(op.id, item.uid)}
                                    className="w-full border border-border/40 px-1 py-[2px] text-left hover:border-primary"
                                  >
                                    {item.name}
                                  </button>
                                ))}
                            </div>
                            <div className="mt-1 text-[9px] text-muted-foreground">
                              LVL {op.progression.level} · XP {op.progression.xp}
                            </div>
                          </div>
                        );
                      })()}
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
                    <PlayerQuestsPanel
                      catalog={QUEST_SPECS}
                      unlockCtx={unlockContextFromMeta(meta)}
                      questProgress={meta.quests}
                      filter={questFilter}
                      onFilter={setQuestFilter}
                      onRedeem={redeem}
                    />
                  )}
                  <button onClick={() => setScreen("hideout")} className="pixel-btn pixel-btn-primary mt-3 w-full">
                    BACK TO CAMP
                  </button>
                </Overlay>
              )}

              {s.phase === "hideout" && screen === "radio" && (() => {
                const m = meta;
                const radio = m.crew.radio ?? freshRadioProgression();
                const facts = progressionFactsFromMeta(m);
                const cap = capabilityFromMeta(m);
                const crewFull =
                  crewOccupancy(m) >= cap.crewCapacity.effective
                    ? "CREW CAPACITY FULL"
                    : null;

                const wolfProg = getUniqueContactProgress(radio, "wolf");
                const wolfDef = UNIQUE_OPERATOR_BY_ID["wolf"];
                const wolfTx =
                  wolfDef && wolfProg.lifecycle !== "HIDDEN"
                    ? uniqueTransmissionForLifecycle(wolfDef, wolfProg.lifecycle)
                    : null;
                const wolfReqs =
                  wolfDef &&
                  (wolfProg.lifecycle === "REQUIREMENTS_VISIBLE" ||
                    wolfProg.lifecycle === "CONTACTABLE" ||
                    wolfProg.lifecycle === "RECRUITABLE")
                    ? wolfDef.contactRequirements.map((r) => evaluateRequirement(r, facts))
                    : null;
                const wolfCanRecruit =
                  !!wolfDef &&
                  (wolfProg.lifecycle === "RECRUITABLE" || wolfProg.lifecycle === "CONTACTABLE") &&
                  uniqueContactRequirementsMet(wolfDef, facts);

                const questHint =
                  radio.radioState === "BROKEN"
                    ? `CURRENT SIGNAL TASK · ${QUEST_SPEC_BY_ID["radio_power"]?.name ?? "DEAD CHANNEL"} — restore power.`
                    : radio.radioState === "POWERED_STATIC"
                      ? `CURRENT SIGNAL TASK · ${QUEST_SPEC_BY_ID["radio_signal"]?.name ?? "RAISE THE TOWER"} — repair the signal path.`
                      : radio.radioState === "SIGNAL_RESTORED" &&
                          wolfProg.lifecycle === "RECRUITED" &&
                          wolfProg.transmissionSettled
                        ? `CURRENT SIGNAL TASK · ${QUEST_SPEC_BY_ID["radio_network"]?.name ?? "OPEN FREQUENCIES"} — unlock the scav network.`
                        : radio.radioState === "SIGNAL_RESTORED" &&
                            (wolfProg.lifecycle === "REQUIREMENTS_VISIBLE" ||
                              wolfProg.lifecycle === "CONTACTABLE" ||
                              wolfProg.lifecycle === "RECRUITABLE")
                          ? `CURRENT SIGNAL TASK · ${QUEST_SPEC_BY_ID["wolf_help"]?.name ?? "HELP WOLF"} — prove you can hold a line.`
                          : null;

                const showWolfTx =
                  !!wolfDef &&
                  !!wolfTx &&
                  isUniqueContactActiveTransmission(wolfProg);

                const uniqueContact = showWolfTx
                    ? {
                        uniqueId: "wolf",
                        lifecycle: wolfProg.lifecycle,
                        transmission: wolfTx!,
                        onAdvance:
                          wolfProg.lifecycle === "DISTRESS_SIGNAL" ||
                          wolfProg.lifecycle === "IDENTIFIED"
                            ? () => {
                                const cur = metaRef.current;
                                ensureRadio(cur);
                                const before = unlockContextFromMeta(cur);
                                const life =
                                  wolfProg.lifecycle === "IDENTIFIED"
                                    ? ("REQUIREMENTS_VISIBLE" as const)
                                    : advanceUniqueLifecycle(wolfProg.lifecycle);
                                cur.crew.radio = setUniqueLifecycle(cur.crew.radio!, "wolf", life);
                                const after = unlockContextFromMeta(cur);
                                const unlockedIds = listNewlyUnlockedQuestIds(QUEST_SPECS, before, after);
                                const unlocked = unlockedIds
                                  .map((id) => QUEST_SPEC_BY_ID[id])
                                  .filter((q): q is NonNullable<typeof q> => !!q);
                                saveMeta(cur);
                                if (unlocked.length) {
                                  enqueueNotices(buildNewQuestsNotice(unlocked));
                                }
                                rerender();
                              }
                            : wolfProg.lifecycle === "RECRUITED"
                              ? () => {
                                  const cur = metaRef.current;
                                  ensureRadio(cur);
                                  const before = unlockContextFromMeta(cur);
                                  cur.crew.radio = settleUniqueTransmission(cur.crew.radio!, "wolf");
                                  const after = unlockContextFromMeta(cur);
                                  const unlockedIds = listNewlyUnlockedQuestIds(QUEST_SPECS, before, after);
                                  const unlocked = unlockedIds
                                    .map((id) => QUEST_SPEC_BY_ID[id])
                                    .filter((q): q is NonNullable<typeof q> => !!q);
                                  saveMeta(cur);
                                  if (unlocked.length) {
                                    enqueueNotices(buildNewQuestsNotice(unlocked));
                                  } else {
                                    pushLog(
                                      `${getUniqueOperatorDisplayName("wolf")} cleared the channel.`,
                                    );
                                  }
                                  rerender();
                                }
                              : null,
                        onRecruit: wolfCanRecruit
                          ? () => {
                              const cur = metaRef.current;
                              const before = unlockContextFromMeta(cur);
                              const result = hireUniqueContact(cur, "wolf");
                              if (!result.ok) return pushLog(result.reason);
                              const after = unlockContextFromMeta(cur);
                              const unlockedIds = listNewlyUnlockedQuestIds(QUEST_SPECS, before, after);
                              const unlocked = unlockedIds
                                .map((id) => QUEST_SPEC_BY_ID[id])
                                .filter((q): q is NonNullable<typeof q> => !!q);
                              saveMeta(cur);
                              setDeployOperatorIds((ids) => [...ids, result.operator.id]);
                              pushLog(`${result.operator.name} joined the crew.`);
                              if (unlocked.length) {
                                enqueueNotices(buildNewQuestsNotice(unlocked));
                              }
                              rerender();
                            }
                          : null,
                        requirements: wolfReqs,
                        canRecruit: wolfCanRecruit,
                        recruitBlockedReason: crewFull,
                      }
                    : null;

                return (
                  <Overlay
                    title="RADIO"
                    subtitle={
                      cap.radioState === "NETWORKED"
                        ? RECRUITMENT_SUBTITLE
                        : radioStatePresentation(cap.radioState).subtitle
                    }
                    layout="wide"
                  >
                    <RecruitmentPanel
                      candidates={m.crew.recruitment.candidates}
                      bank={m.bank}
                      selectedId={selectedRecruitId}
                      onSelect={setSelectedRecruitId}
                      onHire={hireRecruit}
                      onBack={() => setScreen("hideout")}
                      radioState={cap.radioState}
                      hireBlockedReason={crewFull}
                      questHint={questHint}
                      uniqueContact={uniqueContact}
                      retransmission={
                        cap.retransmissionUnlocked
                          ? {
                              unlocked: true,
                              nextCost: nextRetransmissionCashCost(
                                CANONICAL_RETRANSMISSION,
                                radio.retransmissionCount,
                              ),
                              onRequest: () => {
                                const result = requestNewTransmission(metaRef.current);
                                if (!result.ok) return pushLog(result.reason);
                                saveMeta(metaRef.current);
                                pushLog(
                                  `New transmission — ${result.cost.toLocaleString()} ₽.`,
                                );
                                rerender();
                              },
                            }
                          : null
                      }
                    />
                  </Overlay>
                );
              })()}

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
                  {aliveOperators(meta).length > 0 && (
                    <div className="mt-2 pixel-card text-left font-mono text-[10px]">
                      <div className="text-muted-foreground">CREW DEPLOYMENT</div>
                      <div className="mt-1 space-y-1">
                        <div className="text-primary">
                          {meta.pmc.name} — always deploys
                        </div>
                        {aliveOperators(meta).map((op) => {
                          const on = deployOperatorIds.includes(op.id);
                          return (
                            <button
                              key={op.id}
                              onClick={() =>
                                setDeployOperatorIds((ids) =>
                                  on ? ids.filter((id) => id !== op.id) : [...ids, op.id],
                                )
                              }
                              className={`flex w-full items-center justify-between border px-2 py-1 ${
                                on ? "border-accent text-accent" : "border-border/50 text-muted-foreground"
                              }`}
                            >
                              <span>
                                {op.name} · {WEAPONS[op.equipment.weapon]?.name ?? "SIDEARM"}
                              </span>
                              <span>{on ? "DEPLOY" : "STAY"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                  subtitle="Crew kits · shared stash · raid loadout. Select an operator, then EQUIP / INSTALL / PACK."
                  layout="fill"
                >
                  <CrewEquipmentPanel
                    meta={meta}
                    selectedOwnerId={coerceEquipmentOwnerId(meta, selectedEquipOwnerId)}
                    onSelectOwner={setSelectedEquipOwnerId}
                    stash={stash}
                    stashSlots={stashSlots}
                    stashTab={stashTab}
                    setStashTab={setStashTab}
                    sortedStash={sortedStash}
                    loadout={loadout}
                    loadoutSlots={loadoutSlots}
                    onEquip={equipOnSelectedOwner}
                    onUnequip={unequipSelectedOwner}
                    onPack={toLoadout}
                    onUnpack={fromLoadout}
                    onBack={() => setScreen("hideout")}
                    onOpenArmory={() => setScreen("armory")}
                  />
                </Overlay>
              )}

              {s.phase === "hideout" && screen === "armory" && (
                <Overlay
                  title="GUN BENCH"
                  subtitle="Clean it up · bolt on parts · make it work."
                  layout="fill"
                >
                  <ArmoryPanel
                    meta={meta}
                    selectedOwnerId={coerceEquipmentOwnerId(meta, selectedEquipOwnerId)}
                    onSelectOwner={setSelectedEquipOwnerId}
                    stash={stash}
                    stashSlots={stashSlots}
                    shopDefIds={shopIds}
                    buyMult={mods.buyMult}
                    bank={meta.bank}
                    onInstallFromStash={equipOnSelectedOwner}
                    onBuyAndInstall={armoryBuyAndInstall}
                    onDetachMount={(idx) => unequipSelectedOwner(idx)}
                    onEquipWeapon={equipOnSelectedOwner}
                    onUnequipWeapon={() => unequipSelectedOwner("weapon")}
                    onApplyScavMods={(next) => {
                      const m = metaRef.current;
                      const ownerId = coerceEquipmentOwnerId(m, selectedEquipOwnerId);
                      const result = setOwnerScavMods(m, ownerId, next);
                      if (!result.ok) {
                        pushLog(result.reason);
                        return;
                      }
                      saveMeta(m);
                      rerender();
                    }}
                    onBack={() => setScreen("hideout")}
                    onOpenEquipment={() => setScreen("gear")}
                  />
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
                  {battleTimeMode === "PAUSED"
                    ? "TACTICAL PAUSE — L-CLICK move · R-CLICK ORDERS · ESC cancel"
                    : ordersEditorMode.kind !== "idle"
                      ? ordersEditorMode.kind === "author_move"
                        ? "ORDERS — click destination · ESC cancel"
                        : ordersEditorMode.kind === "author_hold"
                          ? "ORDERS — click hold direction · ESC cancel"
                          : "ORDERS open"
                      : "L-CLICK tile = MOVE · R-CLICK = ORDERS · ORDERS for sequences"}
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
                {selected ? getRaidOperatorTitle(selected, meta) : "NO OPERATOR SELECTED"}
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
                  <StatRow label="CONE" value={`±${(getShotDispersion(st.accuracy) * 180 / Math.PI).toFixed(1)}°`} />
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
                    value={`${(towerMoveSpeedPx(selected, metaRef.current) / TILE).toFixed(2)} T/S`}
                  />
                  <StatRow
                    label="LOAD"
                    value={(
                      getEquippedWeight(selected) +
                      scavVisualMods(selected.weapon, selected.scavMods).weightAdd
                    ).toFixed(1)}
                  />
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
                    <div className="mb-1 flex items-center justify-between gap-2 text-[9px] tracking-wide text-muted-foreground">
                      <span>COMMANDS</span>
                      {(() => {
                        const sum = planSummary(planBookRef.current.get(selected.id));
                        return sum ? <span className="text-primary">{sum}</span> : null;
                      })()}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className={`pixel-btn px-1 py-0 text-[9px] ${
                          ordersOpenFor === selected.id ? "pixel-btn-primary" : "text-muted-foreground"
                        }`}
                        onClick={() => {
                          const existing = planBookRef.current.get(selected.id) ?? createEmptyPlan();
                          setOrdersDraft(existing);
                          setOrdersOpenFor(selected.id);
                          setOrdersMode({ kind: "idle" });
                          rerender();
                        }}
                      >
                        ORDERS
                      </button>
                      <button
                        type="button"
                        className="pixel-btn px-1 py-0 text-[9px] text-muted-foreground"
                        onClick={() => {
                          const wasReloading = selected.reloadLeft > 0;
                          const r = dispatchOperatorCommand(
                            selected,
                            { type: "RELOAD" },
                            { map: mapRef.current, towers: gs.current.towers },
                          );
                          if (!r.ok) pushLog(r.reason);
                          else {
                            if (battleTimeMode === "PAUSED") {
                              noteReloadAuthoredInPause(
                                pauseReloadSessionRef.current,
                                selected.id,
                                wasReloading,
                              );
                            }
                            if (r.message) pushLog(r.message);
                          }
                          rerender();
                        }}
                      >
                        RELOAD
                      </button>
                      <button
                        type="button"
                        className="pixel-btn px-1 py-0 text-[9px] text-muted-foreground"
                        title="Clear plan + move/hold; cancel pause-authored reload only"
                        onClick={() => {
                          const ctx = { map: mapRef.current, towers: gs.current.towers };
                          const plan = planBookRef.current.get(selected.id);
                          if (plan?.state === "EXECUTING") {
                            setPlan(planBookRef.current, selected.id, clearFutureOrders(plan));
                          } else {
                            clearPlan(planBookRef.current, selected.id);
                          }
                          const cancelReload = canCancelPausedReload(
                            pauseReloadSessionRef.current,
                            selected.id,
                            selected.reloadLeft,
                            battleTimeMode === "PAUSED",
                          );
                          clearOperatorOrders(selected, ctx, { cancelReload });
                          if (cancelReload) {
                            pauseReloadSessionRef.current.authoredReloadIds.delete(selected.id);
                          }
                          closeOrdersUi();
                          pushLog("ORDERS CLEARED");
                          rerender();
                        }}
                      >
                        CLEAR
                      </button>
                    </div>
                    <p className="mt-1 text-[8px] text-muted-foreground">L-CLICK map = MOVE</p>
                  </div>
                  <div className="pt-1">
                    <div className="mb-1 text-[9px] tracking-wide text-muted-foreground">TARGETING</div>
                    <div className="flex flex-wrap gap-1">
                      {TARGET_MODES.filter((m) => m !== "HOLD_ANGLE").map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`pixel-btn px-1 py-0 text-[9px] ${
                            selected.targetMode === mode ? "text-primary" : "text-muted-foreground"
                          }`}
                          onClick={() => {
                            dispatchOperatorCommand(
                              selected,
                              { type: "SET_TARGETING", mode },
                              { map: mapRef.current, towers: gs.current.towers },
                            );
                            closeOrdersUi();
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
                    {mountRowsForWeapon(selected.weapon, selected.attachments).map((row) => (
                      <div key={row.mount} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="flex items-center gap-1 text-foreground">
                          {row.attachmentId ? (ATTACHMENTS[row.attachmentId]?.name ?? row.attachmentId) : "EMPTY"}
                          {row.attachmentId && (
                            <button
                              type="button"
                              className="pixel-btn px-1 py-0 text-[8px]"
                              onClick={() => detachFromTower(selected.id, row.attachmentId!)}
                            >
                              DETACH
                            </button>
                          )}
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
      {DEV_TOOLS_ENABLED && questLabOpen && (
        <QuestEditor
          enabled={DEV_TOOLS_ENABLED}
          inRaid={s.phase !== "hideout" && s.phase !== "dead" && s.phase !== "extracted"}
          onClose={() => setLabs("none")}
          onApplied={(overrides) => {
            syncDevForcedQuestProgression(metaRef.current, overrides.forcedCompleted);
            saveMeta(metaRef.current);
            rerender();
          }}
          unlockContext={{
            claimedQuestIds: effectiveClaimedQuestIds(
              metaRef.current.claimed,
              getQuestLabOverrides().forcedCompleted,
            ),
            playerLevel: metaRef.current.pmc.level,
            radioState: (metaRef.current.crew.radio ?? freshRadioProgression()).radioState,
            uniqueContacts: metaRef.current.crew.radio?.uniqueContacts,
          }}
          canonicalClaimedIds={metaRef.current.claimed}
          onTestQuest={(questId) => {
            const inRaidNow = s.phase !== "hideout" && s.phase !== "dead" && s.phase !== "extracted";
            const r = requestTestQuest(DEV_TOOLS_ENABLED, inRaidNow, questId);
            if (r.ok) {
              pushLog(`TEST QUEST ${questId} — progress isolated from save`);
              rerender();
            }
            return r;
          }}
          onResetTestProgress={(questId) => {
            resetQuestTestProgress(questId);
            pushLog(`TEST QUEST progress reset (${questId})`);
            rerender();
          }}
        />
      )}
      {DEV_TOOLS_ENABLED && recruitmentLabOpen && (
        <RecruitmentLab
          enabled={DEV_TOOLS_ENABLED}
          meta={metaRef.current}
          onClose={() => setLabs("none")}
          onApplied={() => rerender()}
          onRegeneratePool={() => {
            regenerateRecruitmentPool(metaRef.current);
            saveMeta(metaRef.current);
            pushLog("DEV: Radio pool regenerated");
            rerender();
          }}
          onRequestTransmission={() => {
            const result = requestNewTransmission(metaRef.current);
            if (result.ok) {
              saveMeta(metaRef.current);
              pushLog(`DEV: Retransmission (-${result.cost}₽)`);
            } else {
              pushLog(`DEV: Retransmission failed — ${result.reason}`);
            }
            rerender();
          }}
        />
      )}
      {progressionNotices[0] && (
        <ProgressionNoticeModal notice={progressionNotices[0]} onContinue={dismissProgressionNotice} />
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
  layout?: "center" | "fill" | "wide";
}) {
  const fill = layout === "fill";
  const wide = layout === "wide";
  return (
    <div
      className={`absolute inset-0 z-10 flex flex-col items-center gap-2 bg-background/85 p-3 text-center backdrop-blur-[1px] pixel-scrollbar sm:p-5 ${
        fill ? "overflow-hidden" : wide ? "justify-start overflow-auto pt-4 sm:pt-6" : "justify-center overflow-auto"
      }`}
    >
      <h2 className="shrink-0 font-display text-base text-primary sm:text-xl">{title}</h2>
      <p className="shrink-0 max-w-3xl font-mono text-[11px] text-muted-foreground sm:text-xs">{subtitle}</p>
      <div
        className={`w-full ${
          fill
            ? "flex min-h-0 flex-1 flex-col overflow-hidden max-w-7xl"
            : wide
              ? "flex min-h-0 w-[min(80vw,72rem)] max-w-[80vw] flex-1 flex-col"
              : "max-w-4xl"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
