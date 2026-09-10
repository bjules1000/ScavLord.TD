/**
 * Composited player/scav cosmetic preview. Canvas-backed (not DOM <img> layering) since
 * recoloring needs per-pixel access — see cosmeticRender.ts for the actual draw/recolor.
 */

import { useEffect, useRef, useState } from "react";
import { COSMETIC_FIGURE, type CosmeticLoadout } from "./cosmetics";
import { drawCosmeticFigure } from "./cosmeticRender";

export default function CosmeticFigure({
  loadout,
  scale = 4,
  className = "",
}: {
  loadout: CosmeticLoadout;
  scale?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, bump] = useState(0);
  const intScale = Math.max(1, Math.round(scale));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawCosmeticFigure(ctx, loadout, () => bump((n) => n + 1));
  });

  return (
    <canvas
      ref={canvasRef}
      width={COSMETIC_FIGURE.width}
      height={COSMETIC_FIGURE.height}
      className={className}
      style={{
        width: COSMETIC_FIGURE.width * intScale,
        height: COSMETIC_FIGURE.height * intScale,
        imageRendering: "pixelated",
      }}
    />
  );
}
