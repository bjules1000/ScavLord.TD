/**
 * Retransmission ("REQUEST NEW TRANSMISSION") — locked until progression unlocks it.
 * Cost escalates within a recruitment cycle; resets on natural post-raid pool refresh.
 */

export interface RetransmissionRules {
  /** Cash base cost for first retransmission in a cycle. */
  baseCashCost: number;
  /** Multiplier applied per prior retransmission this cycle: cost = base * escalation^count. */
  escalation: number;
  /** Optional hard cap; null = unlimited. */
  maxPerCycle: number | null;
  /** Future resource-cost hooks (not consumed until those resources exist). */
  resourceCosts: { batteries?: number; electronics?: number };
}

export const CANONICAL_RETRANSMISSION: RetransmissionRules = {
  baseCashCost: 350,
  escalation: 1.75,
  maxPerCycle: 5,
  resourceCosts: {},
};

export function nextRetransmissionCashCost(
  rules: RetransmissionRules,
  retransmissionCount: number,
): number {
  const count = Math.max(0, retransmissionCount);
  const raw = rules.baseCashCost * Math.pow(rules.escalation, count);
  return Math.max(0, Math.round(raw));
}

export type RetransmissionAttempt =
  | { ok: true; cost: number }
  | { ok: false; reason: string };

export function canRequestRetransmission(opts: {
  unlocked: boolean;
  rules: RetransmissionRules;
  retransmissionCount: number;
  bank: number;
}): RetransmissionAttempt {
  if (!opts.unlocked) return { ok: false, reason: "Retransmission locked." };
  if (opts.rules.maxPerCycle != null && opts.retransmissionCount >= opts.rules.maxPerCycle) {
    return { ok: false, reason: "Frequency search exhausted this cycle." };
  }
  const cost = nextRetransmissionCashCost(opts.rules, opts.retransmissionCount);
  if (opts.bank < cost) {
    return { ok: false, reason: `Need ${cost.toLocaleString()} ₽.` };
  }
  return { ok: true, cost };
}
