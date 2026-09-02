/**
 * Canonical authored starting leader identity.
 * Change defaultName here to rename new games — do not scatter name literals in gameplay.
 * Persisted saves keep meta.pmc.name as stored; this default only seeds freshPmc().
 */

export const STARTING_OPERATOR_ID = "leader" as const;

export const STARTING_OPERATOR = {
  /** Stable equipment / conceptual owner id (matches LEADER_EQUIPMENT_OWNER_ID). */
  id: STARTING_OPERATOR_ID,
  /** Authored default display name for brand-new games only. */
  defaultName: "ASH-01",
  roleLabel: "LEADER",
} as const;

export type StartingOperatorConfig = typeof STARTING_OPERATOR;
