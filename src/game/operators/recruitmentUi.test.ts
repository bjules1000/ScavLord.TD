import { describe, expect, it } from "bun:test";
import { generateRecruitmentCandidates } from "./generation";
import { calculateRecruitmentCost, withRecruitmentCosts } from "./recruitment";
import { PERKS } from "./perks";
import { STAT_KEYS, STAT_DISPLAY_MAX, STAT_LABELS, STAT_MAX, STAT_MIN, STAT_POTENTIAL_MAX } from "./stats";
import {
  STAT_BAR_SEGMENTS,
  buildCandidateCardView,
  buildSelectedDetailView,
  canAffordRecruitment,
  candidateStatRows,
  formatRecruitmentRoubles,
  perkRecruitmentDetail,
  recruitmentAffordabilityMessage,
  recruitmentDeficit,
  startingKitDisplay,
  statPotentialBarSegments,
} from "./recruitmentUi";
import { generateRecruitmentCandidates as gen } from "./generation";

describe("recruitment UI helpers", () => {
  const pool = withRecruitmentCosts(generateRecruitmentCandidates(4242, 0));
  const candidate = pool[0]!;
  const other = pool[1]!;

  it("candidate cards render all four canonical stats with current only (player view)", () => {
    const card = buildCandidateCardView(candidate);
    expect(card.statRows).toHaveLength(STAT_KEYS.length);
    for (const row of card.statRows) {
      expect(row.current).toBe(candidate.stats[row.key]);
      expect(row).not.toHaveProperty("potential");
      expect(row.bar.length).toBeGreaterThan(0);
    }
  });

  it("candidate cards render perk and formatted cost", () => {
    const card = buildCandidateCardView(candidate);
    expect(card.perkName).toBe(PERKS[candidate.perkIds[0]!]!.name);
    expect(card.costFormatted).toBe(formatRecruitmentRoubles(candidate.cost));
  });

  it("candidate cards do not include starting-kit line", () => {
    expect(buildCandidateCardView(candidate).showsKitLine).toBe(false);
  });

  it("DEV stat rows expose exact potential", () => {
    const rows = candidateStatRows(candidate.stats, candidate.potential);
    expect(rows[0]!.potential).toBe(candidate.potential.aim);
  });

  it("selected detail does not leak exact development gap", () => {
    const detail = buildSelectedDetailView(candidate, 0);
    expect(detail).not.toHaveProperty("developmentLine");
  });

  it("stat bars use shared global stat scale", () => {
    const a = statPotentialBarSegments(50, 100, "aim");
    const b = statPotentialBarSegments(30, 120, "aim");
    expect(a.currentFilled).toBeGreaterThan(b.currentFilled);
    expect(b.potentialFilled).toBeGreaterThanOrEqual(a.potentialFilled);
  });

  it("low absolute ceiling does not look like high capability", () => {
    const low = statPotentialBarSegments(20, 25, "mobility");
    const high = statPotentialBarSegments(80, 100, "mobility");
    expect(low.potentialFilled).toBeLessThan(high.currentFilled);
    expect(low.potentialFilled).toBeLessThanOrEqual(2);
  });

  it("30/120 renders less current but more potential than 50/100 on aim", () => {
    const nikita = statPotentialBarSegments(50, 100, "aim");
    const dima = statPotentialBarSegments(30, 120, "aim");
    expect(nikita.currentFilled).toBeGreaterThan(dima.currentFilled);
    expect(dima.potentialFilled).toBeGreaterThan(nikita.potentialFilled);
  });

  it("uses centralized display maxima", () => {
    expect(STAT_DISPLAY_MAX.aim).toBe(120);
    const seg = statPotentialBarSegments(STAT_MAX, STAT_POTENTIAL_MAX, "aim");
    expect(seg.totalSegments).toBe(STAT_BAR_SEGMENTS);
  });

  it("selected detail renders perk, kit, and hiring data", () => {
    const detail = buildSelectedDetailView(candidate, 600);
    expect(detail.perk).not.toBeNull();
    expect(detail.kit.weapon.length).toBeGreaterThan(0);
    expect(detail.bankFormatted).toContain("₽");
    expect(detail.costFormatted).toContain("₽");
  });

  it("does not mutate candidate when formatting", () => {
    const beforeStats = { ...candidate.stats };
    const beforePot = { ...candidate.potential };
    buildCandidateCardView(candidate);
    buildSelectedDetailView(candidate, 0);
    candidateStatRows(candidate.stats, candidate.potential);
    expect(candidate.stats).toEqual(beforeStats);
    expect(candidate.potential).toEqual(beforePot);
  });

  it("deficit calculation is correct with locale formatting", () => {
    expect(recruitmentDeficit(1000, 1331)).toBe(331);
    expect(recruitmentAffordabilityMessage(1000, 1331)).toBe("INSUFFICIENT FUNDS · NEED 331 ₽ MORE");
  });

  it("HIRE enabled/disabled from affordability helpers", () => {
    expect(canAffordRecruitment(0, candidate.cost)).toBe(false);
    expect(buildSelectedDetailView(candidate, candidate.cost).affordable).toBe(true);
  });

  it("selecting another candidate updates detail identity", () => {
    const a = buildSelectedDetailView(candidate, 0);
    const b = buildSelectedDetailView(other, 0);
    expect(a.identity).not.toBe(b.identity);
  });

  it("starting kit and perk descriptions remain canonical", () => {
    const kit = startingKitDisplay(candidate.equipment);
    expect(kit.kitValue).toBeGreaterThanOrEqual(0);
    const perk = perkRecruitmentDetail(candidate.perkIds[0]!);
    expect(perk.lines.length).toBeGreaterThan(0);
  });

  it("candidate generation unchanged by UI formatters", () => {
    expect(gen(77, 3)).toEqual(gen(77, 3));
  });

  it("cost available for card display", () => {
    expect(candidate.cost).toBe(calculateRecruitmentCost(candidate));
  });

  it("current stats stay within legal current ranges after generation", () => {
    for (const c of pool) {
      for (const v of Object.values(c.stats)) {
        expect(v).toBeGreaterThanOrEqual(STAT_MIN);
        expect(v).toBeLessThanOrEqual(STAT_MAX);
      }
    }
  });

  it("stat labels remain canonical on rows", () => {
    const rows = candidateStatRows(candidate.stats, candidate.potential);
    for (const key of STAT_KEYS) {
      expect(rows.some((r) => r.key === key && r.label === STAT_LABELS[key])).toBe(true);
    }
  });
});
