/** Percent boxes relative to public/game/hub/camp-base.png (1448×1086). Tune here, not in JSX. */

export const CAMP_IMAGE_SRC = "/game/hub/camp-base.png";
export const CAMP_IMAGE_W = 1448;
export const CAMP_IMAGE_H = 1086;

export type HubAction = "supplies" | "region" | "gear" | "skills";
export type HubStationId = HubAction | "radio";

export interface HubHotspot {
  id: HubStationId;
  label: string;
  /** Left edge, 0–100 of the camp image. */
  xPercent: number;
  /** Top edge, 0–100 of the camp image. */
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  enabled: boolean;
  action?: HubAction;
}

/**
 * Rectangular hit areas over objects in camp-base.png.
 * Values are image-relative percentages (not viewport).
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
  },
];
