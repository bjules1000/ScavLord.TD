import { describe, expect, it } from "bun:test";
import { freshMeta } from "../meta";
import { migrateV5ToV6 } from "./migration";
import { hireCandidate, refreshRecruitmentPoolIfNeeded, regenerateRecruitmentPool } from "./crew";
import { generateRecruitmentCandidates } from "./generation";
import { freshRadioProgression } from "./radioProgression";

function metaWithSignal(slots = 3) {
  const meta = freshMeta();
  meta.crew.radio = {
    ...freshRadioProgression(),
    radioState: "SIGNAL_RESTORED",
    modifiers:
      slots > 1
        ? [{ id: "extra", kind: "RECRUITMENT_SLOT_BONUS", source: "quest", amount: slots - 1 }]
        : [],
  };
  regenerateRecruitmentPool(meta);
  return meta;
}

describe("crew persistence", () => {
  it("refresh only after run counter advances", () => {
    const meta = metaWithSignal(2);
    const first = [...meta.crew.recruitment.candidates];
    expect(refreshRecruitmentPoolIfNeeded(meta)).toBe(false);
    expect(meta.crew.recruitment.candidates.map((c) => c.candidateId)).toEqual(
      first.map((c) => c.candidateId),
    );
    meta.runs = meta.crew.recruitment.lastRefreshedAtRun + 1;
    expect(refreshRecruitmentPoolIfNeeded(meta)).toBe(true);
    expect(meta.crew.recruitment.generation).toBeGreaterThan(0);
    expect(refreshRecruitmentPoolIfNeeded(meta)).toBe(false);
  });

  it("duplicate refresh does not reroll twice", () => {
    const meta = metaWithSignal(2);
    meta.runs = meta.crew.recruitment.lastRefreshedAtRun + 1;
    refreshRecruitmentPoolIfNeeded(meta);
    const ids = meta.crew.recruitment.candidates.map((c) => c.candidateId);
    refreshRecruitmentPoolIfNeeded(meta);
    expect(meta.crew.recruitment.candidates.map((c) => c.candidateId)).toEqual(ids);
  });
});

describe("migration", () => {
  it("v5 meta gains crew without losing stash or bank", () => {
    const legacy = freshMeta();
    legacy.bank = 4200;
    legacy.stash = [{ defId: "w_ak74" }, { defId: "a_grip" }];
    const { crew: _crew, ...withoutCrew } = legacy;
    const migrated = migrateV5ToV6(withoutCrew as typeof legacy);
    expect(migrated.bank).toBe(4200);
    expect(migrated.stash).toHaveLength(2);
    expect(migrated.crew.operators).toEqual([]);
    // New-game radio is BROKEN with empty pool
    expect(migrated.crew.radio.radioState).toBe("BROKEN");
    expect(migrated.crew.recruitment.candidates.length).toBe(0);
  });

  it("migration is idempotent for crew block", () => {
    const meta = freshMeta();
    const again = migrateV5ToV6(meta);
    expect(again.crew.recruitment.candidates.length).toBe(meta.crew.recruitment.candidates.length);
  });
});

describe("pool stability", () => {
  it("hiring one candidate does not reroll the others", () => {
    const meta = metaWithSignal(3);
    const others = meta.crew.recruitment.candidates.slice(1).map((c) => c.candidateId);
    const first = meta.crew.recruitment.candidates[0]!;
    meta.bank = first.cost + 100;
    hireCandidate(meta, first.candidateId, "op_stable");
    expect(meta.crew.recruitment.candidates.map((c) => c.candidateId)).toEqual(others);
  });

  it("same seed reproduces pool contents", () => {
    const a = generateRecruitmentCandidates(404, 9, 2);
    const b = generateRecruitmentCandidates(404, 9, 2);
    expect(a).toEqual(b);
  });
});
