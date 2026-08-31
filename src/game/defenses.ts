/** Player-built frontline defenses. */

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

export function interceptingBarricade<T extends DefensePiece>(
  pieces: readonly T[],
  tx: number,
  ty: number,
  srcX: number,
  srcY: number,
  tile: number,
): T | null {
  const incoming = edgeFromCursor(srcX, srcY, tx, ty, tile);
  const hit = barricadeOnEdge(pieces, tx, ty, incoming);
  return hit && hit.hp > 0 ? hit : null;
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
