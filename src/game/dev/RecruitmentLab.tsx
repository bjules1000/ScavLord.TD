import { useMemo, useState } from "react";
import { MAP_DEFS } from "../map";
import { QUESTS } from "../quests";
import { WEAPONS, ARMORS, ATTACHMENTS } from "../gear";
import {
  applyRecruitmentLabOverrides,
  capabilityFromRadio,
  effectiveRecruitmentProfiles,
  effectiveRetransmissionRules,
  effectiveTraitProbability,
  eligibleProfiles,
  formatRecruitmentPatch,
  generateTestRecruitmentPool,
  getPreviewRecruitmentPool,
  getRecruitmentLabOverrides,
  modifiedRecruitmentLabCount,
  nextLabRetransmissionCost,
  profileEligibilityRows,
  profileListForLab,
  profileLocked,
  profileShareLabel,
  progressionFactsFromMeta,
  recruitmentCostBreakdown,
  recruitmentLabOverridesEqual,
  resetRecruitmentLabAll,
  resetRecruitmentLabCandidate,
  resetRecruitmentLabProfile,
  resetRecruitmentLabRadio,
  resetRecruitmentLabUnique,
  type CandidateOverride,
  type ProfileOverride,
  type RecruitmentLabOverrides,
  type RecruitmentLabView,
} from "../operators/recruitmentLabCore";
import {
  RADIO_SLOT_MAX,
  RADIO_SLOT_MIN,
  RADIO_STATES,
  RECRUITMENT_QUALITY_MAX,
  RECRUITMENT_QUALITY_MIN,
  BASE_CREW_CAPACITY,
  CREW_CAPACITY_MAX,
  freshRadioProgression,
  type RadioState,
  type RecruitmentQuality,
  type UniqueContactLifecycle,
} from "../operators/radioProgression";
import {
  CANONICAL_RECRUITMENT_PROFILES,
  RECRUITMENT_PROFILE_BY_ID,
  type RecruitmentProfileKit,
  type WeightedGearEntry,
} from "../operators/recruitmentProfiles";
import {
  CANONICAL_BOSS_IDS,
  type RecruitmentRequirement,
} from "../operators/recruitmentRequirements";
import {
  CANONICAL_UNIQUE_OPERATORS,
  uniqueRevealForLifecycle,
} from "../operators/uniqueOperators";
import {
  PERKS,
  RECRUITABLE_NEGATIVE_TRAIT_IDS,
  RECRUITABLE_PERK_IDS,
  isNegativeTraitId,
  isPositivePerkId,
} from "../operators/perks";
import { STAT_KEYS, STAT_LABELS } from "../operators/stats";
import type { OperatorBaseStats } from "../operators/types";
import { resolveTraitIds } from "../operators/types";
import { candidateStatRows, formatRecruitmentRoubles } from "../operators/recruitmentUi";
import type { Meta } from "../meta";
import type { RecruitCandidate } from "../operators/types";
import { seedFromParts } from "../operators/rng";
import type { EnemyKind } from "../types";

const UNIQUE_LIFECYCLES: UniqueContactLifecycle[] = [
  "HIDDEN",
  "DISTRESS_SIGNAL",
  "IDENTIFIED",
  "REQUIREMENTS_VISIBLE",
  "CONTACTABLE",
  "RECRUITABLE",
  "RECRUITED",
];

const ENEMY_OPTIONS: Array<EnemyKind | ""> = ["", "scav", "boss", "raider"];

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function changedClass(changed: boolean): string {
  return changed ? "border-primary text-foreground" : "border-border text-muted-foreground";
}

function draftRadio(meta: Meta) {
  return meta.crew.radio ?? freshRadioProgression();
}

export default function RecruitmentLab({
  enabled,
  meta,
  onClose,
  onApplied,
  onRegeneratePool,
  onRequestTransmission,
}: {
  enabled: boolean;
  meta: Meta;
  onClose: () => void;
  onApplied: () => void;
  onRegeneratePool: () => void;
  onRequestTransmission?: () => void;
}) {
  const [view, setView] = useState<RecruitmentLabView>("radio");
  const [query, setQuery] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string>(CANONICAL_RECRUITMENT_PROFILES[0]!.id);
  const [selectedUniqueId, setSelectedUniqueId] = useState<string>(CANONICAL_UNIQUE_OPERATORS[0]?.id ?? "wolf");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecruitmentLabOverrides>(() => getRecruitmentLabOverrides());
  const [copied, setCopied] = useState(false);

  const radio = draftRadio(meta);
  const facts = useMemo(() => progressionFactsFromMeta(meta, draft), [meta, draft]);
  const cap = useMemo(() => capabilityFromRadio(radio, draft), [radio, draft]);
  const applied = getRecruitmentLabOverrides();
  const draftDirty = !recruitmentLabOverridesEqual(draft, applied);
  const retransmitRules = effectiveRetransmissionRules(draft);
  const nextTxCost = nextLabRetransmissionCost(draft, radio.retransmissionCount);
  const traitCfg = effectiveTraitProbability(cap.quality.effective, draft);

  if (!enabled) return null;

  const profiles = profileListForLab(query, draft);
  const selectedProfile = effectiveRecruitmentProfiles(draft).find((p) => p.id === selectedProfileId);
  const eligible = eligibleProfiles(facts, draft);
  const previewPool = getPreviewRecruitmentPool();
  const realCandidates = meta.crew.recruitment.candidates;
  const inspectCandidates = previewPool ?? realCandidates;
  const selectedCandidate =
    inspectCandidates.find((c) => c.candidateId === selectedCandidateId) ?? inspectCandidates[0] ?? null;
  const selectedUnique = CANONICAL_UNIQUE_OPERATORS.find((u) => u.id === selectedUniqueId);

  const setProfilePatch = (profileId: string, patch: ProfileOverride) => {
    setDraft((d) => ({
      ...d,
      profiles: { ...d.profiles, [profileId]: { ...d.profiles[profileId], ...patch } },
    }));
  };

  const setRange = (
    profileId: string,
    kind: "currentRanges" | "potentialRanges",
    key: keyof OperatorBaseStats,
    field: "min" | "max",
    value: number,
  ) => {
    const base = RECRUITMENT_PROFILE_BY_ID[profileId]!;
    const existing = draft.profiles[profileId]?.[kind] ?? {};
    const currentRange = { ...base[kind][key], ...(existing[key] ?? {}) };
    setProfilePatch(profileId, {
      [kind]: { ...existing, [key]: { ...currentRange, [field]: value } },
    });
  };

  const setKit = (profileId: string, kit: RecruitmentProfileKit) => {
    setProfilePatch(profileId, { kit });
  };

  const apply = () => {
    applyRecruitmentLabOverrides(draft);
    onApplied();
  };

  const exportPatch = async () => {
    const text = formatRecruitmentPatch(draft, applied);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const tabs: RecruitmentLabView[] = ["radio", "profiles", "unique", "candidates"];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-2">
      <div className="pixel-card flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="font-display text-sm text-primary">RECRUITMENT LAB</div>
          <button type="button" className="pixel-btn px-2 py-1 text-[10px]" onClick={onClose}>
            CLOSE
          </button>
        </div>

        <div className="flex gap-1 border-b border-border px-2 py-1">
          {tabs.map((v) => (
            <button
              key={v}
              type="button"
              className={`px-2 py-1 font-mono text-[10px] uppercase ${view === v ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
          <div className="ml-auto font-mono text-[10px] text-muted-foreground">
            {modifiedRecruitmentLabCount(applied)} applied · {draftDirty ? "draft dirty" : "synced"}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[10px]">
          {view === "radio" && (
            <div className="space-y-3">
              <div className="text-muted-foreground">
                APPLY updates DEV overrides for the <span className="text-foreground">NEXT</span> pool generation.
                Current pool stays stable until GENERATE / REGENERATE / REQUEST TRANSMISSION / natural refresh.
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="pixel-card p-2">
                  <div className="text-primary">RADIO STATE (DEV DRAFT)</div>
                  <div className="mt-1 text-muted-foreground">META: {radio.radioState}</div>
                  <select
                    className="mt-1 w-full border border-border bg-background px-1"
                    value={draft.radioState ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft((d) => {
                        const next = { ...d };
                        if (!v) delete next.radioState;
                        else next.radioState = v as RadioState;
                        return next;
                      });
                    }}
                  >
                    <option value="">(use meta)</option>
                    {RADIO_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-primary">EFFECTIVE: {cap.radioState}</div>
                </div>

                <div className="pixel-card p-2">
                  <div className="text-primary">SLOT BREAKDOWN</div>
                  <div>stateBase: {cap.slots.stateBase}</div>
                  <div>quest: {cap.slots.quest}</div>
                  <div>upgrade: {cap.slots.upgrade}</div>
                  <div>camp: {cap.slots.camp}</div>
                  <div>perk: {cap.slots.perk}</div>
                  <div>reputation: {cap.slots.reputation}</div>
                  <div>dev: {cap.slots.dev ?? "—"}</div>
                  <div className="mt-1 text-accent">effective: {cap.slots.effective}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span>SLOT OVERRIDE</span>
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          slotCount: Math.max(RADIO_SLOT_MIN, (d.slotCount ?? cap.slots.effective) - 1),
                        }))
                      }
                    >
                      −
                    </button>
                    <span className="text-foreground">{draft.slotCount ?? "—"}</span>
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          slotCount: Math.min(RADIO_SLOT_MAX, (d.slotCount ?? cap.slots.effective) + 1),
                        }))
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => {
                          const next = { ...d };
                          delete next.slotCount;
                          return next;
                        })
                      }
                    >
                      CLEAR
                    </button>
                  </div>
                  <div className="text-muted-foreground">bounds {RADIO_SLOT_MIN}–{RADIO_SLOT_MAX}</div>
                </div>

                <div className="pixel-card p-2">
                  <div className="text-primary">QUALITY BREAKDOWN</div>
                  <div>base: {cap.quality.base}</div>
                  <div>quest: {cap.quality.quest}</div>
                  <div>upgrade: {cap.quality.upgrade}</div>
                  <div>perk: {cap.quality.perk}</div>
                  <div>reputation: {cap.quality.reputation}</div>
                  <div>dev: {cap.quality.dev ?? "—"}</div>
                  <div className="mt-1 text-accent">effective: {cap.quality.effective}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span>QUALITY OVERRIDE</span>
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          qualityLevel: Math.max(
                            RECRUITMENT_QUALITY_MIN,
                            (d.qualityLevel ?? cap.quality.effective) - 1,
                          ),
                        }))
                      }
                    >
                      −
                    </button>
                    <span>{draft.qualityLevel ?? "—"}</span>
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          qualityLevel: Math.min(
                            RECRUITMENT_QUALITY_MAX,
                            (d.qualityLevel ?? cap.quality.effective) + 1,
                          ),
                        }))
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => {
                          const next = { ...d };
                          delete next.qualityLevel;
                          return next;
                        })
                      }
                    >
                      CLEAR
                    </button>
                  </div>
                </div>

                <div className="pixel-card p-2">
                  <div className="text-primary">CREW CAPACITY (≠ slots)</div>
                  <div>base: {cap.crewCapacity.base} (canonical {BASE_CREW_CAPACITY})</div>
                  <div>quest: {cap.crewCapacity.quest}</div>
                  <div>camp: {cap.crewCapacity.camp}</div>
                  <div>perk: {cap.crewCapacity.perk}</div>
                  <div>reputation: {cap.crewCapacity.reputation}</div>
                  <div>dev: {cap.crewCapacity.dev ?? "—"}</div>
                  <div className="mt-1 text-accent">effective: {cap.crewCapacity.effective}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span>CAPACITY OVERRIDE</span>
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          crewCapacity: Math.max(1, (d.crewCapacity ?? cap.crewCapacity.effective) - 1),
                        }))
                      }
                    >
                      −
                    </button>
                    <span>{draft.crewCapacity ?? "—"}</span>
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          crewCapacity: Math.min(
                            CREW_CAPACITY_MAX,
                            (d.crewCapacity ?? cap.crewCapacity.effective) + 1,
                          ),
                        }))
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => {
                          const next = { ...d };
                          delete next.crewCapacity;
                          return next;
                        })
                      }
                    >
                      CLEAR
                    </button>
                  </div>
                </div>
              </div>

              <div className="pixel-card p-2">
                <div className="text-primary">TRAIT PROBABILITIES (Q{cap.quality.effective})</div>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {(
                    [
                      ["positiveAtLeast1", "P(≥1 positive)"],
                      ["positiveAtLeast2", "P(≥2 positive)"],
                      ["positiveAtLeast3", "P(≥3 positive)"],
                      ["negativeAtLeast1", "P(≥1 negative)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1">
                      {label}
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        className="ml-1 w-16 border border-border bg-background px-1"
                        value={traitCfg[key]}
                        onChange={(e) => {
                          const q = cap.quality.effective as RecruitmentQuality;
                          const value = Number(e.target.value);
                          setDraft((d) => ({
                            ...d,
                            qualityTraitOverrides: {
                              ...d.qualityTraitOverrides,
                              [q]: {
                                ...d.qualityTraitOverrides?.[q],
                                [key]: value,
                              },
                            },
                          }));
                        }}
                      />
                      <span className="text-muted-foreground">{pct(traitCfg[key])}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pixel-card p-2">
                <div className="text-primary">RETRANSMISSION</div>
                <label className="mt-1 flex items-center gap-2">
                  UNLOCKED
                  <select
                    className="border border-border bg-background px-1"
                    value={
                      draft.retransmissionUnlocked === null || draft.retransmissionUnlocked === undefined
                        ? ""
                        : draft.retransmissionUnlocked
                          ? "1"
                          : "0"
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft((d) => {
                        const next = { ...d };
                        if (!v) delete next.retransmissionUnlocked;
                        else next.retransmissionUnlocked = v === "1";
                        return next;
                      });
                    }}
                  >
                    <option value="">(from modifiers)</option>
                    <option value="1">forced ON</option>
                    <option value="0">forced OFF</option>
                  </select>
                  <span className="text-muted-foreground">effective: {cap.retransmissionUnlocked ? "YES" : "NO"}</span>
                </label>
                <div className="mt-2 grid gap-1 sm:grid-cols-3">
                  <label>
                    BASE COST
                    <input
                      type="number"
                      className="ml-1 w-20 border border-border bg-background px-1"
                      value={retransmitRules.baseCashCost}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          retransmissionRules: {
                            ...d.retransmissionRules,
                            baseCashCost: Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    ESCALATION
                    <input
                      type="number"
                      step="0.05"
                      className="ml-1 w-16 border border-border bg-background px-1"
                      value={retransmitRules.escalation}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          retransmissionRules: {
                            ...d.retransmissionRules,
                            escalation: Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                  <div>
                    COUNT THIS CYCLE: {radio.retransmissionCount}
                    <div className="text-accent">NEXT COST: {nextTxCost.toLocaleString()} ₽</div>
                  </div>
                </div>
              </div>

              <div className="pixel-card p-2">
                <div className="text-primary">POOL STATUS</div>
                <div>Eligible profiles: {eligible.length}</div>
                <div>Real pool candidates: {realCandidates.length}</div>
                <div>Seed: {meta.crew.recruitment.seed.toString(16)}</div>
                <div>Generation: {meta.crew.recruitment.generation}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="pixel-btn pixel-btn-primary px-3 py-1"
                  onClick={() => {
                    const seed = seedFromParts("lab-preview", Date.now());
                    generateTestRecruitmentPool(
                      seed,
                      999,
                      facts,
                      meta.crew.operators.map((o) => o.name),
                      draft,
                      radio,
                    );
                  }}
                >
                  GENERATE TEST POOL
                </button>
                <button type="button" className="pixel-btn px-3 py-1" onClick={() => onRegeneratePool()}>
                  REGENERATE REAL RADIO POOL
                </button>
                <button
                  type="button"
                  className="pixel-btn px-3 py-1"
                  onClick={() => onRequestTransmission?.()}
                  disabled={!onRequestTransmission}
                >
                  REQUEST TEST TRANSMISSION
                </button>
                <button
                  type="button"
                  className="pixel-btn px-3 py-1"
                  onClick={() => {
                    resetRecruitmentLabRadio();
                    setDraft(getRecruitmentLabOverrides());
                  }}
                >
                  RESET RADIO
                </button>
              </div>

              {previewPool && (
                <div className="pixel-card p-2">
                  <div className="text-primary">PREVIEW POOL ({previewPool.length})</div>
                  <ul className="mt-1 space-y-0.5">
                    {previewPool.map((c) => (
                      <li key={c.candidateId}>
                        {c.name} · {c.roleLabel} · Q{c.generationQuality ?? "?"} ·{" "}
                        {formatRecruitmentRoubles(c.cost)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {view === "profiles" && selectedProfile && (
            <div className="grid gap-3 lg:grid-cols-[10rem_1fr]">
              <div>
                <input
                  className="w-full border border-border bg-background px-1 py-0.5"
                  placeholder="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="mt-1 max-h-[50vh] space-y-0.5 overflow-auto">
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`block w-full px-1 py-0.5 text-left ${selectedProfileId === p.id ? "bg-secondary text-primary" : ""}`}
                      onClick={() => setSelectedProfileId(p.id)}
                    >
                      {p.displayName}
                      <div className="text-[9px] text-muted-foreground">{p.id}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selectedProfile.enabled}
                      onChange={(e) => setProfilePatch(selectedProfile.id, { enabled: e.target.checked })}
                    />
                    ENABLED
                  </label>
                  <label>
                    WEIGHT
                    <input
                      type="number"
                      step="0.1"
                      className="ml-1 w-16 border border-border bg-background px-1"
                      value={selectedProfile.weight}
                      onChange={(e) => setProfilePatch(selectedProfile.id, { weight: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    MIN QUALITY
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="ml-1 w-12 border border-border bg-background px-1"
                      value={selectedProfile.minQuality}
                      onChange={(e) => setProfilePatch(selectedProfile.id, { minQuality: Number(e.target.value) })}
                    />
                  </label>
                  <span className="text-muted-foreground">{profileShareLabel(selectedProfile.id, facts)}</span>
                  {profileLocked(selectedProfile.id, facts) && (
                    <span className="text-destructive">PROFILE LOCKED</span>
                  )}
                </div>

                <div className="pixel-card p-2">
                  <div className="text-primary">STAT RANGES</div>
                  <div className="mt-1 grid grid-cols-[4rem_1fr_1fr] gap-1 text-[9px] text-muted-foreground">
                    <div />
                    <div>CURRENT</div>
                    <div>POTENTIAL</div>
                  </div>
                  {STAT_KEYS.map((key) => {
                    const base = RECRUITMENT_PROFILE_BY_ID[selectedProfile.id]!;
                    const cur = selectedProfile.currentRanges[key];
                    const pot = selectedProfile.potentialRanges[key];
                    return (
                      <div key={key} className="mt-1 grid grid-cols-[4rem_1fr_1fr] items-center gap-1">
                        <div>{STAT_LABELS[key]}</div>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            className={`w-12 border px-0.5 ${changedClass(cur.min !== base.currentRanges[key].min)}`}
                            value={cur.min}
                            onChange={(e) =>
                              setRange(selectedProfile.id, "currentRanges", key, "min", Number(e.target.value))
                            }
                          />
                          <input
                            type="number"
                            className={`w-12 border px-0.5 ${changedClass(cur.max !== base.currentRanges[key].max)}`}
                            value={cur.max}
                            onChange={(e) =>
                              setRange(selectedProfile.id, "currentRanges", key, "max", Number(e.target.value))
                            }
                          />
                        </div>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            className={`w-12 border px-0.5 ${changedClass(pot.min !== base.potentialRanges[key].min)}`}
                            value={pot.min}
                            onChange={(e) =>
                              setRange(selectedProfile.id, "potentialRanges", key, "min", Number(e.target.value))
                            }
                          />
                          <input
                            type="number"
                            className={`w-12 border px-0.5 ${changedClass(pot.max !== base.potentialRanges[key].max)}`}
                            value={pot.max}
                            onChange={(e) =>
                              setRange(selectedProfile.id, "potentialRanges", key, "max", Number(e.target.value))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pixel-card p-2">
                  <div className="text-primary">PERK / TRAIT POOLS</div>
                  <label className="mt-1 block">
                    NEGATIVE TRAIT CHANCE
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={1}
                      className="ml-1 w-16 border border-border bg-background px-1"
                      value={selectedProfile.negativeTraitChance ?? ""}
                      placeholder="tier"
                      onChange={(e) => {
                        if (e.target.value === "") {
                          const existing = { ...(draft.profiles[selectedProfile.id] ?? {}) };
                          delete existing.negativeTraitChance;
                          setDraft((d) => ({
                            ...d,
                            profiles: { ...d.profiles, [selectedProfile.id]: existing },
                          }));
                          return;
                        }
                        setProfilePatch(selectedProfile.id, {
                          negativeTraitChance: Number(e.target.value),
                        });
                      }}
                    />
                    <span className="ml-1 text-muted-foreground">
                      {selectedProfile.negativeTraitChance != null
                        ? pct(selectedProfile.negativeTraitChance)
                        : "(use quality tier)"}
                    </span>
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-muted-foreground">POSITIVE PERK POOL</div>
                      {RECRUITABLE_PERK_IDS.map((id) => (
                        <label key={id} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={selectedProfile.positivePerkPool.includes(id)}
                            onChange={(e) => {
                              const pool = new Set(selectedProfile.positivePerkPool);
                              if (e.target.checked) pool.add(id);
                              else pool.delete(id);
                              setProfilePatch(selectedProfile.id, { positivePerkPool: [...pool] });
                            }}
                          />
                          {PERKS[id]?.name ?? id}
                        </label>
                      ))}
                    </div>
                    <div>
                      <div className="text-muted-foreground">NEGATIVE TRAIT POOL</div>
                      {RECRUITABLE_NEGATIVE_TRAIT_IDS.map((id) => (
                        <label key={id} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={selectedProfile.negativeTraitPool.includes(id)}
                            onChange={(e) => {
                              const pool = new Set(selectedProfile.negativeTraitPool);
                              if (e.target.checked) pool.add(id);
                              else pool.delete(id);
                              setProfilePatch(selectedProfile.id, { negativeTraitPool: [...pool] });
                            }}
                          />
                          {PERKS[id]?.name ?? id}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <KitEditor
                  kit={selectedProfile.kit}
                  onChange={(kit) => setKit(selectedProfile.id, kit)}
                />

                <RequirementsEditor
                  requirements={[...selectedProfile.requirements]}
                  onChange={(requirements) => setProfilePatch(selectedProfile.id, { requirements })}
                />

                <div className="pixel-card p-2">
                  <div className="text-primary">ELIGIBILITY (progressionFactsFromMeta)</div>
                  <div className="text-muted-foreground">
                    radio={facts.radioState} · quality={facts.effectiveQuality}
                  </div>
                  {profileEligibilityRows(selectedProfile.id, facts).map((row, i) => (
                    <div key={i} className={row.met ? "text-foreground" : "text-destructive"}>
                      {row.met ? "✓" : "✕"} {row.label}
                      {row.current != null && row.target != null && !row.met
                        ? ` — ${row.current} / ${row.target}`
                        : ""}
                    </div>
                  ))}
                  {!selectedProfile.requirements.length && (
                    <div className="text-muted-foreground">No requirements — eligible when enabled + minQuality.</div>
                  )}
                </div>

                <button
                  type="button"
                  className="pixel-btn px-2 py-1"
                  onClick={() => {
                    resetRecruitmentLabProfile(selectedProfile.id);
                    setDraft(getRecruitmentLabOverrides());
                  }}
                >
                  RESET PROFILE
                </button>
              </div>
            </div>
          )}

          {view === "unique" && (
            <div className="grid gap-3 lg:grid-cols-[10rem_1fr]">
              <div className="max-h-[55vh] space-y-0.5 overflow-auto">
                {CANONICAL_UNIQUE_OPERATORS.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`block w-full px-1 py-0.5 text-left ${selectedUniqueId === u.id ? "bg-secondary text-primary" : ""}`}
                    onClick={() => setSelectedUniqueId(u.id)}
                  >
                    {u.name}
                    <div className="text-[9px] text-muted-foreground">{u.id}</div>
                  </button>
                ))}
              </div>
              {selectedUnique && (
                <div className="space-y-3">
                  <div className="text-primary">
                    {selectedUnique.name} · {selectedUnique.roleLabel}
                  </div>
                  {(() => {
                    const metaLife = radio.uniqueContacts[selectedUnique.id]?.lifecycle ?? "HIDDEN";
                    const forced = draft.uniqueLifecycle?.[selectedUnique.id];
                    const life = forced ?? metaLife;
                    const reveal = uniqueRevealForLifecycle(selectedUnique, life);
                    return (
                      <>
                        <div className="pixel-card p-2">
                          <div className="text-primary">LIFECYCLE</div>
                          <div className="text-muted-foreground">META: {metaLife}</div>
                          <label className="mt-1 block">
                            DEV FORCE
                            <select
                              className="ml-1 border border-border bg-background px-1"
                              value={forced ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDraft((d) => {
                                  const uniqueLifecycle = { ...(d.uniqueLifecycle ?? {}) };
                                  if (!v) delete uniqueLifecycle[selectedUnique.id];
                                  else uniqueLifecycle[selectedUnique.id] = v as UniqueContactLifecycle;
                                  return { ...d, uniqueLifecycle };
                                });
                              }}
                            >
                              <option value="">(use meta)</option>
                              {UNIQUE_LIFECYCLES.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="mt-1 text-accent">EFFECTIVE: {life}</div>
                        </div>
                        <div className="pixel-card p-2">
                          <div className="text-primary">REVEAL CONTENT</div>
                          {reveal ? (
                            <>
                              <div>{reveal.headline}</div>
                              <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{reveal.body}</div>
                              {reveal.knownTraits?.length ? (
                                <div className="mt-1">traits: {reveal.knownTraits.join(", ")}</div>
                              ) : null}
                              {reveal.knownRoleHint ? <div>role: {reveal.knownRoleHint}</div> : null}
                              {reveal.knownLocationHint ? <div>loc: {reveal.knownLocationHint}</div> : null}
                            </>
                          ) : (
                            <div className="text-muted-foreground">No reveal at {life}</div>
                          )}
                        </div>
                        <div className="pixel-card p-2">
                          <div className="text-primary">DISCOVERY REQUIREMENTS</div>
                          {selectedUnique.discoveryRequirements.map((r, i) => (
                            <div key={i}>{r.type} {JSON.stringify(r)}</div>
                          ))}
                          <div className="mt-2 text-primary">CONTACT REQUIREMENTS</div>
                          {selectedUnique.contactRequirements.map((r, i) => (
                            <div key={i}>{r.type} {JSON.stringify(r)}</div>
                          ))}
                          <div className="mt-2 text-primary">TERMS</div>
                          <div>{JSON.stringify(selectedUnique.terms)}</div>
                        </div>
                      </>
                    );
                  })()}
                  <button
                    type="button"
                    className="pixel-btn px-2 py-1"
                    onClick={() => {
                      resetRecruitmentLabUnique();
                      setDraft(getRecruitmentLabOverrides());
                    }}
                  >
                    RESET UNIQUE
                  </button>
                </div>
              )}
            </div>
          )}

          {view === "candidates" && (
            <div className="grid gap-3 lg:grid-cols-[12rem_1fr]">
              <div className="max-h-[55vh] space-y-0.5 overflow-auto">
                <div className="text-muted-foreground">{previewPool ? "PREVIEW" : "REAL"} POOL</div>
                {inspectCandidates.map((c) => (
                  <button
                    key={c.candidateId}
                    type="button"
                    className={`block w-full px-1 py-0.5 text-left ${selectedCandidate?.candidateId === c.candidateId ? "bg-secondary" : ""}`}
                    onClick={() => setSelectedCandidateId(c.candidateId)}
                  >
                    {c.name}
                    <div className="text-[9px] text-muted-foreground">
                      {c.archetypeId}
                      {c.generationQuality != null ? ` · Q${c.generationQuality}` : ""}
                    </div>
                  </button>
                ))}
              </div>
              {selectedCandidate && (
                <CandidateInspector candidate={selectedCandidate} draft={draft} onDraft={setDraft} />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
          <button type="button" className="pixel-btn pixel-btn-primary px-3 py-1" disabled={!draftDirty} onClick={apply}>
            APPLY
          </button>
          <button type="button" className="pixel-btn px-3 py-1" onClick={exportPatch}>
            {copied ? "COPIED" : "EXPORT PATCH"}
          </button>
          <button
            type="button"
            className="pixel-btn px-3 py-1"
            onClick={() => {
              resetRecruitmentLabAll();
              setDraft(getRecruitmentLabOverrides());
            }}
          >
            RESET ALL
          </button>
        </div>
      </div>
    </div>
  );
}

function KitEditor({
  kit,
  onChange,
}: {
  kit: RecruitmentProfileKit;
  onChange: (kit: RecruitmentProfileKit) => void;
}) {
  const patchEntry = (
    pool: "weapons" | "armors" | "attachments",
    id: string | null,
    patch: Partial<WeightedGearEntry>,
  ) => {
    const entries = kit[pool].map((e) => (e.id === id ? { ...e, ...patch } : e));
    const has = kit[pool].some((e) => e.id === id);
    onChange({
      ...kit,
      [pool]: has ? entries : [...kit[pool], { id, enabled: true, weight: 10, ...patch }],
    });
  };

  const ensureEntry = (pool: "weapons" | "armors" | "attachments", id: string | null) => {
    if (kit[pool].some((e) => e.id === id)) return;
    onChange({
      ...kit,
      [pool]: [...kit[pool], { id, enabled: true, weight: 10 }],
    });
  };

  const renderPool = (
    title: string,
    pool: "weapons" | "armors" | "attachments",
    ids: Array<string | null>,
  ) => (
    <div>
      <div className="text-muted-foreground">{title}</div>
      {ids.map((id) => {
        const entry = kit[pool].find((e) => e.id === id) ?? { id, enabled: false, weight: 0 };
        const label =
          id == null
            ? "NONE"
            : pool === "weapons"
              ? (WEAPONS[id]?.name ?? id)
              : pool === "armors"
                ? (ARMORS[id]?.name ?? id)
                : (ATTACHMENTS[id]?.name ?? id);
        return (
          <div key={String(id)} className="mt-0.5 flex items-center gap-1">
            <input
              type="checkbox"
              checked={entry.enabled}
              onChange={(e) => {
                ensureEntry(pool, id);
                patchEntry(pool, id, { enabled: e.target.checked });
              }}
            />
            <span className="w-24 truncate">{label}</span>
            <input
              type="number"
              className="w-14 border border-border bg-background px-0.5"
              value={entry.weight}
              onChange={(e) => {
                ensureEntry(pool, id);
                patchEntry(pool, id, { weight: Number(e.target.value) });
              }}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="pixel-card p-2">
      <div className="text-primary">EQUIPMENT POOLS</div>
      <label className="mt-1 block">
        ATTACHMENT CHANCE
        <input
          type="number"
          step="0.05"
          min={0}
          max={1}
          className="ml-1 w-16 border border-border bg-background px-1"
          value={kit.attachmentChance}
          onChange={(e) => onChange({ ...kit, attachmentChance: Number(e.target.value) })}
        />
        <span className="ml-1 text-muted-foreground">{pct(kit.attachmentChance)}</span>
      </label>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {renderPool("WEAPONS", "weapons", Object.keys(WEAPONS))}
        {renderPool("ARMORS", "armors", [null, ...Object.keys(ARMORS)])}
        {renderPool("ATTACHMENTS", "attachments", Object.keys(ATTACHMENTS))}
      </div>
    </div>
  );
}

function RequirementsEditor({
  requirements,
  onChange,
}: {
  requirements: RecruitmentRequirement[];
  onChange: (next: RecruitmentRequirement[]) => void;
}) {
  const update = (idx: number, req: RecruitmentRequirement) => {
    const next = [...requirements];
    next[idx] = req;
    onChange(next);
  };

  return (
    <div className="pixel-card p-2">
      <div className="text-primary">REQUIREMENTS</div>
      <div className="mt-1 space-y-2">
        {requirements.map((req, idx) => (
          <div key={idx} className="border border-border/40 px-1 py-1">
            <div className="flex items-center justify-between">
              <span>{req.type}</span>
              <button
                type="button"
                className="text-destructive"
                onClick={() => {
                  const next = [...requirements];
                  next.splice(idx, 1);
                  onChange(next);
                }}
              >
                REMOVE
              </button>
            </div>
            {req.type === "QUEST_COMPLETED" && (
              <label className="mt-1 block">
                QUEST
                <select
                  className="ml-1 border border-border bg-background"
                  value={req.questId}
                  onChange={(e) => update(idx, { type: "QUEST_COMPLETED", questId: e.target.value })}
                >
                  {QUESTS.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {req.type === "TOTAL_KILLS" && (
              <div className="mt-1 flex flex-wrap gap-2">
                <label>
                  COUNT
                  <input
                    type="number"
                    className="ml-1 w-14 border border-border bg-background px-1"
                    value={req.count}
                    onChange={(e) => update(idx, { ...req, count: Number(e.target.value) })}
                  />
                </label>
                <label>
                  ENEMY
                  <select
                    className="ml-1 border border-border bg-background"
                    value={req.enemyId ?? ""}
                    onChange={(e) => {
                      const enemyId = e.target.value as EnemyKind | "";
                      const next = { ...req };
                      if (!enemyId) delete next.enemyId;
                      else next.enemyId = enemyId;
                      update(idx, next);
                    }}
                  >
                    {ENEMY_OPTIONS.map((e) => (
                      <option key={String(e)} value={e}>
                        {e || "(any)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  MAP
                  <select
                    className="ml-1 border border-border bg-background"
                    value={req.mapId ?? ""}
                    onChange={(e) => {
                      const mapId = e.target.value;
                      const next = { ...req };
                      if (!mapId) delete next.mapId;
                      else next.mapId = mapId;
                      update(idx, next);
                    }}
                  >
                    <option value="">(any)</option>
                    {MAP_DEFS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {req.type === "WAVES_COMPLETED" && (
              <div className="mt-1 flex flex-wrap gap-2">
                <label>
                  COUNT
                  <input
                    type="number"
                    className="ml-1 w-14 border border-border bg-background px-1"
                    value={req.count}
                    onChange={(e) => update(idx, { ...req, count: Number(e.target.value) })}
                  />
                </label>
                <label>
                  MAP
                  <select
                    className="ml-1 border border-border bg-background"
                    value={req.mapId ?? ""}
                    onChange={(e) => {
                      const mapId = e.target.value;
                      const next = { ...req };
                      if (!mapId) delete next.mapId;
                      else next.mapId = mapId;
                      update(idx, next);
                    }}
                  >
                    <option value="">(any)</option>
                    {MAP_DEFS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {req.type === "BOSS_KILLED" && (
              <label className="mt-1 block">
                BOSS
                <select
                  className="ml-1 border border-border bg-background"
                  value={req.bossId}
                  onChange={(e) => update(idx, { type: "BOSS_KILLED", bossId: e.target.value })}
                >
                  {CANONICAL_BOSS_IDS.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {req.type === "RADIO_STATE" && (
              <label className="mt-1 block">
                MIN STATE
                <select
                  className="ml-1 border border-border bg-background"
                  value={req.minState}
                  onChange={(e) =>
                    update(idx, { type: "RADIO_STATE", minState: e.target.value as RadioState })
                  }
                >
                  {RADIO_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {req.type === "RECRUITMENT_QUALITY" && (
              <label className="mt-1 block">
                MIN QUALITY
                <input
                  type="number"
                  min={1}
                  max={5}
                  className="ml-1 w-12 border border-border bg-background px-1"
                  value={req.minQuality}
                  onChange={(e) =>
                    update(idx, { type: "RECRUITMENT_QUALITY", minQuality: Number(e.target.value) })
                  }
                />
              </label>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          className="pixel-btn px-2 py-0.5"
          onClick={() => {
            const q = QUESTS[0];
            if (!q) return;
            onChange([...requirements, { type: "QUEST_COMPLETED", questId: q.id }]);
          }}
        >
          + QUEST
        </button>
        <button
          type="button"
          className="pixel-btn px-2 py-0.5"
          onClick={() => onChange([...requirements, { type: "TOTAL_KILLS", count: 50, enemyId: "scav" }])}
        >
          + KILLS
        </button>
        <button
          type="button"
          className="pixel-btn px-2 py-0.5"
          onClick={() => {
            const mapId = MAP_DEFS[0]?.id ?? "kolkhoz";
            onChange([...requirements, { type: "WAVES_COMPLETED", count: 20, mapId }]);
          }}
        >
          + WAVES
        </button>
        {CANONICAL_BOSS_IDS.length > 0 && (
          <button
            type="button"
            className="pixel-btn px-2 py-0.5"
            onClick={() =>
              onChange([...requirements, { type: "BOSS_KILLED", bossId: CANONICAL_BOSS_IDS[0]! }])
            }
          >
            + BOSS
          </button>
        )}
        <button
          type="button"
          className="pixel-btn px-2 py-0.5"
          onClick={() =>
            onChange([...requirements, { type: "RADIO_STATE", minState: "SIGNAL_RESTORED" }])
          }
        >
          + RADIO
        </button>
        <button
          type="button"
          className="pixel-btn px-2 py-0.5"
          onClick={() => onChange([...requirements, { type: "RECRUITMENT_QUALITY", minQuality: 2 }])}
        >
          + QUALITY
        </button>
      </div>
    </div>
  );
}

function CandidateInspector({
  candidate,
  draft,
  onDraft,
}: {
  candidate: RecruitCandidate;
  draft: RecruitmentLabOverrides;
  onDraft: (next: RecruitmentLabOverrides) => void;
}) {
  const override = draft.previewCandidates[candidate.candidateId] ?? {};
  const stats = { ...candidate.stats, ...override.stats };
  const potential = { ...candidate.potential, ...override.potential };
  const rows = candidateStatRows(stats, potential);
  const traits = resolveTraitIds({
    ...(override.traitIds || candidate.traitIds
      ? { traitIds: override.traitIds ?? candidate.traitIds }
      : {}),
    perkIds: override.perkIds ?? candidate.perkIds,
    ...((): { negativeTraitIds?: string[] } => {
      const neg = override.negativeTraitIds ?? candidate.negativeTraitIds;
      return neg ? { negativeTraitIds: neg } : {};
    })(),
  });
  const breakdown = recruitmentCostBreakdown({
    ...candidate,
    stats,
    potential,
    traitIds: traits.traitIds,
    perkIds: traits.perkIds,
    ...(traits.negativeTraitIds.length ? { negativeTraitIds: traits.negativeTraitIds } : {}),
    equipment: {
      ...candidate.equipment,
      ...override.equipment,
      attachments: override.equipment?.attachments ?? candidate.equipment.attachments,
    },
  });

  const patchCandidate = (patch: CandidateOverride) => {
    onDraft({
      ...draft,
      previewCandidates: {
        ...draft.previewCandidates,
        [candidate.candidateId]: { ...draft.previewCandidates[candidate.candidateId], ...patch },
      },
    });
  };

  return (
    <div className="space-y-2">
      <div className="text-primary">
        {candidate.name} · {candidate.roleLabel} · {candidate.archetypeId}
      </div>
      <div className="text-muted-foreground">
        generationQuality: {candidate.generationQuality ?? "—"}
      </div>
      <div className="pixel-card p-2">
        <div className="mb-1 grid grid-cols-[4rem_3rem_3rem_1fr] gap-1 text-muted-foreground">
          <span />
          <span>CURRENT</span>
          <span>POTENTIAL</span>
          <span />
        </div>
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[4rem_3rem_3rem_1fr] gap-1">
            <span>{row.label}</span>
            <input
              type="number"
              className="w-12 border border-border bg-background px-0.5"
              value={row.current}
              onChange={(e) =>
                patchCandidate({ stats: { ...override.stats, [row.key]: Number(e.target.value) } })
              }
            />
            <input
              type="number"
              className="w-12 border border-border bg-background px-0.5"
              value={row.potential}
              onChange={(e) =>
                patchCandidate({ potential: { ...override.potential, [row.key]: Number(e.target.value) } })
              }
            />
            <span>
              {row.current}/{row.potential}
            </span>
          </div>
        ))}
      </div>
      <div className="pixel-card p-2">
        <div className="text-primary">TRAITS</div>
        <div>{traits.traitIds.length ? traits.traitIds.join(", ") : "(none)"}</div>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <label>
            POSITIVE PERK
            <select
              className="ml-1 border border-border bg-background"
              value={(override.perkIds ?? candidate.perkIds)[0] ?? ""}
              onChange={(e) => patchCandidate({ perkIds: e.target.value ? [e.target.value] : [] })}
            >
              <option value="">—</option>
              {RECRUITABLE_PERK_IDS.filter(isPositivePerkId).map((id) => (
                <option key={id} value={id}>
                  {PERKS[id]?.name ?? id}
                </option>
              ))}
            </select>
          </label>
          <label>
            NEGATIVE TRAIT
            <select
              className="ml-1 border border-border bg-background"
              value={(override.negativeTraitIds ?? candidate.negativeTraitIds ?? [])[0] ?? ""}
              onChange={(e) => patchCandidate({ negativeTraitIds: e.target.value ? [e.target.value] : [] })}
            >
              <option value="">—</option>
              {RECRUITABLE_NEGATIVE_TRAIT_IDS.filter(isNegativeTraitId).map((id) => (
                <option key={id} value={id}>
                  {PERKS[id]?.name ?? id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="pixel-card p-2">
        <div className="text-primary">COST BREAKDOWN</div>
        <div>Base {formatRecruitmentRoubles(breakdown.base)}</div>
        <div>Current stats {formatRecruitmentRoubles(breakdown.currentStats)}</div>
        <div>Potential {formatRecruitmentRoubles(breakdown.potential)}</div>
        <div>Positive perk {formatRecruitmentRoubles(breakdown.positivePerks)}</div>
        <div>Negative trait {formatRecruitmentRoubles(breakdown.negativeTraits)}</div>
        <div>Starting kit {formatRecruitmentRoubles(breakdown.startingKit)}</div>
        <div className="mt-1 text-accent">TOTAL {formatRecruitmentRoubles(breakdown.total)}</div>
      </div>
      <div className="text-[9px] text-muted-foreground">
        WEAPON: {WEAPONS[candidate.equipment.weapon]?.name ?? candidate.equipment.weapon} · ARMOR:{" "}
        {candidate.equipment.armor ? (ARMORS[candidate.equipment.armor]?.name ?? candidate.equipment.armor) : "None"} ·
        ATTACH: {candidate.equipment.attachments.map((a) => ATTACHMENTS[a]?.name ?? a).join(", ") || "None"}
      </div>
      <div className="flex flex-wrap gap-2">
        <label>
          KIT WEAPON
          <select
            className="ml-1 border border-border bg-background"
            value={override.equipment?.weapon ?? candidate.equipment.weapon}
            onChange={(e) =>
              patchCandidate({
                equipment: { ...override.equipment, weapon: e.target.value },
              })
            }
          >
            {Object.keys(WEAPONS).map((id) => (
              <option key={id} value={id}>
                {WEAPONS[id]?.name ?? id}
              </option>
            ))}
          </select>
        </label>
        <label>
          KIT ARMOR
          <select
            className="ml-1 border border-border bg-background"
            value={
              override.equipment?.armor !== undefined
                ? (override.equipment.armor ?? "")
                : (candidate.equipment.armor ?? "")
            }
            onChange={(e) =>
              patchCandidate({
                equipment: {
                  ...override.equipment,
                  armor: e.target.value ? e.target.value : null,
                },
              })
            }
          >
            <option value="">None</option>
            {Object.keys(ARMORS).map((id) => (
              <option key={id} value={id}>
                {ARMORS[id]?.name ?? id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="pixel-btn px-2 py-1"
        onClick={() => {
          resetRecruitmentLabCandidate(candidate.candidateId);
          onDraft(getRecruitmentLabOverrides());
        }}
      >
        RESET CANDIDATE
      </button>
    </div>
  );
}
