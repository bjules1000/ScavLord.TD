/** Player-built frontline defenses. */

import { coverProtectionFrom, type CoverPiece } from "./map";
import { LOS_EPS } from "./los";

export type DefenseResource = "RAID_ROUBLES";

export interface DefenseCost {
  resource: DefenseResource;
  amount: number;
}

export const BARRICADE_BUILD_COST: DefenseCost = { resource: "RAID_ROUBLES", amount: 300 };
export const WIRE_BUILD_COST: DefenseCost = { resource: "RAID_ROUBLES", amount: 120 };
export const BARRICADE_REPAIR_COST: DefenseCost = { resource: "RAID_ROUBLES", amount: 80 };
export const WIRE_REPAIR_COST: DefenseCost = { resource: "RAID_ROUBLES", amount: 50 };

/** @deprecated use BARRICADE_BUILD_COST */
export const BARRICADE_COST = BARRICADE_BUILD_COST.amount;
/** @deprecated use WIRE_BUILD_COST */
export const WIRE_COST = WIRE_BUILD_COST.amount;

export const BARRICADE_HP = 260;
export const WIRE_HP = 100;
export const MAX_BARRICADE_LEVEL = 3;

/** Seconds the slow status lasts after touching live wire. */
export const WIRE_SLOW_DURATION = 0.8;
/** Speed multiplier while slowed (45% remaining speed). */
export const WIRE_SPEED_MULT = 0.45;
/** Durability lost the first time an enemy occupies a live wire tile. */
export const WIRE_WEAR_PER_CROSS = 20;
/** Existing environmental DPS to enemies standing in live wire. */
export const WIRE_TICK_DAMAGE = 3;

export type DefenseKind = "barricade" | "wire";
export type DefenseStatus = "ACTIVE" | "DAMAGED" | "DESTROYED";
export type BarricadeEdge = "N" | "E" | "S" | "W";

export const BARRICADE_EDGES: readonly BarricadeEdge[] = ["N", "E", "S", "W"];
export const EDGE_LABEL: Record<BarricadeEdge, string> = {
  N: "NORTH",
  E: "EAST",
  S: "SOUTH",
  W: "WEST",
};
export const EDGE_DELTA: Record<BarricadeEdge, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

export interface DefensePiece {
  id: number;
  tx: number;
  ty: number;
  kind: DefenseKind;
  hp: number;
  maxHp: number;
  level: number;
  /** Occupied edge of the ground cell. Barricades only. Uniqueness is tx+ty+edge. */
  edge?: BarricadeEdge;
}

export function defenseStatus(hp: number, maxHp: number): DefenseStatus {
  if (hp <= 0) return "DESTROYED";
  if (hp < maxHp) return "DAMAGED";
  return "ACTIVE";
}

export function isLive(piece: Pick<DefensePiece, "hp">): boolean {
  return piece.hp > 0;
}

export function neighborCell(tx: number, ty: number, edge: BarricadeEdge): { tx: number; ty: number } {
  const d = EDGE_DELTA[edge];
  return { tx: tx + d.dx, ty: ty + d.dy };
}

/** Cursor nearest tile-center axis. Ties prefer N/S (vertical). Center click → N. */
export function edgeFromCursor(
  px: number,
  py: number,
  tx: number,
  ty: number,
  tile: number,
): BarricadeEdge {
  const dx = px - (tx * tile + tile / 2);
  const dy = py - (ty * tile + tile / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "E" : "W";
  return dy > 0 ? "S" : "N";
}

export function barricadeOnEdge<T extends DefensePiece>(
  pieces: readonly T[],
  tx: number,
  ty: number,
  edge: BarricadeEdge,
): T | null {
  return pieces.find((o) => o.kind === "barricade" && o.tx === tx && o.ty === ty && o.edge === edge) ?? null;
}

export function edgeOccupied<T extends DefensePiece>(
  pieces: readonly T[],
  tx: number,
  ty: number,
  edge: BarricadeEdge,
): boolean {
  return barricadeOnEdge(pieces, tx, ty, edge) != null;
}

export function canPlaceBarricade<T extends DefensePiece>(
  tx: number,
  ty: number,
  edge: BarricadeEdge,
  isRoadAt: (tx: number, ty: number) => boolean,
  isBuildableAt: (tx: number, ty: number) => boolean,
  pieces: readonly T[],
  isBridgeAt: (tx: number, ty: number) => boolean = () => false,
): boolean {
  if (isRoadAt(tx, ty)) return false;
  if (isBridgeAt(tx, ty)) return false;
  if (!isBuildableAt(tx, ty)) return false;
  if (edgeOccupied(pieces, tx, ty, edge)) return false;
  return true;
}

export function canPlaceWire<T extends DefensePiece>(
  tx: number,
  ty: number,
  isRoadAt: (tx: number, ty: number) => boolean,
  pieces: readonly T[],
): boolean {
  if (!isRoadAt(tx, ty)) return false;
  return !pieces.some((o) => o.kind === "wire" && o.tx === tx && o.ty === ty);
}

/** Virtual cover cell in the defended direction, for existing coverProtectionFrom. */
export function barricadeCoverCell(tx: number, ty: number, edge: BarricadeEdge): { tx: number; ty: number } {
  return neighborCell(tx, ty, edge);
}

/** Matches the existing hostile-fire cover miss roll: random() < prot * 0.55. */
export const COVER_MISS_FACTOR = 0.55;

export function coveredDamage(damage: number, prot: number): number {
  return damage * (1 - Math.max(0, Math.min(1, prot)));
}

export function coverMissChance(prot: number): number {
  return Math.max(0, Math.min(1, prot)) * COVER_MISS_FACTOR;
}

export function barricadeEdgeMidpoint(
  tx: number,
  ty: number,
  edge: BarricadeEdge,
  tile: number,
): { x: number; y: number } {
  const cx = tx * tile + tile / 2;
  const cy = ty * tile + tile / 2;
  if (edge === "N") return { x: cx, y: ty * tile };
  if (edge === "S") return { x: cx, y: (ty + 1) * tile };
  if (edge === "E") return { x: (tx + 1) * tile, y: cy };
  return { x: tx * tile, y: cy };
}

/** Edges of (tx,ty) the world segment first enters through. Empty if the origin is already in the tile. */
export function rayTileEntryEdges(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tx: number,
  ty: number,
  tile: number,
): BarricadeEdge[] {
  const startTx = Math.floor(x0 / tile);
  const startTy = Math.floor(y0 / tile);
  if (startTx === tx && startTy === ty) return [];

  const left = tx * tile;
  const right = (tx + 1) * tile;
  const top = ty * tile;
  const bot = (ty + 1) * tile;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const hits: { edge: BarricadeEdge; t: number }[] = [];

  const add = (edge: BarricadeEdge, t: number, u: number, u0: number, u1: number) => {
    if (t < -LOS_EPS || t > 1 + LOS_EPS) return;
    if (u < u0 - LOS_EPS || u > u1 + LOS_EPS) return;
    hits.push({ edge, t: Math.max(0, Math.min(1, t)) });
  };

  if (Math.abs(dx) > LOS_EPS) {
    const tW = (left - x0) / dx;
    add("W", tW, y0 + tW * dy, top, bot);
    const tE = (right - x0) / dx;
    add("E", tE, y0 + tE * dy, top, bot);
  }
  if (Math.abs(dy) > LOS_EPS) {
    const tN = (top - y0) / dy;
    add("N", tN, x0 + tN * dx, left, right);
    const tS = (bot - y0) / dy;
    add("S", tS, x0 + tS * dx, left, right);
  }
  if (!hits.length) return [];
  hits.sort((a, b) => a.t - b.t);
  const minT = hits[0]!.t;
  const edges: BarricadeEdge[] = [];
  for (const h of hits) {
    if (h.t - minT > 1e-7) break;
    if (!edges.includes(h.edge)) edges.push(h.edge);
  }
  return edges;
}

export function interceptingBarricade<T extends DefensePiece>(
  pieces: readonly T[],
  tx: number,
  ty: number,
  srcX: number,
  srcY: number,
  tile: number,
): T | null {
  const hitX = tx * tile + tile / 2;
  const hitY = ty * tile + tile / 2;
  const edges = rayTileEntryEdges(srcX, srcY, hitX, hitY, tx, ty, tile);
  const order = edges.length ? edges : [edgeFromCursor(srcX, srcY, tx, ty, tile)];
  for (const edge of order) {
    const hit = barricadeOnEdge(pieces, tx, ty, edge);
    if (hit && hit.hp > 0) return hit;
  }
  return null;
}

/** WHEN cover applies (ray enters through a live barricade edge) + existing HOW MUCH math. */
export function incomingCoverProtection(
  envCover: CoverPiece[],
  pieces: readonly DefensePiece[],
  tx: number,
  ty: number,
  srcX: number,
  srcY: number,
  tile: number,
): { prot: number; shield: DefensePiece | null } {
  let prot = coverProtectionFrom(envCover, tx, ty, srcX, srcY);
  const hitX = tx * tile + tile / 2;
  const hitY = ty * tile + tile / 2;
  const edges = rayTileEntryEdges(srcX, srcY, hitX, hitY, tx, ty, tile);
  let shield: DefensePiece | null = null;
  const virtual: CoverPiece[] = [];
  for (const edge of edges) {
    const bag = barricadeOnEdge(pieces, tx, ty, edge);
    if (!bag || bag.hp <= 0 || !bag.edge) continue;
    if (!shield) shield = bag;
    const cell = barricadeCoverCell(bag.tx, bag.ty, bag.edge);
    virtual.push({ tx: cell.tx, ty: cell.ty, type: "full" });
  }
  if (virtual.length) {
    prot = Math.max(prot, coverProtectionFrom(virtual, tx, ty, srcX, srcY));
  }
  return { prot, shield };
}

export function liveWireAt<T extends DefensePiece>(
  pieces: readonly T[],
  tx: number,
  ty: number,
): T | null {
  return pieces.find((o) => o.kind === "wire" && o.hp > 0 && o.tx === tx && o.ty === ty) ?? null;
}

export function canPayDefense(roubles: number, cost: DefenseCost): boolean {
  return cost.resource === "RAID_ROUBLES" && roubles >= cost.amount;
}

export function payDefense(
  roubles: number,
  cost: DefenseCost,
): { ok: true; roubles: number } | { ok: false; reason: string } {
  if (cost.resource !== "RAID_ROUBLES") return { ok: false, reason: "Unknown resource." };
  if (roubles < cost.amount) return { ok: false, reason: "Not enough roubles." };
  return { ok: true, roubles: roubles - cost.amount };
}

export function damageDefense<T extends Pick<DefensePiece, "hp">>(piece: T, amount: number): {
  hp: number;
  destroyed: boolean;
} {
  const wasLive = piece.hp > 0;
  piece.hp = Math.max(0, piece.hp - Math.max(0, amount));
  return { hp: piece.hp, destroyed: wasLive && piece.hp <= 0 };
}

export function canRepairDefense(phase: string, hp: number, maxHp: number): boolean {
  return phase === "prep" && hp < maxHp;
}

export function repairCost(kind: DefenseKind): number {
  return kind === "barricade" ? BARRICADE_REPAIR_COST.amount : WIRE_REPAIR_COST.amount;
}

export function repairDefense<T extends Pick<DefensePiece, "hp" | "maxHp">>(
  piece: T,
  phase: string,
  roubles: number,
  kind: DefenseKind,
): { ok: true; roubles: number; hp: number } | { ok: false; reason: string } {
  if (!canRepairDefense(phase, piece.hp, piece.maxHp)) {
    return { ok: false, reason: phase === "prep" ? "Already intact." : "Repair between waves." };
  }
  const paid = payDefense(roubles, kind === "barricade" ? BARRICADE_REPAIR_COST : WIRE_REPAIR_COST);
  if (!paid.ok) return paid;
  piece.hp = piece.maxHp;
  return { ok: true, roubles: paid.roubles, hp: piece.hp };
}

export function applyWireCrossing<T extends Pick<DefensePiece, "id" | "hp">>(
  wire: T,
  enemy: { contactingWireId: number | null },
): { slowed: boolean; wore: boolean } {
  if (wire.hp <= 0) {
    if (enemy.contactingWireId === wire.id) enemy.contactingWireId = null;
    return { slowed: false, wore: false };
  }
  const firstContact = enemy.contactingWireId !== wire.id;
  if (firstContact) {
    enemy.contactingWireId = wire.id;
    damageDefense(wire, WIRE_WEAR_PER_CROSS);
  }
  return { slowed: true, wore: firstContact };
}

export function clearWireContact(enemy: { contactingWireId: number | null }, occupyingWireId: number | null) {
  if (occupyingWireId == null) enemy.contactingWireId = null;
}

export function upgradeCost(level: number): number {
  return 140 * level;
}

export function obstacleDrawAlpha(hpFrac: number, ghost = false): number {
  if (ghost) return 0.38;
  return 0.45 + Math.max(0, Math.min(1, hpFrac)) * 0.55;
}
