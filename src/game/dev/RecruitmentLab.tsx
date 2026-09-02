import { useMemo, useState } from "react";
import { MAP_DEFS } from "../map";
import { QUESTS } from "../quests";
import { WEAPONS, ARMORS, ATTACHMENTS } from "../gear";
import {
  applyRecruitmentLabOverrides,
  effectiveRecruitmentProfiles,
  effectiveSlotCount,
  eligibleProfiles,
  formatRecruitmentPatch,
  generateTestRecruitmentPool,
  getPreviewRecruitmentPool,
  getRecruitmentLabOverrides,
  modifiedRecruitmentLabCount,
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
  type CandidateOverride,
  type ProfileOverride,
  type RecruitmentLabOverrides,
  type RecruitmentLabView,
} from "../operators/recruitmentLabCore";
import { BASE_RADIO_SLOTS, RADIO_SLOT_MAX, RADIO_SLOT_MIN } from "../operators/recruitmentSlots";
import {
  CANONICAL_RECRUITMENT_PROFILES,
  RECRUITMENT_PROFILE_BY_ID,
  type StatRange,
} from "../operators/recruitmentProfiles";
import { CANONICAL_BOSS_IDS } from "../operators/recruitmentRequirements";
import {
  PERKS,
  RECRUITABLE_NEGATIVE_TRAIT_IDS,
  RECRUITABLE_PERK_IDS,
  isNegativeTraitId,
  isPositivePerkId,
} from "../operators/perks";
import { STAT_KEYS, STAT_LABELS } from "../operators/stats";
import type { OperatorBaseStats } from "../operators/types";
import { candidateStatRows, formatRecruitmentRoubles } from "../operators/recruitmentUi";
import { regenerateRecruitmentPool } from "../operators/crew";
import type { Meta } from "../meta";
import type { RecruitCandidate } from "../operators/types";
import { seedFromParts } from "../operators/rng";

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function changedClass(changed: boolean): string {
  return changed ? "border-primary text-foreground" : "border-border text-muted-foreground";
}

export default function RecruitmentLab({
  enabled,
  meta,
  onClose,
  onApplied,
  onRegeneratePool,
}: {
  enabled: boolean;
  meta: Meta;
  onClose: () => void;
  onApplied: () => void;
  onRegeneratePool: () => void;
}) {
  const [view, setView] = useState<RecruitmentLabView>("radio");
  const [query, setQuery] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string>(CANONICAL_RECRUITMENT_PROFILES[0]!.id);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecruitmentLabOverrides>(() => getRecruitmentLabOverrides());
  const [copied, setCopied] = useState(false);

  const facts = useMemo(() => progressionFactsFromMeta(meta), [meta]);
  const applied = getRecruitmentLabOverrides();
  const draftDirty = !recruitmentLabOverridesEqual(draft, applied);

  if (!enabled) return null;

  const profiles = profileListForLab(query, draft);
  const selectedProfile = effectiveRecruitmentProfiles(draft).find((p) => p.id === selectedProfileId);
  const eligible = eligibleProfiles(facts, draft);
  const previewPool = getPreviewRecruitmentPool();
  const realCandidates = meta.crew.recruitment.candidates;
  const inspectCandidates = previewPool ?? realCandidates;
  const selectedCandidate =
    inspectCandidates.find((c) => c.candidateId === selectedCandidateId) ?? inspectCandidates[0] ?? null;

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
          {(["radio", "profiles", "candidates"] as const).map((v) => (
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
                APPLY affects the next Radio pool generation. Current pool stays stable until REGENERATE or natural refresh.
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="pixel-card p-2">
                  <div className="text-primary">RADIO SLOTS</div>
                  <div className="mt-1">BASE: {BASE_RADIO_SLOTS}</div>
                  <div className="mt-1">EFFECTIVE (draft): {effectiveSlotCount(draft)}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          slotCount: Math.max(RADIO_SLOT_MIN, (d.slotCount ?? BASE_RADIO_SLOTS) - 1),
                        }))
                      }
                    >
                      −
                    </button>
                    <span className="text-foreground">{draft.slotCount ?? BASE_RADIO_SLOTS}</span>
                    <button
                      type="button"
                      className="pixel-btn px-2"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          slotCount: Math.min(RADIO_SLOT_MAX, (d.slotCount ?? BASE_RADIO_SLOTS) + 1),
                        }))
                      }
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-1 text-muted-foreground">TEST VALUE bounds: {RADIO_SLOT_MIN}–{RADIO_SLOT_MAX}</div>
                </div>
                <div className="pixel-card p-2">
                  <div className="text-primary">POOL STATUS</div>
                  <div className="mt-1">Eligible profiles: {eligible.length}</div>
                  <div>Real pool candidates: {realCandidates.length}</div>
                  <div>Seed: {meta.crew.recruitment.seed.toString(16)}</div>
                  <div>Generation: {meta.crew.recruitment.generation}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="pixel-btn pixel-btn-primary px-3 py-1"
                  onClick={() => {
                    const seed = seedFromParts("lab-preview", Date.now());
                    generateTestRecruitmentPool(seed, 999, facts, meta.crew.operators.map((o) => o.name));
                  }}
                >
                  GENERATE TEST POOL
                </button>
                <button
                  type="button"
                  className="pixel-btn px-3 py-1"
                  onClick={() => {
                    onRegeneratePool();
                  }}
                >
                  REGENERATE RADIO POOL
                </button>
                <button type="button" className="pixel-btn px-3 py-1" onClick={() => { resetRecruitmentLabRadio(); setDraft(getRecruitmentLabOverrides()); }}>
                  RESET RADIO
                </button>
              </div>
              {previewPool && (
                <div className="pixel-card p-2">
                  <div className="text-primary">PREVIEW POOL ({previewPool.length})</div>
                  <ul className="mt-1 space-y-0.5">
                    {previewPool.map((c) => (
                      <li key={c.candidateId}>
                        {c.name} · {c.roleLabel} · {formatRecruitmentRoubles(c.cost)}
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
                  <span className="text-muted-foreground">{profileShareLabel(selectedProfile.id, facts)}</span>
                  {profileLocked(selectedProfile.id, facts) && (
                    <span className="text-destructive">PROFILE LOCKED</span>
                  )}
                </div>

                <div className="pixel-card p-2">
                  <div className="text-primary">STAT RANGES (TEST)</div>
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
                            onChange={(e) => setRange(selectedProfile.id, "currentRanges", key, "min", Number(e.target.value))}
                          />
                          <input
                            type="number"
                            className={`w-12 border px-0.5 ${changedClass(cur.max !== base.currentRanges[key].max)}`}
                            value={cur.max}
                            onChange={(e) => setRange(selectedProfile.id, "currentRanges", key, "max", Number(e.target.value))}
                          />
                        </div>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            className={`w-12 border px-0.5 ${changedClass(pot.min !== base.potentialRanges[key].min)}`}
                            value={pot.min}
                            onChange={(e) => setRange(selectedProfile.id, "potentialRanges", key, "min", Number(e.target.value))}
                          />
                          <input
                            type="number"
                            className={`w-12 border px-0.5 ${changedClass(pot.max !== base.potentialRanges[key].max)}`}
                            value={pot.max}
                            onChange={(e) => setRange(selectedProfile.id, "potentialRanges", key, "max", Number(e.target.value))}
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
                      value={selectedProfile.negativeTraitChance}
                      onChange={(e) =>
                        setProfilePatch(selectedProfile.id, { negativeTraitChance: Number(e.target.value) })
                      }
                    />
                    <span className="ml-1 text-muted-foreground">{pct(selectedProfile.negativeTraitChance)}</span>
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

                <div className="pixel-card p-2">
                  <div className="text-primary">REQUIREMENTS</div>
                  <div className="mt-1 space-y-1">
                    {(selectedProfile.requirements ?? []).map((req, idx) => (
                      <div key={idx} className="flex items-center justify-between border border-border/40 px-1 py-0.5">
                        <span>{req.type}</span>
                        <button
                          type="button"
                          className="text-destructive"
                          onClick={() => {
                            const next = [...selectedProfile.requirements];
                            next.splice(idx, 1);
                            setProfilePatch(selectedProfile.id, { requirements: next });
                          }}
                        >
                          REMOVE
                        </button>
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
                        setProfilePatch(selectedProfile.id, {
                          requirements: [...selectedProfile.requirements, { type: "QUEST_COMPLETED", questId: q.id }],
                        });
                      }}
                    >
                      + QUEST
                    </button>
                    <button
                      type="button"
                      className="pixel-btn px-2 py-0.5"
                      onClick={() =>
                        setProfilePatch(selectedProfile.id, {
                          requirements: [
                            ...selectedProfile.requirements,
                            { type: "TOTAL_KILLS", count: 50, enemyId: "scav" },
                          ],
                        })
                      }
                    >
                      + KILLS
                    </button>
                    <button
                      type="button"
                      className="pixel-btn px-2 py-0.5"
                      onClick={() => {
                        const mapId = MAP_DEFS[0]?.id ?? "kolkhoz";
                        setProfilePatch(selectedProfile.id, {
                          requirements: [
                            ...selectedProfile.requirements,
                            { type: "WAVES_COMPLETED", count: 20, mapId },
                          ],
                        });
                      }}
                    >
                      + WAVES
                    </button>
                    {CANONICAL_BOSS_IDS.length > 0 && (
                      <button
                        type="button"
                        className="pixel-btn px-2 py-0.5"
                        onClick={() =>
                          setProfilePatch(selectedProfile.id, {
                            requirements: [
                              ...selectedProfile.requirements,
                              { type: "BOSS_KILLED", bossId: CANONICAL_BOSS_IDS[0]! },
                            ],
                          })
                        }
                      >
                        + BOSS
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="text-primary">ELIGIBILITY</div>
                    {profileEligibilityRows(selectedProfile.id, facts).map((row, i) => (
                      <div key={i} className={row.met ? "text-foreground" : "text-destructive"}>
                        {row.met ? "✓" : "✕"} {row.label}
                        {row.current != null && row.target != null && !row.met
                          ? ` — ${row.current} / ${row.target}`
                          : ""}
                      </div>
                    ))}
                    {!selectedProfile.requirements.length && (
                      <div className="text-muted-foreground">No requirements — always eligible when enabled.</div>
                    )}
                  </div>
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

          {view === "candidates" && (
            <div className="grid gap-3 lg:grid-cols-[12rem_1fr]">
              <div className="max-h-[55vh] space-y-0.5 overflow-auto">
                {inspectCandidates.map((c) => (
                  <button
                    key={c.candidateId}
                    type="button"
                    className={`block w-full px-1 py-0.5 text-left ${selectedCandidate?.candidateId === c.candidateId ? "bg-secondary" : ""}`}
                    onClick={() => setSelectedCandidateId(c.candidateId)}
                  >
                    {c.name}
                    <div className="text-[9px] text-muted-foreground">{c.archetypeId}</div>
                  </button>
                ))}
              </div>
              {selectedCandidate && (
                <CandidateInspector
                  candidate={selectedCandidate}
                  draft={draft}
                  onDraft={setDraft}
                />
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
  const rows = candidateStatRows(
    { ...candidate.stats, ...override.stats },
    { ...candidate.potential, ...override.potential },
  );
  const breakdown = recruitmentCostBreakdown({
    ...candidate,
    stats: { ...candidate.stats, ...override.stats },
    potential: { ...candidate.potential, ...override.potential },
    perkIds: override.perkIds ?? candidate.perkIds,
    ...((): Pick<RecruitCandidate, "negativeTraitIds"> => {
      const neg = override.negativeTraitIds ?? candidate.negativeTraitIds;
      return neg?.length ? { negativeTraitIds: [...neg] } : {};
    })(),
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
      <div className="pixel-card p-2">
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
            <span>{row.bar}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>
          POSITIVE PERK
          <select
            className="ml-1 border border-border bg-background"
            value={(override.perkIds ?? candidate.perkIds)[0] ?? ""}
            onChange={(e) => patchCandidate({ perkIds: [e.target.value] })}
          >
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
