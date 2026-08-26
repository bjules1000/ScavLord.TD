import type { Item } from "../gear";

export type RaidPrepAction = "equip" | "pack";

/** Valid Raid Prep actions for a stash item under current kit constraints. */
export function raidPrepActions(
  item: Item,
  kit: { attachments: string[]; attachmentSlots: number },
): RaidPrepAction[] {
  const actions: RaidPrepAction[] = [];
  if (item.kind === "weapon" && item.ref) actions.push("equip");
  else if (item.kind === "armor" && item.ref) actions.push("equip");
  else if (item.kind === "attachment" && item.ref) {
    const room = kit.attachments.length < kit.attachmentSlots;
    const unique = !kit.attachments.includes(item.ref);
    if (room && unique) actions.push("equip");
  }
  actions.push("pack");
  return actions;
}
