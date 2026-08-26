/** Percent boxes relative to public/game/hub/camp-base.png (1448×1086). Tune here, not in JSX. */

export const CAMP_IMAGE_SRC = "/game/hub/camp-base.png";
export const CAMP_IMAGE_W = 1448;
export const CAMP_IMAGE_H = 1086;

export type HubAction = "stash" | "region" | "market" | "gear" | "skills";

export interface HubHotspot {
  id: HubAction;
  label: string;
  /** Left edge, 0–100 of the camp image. */
  xPercent: number;
  /** Top edge, 0–100 of the camp image. */
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  action: HubAction;
}

/**
 * Rectangular hit areas over objects in camp-base.png.
 * Values are image-relative percentages (not viewport).
 *
 * stash        — crate/barrel pile left of the tent
 * region       — paper map on the workbench
 * market       — portable radio on the workbench
 * gear         — pack / armor on the right of the table
 * skills       — seated ScavLord
 *
 * Rear left/right forest is intentionally empty (future systems).
 */
export const HUB_HOTSPOTS: HubHotspot[] = [
  {
    id: "stash",
    label: "STASH",
    xPercent: 6,
    yPercent: 52,
    widthPercent: 26,
    heightPercent: 26,
    action: "stash",
  },
  {
    id: "skills",
    label: "SCAVLORD",
    xPercent: 47,
    yPercent: 40,
    widthPercent: 16,
    heightPercent: 32,
    action: "skills",
  },
  {
    id: "region",
    label: "DESTINATIONS",
    xPercent: 62,
    yPercent: 53,
    widthPercent: 16,
    heightPercent: 11,
    action: "region",
  },
  {
    id: "market",
    label: "BLACK MARKET",
    xPercent: 67,
    yPercent: 43,
    widthPercent: 11,
    heightPercent: 10,
    action: "market",
  },
  {
    id: "gear",
    label: "EQUIPMENT",
    xPercent: 79,
    yPercent: 46,
    widthPercent: 16,
    heightPercent: 22,
    action: "gear",
  },
];
