import type { EditorMapDoc, VisualLayerId, VisualTileLayers } from "./schema";

export const VISUAL_LAYER_IDS = ["GROUND", "DETAIL", "OBJECTS", "FOREGROUND"] as const;

export function emptyVisualTileLayers(): VisualTileLayers {
  return { GROUND: [], DETAIL: [], OBJECTS: [], FOREGROUND: [] };
}

export function normalizeVisualTileLayers(
  value: Partial<VisualTileLayers> | null | undefined,
  width: number,
  height: number,
  tileCount = Number.POSITIVE_INFINITY,
): VisualTileLayers {
  const out = emptyVisualTileLayers();
  for (const layerId of VISUAL_LAYER_IDS) {
    const placements = Array.isArray(value?.[layerId]) ? value[layerId]! : [];
    const byCell = new Map<string, { tx: number; ty: number; tile: number }>();
    for (const placement of placements) {
      const tx = Number(placement?.tx);
      const ty = Number(placement?.ty);
      const tile = Number(placement?.tile);
      if (!Number.isInteger(tx) || !Number.isInteger(ty) || !Number.isInteger(tile)) continue;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height || tile < 0 || tile >= tileCount)
        continue;
      byCell.set(`${tx},${ty}`, { tx, ty, tile });
    }
    out[layerId] = [...byCell.values()].sort((a, b) => a.ty - b.ty || a.tx - b.tx);
  }
  return out;
}

export function visualTileAt(
  doc: EditorMapDoc,
  layerId: VisualLayerId,
  tx: number,
  ty: number,
): number | null {
  return (
    doc.visualLayers[layerId].find((placement) => placement.tx === tx && placement.ty === ty)
      ?.tile ?? null
  );
}

export function paintVisualTile(
  doc: EditorMapDoc,
  layerId: VisualLayerId,
  tx: number,
  ty: number,
  tile: number,
): EditorMapDoc {
  if (doc.status === "locked" || tx < 0 || ty < 0 || tx >= doc.width || ty >= doc.height)
    return doc;
  if (!Number.isInteger(tile) || tile < 0 || tile >= tilesetTileCount(doc)) return doc;
  const current = doc.visualLayers[layerId];
  const previous = current.find((placement) => placement.tx === tx && placement.ty === ty);
  if (previous?.tile === tile) return doc;
  const next = current.filter((placement) => placement.tx !== tx || placement.ty !== ty);
  next.push({ tx, ty, tile });
  next.sort((a, b) => a.ty - b.ty || a.tx - b.tx);
  return { ...doc, visualLayers: { ...doc.visualLayers, [layerId]: next } };
}

export function eraseVisualTile(
  doc: EditorMapDoc,
  layerId: VisualLayerId,
  tx: number,
  ty: number,
): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const current = doc.visualLayers[layerId];
  const next = current.filter((placement) => placement.tx !== tx || placement.ty !== ty);
  return next.length === current.length
    ? doc
    : { ...doc, visualLayers: { ...doc.visualLayers, [layerId]: next } };
}

export function clearVisualLayer(doc: EditorMapDoc, layerId: VisualLayerId): EditorMapDoc {
  if (doc.status === "locked" || doc.visualLayers[layerId].length === 0) return doc;
  return { ...doc, visualLayers: { ...doc.visualLayers, [layerId]: [] } };
}

export function tilesetTileCount(doc: Pick<EditorMapDoc, "tileset">): number {
  return doc.tileset ? doc.tileset.columns * doc.tileset.rows : 0;
}
