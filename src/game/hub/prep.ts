import type { Item } from "../gear";
import {
  canInstallAttachmentOnWeapon,
  installedInMount,
  slotOf,
} from "../weaponAttachments";

export type RaidPrepAction = "equip" | "pack" | "replace";

export type KitContext = {
  attachments: string[];
  attachmentSlots: number;
  weaponId: string;
};

/** Valid Raid Prep actions for a stash item under current kit constraints. */
export function raidPrepActions(item: Item, kit: KitContext): RaidPrepAction[] {
  const actions: RaidPrepAction[] = [];
  if (item.kind === "weapon" && item.ref) actions.push("equip");
  else if (item.kind === "armor" && item.ref) actions.push("equip");
  else if (item.kind === "attachment" && item.ref) {
    const check = canInstallAttachmentOnWeapon(kit.weaponId, item.ref);
    if (check.ok) {
      const mount = slotOf(item.ref);
      const occupied = mount ? installedInMount(kit.attachments, mount) : undefined;
      if (occupied && occupied !== item.ref) actions.push("replace");
      else if (!occupied && !kit.attachments.includes(item.ref)) actions.push("equip");
      else if (occupied === item.ref) {
        // already fitted
      } else if (!occupied) actions.push("equip");
    }
  }
  actions.push("pack");
  return actions;
}

export function attachmentActionLabel(actions: RaidPrepAction[]): string {
  if (actions.includes("replace")) return "REPLACE";
  if (actions.includes("equip")) return "INSTALL";
  return "";
}

export function attachmentBlockReason(item: Item, kit: KitContext): string | null {
  if (item.kind !== "attachment" || !item.ref) return null;
  if (attachmentActionLabel(raidPrepActions(item, kit))) return null;
  const check = canInstallAttachmentOnWeapon(kit.weaponId, item.ref);
  if (!check.ok) return check.reason;
  if (kit.attachments.includes(item.ref)) return "ALREADY FITTED";
  return "NO SLOT";
}
