import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { TILE } from "../data";
import { MAP_BY_ID, MAP_DEFS } from "../map";
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
import { EDITOR_GUTTER, canvasPixelSize, EDGE_LABEL, hitLanePort, portEdgeFromCursor } from "./ports";
import {
  isAuthoringTool,
  isGameplayEraseMode,
  isInspectMode,
  isPathMode,
  isPropEraseMode,
  isPropPlaceMode,
  isTerrainEraserMode,
  isTerrainPaintMode,
  selectGameplayEraser,
  selectPathTool,
  selectPropEraser,
  selectPropTool,
  selectTerrainTool,
  type EditorTool,
} from "./tools";
import type { EditorMapDoc, TerrainKind } from "./schema";
import { CHECKPOINT_TYPES, COVER_TYPES, GATE_IDS, PROP_TYPES } from "./schema";
import { canLock, validateMap } from "./validate";
import { lockDoc } from "./document";

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

  useEffect(() => {
    if (!doc.lanes.some((l) => l.id === laneId)) setLaneId(doc.lanes[0]?.id ?? "MAIN");
  }, [doc.lanes, laneId]);

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
      hover && (tool.id === "edge" || tool.id === "gate")
        ? edgeFromCursor(hover.localX, hover.localY)
        : undefined;
    let ghost: string | null = null;
    let invalid = false;
    let ghostItem: "prop" | "cover" | "crate" | "checkpoint" | "spawn" | "end" | "erase" | "path" | null = null;
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
    drawEditorMap(
      ctx,
      doc,
      layers,
      hover
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
          }
        : null,
      laneId,
    );
  }, [doc, layers, hover, tool, laneId]);

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
    if (isInspectMode(tool)) {
      setSelected(hitObject(doc, cell.tx, cell.ty));
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
            <Section title="TOOLS">
              <Chip active={tool.id === "select"} onClick={() => setTool({ id: "select" })}>
                SELECT
              </Chip>
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
            <Section title="INSPECTOR">
              <Inspector doc={doc} selected={selected} hover={hover} />
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
}: {
  doc: EditorMapDoc;
  selected: { kind: string; id: string } | null;
  hover: { tx: number; ty: number } | null;
}) {
  const tile = selected?.kind === "tile" && selected.id.includes(",")
    ? { tx: Number(selected.id.split(",")[0]), ty: Number(selected.id.split(",")[1]) }
    : hover;
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
    return (
      <div>
        TILE X {tile.tx} Y {tile.ty}
        <div>TERRAIN {t}</div>
        <div>HIGH GROUND {t === "HIGH_GROUND" ? "YES" : "NO"}</div>
        <div>LANES {lanes.join(", ") || "—"}</div>
      </div>
    );
  }
  return <div className="text-muted-foreground">Hover or select a tile.</div>;
}
