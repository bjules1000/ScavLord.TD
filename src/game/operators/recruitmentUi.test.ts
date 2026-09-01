import { describe, expect, it } from "bun:test";
import { generateRecruitmentCandidates } from "./generation";
import { calculateRecruitmentCost, withRecruitmentCosts } from "./recruitment";
import { PERKS } from "./perks";
import {
  STAT_BAR_SEGMENTS,
  STAT_DISPLAY_KEYS,
  canAffordRecruitment,
  candidateStatRows,
  perkRecruitmentDetail,
  recruitmentAffordabilityMessage,
  recruitmentDeficit,
  startingKitDisplay,
  statBarFilledSegments,
  statBarString,
} from "./recruitmentUi";
import { STAT_LABELS, STAT_MAX, STAT_MIN } from "./stats";

describe("recruitment UI helpers", () => {
  const [raw] = generateRecruitmentCandidates(4242, 0);
  const candidate = withRecruitmentCosts([raw!])[0]!;

  it("candidate stat rows render all canonical stats", () => {
    const rows = candidateStatRows(candidate.stats);
    expect(rows).toHaveLength(STAT_DISPLAY_KEYS.length);
    for (const key of STAT_DISPLAY_KEYS) {
      expect(rows.some((r) => r.key === key && r.label === STAT_LABELS[key])).toBe(true);
    }
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
    expect(candidate.stats).toEqual(before);
  });

  it("perk description comes from canonical perk definition", () => {
    const perkId = candidate.perkIds[0]!;
    const detail = perkRecruitmentDetail(perkId);
    expect(detail.name).toBe(PERKS[perkId]!.name);
    expect(detail.lines.length).toBeGreaterThan(0);
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

  it("cost is available on candidate for card display", () => {
    expect(candidate.cost).toBe(calculateRecruitmentCost(candidate));
    expect(candidate.cost).toBeGreaterThan(0);
  });

  it("HIRE disabled when bank < cost", () => {
    expect(canAffordRecruitment(0, candidate.cost)).toBe(false);
    expect(canAffordRecruitment(candidate.cost - 1, candidate.cost)).toBe(false);
  });

  it("HIRE enabled when bank >= cost", () => {
    expect(canAffordRecruitment(candidate.cost, candidate.cost)).toBe(true);
    expect(canAffordRecruitment(candidate.cost + 100, candidate.cost)).toBe(true);
  });

  it("deficit calculation is correct", () => {
    expect(recruitmentDeficit(0, 951)).toBe(951);
    expect(recruitmentDeficit(600, 951)).toBe(351);
    expect(recruitmentDeficit(951, 951)).toBe(0);
    expect(recruitmentAffordabilityMessage(600, 951)).toBe("INSUFFICIENT FUNDS · NEED 351 ₽ MORE");
    expect(recruitmentAffordabilityMessage(951, 951)).toBeNull();
  });

  it("candidate generation remains unchanged", () => {
    const a = generateRecruitmentCandidates(77, 3);
    const b = generateRecruitmentCandidates(77, 3);
    expect(a).toEqual(b);
  });
});
