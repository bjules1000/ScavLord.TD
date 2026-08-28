import { WEAPONS, type ReloadType, type WeaponDef } from "./gear";
import type { TargetMode } from "./targeting";

export type { ReloadType };

export const STARTER_WEAPON_ID = "pm";
export const HIRED_WEAPON_ID = "toz";

export function weaponDef(weaponId: string): WeaponDef {
  return WEAPONS[weaponId] ?? WEAPONS[HIRED_WEAPON_ID] ?? WEAPONS[STARTER_WEAPON_ID]!;
}

export function magSizeOf(weaponId: string): number {
  return weaponDef(weaponId).magSize;
}

export function reloadMsOf(weaponId: string): number {
  return weaponDef(weaponId).reloadMs;
}

export function reloadTypeOf(weaponId: string): ReloadType {
  return weaponDef(weaponId).reloadType;
}

export function initAmmo(weaponId: string): number {
  return magSizeOf(weaponId);
}

export function weaponRuntimeFields(weaponId: string) {
  return {
    ammo: initAmmo(weaponId),
    reloadLeft: 0,
    targetMode: "FIRST" as TargetMode,
    manualTargetId: null as number | null,
    engageTargetId: null as number | null,
  };
}

export function canShoot(ammo: number, reloadLeft: number): boolean {
  return ammo > 0 && reloadLeft <= 0;
}

/** Consume one round. Never drops below zero. Does not start reload. */
export function consumeRound(ammo: number): number {
  return Math.max(0, ammo - 1);
}

/**
 * Advance an in-progress reload.
 * MAGAZINE fills to capacity on completion.
 * PER_ROUND adds one shell; if still not full and there is no valid target,
 * the next shell starts immediately. A valid target interrupts further loading.
 */
export function tickReload(
  ammo: number,
  reloadLeft: number,
  dtMs: number,
  magSize: number,
  reloadMs: number,
  reloadType: ReloadType,
  hasValidTarget: boolean,
): { ammo: number; reloadLeft: number } {
  if (reloadLeft <= 0) return { ammo, reloadLeft: 0 };
  const left = reloadLeft - dtMs;
  if (left > 0) return { ammo, reloadLeft: left };
  if (reloadType === "MAGAZINE") return { ammo: magSize, reloadLeft: 0 };
  const next = Math.min(magSize, ammo + 1);
  if (next < magSize && !hasValidTarget) return { ammo: next, reloadLeft: reloadMs };
  return { ammo: next, reloadLeft: 0 };
}

/** Start a reload when empty, or top up a PER_ROUND gun while idle. */
export function maybeStartReload(
  ammo: number,
  reloadLeft: number,
  magSize: number,
  reloadMs: number,
  reloadType: ReloadType,
  hasValidTarget: boolean,
): number {
  if (reloadLeft > 0) return reloadLeft;
  if (ammo <= 0) return reloadMs;
  if (reloadType === "PER_ROUND" && ammo < magSize && !hasValidTarget) return reloadMs;
  return 0;
}

export type CombatStatus = "IDLE" | "ENGAGING" | "RELOADING" | "HOLD";

export function combatStatus(
  reloadLeft: number,
  hasTarget: boolean,
  manualWithoutTarget: boolean,
): CombatStatus {
  if (reloadLeft > 0) return "RELOADING";
  if (manualWithoutTarget) return "HOLD";
  if (hasTarget) return "ENGAGING";
  return "IDLE";
}

export function reloadProgress(reloadLeft: number, reloadMs: number): number {
  if (reloadMs <= 0 || reloadLeft <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - reloadLeft / reloadMs));
}
