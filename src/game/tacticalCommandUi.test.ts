import { describe, expect, it } from "bun:test";
import {
  beginPauseReloadSession,
  canCancelPausedReload,
  createPauseReloadSession,
  holdPlanEmphasis,
  movementPlanEmphasis,
  noteReloadAuthoredInPause,
  operatorPlanBadge,
  reloadPlanLabelVisible,
} from "./tacticalCommandUi";
import type { Tower } from "./types";

function tower(partial: Partial<Tower> & Pick<Tower, "id">): Tower {
  return {
    tx: 2,
    ty: 8,
    weapon: "w_mp133",
    attachments: [],
    cd: 0,
    angle: 0,
    flash: 0,
    kills: 0,
    hp: 100,
    maxHp: 100,
    hurt: 0,
    ammo: 5,
    reloadLeft: 0,
    targetMode: "FIRST",
    manualTargetId: null,
    engageTargetId: null,
    ...partial,
  };
}

describe("tacticalCommandUi planning emphasis", () => {
  it("shows squad plans while paused for unselected operators", () => {
    expect(
      movementPlanEmphasis({ paused: true, selected: false, hasMoveIntent: true }),
    ).toBe("squad");
    expect(
      movementPlanEmphasis({ paused: true, selected: true, hasMoveIntent: true }),
    ).toBe("selected");
  });

  it("hides unselected plans after resume; selected may stay subtle", () => {
    expect(
      movementPlanEmphasis({ paused: false, selected: false, hasMoveIntent: true }),
    ).toBe("hidden");
    expect(
      movementPlanEmphasis({ paused: false, selected: true, hasMoveIntent: true }),
    ).toBe("subtle");
  });

  it("hold rays: squad while paused, hide unselected when live", () => {
    expect(holdPlanEmphasis({ paused: true, selected: false, holding: true })).toBe("squad");
    expect(holdPlanEmphasis({ paused: false, selected: false, holding: true })).toBe("hidden");
  });

  it("reload labels only during pause", () => {
    expect(reloadPlanLabelVisible(true, 500)).toBe(true);
    expect(reloadPlanLabelVisible(false, 500)).toBe(false);
  });

  it("plan badges distinguish planned vs moving", () => {
    const moving = tower({
      id: 1,
      move: {
        x: 40,
        y: 40,
        path: [{ tx: 3, ty: 8, surface: "GROUND" }],
        dest: { tx: 4, ty: 8, surface: "GROUND" },
        pendingDest: null,
      },
    });
    expect(operatorPlanBadge(moving, true)).toBe("MOVE");
    expect(operatorPlanBadge(moving, false)).toBe("MOVING");
    expect(
      operatorPlanBadge(
        tower({ id: 2, reloadLeft: 800, targetMode: "HOLD_ANGLE", holdAngle: 1 }),
        true,
      ),
    ).toBe("RLD");
  });
});

describe("tacticalCommandUi pause reload cancel", () => {
  it("allows cancel only for reload authored in current pause session", () => {
    let session = createPauseReloadSession();
    session = beginPauseReloadSession(session);
    noteReloadAuthoredInPause(session, 7, false);
    expect(canCancelPausedReload(session, 7, 900, true)).toBe(true);
    expect(canCancelPausedReload(session, 7, 900, false)).toBe(false);
    expect(canCancelPausedReload(session, 8, 900, true)).toBe(false);
    noteReloadAuthoredInPause(session, 9, true);
    expect(canCancelPausedReload(session, 9, 900, true)).toBe(false);
  });

  it("new pause session clears authored reload set", () => {
    let session = createPauseReloadSession();
    session = beginPauseReloadSession(session);
    noteReloadAuthoredInPause(session, 1, false);
    session = beginPauseReloadSession(session);
    expect(canCancelPausedReload(session, 1, 900, true)).toBe(false);
  });
});
