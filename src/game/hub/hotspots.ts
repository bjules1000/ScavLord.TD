/** Percent boxes relative to public/game/hub/camp-base.png (1448×1086). Tune here, not in JSX. */

export const CAMP_IMAGE_SRC = "/game/hub/camp-base.png";
export const CAMP_IMAGE_W = 1448;
export const CAMP_IMAGE_H = 1086;

export type HubAction = "supplies" | "region" | "gear" | "skills";
export type HubStationId = HubAction | "radio";

/** Visual cue region as % of the interaction box — not the hitbox itself. */
export interface HubCue {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Station label origin as % of the interaction box. */
export interface HubLabelPos {
  x: number;
  y: number;
  side: "above" | "below";
}

export interface HubHotspot {
  id: HubStationId;
  label: string;
  /** Left edge, 0–100 of the camp image. Interaction geometry. */
  xPercent: number;
  /** Top edge, 0–100 of the camp image. Interaction geometry. */
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  enabled: boolean;
  action?: HubAction;
  /** Localized glow region inside the hitbox. Omitted for reserved stations. */
  cue?: HubCue;
  /** Label anchor inside the hitbox. Omitted for reserved stations. */
  labelPos?: HubLabelPos;
}

/**
 * Rectangular hit areas over objects in camp-base.png.
 * Values are image-relative percentages (not viewport).
 *
 * Interaction geometry (x/y/w/h) is independent of cue/label presentation.
 *
 * supplies     — crate/barrel pile left of the tent → Stash + Black Market
 * region       — paper map on the workbench → Destinations / Deploy
 * radio        — portable radio on the workbench (reserved: Contacts / Acolytes)
 * gear         — pack / armor on the right of the table → Equipment / Raid Prep
 * skills       — seated ScavLord → Skills / Operator / Quests
 *
 * Rear left/right forest is intentionally empty (future systems).
 */
export const HUB_HOTSPOTS: HubHotspot[] = [
  {
    id: "supplies",
    label: "SUPPLIES",
    xPercent: 6,
    yPercent: 52,
    widthPercent: 26,
    heightPercent: 26,
    enabled: true,
    action: "supplies",
    cue: { x: 22, y: 28, w: 48, h: 50 },
    labelPos: { x: 46, y: 16, side: "above" },
  },
  {
    id: "skills",
    label: "SCAVLORD",
    xPercent: 47,
    yPercent: 40,
    widthPercent: 16,
    heightPercent: 32,
    enabled: true,
    action: "skills",
    cue: { x: 22, y: 14, w: 56, h: 62 },
    labelPos: { x: 50, y: 6, side: "above" },
  },
  {
    id: "region",
    label: "DESTINATIONS",
    xPercent: 62,
    yPercent: 53,
    widthPercent: 16,
    heightPercent: 11,
    enabled: true,
    action: "region",
    cue: { x: 16, y: 10, w: 68, h: 78 },
    labelPos: { x: 50, y: 4, side: "above" },
  },
  {
    id: "radio",
    label: "RESERVED",
    xPercent: 67,
    yPercent: 43,
    widthPercent: 11,
    heightPercent: 10,
    enabled: false,
  },
  {
    id: "gear",
    label: "EQUIPMENT",
    xPercent: 79,
    yPercent: 46,
    widthPercent: 16,
    heightPercent: 22,
    enabled: true,
    action: "gear",
    cue: { x: 20, y: 22, w: 60, h: 56 },
    labelPos: { x: 50, y: 8, side: "above" },
  },
];
