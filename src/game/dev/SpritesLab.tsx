import { useEffect, useMemo, useRef, useState } from "react";
import {
  applySpriteOverride,
  clearSpriteOverride,
  drawGear,
  drawSprite,
  floorImage,
  spriteLabCatalog,
  spriteOverrideData,
  type SpriteLabEntry,
  type SpriteSheetName,
} from "../sprites";

const SHEETS: Array<"ALL" | SpriteSheetName> = ["ALL", "atlas", "gear", "floor"];

function SpritePreview({
  entry,
  revision,
  large = false,
}: {
  entry: SpriteLabEntry;
  revision: number;
  large?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let stopped = false;
    let attempts = 0;
    const paint = () => {
      if (stopped) return;
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#171a16";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const cell = 12;
      ctx.fillStyle = "#222820";
      for (let y = 0; y < canvas.height; y += cell)
        for (let x = 0; x < canvas.width; x += cell) {
          if ((x / cell + y / cell) % 2 === 0) ctx.fillRect(x, y, cell, cell);
        }
      let ready = false;
      const pad = large ? 26 : 10;
      if (entry.sheet === "atlas") {
        ready = drawSprite(
          ctx,
          entry.name as Parameters<typeof drawSprite>[1],
          pad,
          pad,
          canvas.width - pad * 2,
          canvas.height - pad * 2,
          { anchor: "center" },
        );
      } else if (entry.sheet === "gear") {
        ready = drawGear(
          ctx,
          entry.name as Parameters<typeof drawGear>[1],
          canvas.width / 2,
          canvas.height / 2,
          canvas.width - pad * 2,
          { anchor: "center" },
        );
      } else {
        const img = floorImage();
        if (img) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, pad, pad, canvas.width - pad * 2, canvas.height - pad * 2);
          ready = true;
        }
      }
      if (!ready && attempts++ < 30) window.setTimeout(paint, 60);
    };
    paint();
    return () => {
      stopped = true;
    };
  }, [entry, revision, large]);

  const size = large ? 320 : 112;
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="h-full w-full [image-rendering:pixelated]"
    />
  );
}

function readPng(file: File): Promise<string> {
  if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
    return Promise.reject(new Error("Choose a PNG file."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read that PNG."));
    reader.onerror = () => reject(new Error("Could not read that PNG."));
    reader.readAsDataURL(file);
  });
}

export default function SpritesLab({
  enabled,
  onClose,
  onApplied,
}: {
  enabled: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const catalog = useMemo(spriteLabCatalog, []);
  const [sheet, setSheet] = useState<(typeof SHEETS)[number]>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SpriteLabEntry>(catalog[0]!);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);

  if (!enabled) return null;
  const visible = catalog.filter(
    (entry) =>
      (sheet === "ALL" || entry.sheet === sheet) &&
      entry.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const replaced = catalog.filter((entry) => spriteOverrideData(entry.sheet, entry.name)).length;

  const chooseFile = async (file?: File) => {
    if (!file) return;
    try {
      setPending(await readPng(file));
      setPendingName(file.name);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read that PNG.");
    }
  };

  const apply = async () => {
    if (!pending) return;
    try {
      await applySpriteOverride(selected.sheet, selected.name, pending);
      setPending(null);
      setPendingName("");
      setMessage(`${selected.name} is now live and saved in this browser.`);
      setRevision((n) => n + 1);
      onApplied();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply that PNG.");
    }
  };

  const reset = () => {
    clearSpriteOverride(selected.sheet, selected.name);
    setPending(null);
    setPendingName("");
    setMessage(`${selected.name} restored to the bundled placeholder.`);
    setRevision((n) => n + 1);
    onApplied();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/92 p-1 backdrop-blur-[2px] sm:p-2">
      <div className="pixel-card flex h-[94vh] w-[96vw] max-h-[94vh] max-w-[96vw] flex-col overflow-hidden p-3 sm:p-4">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border pb-3">
          <div>
            <div className="font-display text-sm text-primary sm:text-base">SPRITES LAB</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              Browse live placeholders · import PNG replacements · saved locally
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="pixel-chip font-mono text-[11px] text-primary">
              REPLACED {replaced}
            </span>
            <button type="button" className="pixel-btn px-3 py-2 text-[10px]" onClick={onClose}>
              CLOSE
            </button>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap gap-2">
          {SHEETS.map((value) => (
            <button
              key={value}
              type="button"
              className={`pixel-btn px-3 py-2 text-[10px] ${sheet === value ? "pixel-btn-primary" : "text-muted-foreground"}`}
              onClick={() => setSheet(value)}
            >
              {value}
            </button>
          ))}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="SEARCH SPRITES"
            className="min-w-[14rem] flex-1 border-2 border-border bg-background px-3 py-2 font-mono text-sm"
          />
        </div>

        <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.45fr)]">
          <div className="grid min-h-0 grid-cols-2 content-start gap-2 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-5">
            {visible.map((entry) => {
              const active = entry.sheet === selected.sheet && entry.name === selected.name;
              const modified = !!spriteOverrideData(entry.sheet, entry.name);
              return (
                <button
                  key={`${entry.sheet}:${entry.name}`}
                  type="button"
                  onClick={() => {
                    setSelected(entry);
                    setPending(null);
                    setPendingName("");
                    setMessage("");
                  }}
                  className={`overflow-hidden border-2 p-2 text-left ${active ? "border-primary bg-primary/10" : "border-border bg-background/50"}`}
                >
                  <div className="aspect-square">
                    <SpritePreview entry={entry} revision={revision} />
                  </div>
                  <div className="mt-2 truncate font-display text-[9px] text-foreground">
                    {entry.name.toUpperCase()}
                  </div>
                  <div className="mt-1 font-mono text-[9px] text-muted-foreground">
                    {entry.sheet.toUpperCase()} · {entry.width}×{entry.height}
                    {modified ? " · LIVE PNG" : ""}
                  </div>
                </button>
              );
            })}
          </div>

          <aside className="min-h-0 overflow-y-auto border-2 border-border bg-background/60 p-3">
            <div className="font-display text-sm text-primary">{selected.name.toUpperCase()}</div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
              {selected.sheet.toUpperCase()} SLOT · ORIGINAL {selected.width}×{selected.height}
            </div>
            <div className="mt-3 aspect-square max-h-[42vh] overflow-hidden border-2 border-border">
              {pending ? (
                <img
                  src={pending}
                  alt={`Imported preview for ${selected.name}`}
                  className="h-full w-full object-contain [image-rendering:pixelated]"
                />
              ) : (
                <SpritePreview entry={selected} revision={revision} large />
              )}
            </div>
            <label className="pixel-btn mt-3 block cursor-pointer px-3 py-3 text-center text-[10px]">
              IMPORT PNG
              <input
                type="file"
                accept="image/png,.png"
                className="hidden"
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
            </label>
            {pendingName && (
              <div className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
                PREVIEW: {pendingName}
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!pending}
                className="pixel-btn pixel-btn-primary px-3 py-3 text-[10px] disabled:opacity-40"
                onClick={() => void apply()}
              >
                APPLY TO GAME
              </button>
              <button
                type="button"
                disabled={!spriteOverrideData(selected.sheet, selected.name)}
                className="pixel-btn px-3 py-3 text-[10px] disabled:opacity-40"
                onClick={reset}
              >
                RESTORE OLD
              </button>
            </div>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
              PNG replacements persist in this browser and are used by live game rendering. They do
              not overwrite files in the repository.
            </p>
            {message && (
              <div className="mt-3 border-2 border-border p-2 font-mono text-[10px] text-primary">
                {message}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
