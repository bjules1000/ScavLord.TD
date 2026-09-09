/** The camp hub's interactive stations. Shared by the map editor (authoring) and the runtime hub. */
export const HUB_ACTIONS = ["supplies", "region", "gear", "skills", "radio"] as const;
export type HubAction = (typeof HUB_ACTIONS)[number];
