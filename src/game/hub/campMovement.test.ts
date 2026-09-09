import { describe, expect, it } from "bun:test";
import { stepCampMove, nearestStation, type CampMoveInput } from "./campMovement";
import type { HubHotspot } from "./hotspots";

const NONE: CampMoveInput = { up: false, down: false, left: false, right: false };
const BOUNDS = { width: 1000, height: 800 };

function station(partial: Partial<HubHotspot> & Pick<HubHotspot, "id" | "action">): HubHotspot {
  return {
    label: partial.id.toUpperCase(),
    xPercent: 0,
    yPercent: 0,
    widthPercent: 10,
    heightPercent: 10,
    enabled: true,
    ...partial,
  };
}

describe("stepCampMove", () => {
  it("moves in the held direction", () => {
    const r = stepCampMove(500, 400, { ...NONE, right: true }, 0.1, 100, BOUNDS);
    expect(r.x).toBeCloseTo(510);
    expect(r.y).toBeCloseTo(400);
  });

  it("holding no keys does not move", () => {
    const r = stepCampMove(500, 400, NONE, 0.1, 100, BOUNDS);
    expect(r).toEqual({ x: 500, y: 400 });
  });

  it("normalizes diagonal input so it isn't faster than a straight line", () => {
    const step = 40;
    const r = stepCampMove(500, 400, { ...NONE, up: true, right: true }, 0.1, step / 0.1, BOUNDS);
    const dist = Math.hypot(r.x - 500, r.y - 400);
    expect(dist).toBeCloseTo(step, 5);
  });

  it("clamps at each of the four image bounds", () => {
    expect(stepCampMove(2, 400, { ...NONE, left: true }, 1, 100, BOUNDS).x).toBe(0);
    expect(stepCampMove(998, 400, { ...NONE, right: true }, 1, 100, BOUNDS).x).toBe(1000);
    expect(stepCampMove(500, 2, { ...NONE, up: true }, 1, 100, BOUNDS).y).toBe(0);
    expect(stepCampMove(500, 798, { ...NONE, down: true }, 1, 100, BOUNDS).y).toBe(800);
  });
});

describe("nearestStation", () => {
  const stations: HubHotspot[] = [
    station({ id: "supplies", action: "supplies", xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 }),
    station({ id: "gear", action: "gear", xPercent: 80, yPercent: 80, widthPercent: 10, heightPercent: 10 }),
  ];

  it("returns the closest in-range station", () => {
    // (0,0)-(100,100) box in a 1000x800 image; player near it.
    const hit = nearestStation(120, 50, stations, 1000, 800, 60);
    expect(hit?.id).toBe("supplies");
  });

  it("returns null when nothing is within radius", () => {
    expect(nearestStation(500, 400, stations, 1000, 800, 60)).toBeNull();
  });

  it("distance is to the nearest edge of the box, not the center", () => {
    // supplies box is (0,0)-(100,100); a point at (100, 500) is 400px from the box's
    // center but only ~400... actually let's use a point straight off one edge.
    const hit = nearestStation(150, 50, stations, 1000, 800, 60);
    expect(hit?.id).toBe("supplies");
  });

  it("skips disabled or action-less stations", () => {
    const disabled = [station({ id: "reserved", action: undefined, xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 })];
    expect(nearestStation(10, 10, disabled, 1000, 800, 60)).toBeNull();
  });

  it("breaks ties by array order", () => {
    const tied: HubHotspot[] = [
      station({ id: "first", action: "supplies", xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 }),
      station({ id: "second", action: "gear", xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 }),
    ];
    expect(nearestStation(50, 50, tied, 1000, 800, 100)?.id).toBe("first");
  });
});
