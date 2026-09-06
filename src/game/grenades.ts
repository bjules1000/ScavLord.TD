export type GrenadeKind = "frag" | "smoke" | "impact" | "flash" | "stun";

export type GrenadeDef = {
  kind: GrenadeKind;
  itemId: string;
  label: string;
  range: number;
  radius: number;
  fuseSeconds: number;
  damage: number;
  duration?: number;
  color: string;
};

export const GRENADE_DEFS: Record<GrenadeKind, GrenadeDef> = {
  frag: { kind: "frag", itemId: "g_frag", label: "FRAG", range: 220, radius: 72, fuseSeconds: 0.8, damage: 90, color: "#6f7b52" },
  smoke: { kind: "smoke", itemId: "g_smoke", label: "SMOKE", range: 220, radius: 86, fuseSeconds: 0.8, damage: 0, duration: 8, color: "#a4a99d" },
  impact: { kind: "impact", itemId: "g_impact", label: "IMPACT", range: 190, radius: 58, fuseSeconds: 0.35, damage: 72, color: "#7a6848" },
  flash: { kind: "flash", itemId: "g_flash", label: "FLASH", range: 220, radius: 100, fuseSeconds: 0.7, damage: 0, duration: 3.5, color: "#d7d1b2" },
  stun: { kind: "stun", itemId: "g_stun", label: "STUN", range: 200, radius: 78, fuseSeconds: 0.65, damage: 12, duration: 2.25, color: "#4f5960" },
};

export const FRAG_ITEM_ID = GRENADE_DEFS.frag.itemId;
export const FRAG_RANGE = GRENADE_DEFS.frag.range;
export const FRAG_RADIUS = GRENADE_DEFS.frag.radius;
export const FRAG_DAMAGE = GRENADE_DEFS.frag.damage;
export const FRAG_FUSE_SECONDS = GRENADE_DEFS.frag.fuseSeconds;

export function consumeGrenadeItem<T extends { id: string }>(items: T[], kind: GrenadeKind): T | null {
  const index = items.findIndex((item) => item.id === GRENADE_DEFS[kind].itemId);
  if (index < 0) return null;
  return items.splice(index, 1)[0] ?? null;
}

export const consumeFragItem = <T extends { id: string }>(items: T[]) => consumeGrenadeItem(items, "frag");

export type Grenade = {
  id: number;
  shooterId: number;
  kind: GrenadeKind;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  fuse: number;
};
export type FragGrenade = Grenade;

export function clampGrenadeTarget(kind: GrenadeKind, origin: { x: number; y: number }, point: { x: number; y: number }) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const range = GRENADE_DEFS[kind].range;
  if (distance <= range || distance === 0) return { x: point.x, y: point.y };
  return { x: origin.x + (dx / distance) * range, y: origin.y + (dy / distance) * range };
}

export const clampFragTarget = (origin: { x: number; y: number }, point: { x: number; y: number }) => clampGrenadeTarget("frag", origin, point);

export function spawnGrenade(id: number, shooterId: number, kind: GrenadeKind, origin: { x: number; y: number }, point: { x: number; y: number }): Grenade {
  const def = GRENADE_DEFS[kind];
  const target = clampGrenadeTarget(kind, origin, point);
  return { id, shooterId, kind, x: origin.x, y: origin.y, targetX: target.x, targetY: target.y, fuse: def.fuseSeconds };
}

export const spawnFragGrenade = (id: number, shooterId: number, origin: { x: number; y: number }, point: { x: number; y: number }) => spawnGrenade(id, shooterId, "frag", origin, point);

export function tickGrenade(g: Grenade, dt: number): boolean {
  const total = GRENADE_DEFS[g.kind].fuseSeconds;
  g.fuse = Math.max(0, g.fuse - dt);
  const progress = 1 - g.fuse / total;
  g.x += (g.targetX - g.x) * Math.min(1, progress * 0.35 + dt * 5);
  g.y += (g.targetY - g.y) * Math.min(1, progress * 0.35 + dt * 5);
  if (g.fuse === 0) { g.x = g.targetX; g.y = g.targetY; return true; }
  return false;
}
export const tickFragGrenade = tickGrenade;

export function grenadeDamageAt(kind: GrenadeKind, distance: number): number {
  const def = GRENADE_DEFS[kind];
  if (distance > def.radius) return 0;
  return def.damage * (1 - (distance / def.radius) * 0.5);
}
export const fragDamageAt = (distance: number) => grenadeDamageAt("frag", distance);

export type GrenadeCloud = { id: number; kind: "smoke"; x: number; y: number; radius: number; left: number };

export function smokeBlocksSight(clouds: readonly GrenadeCloud[], a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  return clouds.some((cloud) => {
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((cloud.x - a.x) * dx + (cloud.y - a.y) * dy) / lenSq));
    return Math.hypot(cloud.x - (a.x + dx * t), cloud.y - (a.y + dy * t)) <= cloud.radius;
  });
}
