export const FRAG_ITEM_ID = "g_frag";
export const FRAG_RANGE = 220;
export const FRAG_RADIUS = 72;
export const FRAG_DAMAGE = 90;
export const FRAG_FUSE_SECONDS = 0.8;

export function consumeFragItem<T extends { id: string }>(items: T[]): T | null {
  const index = items.findIndex((item) => item.id === FRAG_ITEM_ID);
  if (index < 0) return null;
  return items.splice(index, 1)[0] ?? null;
}

export type FragGrenade = {
  id: number;
  shooterId: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  fuse: number;
};

export function clampFragTarget(origin: { x: number; y: number }, point: { x: number; y: number }) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= FRAG_RANGE || distance === 0) return { x: point.x, y: point.y };
  return { x: origin.x + (dx / distance) * FRAG_RANGE, y: origin.y + (dy / distance) * FRAG_RANGE };
}

export function spawnFragGrenade(
  id: number,
  shooterId: number,
  origin: { x: number; y: number },
  point: { x: number; y: number },
): FragGrenade {
  const target = clampFragTarget(origin, point);
  return {
    id,
    shooterId,
    x: origin.x,
    y: origin.y,
    targetX: target.x,
    targetY: target.y,
    fuse: FRAG_FUSE_SECONDS,
  };
}

export function tickFragGrenade(g: FragGrenade, dt: number): boolean {
  g.fuse = Math.max(0, g.fuse - dt);
  const progress = 1 - g.fuse / FRAG_FUSE_SECONDS;
  g.x += (g.targetX - g.x) * Math.min(1, progress * 0.35 + dt * 5);
  g.y += (g.targetY - g.y) * Math.min(1, progress * 0.35 + dt * 5);
  if (g.fuse === 0) {
    g.x = g.targetX;
    g.y = g.targetY;
    return true;
  }
  return false;
}

export function fragDamageAt(distance: number): number {
  if (distance > FRAG_RADIUS) return 0;
  return FRAG_DAMAGE * (1 - (distance / FRAG_RADIUS) * 0.5);
}
