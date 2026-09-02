import type { RadioProgressionState } from "./radioProgression";

/** Canonical operator combat dimensions. Deltas are applied at runtime, not baked into equipment. */
export interface OperatorBaseStats {
  aim: number;
  toughness: number;
  handling: number;
  mobility: number;
}

export type OperatorStatus = "alive" | "dead";

export interface OperatorAppearance {
  presetId: string;
  paletteId?: string;
}

export interface OperatorEquipment {
  weapon: string;
  attachments: string[];
  armor: string | null;
}

export interface OperatorProgression {
  level: number;
  xp: number;
}

/**
 * Persistent hideout operator. Raid towers are runtime instances of this record.
 * traitIds is the canonical multi-trait list (positive + negative).
 * perkIds is retained for migration/compat and mirrors positive traits.
 */
export interface PersistentOperator {
  id: string;
  name: string;
  roleLabel: string;
  archetypeId: string;
  /** Set when hired from a unique contact definition. */
  uniqueId?: string;
  stats: OperatorBaseStats;
  potential: OperatorBaseStats;
  /** Canonical trait list (positive + negative). Prefer this; migrate from perkIds. */
  traitIds?: string[];
  /** Positive traits / legacy perk list. */
  perkIds: string[];
  /** @deprecated Prefer traitIds — kept for save/UI compat. */
  negativeTraitIds?: string[];
  equipment: OperatorEquipment;
  appearance: OperatorAppearance;
  progression: OperatorProgression;
  status: OperatorStatus;
}

/** Radio offer before hire. Candidate IDs are temporary and discarded on hire. */
export interface RecruitCandidate {
  candidateId: string;
  name: string;
  roleLabel: string;
  archetypeId: string;
  uniqueId?: string;
  stats: OperatorBaseStats;
  potential: OperatorBaseStats;
  traitIds?: string[];
  perkIds: string[];
  negativeTraitIds?: string[];
  equipment: OperatorEquipment;
  appearance: OperatorAppearance;
  cost: number;
  /** Internal generation quality used for this candidate. */
  generationQuality?: number;
}

export interface RecruitmentPoolState {
  seed: number;
  generation: number;
  /** meta.runs value when this pool was last generated. */
  lastRefreshedAtRun: number;
  candidates: RecruitCandidate[];
}

export interface CrewState {
  operators: PersistentOperator[];
  recruitment: RecruitmentPoolState;
  radio: RadioProgressionState;
}

/** Normalize trait lists: prefer traitIds, fall back to perkIds + negativeTraitIds. */
export function resolveTraitIds(raw: {
  traitIds?: string[];
  perkIds?: string[];
  negativeTraitIds?: string[];
}): { traitIds: string[]; perkIds: string[]; negativeTraitIds: string[] } {
  if (Array.isArray(raw.traitIds) && raw.traitIds.length) {
    const traitIds = [...new Set(raw.traitIds.filter(Boolean))];
    const perkIds = traitIds.filter((id) => !(raw.negativeTraitIds ?? []).includes(id));
    // Split by known polarity when available is done by callers; keep simple mirror:
    return {
      traitIds,
      perkIds: Array.isArray(raw.perkIds) && raw.perkIds.length ? [...raw.perkIds] : perkIds,
      negativeTraitIds: Array.isArray(raw.negativeTraitIds) ? [...raw.negativeTraitIds] : [],
    };
  }
  const perkIds = Array.isArray(raw.perkIds) ? [...raw.perkIds] : [];
  const negativeTraitIds = Array.isArray(raw.negativeTraitIds) ? [...raw.negativeTraitIds] : [];
  return {
    traitIds: [...new Set([...perkIds, ...negativeTraitIds])],
    perkIds,
    negativeTraitIds,
  };
}
