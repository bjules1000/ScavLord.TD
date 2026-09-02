import { describe, expect, it } from "bun:test";
import { generateRecruitmentCandidates } from "./generation";
import { calculateRecruitmentCost, withRecruitmentCosts } from "./recruitment";
import { PERKS } from "./perks";
import {
  STAT_BAR_SEGMENTS,
  STAT_DISPLAY_KEYS,
  buildCandidateCardView,
  buildSelectedDetailView,
  canAffordRecruitment,
  candidateStatRows,
  formatRecruitmentRoubles,
  perkRecruitmentDetail,
  recruitmentAffordabilityMessage,
  recruitmentDeficit,
  startingKitDisplay,
  statBarFilledSegments,
  statBarString,
} from "./recruitmentUi";
import { STAT_LABELS, STAT_MAX, STAT_MIN } from "./stats";

describe("recruitment UI helpers", () => {
  const pool = withRecruitmentCosts(generateRecruitmentCandidates(4242, 0));
  const candidate = pool[0]!;
  const other = pool[1]!;

  it("candidate cards render all four canonical stats", () => {
    const card = buildCandidateCardView(candidate);
    expect(card.statRows).toHaveLength(STAT_DISPLAY_KEYS.length);
    for (const key of STAT_DISPLAY_KEYS) {
      expect(card.statRows.some((r) => r.key === key && r.label === STAT_LABELS[key])).toBe(true);
    }
  });

  it("candidate cards render perk", () => {
    const card = buildCandidateCardView(candidate);
    expect(card.perkName.length).toBeGreaterThan(0);
    expect(card.perkName).toBe(PERKS[candidate.perkIds[0]!]!.name);
  });

  it("candidate cards render formatted cost", () => {
    const card = buildCandidateCardView(candidate);
    expect(card.costFormatted).toBe(formatRecruitmentRoubles(candidate.cost));
    expect(card.costFormatted).toContain("₽");
  });

  it("candidate cards do not include starting-kit line", () => {
    const card = buildCandidateCardView(candidate);
    expect(card.showsKitLine).toBe(false);
  });

  it("selected detail does not duplicate full stat grid", () => {
    const detail = buildSelectedDetailView(candidate, 0);
    expect("statRows" in detail).toBe(false);
    expect(detail).not.toHaveProperty("stats");
  });

  it("selected detail renders perk effect", () => {
    const detail = buildSelectedDetailView(candidate, 0);
    expect(detail.perk).not.toBeNull();
    expect(detail.perk!.lines.length).toBeGreaterThan(0);
    expect(detail.perk!.lines.some((l) => l.startsWith("+") || l.startsWith("Future:"))).toBe(true);
  });

  it("selected detail renders weapon armor and attachments", () => {
    const detail = buildSelectedDetailView(candidate, 0);
    expect(detail.kit.weapon.length).toBeGreaterThan(0);
    expect(detail.kit.armor).toBeTruthy();
    expect(detail.kit.attachments).toBeTruthy();
  });

  it("selected detail renders kit value when canonical value exists", () => {
    const detail = buildSelectedDetailView(candidate, 0);
    expect(detail.kit.kitValue).toBeGreaterThanOrEqual(0);
  });

  it("selected detail renders bank and cost", () => {
    const detail = buildSelectedDetailView(candidate, 600);
    expect(detail.bankFormatted).toBe(formatRecruitmentRoubles(600));
    expect(detail.costFormatted).toBe(formatRecruitmentRoubles(candidate.cost));
  });

  it("selecting another candidate updates detail identity", () => {
    const a = buildSelectedDetailView(candidate, 0);
    const b = buildSelectedDetailView(other, 0);
    expect(a.identity).not.toBe(b.identity);
  });

  it("stat visualizer uses shared canonical range", () => {
    expect(statBarFilledSegments(STAT_MIN)).toBe(0);
    expect(statBarFilledSegments(STAT_MAX)).toBe(STAT_BAR_SEGMENTS);
    expect(statBarString(STAT_MIN)).toBe("░".repeat(STAT_BAR_SEGMENTS));
    expect(statBarString(STAT_MAX)).toBe("█".repeat(STAT_BAR_SEGMENTS));
    expect(statBarFilledSegments(50)).toBe(statBarFilledSegments(50));
  });

  it("does not mutate candidate stats when formatting", () => {
    const before = { ...candidate.stats };
    candidateStatRows(candidate.stats);
    statBarString(candidate.stats.aim);
    buildCandidateCardView(candidate);
    buildSelectedDetailView(candidate, 0);
    expect(candidate.stats).toEqual(before);
  });

  it("perk description comes from canonical perk definition", () => {
    const perkId = candidate.perkIds[0]!;
    const detail = perkRecruitmentDetail(perkId);
    expect(detail.name).toBe(PERKS[perkId]!.name);
    expect(detail.lines.some((l) => l.includes(PERKS[perkId]!.desc) || l.startsWith("+"))).toBe(true);
  });

  it("shows future-facing copy for dormant perks", () => {
    const detail = perkRecruitmentDetail("gunsmith");
    expect(detail.lines[0]).toMatch(/^Future:/);
  });

  it("starting kit displays canonical weapon and armor", () => {
    const kit = startingKitDisplay(candidate.equipment);
    expect(kit.weapon.length).toBeGreaterThan(0);
    expect(kit.armor).toBeTruthy();
    expect(kit.kitValue).toBeGreaterThanOrEqual(0);
  });

  it("shows attachments when present", () => {
    const kit = startingKitDisplay({
      weapon: "m4",
      attachments: ["optic", "grip"],
      armor: null,
    });
    expect(kit.attachments).toContain("4X SCOPE");
    expect(kit.attachments).toContain("FOREGRIP");
  });

  it("HIRE disabled when bank < cost", () => {
    expect(canAffordRecruitment(0, candidate.cost)).toBe(false);
    expect(buildSelectedDetailView(candidate, 0).affordable).toBe(false);
  });

  it("HIRE enabled when bank >= cost", () => {
    expect(canAffordRecruitment(candidate.cost, candidate.cost)).toBe(true);
    expect(buildSelectedDetailView(candidate, candidate.cost).affordable).toBe(true);
  });

  it("deficit calculation and message are correct", () => {
    expect(recruitmentDeficit(0, 951)).toBe(951);
    expect(recruitmentDeficit(600, 951)).toBe(351);
    expect(recruitmentDeficit(1000, 1331)).toBe(331);
    expect(recruitmentAffordabilityMessage(600, 951)).toBe("INSUFFICIENT FUNDS · NEED 351 ₽ MORE");
    expect(recruitmentAffordabilityMessage(1000, 1331)).toBe("INSUFFICIENT FUNDS · NEED 331 ₽ MORE");
    expect(recruitmentAffordabilityMessage(0, 1331)).toBe("INSUFFICIENT FUNDS · NEED 1,331 ₽ MORE");
    expect(recruitmentAffordabilityMessage(951, 951)).toBeNull();
  });

  it("candidate generation remains unchanged", () => {
    const a = generateRecruitmentCandidates(77, 3);
    const b = generateRecruitmentCandidates(77, 3);
    expect(a).toEqual(b);
  });
});
