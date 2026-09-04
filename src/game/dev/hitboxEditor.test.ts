import { describe, expect, it } from "bun:test";
import { defaultHitZones, enemyWorldBounds, resolveHitZoneAtPoint } from "../enemyHitZones";
import {
  clampZoneGeometry,
  layoutHitboxCanvas,
  layoutHitboxCanvasForEnemy,
  moveZoneByGrab,
  newCustomHitZone,
  resizeZoneByHandle,
  screenToNormalized,
  selectZoneAtScreen,
  withShape,
  zoneScreenRect,
} from "./hitboxEditor";

describe("hitboxEditor helpers", () => {
  it("preserves geometry when changing shape", () => {
    const head = defaultHitZones().find((z) => z.id === "head")!;
    const next = withShape(head, "rect");
    expect(next.shape).toBe("rect");
    expect(next.x).toBe(head.x);
    expect(next.y).toBe(head.y);
    expect(next.width).toBe(head.width);
    expect(next.height).toBe(head.height);
  });

  it("drag updates normalized x/y without jump via grab offset", () => {
    const zone = { x: 0.3, y: 0.1, width: 0.2, height: 0.2 };
    const grabOffX = 0.05;
    const grabOffY = 0.05;
    // Pointer at same relative spot → zone stays put
    const stayed = moveZoneByGrab(zone, zone.x + grabOffX, zone.y + grabOffY, grabOffX, grabOffY);
    expect(stayed.x).toBeCloseTo(zone.x);
    expect(stayed.y).toBeCloseTo(zone.y);
    const moved = moveZoneByGrab(zone, 0.5, 0.4, grabOffX, grabOffY);
    expect(moved.x).toBeCloseTo(0.45);
    expect(moved.y).toBeCloseTo(0.35);
    expect(moved.width).toBe(zone.width);
  });

  it("resize updates width/height and clamps to unit square", () => {
    const start = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
    const bigger = resizeZoneByHandle(start, "se", 0.8, 0.7);
    expect(bigger.width).toBeCloseTo(0.6);
    expect(bigger.height).toBeCloseTo(0.5);
    const clamped = resizeZoneByHandle(start, "se", 2, 2);
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(1.0001);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(1.0001);
  });

  it("numeric clamp keeps valid bounds", () => {
    const g = clampZoneGeometry({ x: -0.2, y: 0.9, width: 0.5, height: 0.5 });
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.y + g.height).toBeLessThanOrEqual(1.0001);
    expect(g.width).toBeGreaterThan(0);
  });

  it("canvas scaling does not change normalized state", () => {
    const zone = defaultHitZones()[0]!;
    const small = layoutHitboxCanvas(160, 200, 10);
    const large = layoutHitboxCanvas(320, 420, 28);
    const a = zoneScreenRect(small, zone);
    const b = zoneScreenRect(large, zone);
    const nSmall = screenToNormalized(small, a.x + a.w / 2, a.y + a.h / 2);
    const nLarge = screenToNormalized(large, b.x + b.w / 2, b.y + b.h / 2);
    expect(nSmall.x).toBeCloseTo(zone.x + zone.width / 2, 5);
    expect(nSmall.y).toBeCloseTo(zone.y + zone.height / 2, 5);
    expect(nSmall.x).toBeCloseTo(nLarge.x, 5);
    expect(nSmall.y).toBeCloseTo(nLarge.y, 5);
  });

  it("selectZoneAtScreen uses priority for overlaps", () => {
    const zones = defaultHitZones();
    const layout = layoutHitboxCanvas(320, 420);
    const head = zones.find((z) => z.id === "head")!;
    const sx = layout.contentLeft + (head.x + head.width / 2) * layout.contentW;
    const sy = layout.contentTop + (head.y + head.height * 0.9) * layout.contentH;
    expect(selectZoneAtScreen(zones, layout, sx, sy)).toBe("head");
  });

  it("layoutHitboxCanvasForEnemy matches world aspect", () => {
    const size = 13;
    const world = enemyWorldBounds(0, 0, size);
    const layout = layoutHitboxCanvasForEnemy(size);
    expect(layout.contentW / layout.contentH).toBeCloseTo(world.width / world.height, 5);
  });

  it("ellipse vs rect runtime collision differs at corner of bbox", () => {
    const bounds = { left: 0, top: 0, width: 100, height: 100 };
    const base = {
      id: "z",
      displayName: "Z",
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
      damageMult: 1,
      enabled: true,
      priority: 10,
    };
    const cornerX = 10;
    const cornerY = 10;
    expect(resolveHitZoneAtPoint([{ ...base, shape: "rect" as const }], bounds, cornerX, cornerY)?.zone.id).toBe(
      "z",
    );
    // Near corner of bbox — outside ellipse
    expect(
      resolveHitZoneAtPoint([{ ...base, shape: "ellipse" as const }], bounds, cornerX, cornerY),
    ).toBeNull();
  });

  it("newCustomHitZone gets stable unique id", () => {
    const a = newCustomHitZone([]);
    const b = newCustomHitZone([a]);
    expect(a.id).not.toBe(b.id);
    expect(a.shape).toBe("rect");
  });
});
