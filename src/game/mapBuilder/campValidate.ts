import type { HubAction } from "../campActions";
import { inBounds } from "./document";
import { isTerrainKind, type EditorMapDoc, type ValidationIssue, type ValidationResult } from "./schema";

function issue(level: ValidationIssue["level"], code: string, message: string): ValidationIssue {
  return { level, code, message };
}

/** Stations a camp layout must assign to a prop before it can lock. Radio is optional. */
const REQUIRED_HUB_ACTIONS: readonly HubAction[] = ["supplies", "gear", "skills", "region"];

export function validateCampMap(doc: EditorMapDoc): ValidationResult {
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
      if (!isTerrainKind(row[x])) {
        errors.push(issue("error", "TERRAIN", `Invalid terrain at (${x}, ${y}).`));
      }
    }
  }

  const seen = new Set<string>();
  for (const p of doc.props) {
    if (!inBounds(doc, p.tx, p.ty)) {
      errors.push(issue("error", "BOUNDS", `Prop ${p.type} is out of bounds at (${p.tx}, ${p.ty}).`));
      continue;
    }
    const key = `${p.tx},${p.ty}`;
    if (seen.has(key)) {
      errors.push(issue("error", "PROP", `Duplicate prop at (${p.tx}, ${p.ty}).`));
    }
    seen.add(key);
  }

  const assigned = new Set<HubAction>();
  for (const p of doc.props) if (p.hubAction) assigned.add(p.hubAction);
  for (const action of REQUIRED_HUB_ACTIONS) {
    if (!assigned.has(action)) {
      errors.push(issue("error", "STATION", `No prop is assigned to the "${action}" station.`));
    }
  }
  if (!assigned.has("radio")) {
    warnings.push(issue("warning", "STATION", `No prop is assigned to the "radio" station.`));
  }
  if (!assigned.has("range")) {
    warnings.push(issue("warning", "STATION", `No prop is assigned to the "range" station.`));
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function canLockCamp(doc: EditorMapDoc): boolean {
  return validateCampMap(doc).ok && doc.status === "draft";
}
