import type { CampMapDef, CampStationProp } from "../hub/campMap";
import { CAMP_MAP_DEF } from "../hub/campMaps/campMain";
import { createBlankCampMap } from "./campDocument";
import { toCampExport } from "./campExport";
import type { EditorMapDoc } from "./schema";

/** Deterministic CampMapDef subset that the runtime hub reads. */
export function toCampMapDef(doc: EditorMapDoc): CampMapDef {
  const exported = toCampExport(doc);
  return {
    id: exported.id,
    displayName: exported.displayName,
    width: exported.width,
    height: exported.height,
    palette: exported.palette,
    terrain: exported.terrain,
    props: exported.props.map(
      (p, i): CampStationProp => ({
        id: `prop-${i + 1}`,
        type: p.type,
        tx: p.tx,
        ty: p.ty,
        ...(p.hubAction ? { hubAction: p.hubAction } : {}),
      }),
    ),
  };
}

export function fromCampMapDef(def: CampMapDef): EditorMapDoc {
  return {
    ...createBlankCampMap({
      displayName: def.displayName,
      id: `draft-${def.id}`,
      width: def.width,
      height: def.height,
    }),
    sourceMapId: def.id,
    palette: { ...def.palette },
    terrain: def.terrain.map((row) => row.slice()),
    props: def.props.map((p, i) => ({
      id: `prop-${i + 1}`,
      type: p.type,
      tx: p.tx,
      ty: p.ty,
      ...(p.hubAction ? { hubAction: p.hubAction } : {}),
    })),
  };
}

/** Shipped camp layouts. */
export function productionCampMaps(): CampMapDef[] {
  return [CAMP_MAP_DEF];
}

export interface CampIntegrationNote {
  code: string;
  message: string;
}

/** What a later hand-copy into a shipped CampMapDef cannot represent yet. */
export function campIntegrationNotes(doc: EditorMapDoc): CampIntegrationNote[] {
  const notes: CampIntegrationNote[] = [];
  if (doc.collisionWalls.length) {
    notes.push({
      code: "WALLS",
      message: "Authored collision walls exist; the camp runtime derives collision from prop-tile occupancy, not edge walls.",
    });
  }
  if (doc.visualLayers.GROUND.length || doc.visualLayers.DETAIL.length || doc.visualLayers.OBJECTS.length || doc.visualLayers.FOREGROUND.length) {
    notes.push({
      code: "VISUAL_TILES",
      message: "Authored visual-tile decoration exists; the shipped CampMapDef does not carry visual tile layers yet.",
    });
  }
  return notes;
}
