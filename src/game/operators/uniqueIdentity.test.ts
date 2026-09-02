/**
 * Identity decoupling — stable unique IDs vs player-facing callsigns / names.
 */

import { describe, expect, it } from "bun:test";
import { freshMeta } from "../meta";
import { summarizeUniqueState, summarizeQuestReward } from "../progressionNotifications";
import { resolveEquipmentOwnerId, listCrewEquipmentRows, LEADER_EQUIPMENT_OWNER_ID } from "./crewEquipment";
import { hireUniqueContact } from "./crew";
import { progressionFactsFromMeta } from "./recruitmentLabCore";
import { freshRadioProgression } from "./radioProgression";
import {
  CANONICAL_UNIQUE_OPERATORS,
  UNIQUE_OPERATOR_BY_ID,
  getUniqueOperatorDisplayName,
  uniqueToOperator,
  uniqueContactRequirementsMet,
  syncUniqueEligibility,
  type UniqueOperatorDefinition,
} from "./uniqueOperators";
import { HUB_HOTSPOTS } from "../hub/hotspots";

function viperOverlay(base: UniqueOperatorDefinition): UniqueOperatorDefinition {
  return {
    ...base,
    name: "VIPER",
    callsign: "VIPER",
  };
}

describe("unique operator display identity", () => {
  it("prefers callsign over name over id", () => {
    expect(
      getUniqueOperatorDisplayName("wolf", {
        ...UNIQUE_OPERATOR_BY_ID["wolf"]!,
        callsign: "VIPER",
        name: "IGNORED",
      }),
    ).toBe("VIPER");
    const { callsign: _omit, ...withoutCallsign } = UNIQUE_OPERATOR_BY_ID["wolf"]!;
    expect(getUniqueOperatorDisplayName("wolf", { ...withoutCallsign, name: "NIGHTMARE" })).toBe("NIGHTMARE");
  });

  it("progression notices use definition display name, not raw id uppercasing", () => {
    const viper = viperOverlay(UNIQUE_OPERATOR_BY_ID["wolf"]!);
    expect(summarizeUniqueState("wolf", "CONTACTABLE", viper)).toBe("VIPER is ready to talk");
    expect(summarizeUniqueState("wolf", "RECRUITABLE", viper)).toBe("VIPER ready to join");
    expect(summarizeUniqueState("wolf", "CONTACTABLE", viper)).not.toMatch(/WOLF/i);
    expect(summarizeQuestReward({ type: "UNLOCK_UNIQUE_CONTACT", uniqueId: "wolf" })).toContain(
      getUniqueOperatorDisplayName("wolf"),
    );
  });

  it("rename simulation: lifecycle/hire/equipment still key off stable id wolf", () => {
    const canonical = UNIQUE_OPERATOR_BY_ID["wolf"]!;
    const viper = viperOverlay(canonical);
    expect(viper.id).toBe("wolf");
    expect(getUniqueOperatorDisplayName("wolf", viper)).toBe("VIPER");

    const meta = freshMeta();
    meta.bank = 50_000;
    meta.crew.radio = {
      ...freshRadioProgression(),
      radioState: "SIGNAL_RESTORED",
      uniqueContacts: { wolf: { lifecycle: "RECRUITABLE", distressHeard: true } },
    };
    meta.claimed = ["wolf_help"];
    meta.quests.wavesCompletedByMap = { woods: 5 };

    expect(uniqueContactRequirementsMet(viper, progressionFactsFromMeta(meta))).toBe(true);

    const hired = hireUniqueContact(meta, "wolf", "op_viper_sim");
    expect(hired.ok).toBe(true);
    if (!hired.ok) return;
    expect(hired.operator.uniqueId).toBe("wolf");
    expect(resolveEquipmentOwnerId(meta, { uniqueId: "wolf" })).toBe("op_viper_sim");

    const fromViper = uniqueToOperator(viper, "op_from_viper");
    expect(fromViper.uniqueId).toBe("wolf");
    expect(fromViper.name).toBe("VIPER");
  });

  it("sync eligibility uses stable unique id keys", () => {
    const meta = freshMeta();
    meta.claimed = ["wolf_help"];
    meta.quests.wavesCompletedByMap = { woods: 5 };
    meta.crew.radio = {
      ...freshRadioProgression(),
      radioState: "SIGNAL_RESTORED",
      uniqueContacts: { wolf: { lifecycle: "CONTACTABLE", distressHeard: true } },
    };
    const next = syncUniqueEligibility(meta.crew.radio, "wolf", progressionFactsFromMeta(meta));
    expect(next.uniqueContacts["wolf"]?.lifecycle).toBe("RECRUITABLE");
  });

  it("canonical catalog still uses stable id wolf (no display-name identity key)", () => {
    const wolf = CANONICAL_UNIQUE_OPERATORS.find((u) => u.id === "wolf");
    expect(wolf).toBeTruthy();
    expect(UNIQUE_OPERATOR_BY_ID["wolf"]?.id).toBe("wolf");
    expect(CANONICAL_UNIQUE_OPERATORS.find((u) => u.callsign === "NOT_A_REAL_CALLSIGN")).toBeUndefined();
    expect(UNIQUE_OPERATOR_BY_ID["wolf"]).toBeTruthy();
  });
});

describe("leader / branding identity", () => {
  it("crew equipment leader row uses pmc name, not literal ASH-01 key", () => {
    const meta = freshMeta();
    meta.pmc.name = "RENAMED-LEADER";
    const row = listCrewEquipmentRows(meta).find((r) => r.ownerId === LEADER_EQUIPMENT_OWNER_ID);
    expect(row?.name).toBe("RENAMED-LEADER");
    expect(row?.roleLabel).toBe("LEADER");
  });

  it("camp hotspot no longer labels the character station SCAVLORD", () => {
    const skills = HUB_HOTSPOTS.find((h) => h.id === "skills");
    expect(skills?.label).toBe("OPERATOR");
    expect(skills?.label).not.toBe("SCAVLORD");
  });

  it("project branding scavlord namespaces remain for DEV storage / assets", () => {
    expect("scavlord-td".includes("scavlord")).toBe(true);
  });
});
