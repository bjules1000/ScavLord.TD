/**
 * Resolve player-facing raid identity from persistent state.
 * Tower keeps operatorId / pmc flags only — names live on Meta.
 */

import type { Meta } from "../meta";
import type { Tower } from "../types";
import { findOperator } from "./crew";
import { STARTING_OPERATOR } from "./startingOperator";

const FALLBACK_DISPLAY = "OPERATOR";

export type RaidOperatorIdentity = {
  /** Stable link: "leader" for pmc tower, else PersistentOperator.id */
  persistentOperatorId: string | null;
  name: string;
  roleLabel: string | null;
  /** True when only the defensive fallback was available. */
  isFallback: boolean;
};

/** Resolve display identity for a raid tower without snapshotting names onto Tower. */
export function resolveRaidOperatorIdentity(
  tower: Pick<Tower, "pmc" | "operatorId">,
  meta: Meta,
): RaidOperatorIdentity {
  if (tower.pmc) {
    const name = (meta.pmc.name || STARTING_OPERATOR.defaultName).trim() || FALLBACK_DISPLAY;
    return {
      persistentOperatorId: STARTING_OPERATOR.id,
      name,
      roleLabel: STARTING_OPERATOR.roleLabel,
      isFallback: !meta.pmc.name?.trim(),
    };
  }
  if (tower.operatorId) {
    const op = findOperator(meta, tower.operatorId);
    if (op) {
      const name = op.name.trim() || FALLBACK_DISPLAY;
      return {
        persistentOperatorId: op.id,
        name,
        roleLabel: op.roleLabel || null,
        isFallback: !op.name.trim(),
      };
    }
    return {
      persistentOperatorId: tower.operatorId,
      name: FALLBACK_DISPLAY,
      roleLabel: null,
      isFallback: true,
    };
  }
  return {
    persistentOperatorId: null,
    name: FALLBACK_DISPLAY,
    roleLabel: null,
    isFallback: true,
  };
}

export function getRaidOperatorDisplayName(
  tower: Pick<Tower, "pmc" | "operatorId">,
  meta: Meta,
): string {
  return resolveRaidOperatorIdentity(tower, meta).name;
}

/** Sidebar / selection header: "WOLF · MARKSMAN" or "ASH-01 · LEADER". */
export function getRaidOperatorTitle(
  tower: Pick<Tower, "pmc" | "operatorId">,
  meta: Meta,
): string {
  const id = resolveRaidOperatorIdentity(tower, meta);
  if (id.roleLabel) return `${id.name} · ${id.roleLabel}`;
  return id.name;
}
