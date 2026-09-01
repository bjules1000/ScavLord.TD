import { describe, expect, it } from "bun:test";
import { freshMeta } from "../meta";
import { migrateV5ToV6 } from "./migration";
import { hireCandidate, refreshRecruitmentPoolIfNeeded } from "./crew";
import { generateRecruitmentCandidates } from "./generation";

describe("crew persistence", () => {
  it("refresh only after run counter advances", () => {
    const meta = freshMeta();
    const first = [...meta.crew.recruitment.candidates];
    expect(refreshRecruitmentPoolIfNeeded(meta)).toBe(false);
    expect(meta.crew.recruitment.candidates.map((c) => c.candidateId)).toEqual(
      first.map((c) => c.candidateId),
    );
    meta.runs = 1;
    expect(refreshRecruitmentPoolIfNeeded(meta)).toBe(true);
    expect(meta.crew.recruitment.generation).toBe(1);
    expect(refreshRecruitmentPoolIfNeeded(meta)).toBe(false);
  });

  it("duplicate refresh does not reroll twice", () => {
    const meta = freshMeta();
    meta.runs = 2;
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
    expect(migrated.crew.recruitment.candidates.length).toBe(3);
  });

  it("migration is idempotent for crew block", () => {
    const meta = freshMeta();
    const again = migrateV5ToV6(meta);
    expect(again.crew.recruitment.candidates.length).toBe(meta.crew.recruitment.candidates.length);
  });
});

describe("pool stability", () => {
  it("hiring one candidate does not reroll the others", () => {
    const meta = freshMeta();
    const others = meta.crew.recruitment.candidates.slice(1).map((c) => c.candidateId);
    const first = meta.crew.recruitment.candidates[0]!;
    meta.bank = first.cost + 100;
    hireCandidate(meta, first.candidateId, "op_stable");
    expect(meta.crew.recruitment.candidates.map((c) => c.candidateId)).toEqual(others);
  });

  it("same seed reproduces pool contents", () => {
    const a = generateRecruitmentCandidates(404, 9);
    const b = generateRecruitmentCandidates(404, 9);
    expect(a).toEqual(b);
  });
});
