/**
 * Suspended-bridge overlay + two-level surface contract.
 *
 * A bridge tile is an ELEVATED walkable overlay above the base cell. The
 * underlying terrain (ROAD / GROUND / WATER / …) is stored independently and
 * remains the LOW surface. Enemies on an authored ROAD path pass UNDER the
 * bridge; the overlay is not part of the lane and does not change path
 * progress. A LOW occupant never auto-elevates onto the bridge.
 *
 * Future movement (not implemented here):
 *   HIGH_GROUND or connected SUSPENDED_BRIDGE → may enter an adjacent bridge
 *   GROUND / ROAD (LOW) → stays LOW and uses the base tile under the bridge
 *
 * Bridge does not block LOS above or below in this milestone. Invisible walls
 * are a separate edge primitive.
 *
 * Raid drawing uses the HIGH overlay pass after LOW entities. Movement/LOS
 * still do not consume the overlay.
 */
import { inBounds, terrainAt } from "./document";
import type { BridgeOrientation, BridgeTile, EditorMapDoc, SurfaceLevel, TerrainKind } from "./schema";

export function bridgeKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

export function bridgeId(tx: number, ty: number): string {
  return `bridge:${bridgeKey(tx, ty)}`;
}

export function parseBridgeId(id: string): { tx: number; ty: number } | null {
  if (!id.startsWith("bridge:")) return null;
  const parts = id.slice(7).split(",");
  const tx = Number(parts[0]);
  const ty = Number(parts[1]);
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return null;
  return { tx, ty };
}

export function hasBridge(doc: Pick<EditorMapDoc, "bridges">, tx: number, ty: number): boolean {
  return doc.bridges.some((b) => b.tx === tx && b.ty === ty);
}

export function bridgeAt(doc: Pick<EditorMapDoc, "bridges">, tx: number, ty: number): BridgeTile | null {
  return doc.bridges.find((b) => b.tx === tx && b.ty === ty) ?? null;
}

export function sortBridges(bridges: BridgeTile[]): BridgeTile[] {
  return [...bridges].sort((a, b) => a.ty - b.ty || a.tx - b.tx);
}

const ORTH: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function bridgeSet(bridges: BridgeTile[]): Set<string> {
  return new Set(bridges.map((b) => bridgeKey(b.tx, b.ty)));
}

export function inferBridgeOrientation(
  bridges: BridgeTile[],
  tx: number,
  ty: number,
  fallback: BridgeOrientation = "H",
): BridgeOrientation {
  const keys = bridgeSet(bridges);
  const hasH = keys.has(bridgeKey(tx - 1, ty)) || keys.has(bridgeKey(tx + 1, ty));
  const hasV = keys.has(bridgeKey(tx, ty - 1)) || keys.has(bridgeKey(tx, ty + 1));
  if (hasH && !hasV) return "H";
  if (hasV && !hasH) return "V";
  const existing = bridges.find((b) => b.tx === tx && b.ty === ty);
  if (existing) return existing.orientation;
  return fallback;
}

function refreshOrientations(bridges: BridgeTile[], focus: Array<[number, number]>): BridgeTile[] {
  const keys = new Set(focus.map(([x, y]) => bridgeKey(x, y)));
  for (const [x, y] of focus) {
    for (const [dx, dy] of ORTH) keys.add(bridgeKey(x + dx, y + dy));
  }
  return sortBridges(
    bridges.map((b) => {
      if (!keys.has(bridgeKey(b.tx, b.ty))) return b;
      return { ...b, orientation: inferBridgeOrientation(bridges, b.tx, b.ty, b.orientation) };
    }),
  );
}

export function paintBridgeTiles(doc: EditorMapDoc, tiles: Array<[number, number]>): EditorMapDoc {
  if (doc.status === "locked") return doc;
  const have = bridgeSet(doc.bridges);
  const added: BridgeTile[] = [];
  const focus: Array<[number, number]> = [];
  for (const [x, y] of tiles) {
    if (!inBounds(doc, x, y)) continue;
    focus.push([x, y]);
    if (have.has(bridgeKey(x, y))) continue;
    have.add(bridgeKey(x, y));
    added.push({ tx: x, ty: y, orientation: "H" });
  }
  if (!added.length && !focus.length) return doc;
  if (!added.length) {
    const refreshed = refreshOrientations(doc.bridges, focus);
    const same = refreshed.every((b, i) => {
      const prev = doc.bridges[i]!;
      return prev.tx === b.tx && prev.ty === b.ty && prev.orientation === b.orientation;
    });
    return same ? doc : { ...doc, bridges: refreshed };
  }
  const merged = [...doc.bridges, ...added];
  return { ...doc, bridges: refreshOrientations(merged, focus) };
}

export function eraseBridgeAt(doc: EditorMapDoc, tx: number, ty: number): EditorMapDoc {
  if (doc.status === "locked") return doc;
  if (!hasBridge(doc, tx, ty)) return doc;
  const remaining = doc.bridges.filter((b) => !(b.tx === tx && b.ty === ty));
  const neighbors: Array<[number, number]> = ORTH.map(([dx, dy]) => [tx + dx, ty + dy]);
  return { ...doc, bridges: refreshOrientations(remaining, neighbors) };
}

export function eraseBridgeById(doc: EditorMapDoc, id: string): EditorMapDoc {
  const pos = parseBridgeId(id);
  if (!pos) return doc;
  return eraseBridgeAt(doc, pos.tx, pos.ty);
}

export function setBridgeOrientation(doc: EditorMapDoc, tx: number, ty: number, orientation: BridgeOrientation): EditorMapDoc {
  if (doc.status === "locked") return doc;
  if (!hasBridge(doc, tx, ty)) return doc;
  const current = bridgeAt(doc, tx, ty);
  if (current?.orientation === orientation) return doc;
  return {
    ...doc,
    bridges: sortBridges(doc.bridges.map((b) => (b.tx === tx && b.ty === ty ? { ...b, orientation } : b))),
  };
}

export function toggleBridgeOrientation(doc: EditorMapDoc, tx: number, ty: number): EditorMapDoc {
  const current = bridgeAt(doc, tx, ty);
  if (!current) return doc;
  return setBridgeOrientation(doc, tx, ty, current.orientation === "H" ? "V" : "H");
}

export function visibleBridges(doc: Pick<EditorMapDoc, "bridges">, layers: { bridges: boolean }): BridgeTile[] {
  if (!layers.bridges) return [];
  return doc.bridges;
}

export function raidRendersBridgeOverlay(): boolean {
  return false;
}

export function getBaseTerrain(doc: EditorMapDoc, tx: number, ty: number): TerrainKind | null {
  return terrainAt(doc, tx, ty);
}

export function hasElevatedSurface(doc: EditorMapDoc, tx: number, ty: number): boolean {
  if (hasBridge(doc, tx, ty)) return true;
  return terrainAt(doc, tx, ty) === "HIGH_GROUND";
}

export function surfaceLevelAt(doc: EditorMapDoc, tx: number, ty: number, occupant: "LOW" | "HIGH" = "LOW"): SurfaceLevel {
  if (occupant === "HIGH" && hasElevatedSurface(doc, tx, ty)) return "HIGH";
  return "GROUND";
}

export function bridgeSurfaceIsHigh(_tile: BridgeTile): boolean {
  return true;
}

/** LOW occupants use base terrain even when a bridge overlay exists on the same cell. */
export function lowOccupantUsesBaseUnderBridge(doc: Pick<EditorMapDoc, "bridges">, tx: number, ty: number): boolean {
  return hasBridge(doc, tx, ty);
}

/** Enemy lanes stay on authored ROAD/path. The overlay is not a path cell. */
export function lanePathIgnoresBridgeOverlay(): boolean {
  return true;
}

export function canEnterBridgeFrom(
  doc: EditorMapDoc,
  from: [number, number],
  to: [number, number],
): boolean {
  if (!hasBridge(doc, to[0], to[1])) return false;
  const dx = Math.abs(to[0] - from[0]);
  const dy = Math.abs(to[1] - from[1]);
  if (dx + dy !== 1) return false;
  if (hasBridge(doc, from[0], from[1])) return true;
  return terrainAt(doc, from[0], from[1]) === "HIGH_GROUND";
}

export function lowGroundCanEnterBridge(doc: EditorMapDoc, from: [number, number], to: [number, number]): boolean {
  if (hasElevatedSurface(doc, from[0], from[1]) && terrainAt(doc, from[0], from[1]) === "HIGH_GROUND") {
    return canEnterBridgeFrom(doc, from, to);
  }
  if (hasBridge(doc, from[0], from[1])) return canEnterBridgeFrom(doc, from, to);
  return false;
}

export function orthogonalBridgeNeighbors(doc: Pick<EditorMapDoc, "bridges">, tx: number, ty: number): BridgeTile[] {
  return doc.bridges.filter((b) => Math.abs(b.tx - tx) + Math.abs(b.ty - ty) === 1);
}

export function bridgeTilesConnectOrthogonally(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

export function isDiagonalPair(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) === 1 && Math.abs(a[1] - b[1]) === 1;
}

export function bridgeComponents(doc: Pick<EditorMapDoc, "bridges">): BridgeTile[][] {
  const remaining = new Set(doc.bridges.map((b) => bridgeKey(b.tx, b.ty)));
  const byKey = new Map(doc.bridges.map((b) => [bridgeKey(b.tx, b.ty), b] as const));
  const groups: BridgeTile[][] = [];
  for (const start of doc.bridges) {
    const sk = bridgeKey(start.tx, start.ty);
    if (!remaining.has(sk)) continue;
    const stack = [sk];
    remaining.delete(sk);
    const group: BridgeTile[] = [];
    while (stack.length) {
      const k = stack.pop()!;
      const tile = byKey.get(k)!;
      group.push(tile);
      for (const [dx, dy] of ORTH) {
        const nk = bridgeKey(tile.tx + dx, tile.ty + dy);
        if (!remaining.has(nk)) continue;
        remaining.delete(nk);
        stack.push(nk);
      }
    }
    groups.push(group);
  }
  return groups;
}

export function bridgeHasDiagonalOnlyConnection(doc: Pick<EditorMapDoc, "bridges">): boolean {
  const keys = bridgeSet(doc.bridges);
  for (const a of doc.bridges) {
    for (const b of doc.bridges) {
      if (a === b) continue;
      if (!isDiagonalPair([a.tx, a.ty], [b.tx, b.ty])) continue;
      const aOrth = ORTH.some(([dx, dy]) => keys.has(bridgeKey(a.tx + dx, a.ty + dy)));
      const bOrth = ORTH.some(([dx, dy]) => keys.has(bridgeKey(b.tx + dx, b.ty + dy)));
      if (!aOrth && !bOrth) return true;
    }
  }
  return false;
}

export function componentTouchesHighGround(doc: EditorMapDoc, component: BridgeTile[]): boolean {
  for (const tile of component) {
    for (const [dx, dy] of ORTH) {
      const x = tile.tx + dx;
      const y = tile.ty + dy;
      if (terrainAt(doc, x, y) === "HIGH_GROUND") return true;
    }
  }
  return false;
}

export function isolatedBridgeTiles(doc: Pick<EditorMapDoc, "bridges">): BridgeTile[] {
  return doc.bridges.filter((b) => orthogonalBridgeNeighbors(doc, b.tx, b.ty).length === 0);
}
