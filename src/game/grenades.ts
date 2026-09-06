import { effectiveGrenade } from "./dev/balance";
import { GRENADE_DEFS, type GrenadeKind } from "./grenadeDefs";
export { GRENADE_DEFS } from "./grenadeDefs";
export type { GrenadeDef, GrenadeKind } from "./grenadeDefs";

export function grenadeDef(kind: GrenadeKind) {
  return effectiveGrenade(kind) ?? GRENADE_DEFS[kind];
}

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
  const range = grenadeDef(kind).range;
  if (distance <= range || distance === 0) return { x: point.x, y: point.y };
  return { x: origin.x + (dx / distance) * range, y: origin.y + (dy / distance) * range };
}

export const clampFragTarget = (origin: { x: number; y: number }, point: { x: number; y: number }) => clampGrenadeTarget("frag", origin, point);

export function spawnGrenade(id: number, shooterId: number, kind: GrenadeKind, origin: { x: number; y: number }, point: { x: number; y: number }): Grenade {
  const def = grenadeDef(kind);
  const target = clampGrenadeTarget(kind, origin, point);
  return { id, shooterId, kind, x: origin.x, y: origin.y, targetX: target.x, targetY: target.y, fuse: def.fuseSeconds };
}

export const spawnFragGrenade = (id: number, shooterId: number, origin: { x: number; y: number }, point: { x: number; y: number }) => spawnGrenade(id, shooterId, "frag", origin, point);

export function tickGrenade(g: Grenade, dt: number): boolean {
  const total = grenadeDef(g.kind).fuseSeconds;
  g.fuse = Math.max(0, g.fuse - dt);
  const progress = 1 - g.fuse / total;
  g.x += (g.targetX - g.x) * Math.min(1, progress * 0.35 + dt * 5);
  g.y += (g.targetY - g.y) * Math.min(1, progress * 0.35 + dt * 5);
  if (g.fuse === 0) { g.x = g.targetX; g.y = g.targetY; return true; }
  return false;
}
export const tickFragGrenade = tickGrenade;

export function grenadeDamageAt(kind: GrenadeKind, distance: number): number {
  const def = grenadeDef(kind);
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
