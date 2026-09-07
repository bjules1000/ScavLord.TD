/** Canonical kill vs leak. HP values never encode lifecycle. */

export interface KillState {
  hp: number;
  leaked?: boolean;
  counted?: boolean;
}

export function isSettledOut(e: KillState): boolean {
  return !!e.leaked || !!e.counted || e.hp <= 0;
}

/**
 * Armor above pen removes a fraction of incoming damage — proportional, not flat, so it
 * bites a shotgun pellet and a sniper round the same relative amount. Always deals at
 * least 1 damage; pen can blunt armor but never fully cancels it once armor exceeds K.
 */
export const ARMOR_MITIGATION_K = 12;

export function damageAfterArmor(amount: number, armor: number, pen: number): number {
  const effective = Math.max(0, armor - pen);
  const reduction = Math.min(1, effective / ARMOR_MITIGATION_K);
  return Math.max(1, amount * (1 - reduction));
}

export function applyHit(e: KillState, amount: number, armor: number, pen: number): number {
  if (e.leaked || e.counted) return 0;
  const dealt = damageAfterArmor(amount, armor, pen);
  e.hp -= dealt;
  return dealt;
}

/** Environmental tick (barbed wire). No armor. Ignored on corpses / leaks. */
export function applyWireDamage(e: KillState, amount: number): number {
  if (e.leaked || e.counted || e.hp <= 0) return 0;
  e.hp -= amount;
  return amount;
}

/**
 * Path completed while still alive. Corpses never leak.
 * Returns true only on the first leak (deduct lives then).
 */
export function leakIfAlive(e: KillState): boolean {
  if (e.counted || e.hp <= 0 || e.leaked) return false;
  e.leaked = true;
  e.hp = 0;
  return true;
}

export function settleRemovedEnemies<T extends KillState>(enemies: T[]): {
  survivors: T[];
  kills: T[];
  leaks: T[];
} {
  const survivors: T[] = [];
  const kills: T[] = [];
  const leaks: T[] = [];
  for (const e of enemies) {
    if (e.leaked) {
      leaks.push(e);
      continue;
    }
    if (e.hp <= 0) {
      if (!e.counted) {
        e.counted = true;
        kills.push(e);
      }
      continue;
    }
    survivors.push(e);
  }
  return { survivors, kills, leaks };
}

export interface KillBook {
  killed: number;
  scavKills: number;
  bossKills: number;
  roubles: number;
}

export function killXpFor(kind: string): number {
  return kind === "boss" ? 120 : 14;
}

/** Bounty, HUD kills, and quest counters. Call once per settled kill, never for leaks. */
export function creditKillBook(kind: string, bounty: number, book: KillBook): number {
  book.roubles += bounty;
  book.killed += 1;
  if (kind === "boss") book.bossKills += 1;
  else book.scavKills += 1;
  return killXpFor(kind);
}
