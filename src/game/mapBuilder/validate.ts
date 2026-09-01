import { inBounds, occupantAt, terrainAt } from "./document";
import { isOrthogonalPair, pathCells } from "./pathing";
import { isLegalPort, portConnectedToPath } from "./ports";
import {
  GATE_IDS,
  isCollisionWallKind,
  isTerrainKind,
  type EditorMapDoc,
  type ValidationIssue,
  type ValidationResult,
} from "./schema";
import {
  bridgeComponents,
  bridgeHasDiagonalOnlyConnection,
  componentTouchesHighGround,
  isolatedBridgeTiles,
} from "./bridges";
import { canonicalCollisionWall, collisionWallKey } from "./walls";

function issue(level: ValidationIssue["level"], code: string, message: string): ValidationIssue {
  return { level, code, message };
}

export function validateMap(doc: EditorMapDoc): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (doc.schemaVersion !== 1) {
    errors.push(issue("error", "SCHEMA", `Unsupported schemaVersion ${doc.schemaVersion}.`));
  }
  if (doc.width < 1 || doc.height < 1) {
    errors.push(issue("error", "SIZE", "Map dimensions must be positive."));
  }
  if (doc.terrain.length !== doc.height) {
    errors.push(issue("error", "TERRAIN", "Terrain height does not match map height."));
  }
  for (let y = 0; y < doc.terrain.length; y++) {
    const row = doc.terrain[y];
    if (!row || row.length !== doc.width) {
      errors.push(issue("error", "TERRAIN", `Terrain row ${y} width does not match map width.`));
      continue;
    }
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (!isTerrainKind(cell)) {
        errors.push(issue("error", "TERRAIN", `Invalid terrain at (${x}, ${y}).`));
      }
    }
  }

  const checkTile = (label: string, tx: number, ty: number) => {
    if (!inBounds(doc, tx, ty)) errors.push(issue("error", "BOUNDS", `${label} is out of bounds at (${tx}, ${ty}).`));
  };

  for (const p of doc.props) checkTile(`Prop ${p.type}`, p.tx, p.ty);
  for (const p of doc.cover) checkTile(`Cover ${p.type}`, p.tx, p.ty);
  for (const p of doc.crates) checkTile("Crate", p.tx, p.ty);
  for (const p of doc.checkpoints) checkTile(`Checkpoint ${p.type}`, p.tx, p.ty);
  for (const p of doc.edges) checkTile(`Edge ${p.type}`, p.tx, p.ty);

  const wallKeys = new Set<string>();
  for (const wall of doc.collisionWalls) {
    const canonical = canonicalCollisionWall(wall.tx, wall.ty, wall.edge, doc.width, doc.height);
    if (!canonical) {
      errors.push(issue("error", "WALL", `Wall is out of bounds at (${wall.tx}, ${wall.ty} ${wall.edge}).`));
      continue;
    }
    if (!isCollisionWallKind(wall.kind)) {
      errors.push(issue("error", "WALL", `Wall at (${canonical.tx}, ${canonical.ty} ${canonical.edge}) has invalid type.`));
    }
    const key = collisionWallKey(canonical);
    if (wallKeys.has(key)) {
      errors.push(issue("error", "WALL", `Duplicate wall at (${canonical.tx}, ${canonical.ty} ${canonical.edge}).`));
      continue;
    }
    wallKeys.add(key);
    if (wall.tx !== canonical.tx || wall.ty !== canonical.ty || wall.edge !== canonical.edge) {
      errors.push(
        issue("error", "WALL", `Wall at (${wall.tx}, ${wall.ty} ${wall.edge}) is not in canonical shared-edge form.`),
      );
    }
  }

  for (const bridge of doc.bridges) {
    checkTile("Suspended bridge", bridge.tx, bridge.ty);
  }
  const bridgeCells = new Set<string>();
  for (const bridge of doc.bridges) {
    const key = `${bridge.tx},${bridge.ty}`;
    if (bridgeCells.has(key)) {
      errors.push(issue("error", "BRIDGE", `Duplicate suspended bridge overlay at (${bridge.tx}, ${bridge.ty}).`));
    }
    bridgeCells.add(key);
  }
  if (bridgeHasDiagonalOnlyConnection(doc)) {
    errors.push(issue("error", "BRIDGE", "Suspended bridge tiles connect diagonally without an orthogonal chain."));
  }
  for (const tile of isolatedBridgeTiles(doc)) {
    warnings.push(issue("warning", "BRIDGE", `Isolated suspended bridge tile at (${tile.tx}, ${tile.ty}).`));
  }
  for (const component of bridgeComponents(doc)) {
    if (!component.length) continue;
    if (!componentTouchesHighGround(doc, component)) {
      warnings.push(issue("warning", "BRIDGE", "Bridge segment has no elevated access."));
    }
  }

  const laneIds = new Set<string>();
  for (const lane of doc.lanes) {
    if (!lane.id.trim()) {
      errors.push(issue("error", "LANE", "Lane ID is empty."));
      continue;
    }
    if (laneIds.has(lane.id)) {
      errors.push(issue("error", "LANE", `Duplicate lane ID ${lane.id}.`));
    }
    laneIds.add(lane.id);

    if (!lane.spawn || !lane.endpoint) {
      errors.push(issue("error", "LANE", `Lane ${lane.id} needs a spawn boundary port and an endpoint boundary port.`));
    }
    if (lane.spawn && !isLegalPort(lane.spawn, doc.width, doc.height)) {
      errors.push(
        issue(
          "error",
          "SPAWN",
          `Lane ${lane.id} spawn is not a legal boundary port (${lane.spawn.tx}, ${lane.spawn.ty} ${lane.spawn.edge}).`,
        ),
      );
    }
    if (lane.endpoint && !isLegalPort(lane.endpoint, doc.width, doc.height)) {
      errors.push(
        issue(
          "error",
          "ENDPOINT",
          `Lane ${lane.id} endpoint is not a legal boundary port (${lane.endpoint.tx}, ${lane.endpoint.ty} ${lane.endpoint.edge}).`,
        ),
      );
    }
    if (lane.waypoints.length < 1) {
      errors.push(issue("error", "LANE", `Lane ${lane.id} needs a path.`));
    }
    for (const [x, y] of lane.waypoints) {
      if (!inBounds(doc, x, y)) {
        errors.push(issue("error", "BOUNDS", `Lane ${lane.id} path cell (${x}, ${y}) is outside the playable map.`));
      }
    }
    if (lane.spawn && lane.waypoints.length && !portConnectedToPath(lane.spawn, lane.waypoints, "start")) {
      errors.push(
        issue(
          "error",
          "SPAWN",
          `Lane ${lane.id} spawn is not connected to the path at (${lane.spawn.tx}, ${lane.spawn.ty}).`,
        ),
      );
    }
    if (lane.endpoint && lane.waypoints.length && !portConnectedToPath(lane.endpoint, lane.waypoints, "end")) {
      errors.push(
        issue(
          "error",
          "ENDPOINT",
          `Lane ${lane.id} endpoint is not connected to the path at (${lane.endpoint.tx}, ${lane.endpoint.ty}).`,
        ),
      );
    }
    for (let i = 0; i < lane.waypoints.length - 1; i++) {
      const a = lane.waypoints[i]!;
      const b = lane.waypoints[i + 1]!;
      if (same(a, b)) {
        errors.push(issue("error", "LANE", `Lane ${lane.id} has a zero-length step at (${a[0]}, ${a[1]}).`));
        continue;
      }
      if (!isOrthogonalPair(a, b)) {
        errors.push(
          issue(
            "error",
            "DIAGONAL",
            `Lane ${lane.id} has a diagonal-only step (${a[0]}, ${a[1]}) → (${b[0]}, ${b[1]}).`,
          ),
        );
      }
    }
    const cells = pathCells(lane.waypoints);
    if (!cells.length && lane.waypoints.length >= 2) {
      errors.push(issue("error", "LANE", `Lane ${lane.id} path is disconnected.`));
    }
    for (const [x, y] of cells) {
      if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) continue;
      const terrain = terrainAt(doc, x, y);
      if (terrain === "WATER") {
        errors.push(
          issue("error", "WATER", `Lane ${lane.id} crosses water at (${x}, ${y}) without a ROAD/bridge tile.`),
        );
      } else if (terrain === "MOUNTAIN") {
        errors.push(issue("error", "MOUNTAIN", `Lane ${lane.id} crosses blocked terrain at (${x}, ${y}).`));
      } else if (terrain !== "ROAD") {
        errors.push(issue("error", "ROAD", `Lane ${lane.id} leaves the road at (${x}, ${y}).`));
      }
    }
    if (cells.length > 0 && cells.length < 6) {
      warnings.push(issue("warning", "SHORT", `Lane ${lane.id} is unusually short (${cells.length} tiles).`));
    }
  }

  if (!doc.lanes.length) errors.push(issue("error", "LANE", "Map has no lanes."));

  for (const gate of doc.gates) {
    if (!(GATE_IDS as readonly string[]).includes(gate.id)) {
      errors.push(issue("error", "GATE", `Gate ${gate.id} is not a valid identity.`));
    }
    if (!laneIds.has(gate.laneId)) {
      errors.push(issue("error", "GATE", `Gate ${gate.id} references missing lane ${gate.laneId}.`));
    }
    checkTile(`Gate ${gate.id}`, gate.tx, gate.ty);
  }

  for (const zone of doc.zones) {
    if (!zone.cells.length) {
      errors.push(issue("error", "ZONE", `Special zone ${zone.name || zone.id} has no cells.`));
    }
    for (const [x, y] of zone.cells) checkTile(`Zone ${zone.name || zone.id}`, x, y);
    if (!zone.type) errors.push(issue("error", "ZONE", `Special zone ${zone.id} has no type.`));
  }

  let ground = 0;
  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      const t = terrainAt(doc, x, y);
      if ((t === "GROUND" || t === "HIGH_GROUND") && occupantAt(doc, x, y) === null) ground += 1;
    }
  }
  if (ground < 8) warnings.push(issue("warning", "GROUND", "Very little legal ground remains."));
  if (!doc.zones.length) warnings.push(issue("warning", "ZONE", "No special zones authored."));

  return { ok: errors.length === 0, errors, warnings };
}

function same(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function canLock(doc: EditorMapDoc): boolean {
  return validateMap(doc).ok && doc.status === "draft";
}
