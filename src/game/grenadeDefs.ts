export type GrenadeKind = "frag" | "smoke" | "impact" | "flash" | "stun";

export type GrenadeDef = {
  kind: GrenadeKind;
  itemId: string;
  name: string;
  label: string;
  range: number;
  radius: number;
  fuseSeconds: number;
  damage: number;
  duration?: number;
  color: string;
};

export const GRENADE_DEFS: Record<GrenadeKind, GrenadeDef> = {
  frag: { kind: "frag", itemId: "g_frag", name: "FRAG GRENADE", label: "FRAG", range: 220, radius: 72, fuseSeconds: 0.8, damage: 90, color: "#6f7b52" },
  smoke: { kind: "smoke", itemId: "g_smoke", name: "SMOKE GRENADE", label: "SMOKE", range: 220, radius: 86, fuseSeconds: 0.8, damage: 0, duration: 8, color: "#a4a99d" },
  impact: { kind: "impact", itemId: "g_impact", name: "IMPACT GRENADE", label: "IMPACT", range: 190, radius: 58, fuseSeconds: 0.35, damage: 72, color: "#7a6848" },
  flash: { kind: "flash", itemId: "g_flash", name: "FLASH GRENADE", label: "FLASH", range: 220, radius: 100, fuseSeconds: 0.7, damage: 0, duration: 3.5, color: "#d7d1b2" },
  stun: { kind: "stun", itemId: "g_stun", name: "STUN GRENADE", label: "STUN", range: 200, radius: 78, fuseSeconds: 0.65, damage: 12, duration: 2.25, color: "#4f5960" },
};
