import type { OperatorBaseStats } from "./types";
import { STAT_NEUTRAL, clampStat } from "./stats";

export interface ArchetypeDef {
  id: string;
  roleLabel: string;
  /** Baseline tendencies before random variation. */
  tendencies: Partial<OperatorBaseStats>;
  /** Weight in random archetype pick. */
  weight: number;
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: "marksman",
    roleLabel: "MARKSMAN",
    tendencies: { aim: 8, mobility: -2, toughness: -1 },
    weight: 1,
  },
  {
    id: "runner",
    roleLabel: "RUNNER",
    tendencies: { mobility: 8, toughness: -4, handling: 2 },
    weight: 1,
  },
  {
    id: "bruiser",
    roleLabel: "BRUISER",
    tendencies: { toughness: 8, mobility: -5, handling: -2 },
    weight: 1,
  },
  {
    id: "rifleman",
    roleLabel: "RIFLEMAN",
    tendencies: { aim: 2, handling: 2, toughness: 1 },
    weight: 1,
  },
  {
    id: "scrapper",
    roleLabel: "SCRAPPER",
    tendencies: { toughness: 2, aim: -2, handling: 3 },
    weight: 1,
  },
];

export const ARCHETYPE_BY_ID: Record<string, ArchetypeDef> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a]),
);

export function applyArchetypeBaseline(archetypeId: string, variation: OperatorBaseStats): OperatorBaseStats {
  const arch = ARCHETYPE_BY_ID[archetypeId];
  const base = arch?.tendencies ?? {};
  return {
    aim: clampStat(STAT_NEUTRAL + (base.aim ?? 0) + (variation.aim - STAT_NEUTRAL)),
    toughness: clampStat(STAT_NEUTRAL + (base.toughness ?? 0) + (variation.toughness - STAT_NEUTRAL)),
    handling: clampStat(STAT_NEUTRAL + (base.handling ?? 0) + (variation.handling - STAT_NEUTRAL)),
    mobility: clampStat(STAT_NEUTRAL + (base.mobility ?? 0) + (variation.mobility - STAT_NEUTRAL)),
  };
}
