/**
 * Presentation policy for boundary-port markers.
 * Logical spawn/endpoint data is unchanged; this only controls visibility.
 */
export type LanePortSurface = "raid" | "builder" | "debug";
export type LanePortKind = "spawn" | "endpoint";

/** Raw S/E pads are authoring/debug chrome, not player-facing raid art. */
export function showLanePortMarkers(surface: LanePortSurface): boolean {
  return surface === "builder" || surface === "debug";
}

/** Raid bake uses this. Pass `true` only from a debug overlay. */
export function shouldDrawLanePortMarkers(surface: LanePortSurface, override?: boolean): boolean {
  if (override !== undefined) return override;
  return showLanePortMarkers(surface);
}

export function raidRendersLanePortMarker(_kind: LanePortKind): boolean {
  return showLanePortMarkers("raid");
}

/** Hidden raid markers have no hitbox. Builder/debug markers stay selectable in those UIs. */
export function lanePortHasPointerTarget(surface: LanePortSurface): boolean {
  return showLanePortMarkers(surface);
}
