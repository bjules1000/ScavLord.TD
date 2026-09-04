import { describe, expect, it } from "bun:test";
import { makeItem } from "./gear";
import { freshMeta, stashItems } from "./meta";
import { candidateToOperator } from "./operators/crew";
import {
  LEADER_EQUIPMENT_OWNER_ID,
  equipOnEquipmentOwner,
  getOwnerEquipment,
  setOwnerScavMods,
  unequipFromEquipmentOwner,
} from "./operators/crewEquipment";
import { stashEntriesFromItems } from "./operators/equipment";
import { generateRecruitmentCandidates } from "./operators/generation";
import { syncOperatorEquipmentFromTower } from "./operators/runtime";
import { applyScavAction } from "./scavWeaponMods";
import { canInstallAttachmentOnWeapon, installAttachmentInMounts } from "./weaponAttachments";
import { defaultVisualState, resolveVisualState } from "./weaponVisuals";

describe("scav mods persistence", () => {
  it("weapon modification state survives stash roundtrip", () => {
    const meta = freshMeta();
    const gun = makeItem("w_ak74", 9001);
    expect(gun).toBeTruthy();
    if (!gun) return;
    const cut = applyScavAction("ak74", defaultVisualState("ak74"), "cut_stock");
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    gun.scavMods = cut.state;

    const entries = stashEntriesFromItems([gun]);
    expect(entries[0]?.scavMods?.parts.stock).toBe("ak_stock_cut");

    const restored = stashItems({ ...meta, stash: entries }, 1);
    expect(restored[0]?.scavMods?.parts.stock).toBe("ak_stock_cut");
  });

  it("setOwnerScavMods persists on leader", () => {
    const meta = freshMeta();
    const built = applyScavAction("ak74", defaultVisualState("ak74"), "tape_mags");
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const gun = makeItem("w_ak74", 42)!;
    const stash = [gun];
    const equipped = equipOnEquipmentOwner(meta, LEADER_EQUIPMENT_OWNER_ID, stash, 100, gun.uid, 40);
    expect(equipped.ok).toBe(true);
    if (!equipped.ok) return;
    meta.stash = stashEntriesFromItems(equipped.stash);

    const applied = setOwnerScavMods(meta, LEADER_EQUIPMENT_OWNER_ID, built.state);
    expect(applied.ok).toBe(true);
    const eq = getOwnerEquipment(meta, LEADER_EQUIPMENT_OWNER_ID);
    expect(eq?.scavMods?.parts.magazine).toBe("ak_mag_taped");
  });

  it("switching unequip/equip preserves scavMods on the gun item", () => {
    const meta = freshMeta();
    const gun = makeItem("w_ak74", 77)!;
    const beer = applyScavAction("ak74", defaultVisualState("ak74"), "add_beer_sight");
    expect(beer.ok).toBe(true);
    if (!beer.ok) return;
    gun.scavMods = beer.state;

    const eq = equipOnEquipmentOwner(meta, LEADER_EQUIPMENT_OWNER_ID, [gun], 100, gun.uid, 40);
    expect(eq.ok).toBe(true);
    if (!eq.ok) return;
    expect(getOwnerEquipment(meta, LEADER_EQUIPMENT_OWNER_ID)?.scavMods?.parts.optic).toBe(
      "ak_optic_beer_bottle",
    );

    const uneq = unequipFromEquipmentOwner(meta, LEADER_EQUIPMENT_OWNER_ID, eq.stash, 200, "weapon", 40);
    expect(uneq.ok).toBe(true);
    if (!uneq.ok) return;
    const back = uneq.stash.find((i) => i.ref === "ak74");
    expect(back?.scavMods?.parts.optic).toBe("ak_optic_beer_bottle");
  });

  it("syncOperatorEquipmentFromTower preserves scavMods", () => {
    const meta = freshMeta();
    const [c] = generateRecruitmentCandidates(1, 0);
    const op = candidateToOperator({ ...c!, cost: 1 }, "op_sync_scav");
    meta.crew.operators.push(op);

    const built = applyScavAction("ak74", defaultVisualState("ak74"), "saw_barrel");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    op.equipment = {
      weapon: "ak74",
      attachments: [],
      armor: null,
      scavMods: built.state,
    };

    const synced = syncOperatorEquipmentFromTower(op, {
      weapon: "ak74",
      attachments: ["grip"],
      armor: null,
      scavMods: built.state,
    });
    expect(synced.equipment.attachments).toEqual(["grip"]);
    expect(synced.equipment.scavMods?.parts.muzzle).toBe("ak_muzzle_sawed");
  });

  it("weapon swap via canonical equip preserves scavMods both ways", () => {
    const meta = freshMeta();
    const ak = makeItem("w_ak74", 10)!;
    const cut = applyScavAction("ak74", defaultVisualState("ak74"), "cut_stock");
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    ak.scavMods = cut.state;
    const sks = makeItem("w_sks", 11)!;
    const beer = applyScavAction("sks", defaultVisualState("sks"), "add_beer_sight");
    expect(beer.ok).toBe(true);
    if (!beer.ok) return;
    sks.scavMods = beer.state;

    let stash = [ak, sks];
    const equipAk = equipOnEquipmentOwner(meta, LEADER_EQUIPMENT_OWNER_ID, stash, 100, 10, 40);
    expect(equipAk.ok).toBe(true);
    if (!equipAk.ok) return;
    stash = equipAk.stash;
    expect(getOwnerEquipment(meta, LEADER_EQUIPMENT_OWNER_ID)?.scavMods?.parts.stock).toBe(
      "ak_stock_cut",
    );

    const equipSks = equipOnEquipmentOwner(meta, LEADER_EQUIPMENT_OWNER_ID, stash, 200, 11, 40);
    expect(equipSks.ok).toBe(true);
    if (!equipSks.ok) return;
    stash = equipSks.stash;
    expect(getOwnerEquipment(meta, LEADER_EQUIPMENT_OWNER_ID)?.weapon).toBe("sks");
    expect(getOwnerEquipment(meta, LEADER_EQUIPMENT_OWNER_ID)?.scavMods?.parts.optic).toBe(
      "sks_optic_beer_bottle",
    );

    const returnedAk = stash.find((i) => i.ref === "ak74");
    expect(returnedAk?.scavMods?.parts.stock).toBe("ak_stock_cut");

    const back = equipOnEquipmentOwner(
      meta,
      LEADER_EQUIPMENT_OWNER_ID,
      stash,
      300,
      returnedAk!.uid,
      40,
    );
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(getOwnerEquipment(meta, LEADER_EQUIPMENT_OWNER_ID)?.scavMods?.parts.stock).toBe(
      "ak_stock_cut",
    );
    expect(back.stash.find((i) => i.ref === "sks")?.scavMods?.parts.optic).toBe(
      "sks_optic_beer_bottle",
    );
  });

  it("failed swap is atomic when stash would overflow", () => {
    const meta = freshMeta();
    const ak = makeItem("w_ak74", 20)!;
    const first = equipOnEquipmentOwner(meta, LEADER_EQUIPMENT_OWNER_ID, [ak], 50, 20, 40);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const before = structuredClone(getOwnerEquipment(meta, LEADER_EQUIPMENT_OWNER_ID));
    const sks = makeItem("w_sks", 21)!;
    // Cap 1: equipping SKS would need to return AK → overflow
    const stash = [sks, ...Array.from({ length: 1 }, (_, i) => makeItem("m_ifak", 100 + i)!)];
    const result = equipOnEquipmentOwner(meta, LEADER_EQUIPMENT_OWNER_ID, stash, 60, 21, 1);
    expect(result.ok).toBe(false);
    expect(getOwnerEquipment(meta, LEADER_EQUIPMENT_OWNER_ID)).toEqual(before);
  });
});

describe("factory attachments still work alongside scav mods", () => {
  it("can install optic on AK with scav build present", () => {
    const state = applyScavAction("ak74", defaultVisualState("ak74"), "cut_stock");
    expect(state.ok).toBe(true);
    const check = canInstallAttachmentOnWeapon("ak74", "red_dot");
    expect(check.ok).toBe(true);
    const install = installAttachmentInMounts("ak74", [], "red_dot");
    expect(install.ok).toBe(true);
    if (!install.ok || !state.ok) return;
    const resolved = resolveVisualState("ak74", state.state);
    expect(resolved?.parts.stock).toBe("ak_stock_cut");
    expect(install.attachments).toContain("red_dot");
  });
});
