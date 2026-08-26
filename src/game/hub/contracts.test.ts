import { describe, expect, it } from "bun:test";
import { compactContracts } from "./contracts";
import type { QuestProgress } from "../meta";

const empty: QuestProgress = { scavKills: 0, bossKills: 0, bestWave: 0, extracts: 0 };

describe("compact camp contracts", () => {
  it("prefers incomplete quests and caps at three", () => {
    const rows = compactContracts(empty, [], 3);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.ready)).toBe(true);
    expect(rows[0]?.name).toBe("FIRST BLOOD");
  });

  it("surfaces one redeemable quest after incomplete slots", () => {
    const rows = compactContracts({ ...empty, scavKills: 25 }, [], 3);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.ready)).toHaveLength(1);
    expect(rows[rows.length - 1]?.id).toBe("debut");
    expect(rows[rows.length - 1]?.line).toBe("Complete");
    expect(rows[0]?.ready).toBe(false);
  });

  it("omits already claimed quests", () => {
    const rows = compactContracts({ ...empty, scavKills: 25 }, ["debut"], 3);
    expect(rows.some((r) => r.id === "debut")).toBe(false);
  });
});
