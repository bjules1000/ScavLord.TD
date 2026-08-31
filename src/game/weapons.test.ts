import { describe, expect, it } from "bun:test";
import { WEAPONS } from "./gear";
import {
  HIRED_WEAPON_ID,
  STARTER_WEAPON_ID,
  canShoot,
  combatStatus,
  consumeRound,
  initAmmo,
  magSizeOf,
  maybeStartReload,
  reloadMsOf,
  reloadTypeOf,
  tickReload,
} from "./weapons";

describe("starter weapon identities", () => {
  it("gives the pistol a 7-round magazine reload", () => {
    expect(STARTER_WEAPON_ID).toBe("pm");
    expect(WEAPONS["pm"]?.name).toBe("SIDEARM");
    expect(magSizeOf("pm")).toBe(7);
    expect(reloadTypeOf("pm")).toBe("MAGAZINE");
    expect(reloadMsOf("pm")).toBe(1500);
    expect(initAmmo("pm")).toBe(7);
    expect(WEAPONS["pm"]?.damage).toBe(15);
    expect(WEAPONS["pm"]?.range).toBe(92);
    expect(WEAPONS["pm"]?.cooldown).toBe(400);
  });

  it("gives the sawed-off interruptible per-round loading", () => {
    expect(HIRED_WEAPON_ID).toBe("toz");
    expect(WEAPONS["toz"]?.name).toBe("SAWED-OFF");
    expect(magSizeOf("toz")).toBe(2);
    expect(reloadTypeOf("toz")).toBe("PER_ROUND");
    expect(reloadMsOf("toz")).toBe(950);
    expect(initAmmo("toz")).toBe(2);
    expect((WEAPONS["toz"]!.damage) * (WEAPONS["toz"]!.pellets ?? 1)).toBe(63);
    expect(WEAPONS["toz"]?.pellets).toBe(9);
    expect(WEAPONS["toz"]?.damage).toBe(7);
    expect(WEAPONS["toz"]?.range).toBeLessThan(WEAPONS["pm"]!.range);
    expect(WEAPONS["toz"]?.cooldown).toBeGreaterThan(WEAPONS["pm"]!.cooldown);
  });
});

describe("pistol magazine", () => {
  const mag = magSizeOf("pm");
  const reloadMs = reloadMsOf("pm");

  it("starts full and consumes one round per shot", () => {
    let ammo = initAmmo("pm");
    expect(ammo).toBe(7);
    ammo = consumeRound(ammo);
    expect(ammo).toBe(6);
    for (let i = 0; i < 6; i++) ammo = consumeRound(ammo);
    expect(ammo).toBe(0);
    expect(consumeRound(0)).toBe(0);
  });

  it("cannot shoot while empty or reloading", () => {
    expect(canShoot(7, 0)).toBe(true);
    expect(canShoot(0, 0)).toBe(false);
    expect(canShoot(7, 400)).toBe(false);
    expect(canShoot(0, 1500)).toBe(false);
  });

  it("empty magazine starts a full reload that restores 7", () => {
    let ammo = 0;
    let reloadLeft = maybeStartReload(ammo, 0, mag, reloadMs, "MAGAZINE", false);
    expect(reloadLeft).toBe(1500);
    const mid = tickReload(ammo, reloadLeft, 700, mag, reloadMs, "MAGAZINE", false);
    expect(mid.ammo).toBe(0);
    expect(mid.reloadLeft).toBe(800);
    expect(canShoot(mid.ammo, mid.reloadLeft)).toBe(false);
    const done = tickReload(mid.ammo, mid.reloadLeft, 800, mag, reloadMs, "MAGAZINE", true);
    expect(done.ammo).toBe(7);
    expect(done.reloadLeft).toBe(0);
    expect(canShoot(done.ammo, done.reloadLeft)).toBe(true);
  });
});

describe("sawed-off per-round reload", () => {
  const mag = magSizeOf("toz");
  const reloadMs = reloadMsOf("toz");

  it("starts with 2 shells and cannot fire on empty", () => {
    let ammo = initAmmo("toz");
    expect(ammo).toBe(2);
    ammo = consumeRound(ammo);
    expect(ammo).toBe(1);
    ammo = consumeRound(ammo);
    expect(ammo).toBe(0);
    expect(canShoot(ammo, 0)).toBe(false);
  });

  it("loads one shell at a time and can fire after the first shell", () => {
    let ammo = 0;
    let reloadLeft = maybeStartReload(ammo, 0, mag, reloadMs, "PER_ROUND", false);
    expect(reloadLeft).toBe(950);
    const first = tickReload(ammo, reloadLeft, 950, mag, reloadMs, "PER_ROUND", true);
    expect(first.ammo).toBe(1);
    expect(first.reloadLeft).toBe(0);
    expect(canShoot(first.ammo, first.reloadLeft)).toBe(true);
  });

  it("interrupts further loading when a target is available after a shell seats", () => {
    const afterFirst = tickReload(0, 950, 950, mag, reloadMs, "PER_ROUND", true);
    expect(afterFirst).toEqual({ ammo: 1, reloadLeft: 0 });
    const idleTopUp = maybeStartReload(1, 0, mag, reloadMs, "PER_ROUND", true);
    expect(idleTopUp).toBe(0);
  });

  it("continues loading the second shell when idle", () => {
    const afterFirst = tickReload(0, 950, 950, mag, reloadMs, "PER_ROUND", false);
    expect(afterFirst.ammo).toBe(1);
    expect(afterFirst.reloadLeft).toBe(950);
    const full = tickReload(afterFirst.ammo, afterFirst.reloadLeft, 950, mag, reloadMs, "PER_ROUND", false);
    expect(full).toEqual({ ammo: 2, reloadLeft: 0 });
  });

  it("can resume loading after firing a single seated shell", () => {
    let ammo = consumeRound(1);
    expect(ammo).toBe(0);
    let reloadLeft = maybeStartReload(ammo, 0, mag, reloadMs, "PER_ROUND", false);
    const seated = tickReload(ammo, reloadLeft, 950, mag, reloadMs, "PER_ROUND", false);
    expect(seated.ammo).toBe(1);
    ammo = consumeRound(seated.ammo);
    reloadLeft = maybeStartReload(ammo, 0, mag, reloadMs, "PER_ROUND", false);
    const again = tickReload(ammo, reloadLeft, 950, mag, reloadMs, "PER_ROUND", false);
    expect(again.ammo).toBe(1);
  });
});

describe("combat status", () => {
  it("reports reload, hold, engaging, and idle", () => {
    expect(combatStatus(400, false, false)).toBe("RELOADING");
    expect(combatStatus(0, false, true)).toBe("HOLD");
    expect(combatStatus(0, true, false)).toBe("ENGAGING");
    expect(combatStatus(0, false, false)).toBe("IDLE");
    expect(combatStatus(0, true, false, true)).toBe("MOVING");
    expect(combatStatus(400, true, false, true)).toBe("MOVING");
  });
});

describe("weapon catalog", () => {
  it("gives every weapon a magazine and reload recipe", () => {
    for (const w of Object.values(WEAPONS)) {
      expect(w.magSize).toBeGreaterThan(0);
      expect(w.reloadMs).toBeGreaterThan(0);
      expect(w.reloadType === "MAGAZINE" || w.reloadType === "PER_ROUND").toBe(true);
    }
  });
});

describe("weapon runtime isolation", () => {
  it("does not share ammo between operators", () => {
    const a = { ammo: initAmmo("pm"), reloadLeft: 0 };
    const b = { ammo: initAmmo("toz"), reloadLeft: 0 };
    a.ammo = consumeRound(a.ammo);
    expect(a.ammo).toBe(6);
    expect(b.ammo).toBe(2);
  });
});
