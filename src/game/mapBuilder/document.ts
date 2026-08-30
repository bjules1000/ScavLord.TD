import { COLS, ROWS } from "../data";
import type { Palette } from "../map";
import {
  MAX_MAP_HEIGHT,
  MAX_MAP_WIDTH,
  MIN_MAP_SIZE,
  MAP_BUILDER_SCHEMA_VERSION,
  type EditorMapDoc,
  type TerrainKind,
} from "./schema";

export const DEFAULT_EDITOR_PALETTE: Palette = {
  grassA: "#2e3a24",
  grassB: "#27321f",
  grassC: "#222c1b",
  speckLight: "#3a4a2a",
  speckDark: "#1b2415",
  roadOuter: "#3a3328",
  roadMid: "#4a4034",
  roadInner: "#5b503f",
  roadLine: "#6d6250",
};

export function emptyTerrain(width: number, height: number, fill: TerrainKind = "GROUND"): TerrainKind[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

export function slugId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "draft";
}

export function validateNewMapInput(input: {
  displayName: string;
  id: string;
  width: number;
  height: number;
}): string | null {
  const name = input.displayName.trim();
  if (name.length < 1 || name.length > 40) return "Display name must be 1–40 characters.";
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(input.id)) {
    return "Internal ID must be 2–32 characters: lowercase letters, numbers, hyphens.";
  }
  if (
    !Number.isInteger(input.width) ||
    !Number.isInteger(input.height) ||
    input.width < MIN_MAP_SIZE ||
    input.height < MIN_MAP_SIZE ||
    input.width > MAX_MAP_WIDTH ||
    input.height > MAX_MAP_HEIGHT
  ) {
    return `Size must be integers ${MIN_MAP_SIZE}–${MAX_MAP_WIDTH} wide and ${MIN_MAP_SIZE}–${MAX_MAP_HEIGHT} tall.`;
  }
  return null;
}

export function createBlankMap(input: {
  displayName: string;
  id: string;
  width?: number;
  height?: number;
}): EditorMapDoc {
  const width = input.width ?? COLS;
  const height = input.height ?? ROWS;
  const err = validateNewMapInput({
    displayName: input.displayName,
    id: input.id,
    width,
    height,
  });
  if (err) throw new Error(err);
  return {
    schemaVersion: MAP_BUILDER_SCHEMA_VERSION,
    id: input.id,
    displayName: input.displayName.trim(),
    width,
    height,
    status: "draft",
    revision: 1,
    sourceMapId: null,
    palette: DEFAULT_EDITOR_PALETTE,
    threat: 2,
    threatLabel: "MEDIUM THREAT",
    desc: "Dev-authored draft.",
    hpMult: 1,
    lootMult: 1,
    waveMods: null,
    sector: "SECTOR DEV",
    geo: { x: 50, y: 50 },
    terrain: emptyTerrain(width, height),
    lanes: [{ id: "MAIN", waypoints: [] }],
    props: [],
    cover: [],
    crates: [],
    checkpoints: [],
    edges: [],
    gates: [],
    zones: [],
  };
}

export function inBounds(doc: Pick<EditorMapDoc, "width" | "height">, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < doc.width && ty < doc.height;
}

export function nextObjectId(doc: EditorMapDoc, prefix: string): string {
  const used = new Set<string>([
    ...doc.props.map((p) => p.id),
    ...doc.cover.map((p) => p.id),
    ...doc.crates.map((p) => p.id),
    ...doc.checkpoints.map((p) => p.id),
    ...doc.edges.map((p) => p.id),
    ...doc.zones.map((p) => p.id),
  ]);
  let n = 1;
  while (used.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

export function occupantAt(doc: EditorMapDoc, tx: number, ty: number): string | null {
  if (doc.props.some((p) => p.tx === tx && p.ty === ty)) return "prop";
  if (doc.cover.some((p) => p.tx === tx && p.ty === ty)) return "cover";
  if (doc.crates.some((p) => p.tx === tx && p.ty === ty)) return "crate";
  if (doc.checkpoints.some((p) => p.tx === tx && p.ty === ty)) return "checkpoint";
  return null;
}

export function terrainAt(doc: EditorMapDoc, tx: number, ty: number): TerrainKind | null {
  if (!inBounds(doc, tx, ty)) return null;
  return doc.terrain[ty]![tx]!;
}

export function isWalkableTerrain(kind: TerrainKind): boolean {
  return kind === "GROUND" || kind === "ROAD" || kind === "HIGH_GROUND";
}

export function lockDoc(doc: EditorMapDoc): EditorMapDoc {
  return { ...doc, status: "locked" };
}

export function unlockRevision(doc: EditorMapDoc): EditorMapDoc {
  return { ...doc, status: "draft", revision: doc.revision + 1 };
}
