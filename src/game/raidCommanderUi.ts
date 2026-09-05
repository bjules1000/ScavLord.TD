/**
 * Raid commander layout / interaction contracts (testable without DOM).
 * TarkovTD implements these surfaces; this module documents the hierarchy.
 */

export const RAID_COMMANDER_SIDEBAR_ORDER = [
  "RAID_CONTROL",
  "OPERATOR_SUMMARY",
  "TARGETING",
  "ORDERS",
  "DETAILS_COLLAPSIBLE",
  "FIELD_NOTES",
  "RADIO",
] as const;

export const RAID_CONTROL_ACTIONS = ["START", "EXTRACT"] as const;

/** Removed from persistent bottom toolbar in M9 commander pass. */
export const REMOVED_BOTTOM_TOOLBAR_ACTIONS = [
  "HIRE OPERATOR",
  "BARRICADE",
  "BARBED WIRE",
  "START WAVE",
  "EXTRACT",
] as const;

export const OPERATOR_SUMMARY_ESSENTIALS = ["TITLE", "ACTIVITY", "WEAPON", "HP", "AMMO", "DETAILS_TOGGLE"] as const;

export const BACKPACK_PLACEMENT = "BELOW_BATTLEFIELD" as const;

export function detailsExpandedByDefault(): boolean {
  return false;
}

export function targetingAccessibleWhenDetailsCollapsed(): boolean {
  return true;
}

export function ordersAccessibleWhenDetailsCollapsed(): boolean {
  return true;
}
