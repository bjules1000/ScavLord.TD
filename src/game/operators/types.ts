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

/** Persistent hideout operator. Raid towers are runtime instances of this record. */
export interface PersistentOperator {
  id: string;
  name: string;
  roleLabel: string;
  archetypeId: string;
  stats: OperatorBaseStats;
  potential: OperatorBaseStats;
  perkIds: string[];
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
  stats: OperatorBaseStats;
  potential: OperatorBaseStats;
  perkIds: string[];
  negativeTraitIds?: string[];
  equipment: OperatorEquipment;
  appearance: OperatorAppearance;
  cost: number;
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
}
