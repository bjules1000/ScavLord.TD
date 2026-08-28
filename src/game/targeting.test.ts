import { describe, expect, it } from "bun:test";
import {
  hitTestEnemy,
  pathProgress,
  pickAutoTarget,
  pickManualTarget,
  selectTarget,
  type Targetable,
} from "./targeting";

function foe(partial: Partial<Targetable> & Pick<Targetable, "id">): Targetable {
  return {
    x: 0,
    y: 0,
    hp: 10,
    pathProgress: 0,
    ...partial,
  };
}

const origin = { x: 0, y: 0 };

describe("path progress", () => {
  it("uses segment plus t, not physical distance", () => {
    expect(pathProgress(3, 0.4)).toBe(3.4);
    expect(pathProgress(1, 0.9)).toBeLessThan(pathProgress(2, 0));
  });
});

describe("automatic targeting", () => {
  const pack: Targetable[] = [
    foe({ id: 1, x: 10, y: 0, hp: 8, pathProgress: 4.2 }),
    foe({ id: 2, x: 30, y: 0, hp: 40, pathProgress: 1.1 }),
    foe({ id: 3, x: 50, y: 0, hp: 40, pathProgress: 2.5 }),
  ];

  it("FIRST chooses furthest path progress in range", () => {
    expect(pickAutoTarget("FIRST", origin, 100, pack)?.id).toBe(1);
    expect(pickAutoTarget("FIRST", origin, 20, pack)?.id).toBe(1);
    expect(pickAutoTarget("FIRST", origin, 5, pack)).toBeNull();
    const split = [
      foe({ id: 4, x: 90, y: 0, pathProgress: 8 }),
      foe({ id: 5, x: 5, y: 0, pathProgress: 0.2 }),
    ];
    expect(pickAutoTarget("FIRST", origin, 100, split)?.id).toBe(4);
    expect(pickAutoTarget("CLOSEST", origin, 100, split)?.id).toBe(5);
  });

  it("LAST chooses least path progress in range", () => {
    expect(pickAutoTarget("LAST", origin, 100, pack)?.id).toBe(2);
  });

  it("CLOSEST chooses shortest physical distance", () => {
    expect(pickAutoTarget("CLOSEST", origin, 100, pack)?.id).toBe(1);
  });

  it("STRONGEST chooses highest current HP with deterministic ties", () => {
    expect(pickAutoTarget("STRONGEST", origin, 100, pack)?.id).toBe(3);
    const tied = [
      foe({ id: 10, hp: 50, pathProgress: 1 }),
      foe({ id: 11, hp: 50, pathProgress: 3 }),
      foe({ id: 9, hp: 50, pathProgress: 3 }),
    ];
    expect(pickAutoTarget("STRONGEST", origin, 100, tied)?.id).toBe(9);
  });
});

describe("MANUAL targeting", () => {
  const pack: Targetable[] = [
    foe({ id: 1, x: 10, y: 0, pathProgress: 9 }),
    foe({ id: 2, x: 80, y: 0, pathProgress: 1 }),
  ];

  it("honors the selected enemy while valid and in range", () => {
    expect(pickManualTarget(2, origin, 100, pack)?.id).toBe(2);
    expect(selectTarget("MANUAL", origin, 100, pack, 2)?.id).toBe(2);
  });

  it("does not auto-switch when the lock is invalid", () => {
    expect(pickManualTarget(2, origin, 20, pack)).toBeNull();
    expect(pickManualTarget(99, origin, 100, pack)).toBeNull();
    expect(selectTarget("MANUAL", origin, 100, pack, null)).toBeNull();
    expect(selectTarget("FIRST", origin, 100, pack)?.id).toBe(1);
  });

  it("holds fire when no manual target exists", () => {
    expect(selectTarget("MANUAL", origin, 100, pack, null)).toBeNull();
  });
});

describe("enemy click pick", () => {
  it("picks the nearest enemy within radius", () => {
    const pack = [foe({ id: 1, x: 10, y: 0 }), foe({ id: 2, x: 12, y: 0 })];
    expect(hitTestEnemy(12, 0, pack, 8)?.id).toBe(2);
    expect(hitTestEnemy(100, 100, pack, 8)).toBeNull();
  });
});
