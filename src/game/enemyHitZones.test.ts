import { describe, expect, it } from "bun:test";
import {
  defaultHitZones,
  enemyWorldBounds,
  fallbackBodyHitZones,
  resolveEnemyHitZones,
  resolveHitZoneAtPoint,
} from "./enemyHitZones";

describe("enemyHitZones", () => {
  it("resolves authored zones at a point", () => {
    const zones = defaultHitZones();
    const bounds = enemyWorldBounds(100, 100, 13);
    const head = zones.find((z) => z.id === "head")!;
    const hx = bounds.left + (head.x + head.width / 2) * bounds.width;
    const hy = bounds.top + (head.y + head.height / 2) * bounds.height;
    const hit = resolveHitZoneAtPoint(zones, bounds, hx, hy);
    expect(hit?.zone.id).toBe("head");
    expect(hit?.damageMult).toBe(1.75);
  });

  it("falls back to legacy body when authored zones missing", () => {
    expect(resolveEnemyHitZones(undefined)).toEqual(fallbackBodyHitZones());
    expect(resolveEnemyHitZones([])).toEqual(fallbackBodyHitZones());
    expect(resolveEnemyHitZones(null)).toEqual(fallbackBodyHitZones());
  });

  it("highest priority wins when zones overlap", () => {
    const zones = defaultHitZones();
    const bounds = enemyWorldBounds(50, 50, 16);
    // Point near head/body overlap: head priority 30 > body 20
    const head = zones.find((z) => z.id === "head")!;
    const body = zones.find((z) => z.id === "body")!;
    const hx = bounds.left + (head.x + head.width / 2) * bounds.width;
    const hy = bounds.top + Math.max(head.y + head.height * 0.85, body.y + body.height * 0.1) * bounds.height;
    const hit = resolveHitZoneAtPoint(zones, bounds, hx, hy);
    expect(hit?.zone.id).toBe("head");
    expect(hit!.zone.priority).toBeGreaterThan(body.priority);
  });

  it("ignores disabled zones", () => {
    const zones = defaultHitZones().map((z) => (z.id === "head" ? { ...z, enabled: false } : z));
    const bounds = enemyWorldBounds(100, 100, 13);
    const head = defaultHitZones().find((z) => z.id === "head")!;
    const hx = bounds.left + (head.x + head.width / 2) * bounds.width;
    const hy = bounds.top + (head.y + head.height / 2) * bounds.height;
    const hit = resolveHitZoneAtPoint(zones, bounds, hx, hy);
    expect(hit?.zone.id).not.toBe("head");
  });
});
