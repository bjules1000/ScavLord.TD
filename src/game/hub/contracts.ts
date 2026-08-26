import { QUESTS, type QuestProgress } from "../meta";

export interface CompactContract {
  id: string;
  name: string;
  line: string;
  ready: boolean;
}

/** Read-only camp rail entries. Incomplete first, then one redeemable if room. */
export function compactContracts(
  quests: QuestProgress,
  claimed: string[],
  limit = 3,
): CompactContract[] {
  const unused = QUESTS.filter((q) => !claimed.includes(q.id));
  const open = unused.filter((q) => !q.done(quests));
  const ready = unused.filter((q) => q.done(quests));
  const picked: CompactContract[] = [];
  const openLimit = ready[0] ? Math.max(0, limit - 1) : limit;
  for (const q of open) {
    if (picked.length >= openLimit) break;
    picked.push({ id: q.id, name: q.name, line: q.progress(quests), ready: false });
  }
  if (picked.length < limit && ready[0]) {
    const q = ready[0];
    picked.push({ id: q.id, name: q.name, line: "Complete", ready: true });
  }
  return picked;
}
