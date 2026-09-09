import { describe, expect, it } from "bun:test";
import { stepCampMove, nearestStation, type CampMoveInput } from "./campMovement";
import type { CampStationProp } from "./campMap";

const NONE: CampMoveInput = { up: false, down: false, left: false, right: false };
const BOUNDS = { width: 1000, height: 800 };
const TILE = 32;

function station(partial: Partial<CampStationProp> & Pick<CampStationProp, "id">): CampStationProp {
  return { type: "crate", tx: 0, ty: 0, ...partial };
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

  it("without a collision predicate, movement is unaffected (backward compatible)", () => {
    const r = stepCampMove(500, 400, { ...NONE, right: true }, 1, 100, BOUNDS);
    expect(r.x).toBe(600);
  });

  it("stops on the blocked axis when approaching from the west", () => {
    // Tile tx=5 spans 160..192. Starting at x=150 (tile 4), a 20px step lands at 170 (tile 5).
    const collision = { tileSize: TILE, blocked: (tx: number) => tx === 5 };
    const r = stepCampMove(150, 100, { ...NONE, right: true }, 1, 20, BOUNDS, collision);
    expect(r.x).toBe(150);
  });

  it("stops on the blocked axis when approaching from the north", () => {
    const collision = { tileSize: TILE, blocked: (_tx: number, ty: number) => ty === 5 };
    const r = stepCampMove(100, 150, { ...NONE, down: true }, 1, 20, BOUNDS, collision);
    expect(r.y).toBe(150);
  });

  it("lets a diagonal move slide along a wall instead of freezing both axes", () => {
    // Blocked column at tx=5; moving down-right should still advance in y.
    const collision = { tileSize: TILE, blocked: (tx: number) => tx === 5 };
    const r = stepCampMove(150, 100, { ...NONE, right: true, down: true }, 1, 20, BOUNDS, collision);
    expect(r.x).toBe(150);
    expect(r.y).toBeGreaterThan(100);
  });
});

describe("nearestStation", () => {
  const props: CampStationProp[] = [
    station({ id: "supplies", type: "crate", tx: 0, ty: 0, hubAction: "supplies" }),
    station({ id: "gear", type: "gun-bench", tx: 25, ty: 25, hubAction: "gear" }),
  ];

  it("returns the closest in-range station", () => {
    const hit = nearestStation(40, 20, props, TILE, 60);
    expect(hit?.id).toBe("supplies");
  });

  it("returns null when nothing is within radius", () => {
    expect(nearestStation(500, 400, props, TILE, 60)).toBeNull();
  });

  it("distance is to the nearest edge of the tile, not the center", () => {
    const hit = nearestStation(TILE + 50, 16, props, TILE, 60);
    expect(hit?.id).toBe("supplies");
  });

  it("skips decorative props with no hubAction", () => {
    const decorative = [station({ id: "fire", type: "fire", tx: 0, ty: 0 })];
    expect(nearestStation(10, 10, decorative, TILE, 60)).toBeNull();
  });

  it("breaks ties by array order", () => {
    const tied: CampStationProp[] = [
      station({ id: "first", type: "crate", tx: 0, ty: 0, hubAction: "supplies" }),
      station({ id: "second", type: "gun-bench", tx: 0, ty: 0, hubAction: "gear" }),
    ];
    expect(nearestStation(16, 16, tied, TILE, 100)?.id).toBe("first");
  });
});
