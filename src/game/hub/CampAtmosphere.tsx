import { useEffect, useState } from "react";
import {
  atmosphereFrameIndex,
  atmosphereLayersToRender,
  shouldRenderAtmosphere,
  type AtmosphereLayer,
} from "./animate";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

function useSequenceStep(intervalMs: number, paused: boolean): number {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (paused) {
      setStep(0);
      return;
    }
    const id = window.setInterval(() => setStep((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, paused]);

  return paused ? 0 : step;
}

function LayerSprite({ layer, reducedMotion }: { layer: AtmosphereLayer; reducedMotion: boolean }) {
  const step = useSequenceStep(layer.intervalMs, reducedMotion);
  const frame = atmosphereFrameIndex(layer.sequence, step, reducedMotion);
  const src = layer.frames[frame] ?? layer.frames[0] ?? "";
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="pointer-events-none absolute select-none"
      style={{
        left: `${layer.box.xPercent}%`,
        top: `${layer.box.yPercent}%`,
        width: `${layer.box.widthPercent}%`,
        height: `${layer.box.heightPercent}%`,
        imageRendering: "pixelated",
        zIndex: layer.zIndex,
      }}
    />
  );
}

/** Presentation-only camp sprites. Does not persist. Continues under station overlays. */
export default function CampAtmosphere({ reducedMotion }: { reducedMotion: boolean }) {
  if (!shouldRenderAtmosphere(reducedMotion)) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden>
      {atmosphereLayersToRender(reducedMotion).map((layer) => (
        <LayerSprite key={layer.id} layer={layer} reducedMotion={reducedMotion} />
      ))}
    </div>
  );
}
