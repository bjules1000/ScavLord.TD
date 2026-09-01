import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { TILE } from "../data";
import { MAP_BY_ID, MAP_DEFS, type GameMap } from "../map";
import type { LosHit } from "../los";
import type { SurfaceLevel } from "../types";
import { EDITOR_GUTTER, canvasPixelSize, EDGE_LABEL, hitLanePort, portEdgeFromCursor } from "./ports";
import { draftIdForSource, fromProductionMap, productionMaps } from "./adapters";
import { createBlankMap, slugId, unlockRevision, validateNewMapInput } from "./document";
import { edgeFromCursor } from "./edges";
import { exportFilename, importedToDoc, parseImport, stringifyExport } from "./export";
import { canRedo, canUndo, commit, commitStroke, redo, replaceDoc, sessionFrom, undo, type EditorSession } from "./history";
import { applyAuthorStroke, gameplayEraseTarget, pathPreviewCells, pathStepValid, propAt, type AuthorCell } from "./author";
import { addLane, canPlaceOccupant, clearLanePath, removeLane, removeObject } from "./paint";
import { nextLaneId, pathCells } from "./pathing";
import { emptyStore, readStore, upsertDoc, writeStore } from "./persist";
import { DEFAULT_LAYERS, clientToTile, drawEditorMap, hitObject, type LayerFlags } from "./render";
import {
  isAuthoringTool,
  isBridgeMode,
  isCollisionWallMode,
  isEraseBridgeMode,
  isEraseWallMode,
  isGameplayEraseMode,
  isInspectMode,
  isLosProbeMode,
  isPathMode,
  isPropEraseMode,
  isPropPlaceMode,
  isTerrainEraserMode,
  isTerrainPaintMode,
  selectBridgeTool,
  selectCollisionWallTool,
  selectEraseBridgeTool,
  selectEraseWallTool,
  selectGameplayEraser,
  selectLosProbeTool,
  selectPathTool,
  selectPropEraser,
  selectPropTool,
  selectTerrainTool,
  type EditorTool,
} from "./tools";
import {
  applyLosProbeClick,
  applyLosProbeHover,
  displaySurface,
  drawLosProbeOverlay,
  emptyLosProbeState,
  evaluateCustomProbe,
  evaluatePathSweep,
  formatOriginLine,
  formatPathLosSummary,
  formatProbeBlocker,
  gameMapFromEditorDoc,
  probeKindLabel,
  probePointAsSight,
  probeSurfacesAt,
  resolveProbePoint,
  sampleActiveLane,
  type LosProbeState,
  type PathSweepResult,
} from "./losProbe";
import type { EditorMapDoc, TerrainKind } from "./schema";
import { CHECKPOINT_TYPES, COVER_TYPES, GATE_IDS, PROP_TYPES } from "./schema";
import { canLock, validateMap } from "./validate";
import { lockDoc } from "./document";
import { bridgeAt, hasBridge, inferBridgeOrientation, toggleBridgeOrientation } from "./bridges";
import { canonicalCollisionWall, hitCollisionWall } from "./walls";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5];
const GHOST: Record<TerrainKind, string> = {
  GROUND: "#6a7a50",
  ROAD: "#8a8070",
  WATER: "#3a8ab0",
  MOUNTAIN: "#6a6e76",
  HIGH_GROUND: "#c9a227",
};

function persist(session: EditorSession) {
  if (typeof window === "undefined") return;
  const store = upsertDoc(readStore(window.localStorage), session.doc);
  writeStore(window.localStorage, store);
}

function seedSession(initialMapId?: string): EditorSession {
  const requested = initialMapId ? MAP_BY_ID[initialMapId] : undefined;
  if (typeof window === "undefined") {
    return sessionFrom(fromProductionMap(requested ?? MAP_DEFS[0]!));
  }
  const store = readStore(window.localStorage);
  if (requested) {
    const id = draftIdForSource(requested.id);
    const next = store.docs[id] ?? fromProductionMap(requested);
    writeStore(window.localStorage, upsertDoc(store, next));
    return sessionFrom(next);
  }
  const existing = store.activeId ? store.docs[store.activeId] : undefined;
  if (existing) return sessionFrom(existing);
  const first = fromProductionMap(MAP_DEFS[0]!);
  writeStore(window.localStorage, upsertDoc(emptyStore(), first));
  return sessionFrom(first);
}

export default function MapBuilder({ initialMapId }: { initialMapId?: string }) {
  const [session, setSession] = useState<EditorSession>(() => seedSession(initialMapId));
  const [tool, setTool] = useState<EditorTool>({ id: "terrain", terrain: "ROAD" });
  const [laneId, setLaneId] = useState("MAIN");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerFlags>(DEFAULT_LAYERS);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<{ tx: number; ty: number; localX: number; localY: number } | null>(null);
  const [selected, setSelected] = useState<{ kind: string; id: string } | null>(null);
  const [probe, setProbe] = useState<LosProbeState>(emptyLosProbeState);
  const [validation, setValidation] = useState<ReturnType<typeof validateMap> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("NEW SECTOR");
  const [newId, setNewId] = useState("new-sector");
  const [newW, setNewW] = useState(20);
  const [newH, setNewH] = useState(13);
  const stroke = useRef<AuthorCell[]>([]);
  const painting = useRef(false);
  const strokeBase = useRef<EditorMapDoc | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [liveDoc, setLiveDoc] = useState<EditorMapDoc | null>(null);
  const liveRef = useRef<EditorMapDoc | null>(null);
  const doc = liveDoc ?? session.doc;
  const locked = doc.status === "locked";

  const probeMap = useMemo(() => gameMapFromEditorDoc(doc), [doc]);
  const pathSamples = useMemo(() => sampleActiveLane(probeMap, laneId), [probeMap, laneId]);
  const pathSweep = useMemo(() => {
    if (!probe.origin) return { results: [], visible: 0, blocked: 0 };
    return evaluatePathSweep(probeMap, probePointAsSight(probe.origin), pathSamples);
  }, [probeMap, probe.origin, pathSamples]);
  const customHit = useMemo(() => {
    if (probe.mode !== "CUSTOM" || !probe.origin || !probe.customTarget) return null;
    return evaluateCustomProbe(probeMap, probePointAsSight(probe.origin), probePointAsSight(probe.customTarget));
  }, [probe.mode, probe.origin, probe.customTarget, probeMap]);

  useEffect(() => {
    if (!doc.lanes.some((l) => l.id === laneId)) setLaneId(doc.lanes[0]?.id ?? "MAIN");
  }, [doc.lanes, laneId]);

  useEffect(() => {
    setProbe((s) => ({ ...s, hoverSampleIndex: null, selectedSampleIndex: null }));
  }, [laneId]);

  useEffect(() => {
    persist(session);
  }, [session]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = canvasPixelSize(doc.width, doc.height);
    canvas.width = size.w;
    canvas.height = size.h;
    const edge =
      hover && (tool.id === "edge" || tool.id === "gate" || isCollisionWallMode(tool) || isEraseWallMode(tool))
        ? edgeFromCursor(hover.localX, hover.localY)
        : undefined;
    let ghost: string | null = null;
    let invalid = false;
    let ghostItem:
      | "prop"
      | "cover"
      | "crate"
      | "checkpoint"
      | "spawn"
      | "end"
      | "erase"
      | "path"
      | "wall"
      | "bridge"
      | "erase-wall"
      | "erase-bridge"
      | null = null;
    let pathPreview: Array<[number, number]> | undefined;
    if (hover && isTerrainPaintMode(tool) && tool.id === "terrain") ghost = GHOST[tool.terrain];
    if (hover && isPropPlaceMode(tool)) {
      ghost = "#c9c2a6";
      invalid = tool.id === "edge" ? false : !canPlaceOccupant(doc, hover.tx, hover.ty);
      if (tool.id === "cover") ghostItem = "cover";
      else if (tool.id === "crate") ghostItem = "crate";
      else if (tool.id === "checkpoint") ghostItem = "checkpoint";
      else ghostItem = "prop";
    }
    if (hover && (isTerrainEraserMode(tool) || isPropEraseMode(tool) || isGameplayEraseMode(tool))) {
      ghost = "#c23b2c";
      ghostItem = "erase";
      if (isPropEraseMode(tool)) invalid = !propAt(doc, hover.tx, hover.ty);
      if (isGameplayEraseMode(tool)) invalid = !gameplayEraseTarget(doc, laneId, hover.tx, hover.ty);
    }
    if (hover && isPathMode(tool)) {
      ghost = "#f0b400";
      ghostItem = "path";
      invalid = !pathStepValid(doc, laneId, [hover.tx, hover.ty]);
      pathPreview = pathPreviewCells(doc, laneId, [hover.tx, hover.ty]);
    }
    let portPreview: { tx: number; ty: number; edge: "N" | "E" | "S" | "W" } | null = null;
    if (hover && (tool.id === "spawn" || tool.id === "end")) {
      ghost = "#f0b400";
      ghostItem = tool.id === "spawn" ? "spawn" : "end";
      const portEdge = portEdgeFromCursor(hover.tx, hover.ty, hover.localX, hover.localY, doc.width, doc.height);
      invalid = !portEdge;
      portPreview = portEdge ? { tx: hover.tx, ty: hover.ty, edge: portEdge } : null;
    } else if (hover && (tool.id === "zone" || tool.id === "gate")) {
      ghost = "#f0b400";
    }
    let wallPreview: { tx: number; ty: number; edge: "N" | "E" | "S" | "W" } | null = null;
    if (hover && (isCollisionWallMode(tool) || isEraseWallMode(tool)) && edge) {
      ghost = "#3ef0e0";
      ghostItem = isEraseWallMode(tool) ? "erase-wall" : "wall";
      wallPreview = canonicalCollisionWall(hover.tx, hover.ty, edge, doc.width, doc.height);
      invalid = isEraseWallMode(tool)
        ? !wallPreview || !hitCollisionWall(doc, hover.tx, hover.ty, edge)
        : !wallPreview;
    }
    let bridgePreview: { tx: number; ty: number; orientation: "H" | "V" } | null = null;
    if (hover && (isBridgeMode(tool) || isEraseBridgeMode(tool))) {
      ghost = "#c9a56a";
      ghostItem = isEraseBridgeMode(tool) ? "erase-bridge" : "bridge";
      invalid = isEraseBridgeMode(tool) ? !hasBridge(doc, hover.tx, hover.ty) : false;
      bridgePreview = {
        tx: hover.tx,
        ty: hover.ty,
        orientation: inferBridgeOrientation(doc.bridges, hover.tx, hover.ty, "H"),
      };
    }
    drawEditorMap(
      ctx,
      doc,
      layers,
      hover && !isLosProbeMode(tool)
        ? {
            tx: hover.tx,
            ty: hover.ty,
            ghost,
            invalid,
            ghostItem,
            ghostProp: tool.id === "prop" ? tool.type : null,
            ghostCover: tool.id === "cover" ? tool.type : null,
            ghostCheckpoint: tool.id === "checkpoint" ? tool.type : null,
            ...(pathPreview ? { pathPreview } : {}),
            ...(edge ? { edge } : {}),
            ...(portPreview ? { portPreview } : {}),
            ...(wallPreview ? { wallPreview } : {}),
            ...(bridgePreview ? { bridgePreview } : {}),
          }
        : null,
      laneId,
    );
    if (isLosProbeMode(tool)) {
      ctx.save();
      ctx.translate(EDITOR_GUTTER, EDITOR_GUTTER);
      const active =
        probe.selectedSampleIndex != null && probe.selectedSampleIndex < pathSweep.results.length
          ? probe.selectedSampleIndex
          : probe.hoverSampleIndex != null && probe.hoverSampleIndex < pathSweep.results.length
            ? probe.hoverSampleIndex
            : null;
      drawLosProbeOverlay(ctx, {
        origin: probe.origin,
        mode: probe.mode,
        customTarget: probe.customTarget,
        customHit,
        samples: pathSweep.results,
        activeSampleIndex: active,
      });
      ctx.restore();
    }
  }, [doc, layers, hover, tool, laneId, probe, pathSweep, customHit]);

  const apply = useCallback((next: EditorMapDoc) => {
    setSession((s) => commit(s, next));
    setValidation(null);
  }, []);

  const pointerCell = (ev: PointerEvent<HTMLCanvasElement>): AuthorCell | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return clientToTile(ev.clientX, ev.clientY, canvas.getBoundingClientRect(), doc.width, doc.height, TILE, EDITOR_GUTTER);
  };

  const authorCtx = () => ({ laneId, zoneId, tileSize: TILE });

  const strokePreview = (cells: AuthorCell[]) => {
    const base = strokeBase.current ?? session.doc;
    return applyAuthorStroke(base, tool, cells, authorCtx());
  };

  const onPointerDown = (ev: PointerEvent<HTMLCanvasElement>) => {
    if (ev.button !== 0) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const cell = pointerCell(ev);
    if (!cell) return;
    if (isLosProbeMode(tool)) {
      const x = cell.tx * TILE + cell.localX;
      const y = cell.ty * TILE + cell.localY;
      setProbe((s) => applyLosProbeClick(s, probeMap, { tx: cell.tx, ty: cell.ty, x, y }, pathSweep.results));
      return;
    }
    if (isInspectMode(tool)) {
      setSelected(hitObject(doc, cell.tx, cell.ty, cell.localX, cell.localY));
      return;
    }
    if (locked || !isAuthoringTool(tool)) return;
    painting.current = true;
    strokeBase.current = session.doc;
    stroke.current = [cell];
    const next = strokePreview(stroke.current);
    if (tool.id === "zone") {
      const created = next.zones[next.zones.length - 1];
      if (created && !zoneId) setZoneId(created.id);
    }
    liveRef.current = next;
    setLiveDoc(next);
  };

  const onPointerMove = (ev: PointerEvent<HTMLCanvasElement>) => {
    const cell = pointerCell(ev);
    setHover(cell);
    if (isLosProbeMode(tool)) {
      const world = cell ? { x: cell.tx * TILE + cell.localX, y: cell.ty * TILE + cell.localY } : null;
      setProbe((s) => applyLosProbeHover(s, pathSweep.results, world));
      return;
    }
    if (!painting.current || !cell || locked) return;
    const last = stroke.current[stroke.current.length - 1];
    if (last && last.tx === cell.tx && last.ty === cell.ty) return;
    stroke.current.push(cell);
    const next = strokePreview(stroke.current);
    liveRef.current = next;
    setLiveDoc(next);
  };

  const onPointerUp = () => {
    const preview = liveRef.current;
    const wasPainting = painting.current;
    painting.current = false;
    stroke.current = [];
    strokeBase.current = null;
    liveRef.current = null;
    setLiveDoc(null);
    if (wasPainting) {
      setSession((s) => commitStroke(s, preview));
      setValidation(null);
    }
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
        return;
      }
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        setSession((s) => (ev.shiftKey ? redo(s) : undo(s)));
        return;
      }
      if (mod && ev.key.toLowerCase() === "y") {
        ev.preventDefault();
        setSession((s) => redo(s));
        return;
      }
      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (selected && selected.kind !== "tile") {
          ev.preventDefault();
          apply(removeObject(doc, selected.id));
          setSelected(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, doc, selected]);

  const report = useMemo(() => validation ?? validateMap(doc), [doc, validation]);

  const openProduction = (sourceId: string) => {
    const store = typeof window !== "undefined" ? readStore(window.localStorage) : emptyStore();
    const id = draftIdForSource(sourceId);
    const existing = store.docs[id];
    const next = existing ?? fromProductionMap(MAP_DEFS.find((m) => m.id === sourceId)!);
    setSession(replaceDoc(session, next));
    setLaneId(next.lanes[0]?.id ?? "MAIN");
    setZoneId(null);
    setSelected(null);
    setProbe(emptyLosProbeState());
    setValidation(null);
  };

  const createNew = () => {
    const id = slugId(newId);
    const err = validateNewMapInput({ displayName: newName, id, width: newW, height: newH });
    if (err) {
      setMessage(err);
      return;
    }
    const next = createBlankMap({ displayName: newName, id, width: newW, height: newH });
    setSession(replaceDoc(session, next));
    setShowNew(false);
    setLaneId("MAIN");
    setProbe(emptyLosProbeState());
    setMessage(null);
  };

  const resetDraft = () => {
    if (doc.sourceMapId) {
      if (!window.confirm("Discard this draft and reload the current production map?")) return;
      setSession(replaceDoc(session, fromProductionMap(MAP_DEFS.find((m) => m.id === doc.sourceMapId)!)));
    } else {
      if (!window.confirm("Clear this map? All authored tiles will be lost.")) return;
      setSession(replaceDoc(session, createBlankMap({ displayName: doc.displayName, id: doc.id, width: doc.width, height: doc.height })));
    }
    setProbe(emptyLosProbeState());
    setValidation(null);
  };

  const runValidate = () => setValidation(validateMap(doc));

  const runLock = () => {
    const result = validateMap(doc);
    setValidation(result);
    if (!canLock(doc)) {
      setMessage("Lock blocked: fix validation errors first.");
      return;
    }
    setSession((s) => {
      const next = { ...s, doc: lockDoc(s.doc), past: [], future: [] };
      return next;
    });
    setMessage("Map locked. Export is ready.");
  };

  const runUnlock = () => {
    setSession((s) => ({ ...s, doc: unlockRevision(s.doc), past: [], future: [] }));
    setMessage("Revision unlocked. Editing enabled.");
  };

  const runExport = () => {
    const text = stringifyExport(doc);
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = exportFilename(doc);
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage(`Downloaded ${exportFilename(doc)}`);
  };

  const runCopy = async () => {
    await navigator.clipboard.writeText(stringifyExport(doc));
    setMessage("Map data copied.");
  };

  const runImport = (raw: string) => {
    const parsed = parseImport(raw);
    if (!parsed.ok) {
      setMessage(parsed.error);
      return;
    }
    const id = `import-${parsed.payload.id}`;
    setSession(replaceDoc(session, importedToDoc(parsed.payload, id)));
    setProbe(emptyLosProbeState());
    setMessage("Import loaded as a new editor draft.");
  };

  const drafts =
    typeof window !== "undefined" ? Object.values(readStore(window.localStorage).docs) : [doc];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-[1600px] px-2 py-2">
        <header className="mb-2 flex flex-wrap items-end gap-2 border-b-2 border-border pb-2">
          <div>
            <div className="font-display text-[10px] text-primary">DEV / MAP BUILDER</div>
            <h1 className="font-display text-sm text-foreground">{doc.displayName}</h1>
            <div className="font-mono text-[11px] text-muted-foreground">
              {doc.status.toUpperCase()} · REV {doc.revision} · {doc.width}×{doc.height}
              {hover ? ` · X ${hover.tx}  Y ${hover.ty}` : ""}
            </div>
          </div>
          <label className="font-mono text-[11px]">
            MAP
            <select
              className="ml-2 border border-border bg-card px-2 py-1"
              value={doc.sourceMapId ?? doc.id}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__new") {
                  setShowNew(true);
                  return;
                }
                const prod = productionMaps().find((m) => m.id === v);
                if (prod) openProduction(prod.id);
                else {
                  const stored = readStore(window.localStorage).docs[v];
                  if (stored) setSession(replaceDoc(session, stored));
                }
              }}
            >
              {productionMaps().map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              {drafts
                .filter((d) => !d.sourceMapId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.displayName} (draft)
                  </option>
                ))}
              <option value="__new">+ NEW MAP</option>
            </select>
          </label>
          <div className="ml-auto flex flex-wrap gap-1">
            <button className="pixel-btn" disabled={!canUndo(session)} onClick={() => setSession((s) => undo(s))}>
              UNDO
            </button>
            <button className="pixel-btn" disabled={!canRedo(session)} onClick={() => setSession((s) => redo(s))}>
              REDO
            </button>
            <button className="pixel-btn" onClick={runValidate}>
              VALIDATE
            </button>
            {locked ? (
              <button className="pixel-btn" onClick={runUnlock}>
                UNLOCK / REVISION
              </button>
            ) : (
              <button className="pixel-btn pixel-btn-primary" onClick={runLock}>
                LOCK
              </button>
            )}
            <button className="pixel-btn" onClick={runExport}>
              EXPORT
            </button>
            <button className="pixel-btn" onClick={() => void runCopy()}>
              COPY MAP DATA
            </button>
            <label className="pixel-btn cursor-pointer">
              IMPORT
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void file.text().then(runImport);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="pixel-btn" onClick={resetDraft}>
              {doc.sourceMapId ? "RESET TO CURRENT" : "CLEAR MAP"}
            </button>
            <Link to="/" className="pixel-btn">
              RAID
            </Link>
          </div>
        </header>

        {message && <div className="mb-2 font-mono text-[11px] text-primary">{message}</div>}

        {showNew && (
          <div className="pixel-card mb-2 flex flex-wrap items-end gap-2 font-mono text-[11px]">
            <label>
              NAME
              <input className="ml-1 border border-border bg-background px-1" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </label>
            <label>
              ID
              <input className="ml-1 border border-border bg-background px-1" value={newId} onChange={(e) => setNewId(e.target.value)} />
            </label>
            <label>
              W
              <input className="ml-1 w-14 border border-border bg-background px-1" type="number" value={newW} onChange={(e) => setNewW(Number(e.target.value))} />
            </label>
            <label>
              H
              <input className="ml-1 w-14 border border-border bg-background px-1" type="number" value={newH} onChange={(e) => setNewH(Number(e.target.value))} />
            </label>
            <button className="pixel-btn pixel-btn-primary" onClick={createNew}>
              CREATE
            </button>
            <button className="pixel-btn" onClick={() => setShowNew(false)}>
              CANCEL
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
          <aside className="pixel-card space-y-3 overflow-auto font-mono text-[11px]">
            <Section title="TERRAIN">
              {(["GROUND", "ROAD", "WATER", "MOUNTAIN", "HIGH_GROUND"] as const).map((t) => (
                <Chip key={t} active={tool.id === "terrain" && tool.terrain === t} onClick={() => setTool(selectTerrainTool(t))}>
                  {t.replace("_", " ")}
                </Chip>
              ))}
              <Chip active={tool.id === "eraser"} onClick={() => setTool({ id: "eraser" })}>
                ERASE TERRAIN
              </Chip>
            </Section>
            <Section title="ROUTES / GAMEPLAY">
              <Chip active={tool.id === "path"} onClick={() => setTool(selectPathTool())}>
                PATH
              </Chip>
              <Chip active={tool.id === "spawn"} onClick={() => setTool({ id: "spawn" })}>
                SPAWN
              </Chip>
              <Chip active={tool.id === "end"} onClick={() => setTool({ id: "end" })}>
                ENDPOINT
              </Chip>
              <Chip active={tool.id === "zone"} onClick={() => setTool({ id: "zone" })}>
                SPECIAL ZONE
              </Chip>
              {GATE_IDS.map((g) => (
                <Chip key={g} active={tool.id === "gate" && tool.gateId === g} onClick={() => setTool({ id: "gate", gateId: g })}>
                  GATE {g}
                </Chip>
              ))}
              <Chip active={tool.id === "erase-gameplay"} onClick={() => setTool(selectGameplayEraser())}>
                ERASE GAMEPLAY
              </Chip>
            </Section>
            <Section title="PROPS">
              {PROP_TYPES.map((p) => (
                <Chip key={p} active={tool.id === "prop" && tool.type === p} onClick={() => setTool(selectPropTool(p))}>
                  {p}
                </Chip>
              ))}
              {COVER_TYPES.map((c) => (
                <Chip key={c} active={tool.id === "cover" && tool.type === c} onClick={() => setTool({ id: "cover", type: c })}>
                  COVER {c}
                </Chip>
              ))}
              <Chip active={tool.id === "crate"} onClick={() => setTool({ id: "crate" })}>
                LOOT CRATE
              </Chip>
              {CHECKPOINT_TYPES.map((c) => (
                <Chip key={c} active={tool.id === "checkpoint" && tool.type === c} onClick={() => setTool({ id: "checkpoint", type: c })}>
                  {c}
                </Chip>
              ))}
              <Chip active={tool.id === "edge" && tool.type === "fence"} onClick={() => setTool({ id: "edge", type: "fence" })}>
                FENCE EDGE
              </Chip>
              <Chip active={tool.id === "edge" && tool.type === "wall"} onClick={() => setTool({ id: "edge", type: "wall" })}>
                WALL EDGE
              </Chip>
              <Chip active={tool.id === "erase-prop"} onClick={() => setTool(selectPropEraser())}>
                ERASE PROP
              </Chip>
            </Section>
            <Section title="COLLISION / BARRIERS">
              <Chip active={isCollisionWallMode(tool)} onClick={() => setTool(selectCollisionWallTool())}>
                INVISIBLE WALL
              </Chip>
              <Chip active={isEraseWallMode(tool)} onClick={() => setTool(selectEraseWallTool())}>
                ERASE WALL
              </Chip>
              <div className="w-full text-muted-foreground">
                Hover a tile edge (N/E/S/W) and click. Shared neighbor edges are one wall. Leave gaps at slopes.
              </div>
            </Section>
            <Section title="OVERLAYS / STRUCTURES">
              <Chip active={isBridgeMode(tool)} onClick={() => setTool(selectBridgeTool())}>
                SUSPENDED BRIDGE
              </Chip>
              <Chip active={isEraseBridgeMode(tool)} onClick={() => setTool(selectEraseBridgeTool())}>
                ERASE BRIDGE
              </Chip>
              <div className="w-full text-muted-foreground">
                Overlay sits above base terrain. ROAD under a bridge stays. Drag to paint. ERASE TERRAIN does not remove the overlay.
              </div>
            </Section>
            <Section title="TOOLS">
              <Chip active={tool.id === "select"} onClick={() => setTool({ id: "select" })}>
                SELECT
              </Chip>
              <Chip active={isLosProbeMode(tool)} onClick={() => setTool(selectLosProbeTool())}>
                LOS PROBE
              </Chip>
              {isLosProbeMode(tool) && (
                <>
                  <Chip
                    active={probe.mode === "PATH"}
                    onClick={() =>
                      setProbe((s) => ({
                        ...s,
                        mode: "PATH",
                        customTarget: null,
                        selectedSampleIndex: null,
                        hoverSampleIndex: null,
                      }))
                    }
                  >
                    TARGETS: ENEMY PATH
                  </Chip>
                  <Chip
                    active={probe.mode === "CUSTOM"}
                    onClick={() =>
                      setProbe((s) => ({
                        ...s,
                        mode: "CUSTOM",
                        selectedSampleIndex: null,
                        hoverSampleIndex: null,
                      }))
                    }
                  >
                    TARGETS: CUSTOM
                  </Chip>
                  <div className="w-full text-muted-foreground">
                    Diagnostic only. Click a tile for origin (HIGH on HIGH_GROUND / bridge; LOW elsewhere; stacked tiles cycle). Unlimited range. Same LOS as raids. Does not edit the map.
                  </div>
                </>
              )}
            </Section>
          </aside>

          <div className="pixel-frame overflow-auto bg-[#141812] p-2">
            <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span>ZOOM</span>
              {ZOOM_STEPS.map((z) => (
                <Chip key={z} active={zoom === z} onClick={() => setZoom(z)}>
                  {Math.round(z * 100)}%
                </Chip>
              ))}
              {locked && <span className="text-primary">READ-ONLY</span>}
            </div>
            <canvas
              ref={canvasRef}
              className="block cursor-crosshair"
              style={{
                width: canvasPixelSize(doc.width, doc.height).w * zoom,
                height: canvasPixelSize(doc.width, doc.height).h * zoom,
                imageRendering: "pixelated",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => {
                if (!painting.current) setHover(null);
                if (isLosProbeMode(tool)) setProbe((s) => applyLosProbeHover(s, pathSweep.results, null));
              }}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>

          <aside className="pixel-card space-y-3 overflow-auto font-mono text-[11px]">
            <Section title="LANES">
              {doc.lanes.map((l) => (
                <Chip key={l.id} active={l.id === laneId} onClick={() => setLaneId(l.id)}>
                  {l.id} {l.waypoints.length ? `(${l.waypoints.length})` : ""}
                </Chip>
              ))}
              <button
                className="pixel-btn"
                disabled={locked}
                onClick={() => {
                  const id = nextLaneId(doc.lanes);
                  apply(addLane(doc, id));
                  setLaneId(id);
                }}
              >
                + NEW LANE
              </button>
              {doc.lanes.length > 1 && (
                <button className="pixel-btn" disabled={locked} onClick={() => apply(removeLane(doc, laneId))}>
                  REMOVE LANE
                </button>
              )}
              <button
                className="pixel-btn"
                disabled={locked || !(doc.lanes.find((l) => l.id === laneId)?.waypoints.length)}
                onClick={() => {
                  const lane = doc.lanes.find((l) => l.id === laneId);
                  const n = lane ? pathCells(lane.waypoints).length : 0;
                  if (n > 4 && typeof window !== "undefined" && !window.confirm(`Clear the ${n}-tile path on lane ${laneId}? Spawn stays. Road and props are unchanged.`)) {
                    return;
                  }
                  apply(clearLanePath(doc, laneId));
                }}
              >
                CLEAR PATH
              </button>
              <div className="text-muted-foreground">
                PATH is in-map ROAD only. SPAWN and ENDPOINT attach to a border tile and sit just outside the map. Hover a boundary tile (corners pick the nearer edge) and click to place or move the port. ERASE GAMEPLAY on an outside marker removes that spawn or endpoint only. CLEAR PATH keeps ports and drops the route.
              </div>
            </Section>
            <Section title="LAYERS">
              {(Object.keys(layers) as Array<keyof LayerFlags>).map((k) => (
                <label key={k} className="mr-2 inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={layers[k]}
                    onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })}
                  />
                  {k.toUpperCase()}
                </label>
              ))}
            </Section>
            {isLosProbeMode(tool) && (
              <Section title="LOS PROBE">
                <LosProbeInspector
                  map={probeMap}
                  probe={probe}
                  laneId={laneId}
                  pathSweep={pathSweep}
                  customHit={customHit}
                  onSetOriginSurface={(surface) =>
                    setProbe((s) =>
                      s.origin ? { ...s, origin: resolveProbePoint(probeMap, s.origin.tx, s.origin.ty, surface) } : s,
                    )
                  }
                  onSetTargetSurface={(surface) =>
                    setProbe((s) =>
                      s.customTarget
                        ? { ...s, customTarget: resolveProbePoint(probeMap, s.customTarget.tx, s.customTarget.ty, surface) }
                        : s,
                    )
                  }
                />
              </Section>
            )}
            <Section title="INSPECTOR">
              <Inspector
                doc={doc}
                selected={selected}
                hover={hover}
                locked={locked}
                onToggleBridge={(tx, ty) => apply(toggleBridgeOrientation(doc, tx, ty))}
              />
            </Section>
            <Section title="VALIDATION">
              <div className={report.ok ? "text-accent" : "text-destructive"}>
                {report.ok ? "VALID ✓" : "INVALID"}
              </div>
              <div>
                {report.errors.length} errors · {report.warnings.length} warnings
              </div>
              {report.errors.map((e) => (
                <div key={e.message} className="text-destructive">
                  · {e.message}
                </div>
              ))}
              {report.warnings.map((e) => (
                <div key={e.message} className="text-primary">
                  · {e.message}
                </div>
              ))}
            </Section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-display text-[9px] text-primary">{title}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-1.5 py-0.5 uppercase ${active ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}

function Inspector({
  doc,
  selected,
  hover,
  locked,
  onToggleBridge,
}: {
  doc: EditorMapDoc;
  selected: { kind: string; id: string } | null;
  hover: { tx: number; ty: number } | null;
  locked: boolean;
  onToggleBridge: (tx: number, ty: number) => void;
}) {
  const tile = selected?.kind === "tile" && selected.id.includes(",")
    ? { tx: Number(selected.id.split(",")[0]), ty: Number(selected.id.split(",")[1]) }
    : hover;
  if (selected?.kind === "wall") {
    const parts = selected.id.slice("wall:".length).split(",");
    const tx = Number(parts[0]);
    const ty = Number(parts[1]);
    const edge = parts[2] ?? "";
    return (
      <div>
        INVISIBLE WALL
        <div>EDGE {edge}</div>
        <div>
          TILE X{tx} Y{ty}
        </div>
        <div>MOVEMENT BLOCKED</div>
        <div>LOS BLOCKED</div>
      </div>
    );
  }
  const bridgeSel =
    selected?.kind === "bridge"
      ? { tx: Number(selected.id.split(":")[1]?.split(",")[0]), ty: Number(selected.id.split(",")[1]) }
      : tile && hasBridge(doc, tile.tx, tile.ty)
        ? tile
        : null;
  if (bridgeSel && Number.isInteger(bridgeSel.tx) && Number.isInteger(bridgeSel.ty)) {
    const overlay = bridgeAt(doc, bridgeSel.tx, bridgeSel.ty);
    const base = doc.terrain[bridgeSel.ty]?.[bridgeSel.tx] ?? "—";
    if (overlay) {
      return (
        <div>
          SUSPENDED BRIDGE
          <div>SURFACE HIGH</div>
          <div>BASE TERRAIN {base}</div>
          <div>ORIENTATION {overlay.orientation === "H" ? "HORIZONTAL" : "VERTICAL"}</div>
          <div>
            TILE X{overlay.tx} Y{overlay.ty}
          </div>
          <button
            type="button"
            className="pixel-btn mt-1"
            disabled={locked}
            onClick={() => onToggleBridge(overlay.tx, overlay.ty)}
          >
            TOGGLE ORIENTATION
          </button>
        </div>
      );
    }
  }
  const portHit =
    selected?.kind === "spawn" || selected?.kind === "endpoint"
      ? { kind: selected.kind as "spawn" | "endpoint", laneId: selected.id.split(":")[1] ?? "" }
      : tile
        ? hitLanePort(doc, tile.tx, tile.ty) ??
          doc.lanes
            .map((l) => {
              if (l.spawn && l.spawn.tx === tile.tx && l.spawn.ty === tile.ty) {
                return { kind: "spawn" as const, laneId: l.id };
              }
              if (l.endpoint && l.endpoint.tx === tile.tx && l.endpoint.ty === tile.ty) {
                return { kind: "endpoint" as const, laneId: l.id };
              }
              return null;
            })
            .find(Boolean) ?? null
        : null;
  if (portHit) {
    const lane = doc.lanes.find((l) => l.id === portHit.laneId);
    const port = portHit.kind === "spawn" ? lane?.spawn : lane?.endpoint;
    if (port) {
      return (
        <div>
          {portHit.kind === "spawn" ? "SPAWN" : "ENDPOINT"}
          <div>LANE {portHit.laneId}</div>
          <div>BOUNDARY {EDGE_LABEL[port.edge]}</div>
          <div>
            TILE X{port.tx} Y{port.ty}
          </div>
        </div>
      );
    }
  }
  const prop = doc.props.find((p) => p.id === selected?.id);
  const cover = doc.cover.find((p) => p.id === selected?.id);
  const crate = doc.crates.find((p) => p.id === selected?.id);
  const cp = doc.checkpoints.find((p) => p.id === selected?.id);
  const zone = doc.zones.find((p) => p.id === selected?.id);
  const gate = doc.gates.find((p) => p.id === selected?.id);
  if (prop) return <div>PROP {prop.type} · X {prop.tx} Y {prop.ty}</div>;
  if (cover) return <div>COVER {cover.type} · X {cover.tx} Y {cover.ty}</div>;
  if (crate) return <div>CRATE · X {crate.tx} Y {crate.ty}</div>;
  if (cp) return <div>CHECKPOINT {cp.type} · X {cp.tx} Y {cp.ty}</div>;
  if (zone) return <div>ZONE {zone.type} · {zone.name} · {zone.cells.length} tiles</div>;
  if (gate) return <div>GATE {gate.id} · LANE {gate.laneId} · X {gate.tx} Y {gate.ty} · {gate.edge}</div>;
  if (tile) {
    const t = doc.terrain[tile.ty]?.[tile.tx] ?? "—";
    const lanes = doc.lanes.filter((l) => pathCells(l.waypoints).some(([x, y]) => x === tile.tx && y === tile.ty)).map((l) => l.id);
    const elevated = t === "HIGH_GROUND" || hasBridge(doc, tile.tx, tile.ty);
    return (
      <div>
        TILE X {tile.tx} Y {tile.ty}
        <div>TERRAIN {t}</div>
        <div>SURFACE {elevated ? "HIGH" : "GROUND"}</div>
        <div>HIGH GROUND {t === "HIGH_GROUND" ? "YES" : "NO"}</div>
        <div>BRIDGE {hasBridge(doc, tile.tx, tile.ty) ? "YES" : "NO"}</div>
        <div>LANES {lanes.join(", ") || "—"}</div>
      </div>
    );
  }
  return <div className="text-muted-foreground">Hover or select a tile.</div>;
}

function LosProbeInspector({
  map,
  probe,
  laneId,
  pathSweep,
  customHit,
  onSetOriginSurface,
  onSetTargetSurface,
}: {
  map: GameMap;
  probe: LosProbeState;
  laneId: string;
  pathSweep: PathSweepResult;
  customHit: LosHit | null;
  onSetOriginSurface: (surface: SurfaceLevel) => void;
  onSetTargetSurface: (surface: SurfaceLevel) => void;
}) {
  const originSurfaces = probe.origin ? probeSurfacesAt(map, probe.origin.tx, probe.origin.ty) : [];
  const targetSurfaces = probe.customTarget ? probeSurfacesAt(map, probe.customTarget.tx, probe.customTarget.ty) : [];
  const activeIdx = probe.selectedSampleIndex ?? probe.hoverSampleIndex;
  const sample =
    probe.mode === "PATH" && activeIdx != null && activeIdx >= 0 && activeIdx < pathSweep.results.length
      ? pathSweep.results[activeIdx]
      : null;

  return (
    <div className="w-full space-y-1">
      <div>LANE {laneId}</div>
      <div>RANGE UNLIMITED · VISIBILITY ONLY</div>
      {probe.origin ? (
        <div>{formatOriginLine(map, probe.origin)}</div>
      ) : (
        <div className="text-muted-foreground">ORIGIN: click the map</div>
      )}
      {originSurfaces.length > 1 && probe.origin && (
        <div className="flex flex-wrap gap-1">
          {originSurfaces.map((surface) => (
            <Chip
              key={surface}
              active={probe.origin?.surface === surface}
              onClick={() => onSetOriginSurface(surface)}
            >
              ORIGIN {displaySurface(surface)}
            </Chip>
          ))}
        </div>
      )}
      {probe.mode === "PATH" && (
        <div>
          {probe.origin
            ? formatPathLosSummary(pathSweep.visible, pathSweep.results.length)
            : "PATH LOS: —"}
        </div>
      )}
      {probe.mode === "CUSTOM" && probe.customTarget && (
        <>
          <div>
            TARGET: ({probe.customTarget.tx},{probe.customTarget.ty}) · {displaySurface(probe.customTarget.surface)} ·{" "}
            {probeKindLabel(map, probe.customTarget.tx, probe.customTarget.ty, probe.customTarget.surface)}
          </div>
          {targetSurfaces.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {targetSurfaces.map((surface) => (
                <Chip
                  key={surface}
                  active={probe.customTarget?.surface === surface}
                  onClick={() => onSetTargetSurface(surface)}
                >
                  TARGET {displaySurface(surface)}
                </Chip>
              ))}
            </div>
          )}
        </>
      )}
      {probe.mode === "CUSTOM" && probe.origin && !probe.customTarget && (
        <div className="text-muted-foreground">Click a second tile for the custom target.</div>
      )}
      {probe.mode === "PATH" && sample && probe.origin && (
        <div>
          <div>{formatProbeBlocker(sample.hit)}</div>
          <div>
            SRC {displaySurface(probe.origin.surface)} · {probeKindLabel(map, probe.origin.tx, probe.origin.ty, probe.origin.surface)}
          </div>
          <div>
            TGT {displaySurface(sample.surface)} · PATH
          </div>
        </div>
      )}
      {probe.mode === "CUSTOM" && customHit && probe.origin && probe.customTarget && (
        <div>
          <div>{formatProbeBlocker(customHit)}</div>
          <div>
            SRC {displaySurface(probe.origin.surface)} · {probeKindLabel(map, probe.origin.tx, probe.origin.ty, probe.origin.surface)}
          </div>
          <div>
            TGT {displaySurface(probe.customTarget.surface)} ·{" "}
            {probeKindLabel(map, probe.customTarget.tx, probe.customTarget.ty, probe.customTarget.surface)}
          </div>
        </div>
      )}
    </div>
  );
}
