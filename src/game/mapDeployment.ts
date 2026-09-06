import type { GameMap } from "./map";

export type DeploymentTile = { tx: number; ty: number };

/** Authored special-zone cells are the preferred insertion area for a raid squad. */
export function authoredDeploymentTiles(map: GameMap): DeploymentTile[] {
  const seen = new Set<string>();
  const tiles: DeploymentTile[] = [];
  for (const zone of map.def.zones ?? []) {
    for (const [tx, ty] of zone.cells) {
      const key = `${tx},${ty}`;
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height || seen.has(key)) continue;
      seen.add(key);
      tiles.push({ tx, ty });
    }
  }
  return tiles;
}

export function selectDeploymentTiles(
  map: GameMap,
  count: number,
  isPlaceable: (tx: number, ty: number) => boolean,
  fallback: () => DeploymentTile,
): DeploymentTile[] {
  const tiles: DeploymentTile[] = [];
  const seen = new Set<string>();
  const add = (tx: number, ty: number) => {
    const key = `${tx},${ty}`;
    if (tiles.length >= count || seen.has(key) || !isPlaceable(tx, ty)) return;
    seen.add(key);
    tiles.push({ tx, ty });
  };

  for (const tile of authoredDeploymentTiles(map)) add(tile.tx, tile.ty);
  const primary = tiles[0] ?? fallback();
  add(primary.tx, primary.ty);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]] as const) {
    add(primary.tx + dx, primary.ty + dy);
  }
  for (let ty = 0; ty < map.height && tiles.length < count; ty++) {
    for (let tx = 0; tx < map.width && tiles.length < count; tx++) add(tx, ty);
  }
  while (tiles.length < count) tiles.push(primary);
  return tiles;
}
