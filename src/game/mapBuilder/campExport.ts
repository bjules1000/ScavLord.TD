import type { HubAction } from "../campActions";
import { validateNewMapInput } from "./document";
import { emptyVisualTileLayers } from "./visualTiles";
import {
  MAP_BUILDER_SCHEMA_VERSION,
  isTerrainKind,
  type CampPropType,
  type EditorMapDoc,
  type TerrainKind,
} from "./schema";
import type { PropType } from "../map";

export interface ExportedCampProp {
  type: PropType | CampPropType;
  tx: number;
  ty: number;
  hubAction?: HubAction;
}

/** Leaner sibling of ExportedMap: a camp layout has no lanes/gates/sentries/waves/threat. */
export interface ExportedCampMap {
  schemaVersion: 1;
  mapType: "camp";
  id: string;
  displayName: string;
  width: number;
  height: number;
  status: "locked" | "draft";
  revision: number;
  palette: EditorMapDoc["palette"];
  terrain: TerrainKind[][];
  props: ExportedCampProp[];
}

/** Stable payload: same locked map → identical JSON. No timestamps or editor history. */
export function toCampExport(doc: EditorMapDoc): ExportedCampMap {
  return {
    schemaVersion: MAP_BUILDER_SCHEMA_VERSION,
    mapType: "camp",
    id: campExportMapId(doc),
    displayName: doc.displayName,
    width: doc.width,
    height: doc.height,
    status: doc.status,
    revision: doc.revision,
    palette: { ...doc.palette },
    terrain: doc.terrain.map((row) => row.slice()),
    props: [...doc.props]
      .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.type.localeCompare(b.type))
      .map((p) =>
        p.hubAction
          ? { type: p.type, tx: p.tx, ty: p.ty, hubAction: p.hubAction }
          : { type: p.type, tx: p.tx, ty: p.ty },
      ),
  };
}

export function stringifyCampExport(doc: EditorMapDoc): string {
  return `${JSON.stringify(toCampExport(doc), null, 2)}\n`;
}

export function campExportMapId(doc: EditorMapDoc): string {
  if (doc.sourceMapId) return doc.sourceMapId;
  return doc.id.replace(/^(draft|import)-/, "");
}

export function campExportFilename(doc: EditorMapDoc): string {
  const id = campExportMapId(doc).replace(/[^a-z0-9-]/gi, "-");
  return `${id}.camp.json`;
}

export function parseCampImport(
  raw: string,
): { ok: true; payload: ExportedCampMap } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Import is not valid JSON." };
  }
  if (!data || typeof data !== "object") return { ok: false, error: "Import must be a JSON object." };
  const o = data as Record<string, unknown>;
  if (o["schemaVersion"] !== 1) return { ok: false, error: "Unsupported or missing schemaVersion." };
  if (o["mapType"] !== "camp") return { ok: false, error: "Import is not a camp map." };
  if (typeof o["id"] !== "string" || typeof o["displayName"] !== "string") {
    return { ok: false, error: "Import is missing id or displayName." };
  }
  if (typeof o["width"] !== "number" || typeof o["height"] !== "number") {
    return { ok: false, error: "Import is missing width/height." };
  }
  const sizeErr = validateNewMapInput({
    displayName: o["displayName"],
    id: String(o["id"]).replace(/^draft-/, "") || "import",
    width: o["width"],
    height: o["height"],
  });
  if (sizeErr) return { ok: false, error: sizeErr };
  const terrain = o["terrain"];
  if (!Array.isArray(terrain) || terrain.length !== o["height"]) {
    return { ok: false, error: "Terrain grid does not match height." };
  }
  for (const row of terrain) {
    if (!Array.isArray(row) || row.length !== o["width"]) {
      return { ok: false, error: "Terrain row width mismatch." };
    }
    for (const cell of row) {
      if (!isTerrainKind(cell)) return { ok: false, error: "Terrain contains an unknown type." };
    }
  }
  if (!Array.isArray(o["props"])) return { ok: false, error: "Import is missing props." };
  return { ok: true, payload: o as unknown as ExportedCampMap };
}

export function importedToCampDoc(payload: ExportedCampMap, draftId: string): EditorMapDoc {
  return {
    schemaVersion: MAP_BUILDER_SCHEMA_VERSION,
    mapType: "camp",
    id: draftId,
    displayName: payload.displayName,
    width: payload.width,
    height: payload.height,
    status: payload.status === "locked" ? "locked" : "draft",
    revision: Number(payload.revision) || 1,
    sourceMapId: null,
    palette: payload.palette,
    threat: 2,
    threatLabel: "MEDIUM THREAT",
    desc: "Camp layout draft.",
    hpMult: 1,
    lootMult: 1,
    waveMods: null,
    sector: "CAMP",
    geo: { x: 50, y: 50 },
    terrain: payload.terrain.map((row) => row.slice() as TerrainKind[]),
    lanes: [],
    props: payload.props.map((p, i) => ({
      id: `prop-${i + 1}`,
      type: p.type,
      tx: p.tx,
      ty: p.ty,
      ...(p.hubAction ? { hubAction: p.hubAction } : {}),
    })),
    cover: [],
    crates: [],
    extraction: [],
    sentries: [],
    checkpoints: [],
    edges: [],
    gates: [],
    zones: [],
    collisionWalls: [],
    bridges: [],
    tileset: null,
    visualLayers: emptyVisualTileLayers(),
  };
}
