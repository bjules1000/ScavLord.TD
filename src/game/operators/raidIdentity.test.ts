import { describe, expect, it } from "bun:test";
import { freshMeta } from "../meta";
import { candidateToOperator, hireUniqueContact } from "./crew";
import { generateRecruitmentCandidates } from "./generation";
import { freshRadioProgression } from "./radioProgression";
import {
  getRaidOperatorDisplayName,
  getRaidOperatorTitle,
  resolveRaidOperatorIdentity,
} from "./raidIdentity";
import { STARTING_OPERATOR } from "./startingOperator";
import { LEADER_EQUIPMENT_OWNER_ID, listCrewEquipmentRows } from "./crewEquipment";
import { UNIQUE_OPERATOR_BY_ID } from "./uniqueOperators";
import type { Tower } from "../types";

function metaWithWolf() {
  const meta = freshMeta();
  meta.bank = 50_000;
  meta.crew.radio = {
    ...freshRadioProgression(),
    radioState: "SIGNAL_RESTORED",
    uniqueContacts: { wolf: { lifecycle: "RECRUITABLE", distressHeard: true } },
  };
  meta.claimed = ["wolf_help"];
  meta.quests.wavesCompletedByMap = { woods: 5 };
  const hired = hireUniqueContact(meta, "wolf", "op_wolf_raid");
  if (!hired.ok) throw new Error(hired.reason);
  return { meta, wolfId: hired.operator.id, wolf: hired.operator };
}

function tower(partial: Partial<Tower> & Pick<Tower, "id">): Tower {
  return {
    tx: 0,
    ty: 0,
    weapon: "pm",
    attachments: [],
    cd: 0,
    angle: 0,
    flash: 0,
    kills: 0,
    hp: 100,
    maxHp: 100,
    hurt: 0,
    ammo: 0,
    reloadLeft: 0,
    targetMode: "CLOSEST",
    manualTargetId: null,
    engageTargetId: null,
    ...partial,
  };
}

describe("raid operator identity", () => {
  it("leader deploy resolves persisted pmc name via leader id, not ASH-01 literal key", () => {
    const meta = freshMeta();
    meta.pmc.name = "RENAMED-LEADER";
    const t = tower({ id: 1, pmc: true });
    const id = resolveRaidOperatorIdentity(t, meta);
    expect(id.persistentOperatorId).toBe(STARTING_OPERATOR.id);
    expect(id.persistentOperatorId).toBe(LEADER_EQUIPMENT_OWNER_ID);
    expect(getRaidOperatorDisplayName(t, meta)).toBe("RENAMED-LEADER");
    expect(getRaidOperatorTitle(t, meta)).toBe("RENAMED-LEADER · LEADER");
    expect(getRaidOperatorDisplayName(t, meta)).not.toBe("OPERATOR");
  });

  it("unique recruit deploy keeps operatorId and resolves persistent name", () => {
    const { meta, wolfId, wolf } = metaWithWolf();
    const t = tower({ id: 2, operatorId: wolfId });
    const id = resolveRaidOperatorIdentity(t, meta);
    expect(id.persistentOperatorId).toBe(wolfId);
    expect(id.persistentOperatorId).not.toBe("wolf");
    expect(wolf.uniqueId).toBe("wolf");
    expect(getRaidOperatorDisplayName(t, meta)).toBe(wolf.name);
    expect(getRaidOperatorTitle(t, meta)).toContain(wolf.name);
    expect(getRaidOperatorDisplayName(t, meta)).not.toBe("OPERATOR");
  });

  it("procedural recruit deploy resolves their own name", () => {
    const meta = freshMeta();
    const [cand] = generateRecruitmentCandidates(7, 0);
    const op = candidateToOperator({ ...cand!, cost: 1 }, "op_artyom");
    op.name = "ARTYOM";
    op.roleLabel = "RIFLEMAN";
    meta.crew.operators.push(op);
    const t = tower({ id: 3, operatorId: "op_artyom" });
    expect(getRaidOperatorDisplayName(t, meta)).toBe("ARTYOM");
    expect(getRaidOperatorTitle(t, meta)).toBe("ARTYOM · RIFLEMAN");
  });

  it("two deployed operators resolve independently", () => {
    const { meta, wolfId } = metaWithWolf();
    const leader = tower({ id: 1, pmc: true });
    const wolf = tower({ id: 2, operatorId: wolfId });
    expect(getRaidOperatorDisplayName(leader, meta)).toBe(meta.pmc.name);
    expect(getRaidOperatorDisplayName(wolf, meta)).toBe(
      meta.crew.operators.find((o) => o.id === wolfId)!.name,
    );
    expect(getRaidOperatorDisplayName(leader, meta)).not.toBe(getRaidOperatorDisplayName(wolf, meta));
  });

  it("renaming persistent operator updates raid display without changing operatorId", () => {
    const { meta, wolfId } = metaWithWolf();
    const op = meta.crew.operators.find((o) => o.id === wolfId)!;
    op.name = "VIPER";
    const t = tower({ id: 9, operatorId: wolfId });
    expect(resolveRaidOperatorIdentity(t, meta).persistentOperatorId).toBe(wolfId);
    expect(getRaidOperatorDisplayName(t, meta)).toBe("VIPER");
    expect(op.uniqueId).toBe("wolf");
  });

  it("missing operator falls back to OPERATOR", () => {
    const meta = freshMeta();
    const t = tower({ id: 4, operatorId: "missing" });
    expect(getRaidOperatorDisplayName(t, meta)).toBe("OPERATOR");
    expect(resolveRaidOperatorIdentity(t, meta).isFallback).toBe(true);
  });
});

describe("starting operator identity", () => {
  it("fresh pmc uses canonical authored default", () => {
    const meta = freshMeta();
    expect(meta.pmc.name).toBe(STARTING_OPERATOR.defaultName);
  });

  it("persisted pmc name is respected and gameplay does not key on ASH-01", () => {
    const meta = freshMeta();
    meta.pmc.name = "CUSTOM";
    expect(getRaidOperatorDisplayName(tower({ id: 1, pmc: true }), meta)).toBe("CUSTOM");
    expect(listCrewEquipmentRows(meta)[0]?.name).toBe("CUSTOM");
  });

  it("canonical default is the single rename source for new games", () => {
    expect(STARTING_OPERATOR.defaultName).toBe("ASH-01");
    expect(STARTING_OPERATOR.id).toBe("leader");
  });

  it("unique content id remains separate from raid instance id", () => {
    const { wolf } = metaWithWolf();
    expect(UNIQUE_OPERATOR_BY_ID["wolf"]?.id).toBe("wolf");
    expect(wolf.id).not.toBe("wolf");
    expect(wolf.uniqueId).toBe("wolf");
  });
});
