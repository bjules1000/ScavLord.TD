import { COLS, ROWS, SCALE, TILE } from "./data";
import { shouldDrawLanePortMarkers } from "./lanePortsView";
import { extractMarkerCenter, type GameMap } from "./map";
import { ARMORS, WEAPONS } from "./gear";
import type { Enemy, Tower } from "./types";
import { operatorWorldPos } from "./movement";
import { effectiveEnemy } from "./dev/waveLabCore";
import { drawGear, drawSprite, floorImage } from "./sprites";
import type { GearFrameName } from "./sprites";
import type { WeaponClass } from "./gear";
import { obstacleDrawAlpha, type BarricadeEdge } from "./defenses";

/** Map a weapon class to the pixel gun art in the gear atlas. */
function gunFrame(cls: WeaponClass, firing: boolean): GearFrameName {
  const base = cls === "shotgun" || cls === "pistolCarbine" || cls === "launcher" ? "sg" : cls === "lmg" ? "uzi" : "ak";
  return (base + (firing ? "_fire" : "_idle")) as GearFrameName;
}

/** Same art resolution used by drawEnemy — Wave Lab HITBOX must reuse this. */
export function resolveEnemyBodyFrame(kind: Enemy["kind"], walk = false): GearFrameName {
  const def = effectiveEnemy(kind);
  const heavy =
    def.artProfile === "heavy" ||
    (def.artProfile == null &&
      (kind === "raider" || kind === "pmc" || kind === "boss" || String(kind).startsWith("boss_")));
  return `${heavy ? "unk" : "joe"}_${walk ? "2" : "1"}` as GearFrameName;
}

export function resolveEnemyGunFrame(kind: Enemy["kind"], firing = false): GearFrameName {
  const def = effectiveEnemy(kind);
  const profile =
    def.attackProfile ??
    (kind === "sniperScav" ? "sg" : kind === "scav" ? "uzi" : "ak");
  return `${profile}_${firing ? "fire" : "idle"}` as GearFrameName;
}

/** Draw width matching drawEnemy bodyW for collision-art alignment. */
export function enemyBodyDrawWidth(kind: Enemy["kind"], size: number): number {
  return kind === "boss" || String(kind).startsWith("boss_") ? size + 12 : size + 6;
}

function enemyBodyFrame(kind: Enemy["kind"], walk: boolean): GearFrameName {
  return resolveEnemyBodyFrame(kind, walk);
}

function enemyGunFrame(kind: Enemy["kind"], firing: boolean): GearFrameName {
  return resolveEnemyGunFrame(kind, firing);
}


const rnd = (seed: number) => {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

export function drawTerrain(ctx: CanvasRenderingContext2D, map: GameMap, opts?: { lanePorts?: boolean }) {
  // Base terrain only. Suspended bridges are drawn later via drawElevatedSurfaces
  // so LOW entities can pass underneath the deck.
  const pal = map.def.palette;
  const r = rnd(7);
  const cell = TILE / 8;
  const W = COLS * TILE;
  const H = ROWS * TILE;
  const floor = floorImage();
  if (floor) {
    // photographed-dirt base texture, tiled and tinted per location
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const fw = floor.width;
    const fh = floor.height;
    for (let y = 0; y < H; y += fh)
      for (let x = 0; x < W; x += fw) ctx.drawImage(floor, x, y, fw, fh);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = pal.grassB;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // faint pixel noise so it still reads 8-bit
    const rn = rnd(19);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = rn() > 0.5 ? pal.speckLight : pal.speckDark;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(Math.floor(rn() * W), Math.floor(rn() * H), 2, 2);
    }
    ctx.globalAlpha = 1;
  } else {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const n = r();
        ctx.fillStyle = n > 0.7 ? pal.grassA : n > 0.35 ? pal.grassB : pal.grassC;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.fillStyle = n > 0.8 ? pal.speckLight : pal.speckDark;
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(
            x * TILE + Math.floor(r() * 8) * cell,
            y * TILE + Math.floor(r() * 8) * cell,
            cell,
            cell,
          );
        }
      }
    }
  }


  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!map.WATER[y]![x]) continue;
      ctx.fillStyle = "#1a4a6a";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.fillStyle = "#2a6a8a";
      ctx.fillRect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8);
    }
  }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!map.MOUNTAIN[y]![x]) continue;
      ctx.fillStyle = "#3a3c42";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.fillStyle = "#5a5e66";
      ctx.fillRect(x * TILE + 6, y * TILE + 8, TILE - 12, TILE - 16);
    }
  }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!map.HIGH_GROUND[y]![x] || map.MOUNTAIN[y]![x] || map.BLOCKED[y]![x]) continue;
      ctx.fillStyle = "#6a5430";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.fillStyle = "#8a7040";
      ctx.fillRect(x * TILE + 3, y * TILE + 3, TILE - 6, 4);
    }
  }

  // road: mud shoulders + cracked asphalt
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.strokeStyle = pal.roadOuter;
  ctx.lineWidth = 34 * SCALE;
  strokePath(ctx, map);
  ctx.strokeStyle = pal.roadMid;
  ctx.lineWidth = 27 * SCALE;
  strokePath(ctx, map);
  ctx.strokeStyle = pal.roadInner;
  ctx.lineWidth = 20 * SCALE;
  strokePath(ctx, map);
  ctx.strokeStyle = pal.roadLine;
  ctx.lineWidth = 3 * SCALE;
  ctx.setLineDash([8 * SCALE, 14 * SCALE]);
  strokePath(ctx, map);
  ctx.setLineDash([]);

  // gravel speckles on road
  const r2 = rnd(31);
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(r2() * COLS * TILE);
    const y = Math.floor(r2() * ROWS * TILE);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (map.BLOCKED[ty]?.[tx]) {
      ctx.fillStyle = r2() > 0.5 ? "#413a2e" : "#7a6e58";
      ctx.fillRect(x - (x % 2), y - (y % 2), 2, 2);
    }
  }

  // scattered vegetation decals on off-road tiles
  const r3 = rnd(53);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const n = r3();
      const on = map.BLOCKED[ty]?.[tx] || map.WATER[ty]?.[tx] || map.MOUNTAIN[ty]?.[tx] || map.HIGH_GROUND[ty]?.[tx];
      if (on || n > 0.16) continue;
      const name: "grass2" | "grass3" = n < 0.05 ? "grass2" : "grass3";
      const size = TILE * (0.8 + r3() * 0.45);
      drawSprite(ctx, name, tx * TILE - (size - TILE) / 2, ty * TILE - (size - TILE) / 2, size, size, {
        anchor: "center",
        alpha: 0.3 + r3() * 0.25,
      });
    }
  }

  for (const c of map.COVER) drawCover(ctx, c.tx * TILE, c.ty * TILE, c.type);
  for (const p of map.PROPS) drawProp(ctx, p.tx * TILE, p.ty * TILE, p.type);
  for (const c of map.CHECKPOINT) drawCheckpoint(ctx, c.tx * TILE, c.ty * TILE, c.type);

  if (shouldDrawLanePortMarkers("raid", opts?.lanePorts)) drawLanePortMarkers(ctx, map);
}

/** HIGH overlay pass. Drawn after LOW entities so the deck occludes the road underneath. */
export function drawElevatedSurfaces(ctx: CanvasRenderingContext2D, map: GameMap) {
  for (const b of map.def.bridges ?? []) drawRaidBridge(ctx, b.tx, b.ty, b.orientation);
}

/** Dev/debug extract pads. Not used in normal raids. */
export function drawLanePortMarkers(ctx: CanvasRenderingContext2D, map: GameMap) {
  for (const lane of map.lanes) {
    const end = extractMarkerCenter(lane.PIX);
    ctx.save();
    ctx.translate(end[0], end[1]);
    ctx.scale(SCALE, SCALE);
    px(ctx, "#132b18", -16, -18, 32, 36);
    px(ctx, "#1d5c2a", -14, -16, 28, 32);
    px(ctx, "#4dd36a", -14, -16, 28, 4);
    px(ctx, "#4dd36a", -14, 12, 28, 4);
    px(ctx, "#0d1a10", -6, -6, 12, 12);
    px(ctx, "#4dd36a", -4, -4, 8, 8);
    ctx.restore();
  }
}

function drawRaidBridge(ctx: CanvasRenderingContext2D, tx: number, ty: number, orientation: "H" | "V") {
  const x = tx * TILE;
  const y = ty * TILE;
  ctx.fillStyle = "#5a3a18";
  ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
  ctx.fillStyle = "#c9a56a";
  if (orientation === "H") {
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 3, y + 6 + i * 8, TILE - 6, 5);
  } else {
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 6 + i * 8, y + 3, 5, TILE - 6);
  }
  ctx.fillStyle = "#8a6230";
  ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
  ctx.fillRect(x + 2, y + TILE - 4, TILE - 4, 2);
}

/** Player-built barricades sit on a tile edge. Wire stays road-centered. */
export function drawObstacle(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  kind: "barricade" | "wire",
  hpFrac: number,
  level = 1,
  edge: BarricadeEdge = "N",
  look?: { ghost?: boolean; invalid?: boolean },
) {
  const x = tx * TILE;
  const y = ty * TILE;
  ctx.save();
  ctx.globalAlpha = obstacleDrawAlpha(hpFrac, look?.ghost === true);
  const invalid = look?.invalid === true;
  if (kind === "barricade") {
    const thick = 10 + Math.min(6, (level - 1) * 3);
    const shadow = invalid ? "#3a1512" : "#2b2419";
    const body = invalid ? "#8a3a30" : "#6b5a3c";
    const highlight = invalid ? "#c94b3a" : "#8a7449";
    const stitch = invalid ? "#7a3028" : "#5d543c";
    if (edge === "N" || edge === "S") {
      const by = edge === "N" ? y + 2 : y + TILE - thick - 2;
      px(ctx, shadow, x + 3, by + 1, TILE - 6, thick);
      px(ctx, body, x + 3, by, TILE - 6, thick - 2);
      px(ctx, highlight, x + 4, by, TILE - 8, 3);
      px(ctx, stitch, x + 5, by + 4, TILE - 10, 3);
      if (level >= 2) px(ctx, "#776d4e", x + 6, by + 5, TILE - 12, 2);
      if (level >= 3) px(ctx, "#4b5058", x + 6, by + 2, TILE - 12, 4);
    } else {
      const bx = edge === "W" ? x + 2 : x + TILE - thick - 2;
      px(ctx, shadow, bx + 1, y + 3, thick, TILE - 6);
      px(ctx, body, bx, y + 3, thick - 2, TILE - 6);
      px(ctx, highlight, bx, y + 4, 3, TILE - 8);
      px(ctx, stitch, bx + 4, y + 5, 3, TILE - 10);
      if (level >= 2) px(ctx, "#776d4e", bx + 5, y + 6, 2, TILE - 12);
      if (level >= 3) px(ctx, "#4b5058", bx + 2, y + 6, 4, TILE - 12);
    }
  } else {
    px(ctx, "#3a3a33", x + 4, y + TILE / 2 - 2, TILE - 8, 3);
    for (let i = 0; i < 5; i++) {
      const bx = x + 6 + i * ((TILE - 12) / 4);
      px(ctx, "#9a9484", bx, y + TILE / 2 - 6, 2, 11);
      px(ctx, "#9a9484", bx - 2, y + TILE / 2 - 2, 6, 2);
    }
    px(ctx, "#5a5142", x + 4, y + TILE / 2 + 6, TILE - 8, 2);
  }
  ctx.restore();
}


function strokePath(ctx: CanvasRenderingContext2D, map: GameMap) {
  for (const lane of map.lanes) {
    if (!lane.PIX.length) continue;
    ctx.beginPath();
    ctx.moveTo(lane.PIX[0]![0], lane.PIX[0]![1]);
    for (let i = 1; i < lane.PIX.length; i++) ctx.lineTo(lane.PIX[i]![0], lane.PIX[i]![1]);
    ctx.stroke();
  }
}


function px(ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Draw with the 32px art grid scaled up to TILE. */
function scaled(ctx: CanvasRenderingContext2D, x: number, y: number, fn: () => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(SCALE, SCALE);
  fn();
  ctx.restore();
}

export function drawCover(ctx: CanvasRenderingContext2D, x: number, y: number, type: string) {
  if (type !== "full") {
    px(ctx, "#00000055", x + 3, y + TILE - 8, TILE - 6, 5);
    if (drawSprite(ctx, "sandbag_h", x, y + 2, TILE, TILE - 4)) return;
  }
  scaled(ctx, x, y, () => {

    if (type === "full") {
      // concrete jersey barrier / block
      px(ctx, "#1d1e1a", 1, 24, 30, 5);
      px(ctx, "#5b5c55", 2, 6, 28, 20);
      px(ctx, "#767769", 3, 7, 26, 6);
      px(ctx, "#43443e", 3, 19, 26, 6);
      px(ctx, "#2c2d29", 8, 6, 2, 20);
      px(ctx, "#2c2d29", 20, 6, 2, 20);
      px(ctx, "#8b8c7c", 4, 8, 6, 2);
      // rust stains
      px(ctx, "#6a4a2c", 14, 12, 2, 8);
      px(ctx, "#6a4a2c", 25, 10, 2, 6);
    } else {
      // sandbag half-wall
      px(ctx, "#1d1e1a", 1, 25, 30, 4);
      const rows = [20, 14, 8];
      rows.forEach((ry, i) => {
        const off = i % 2 === 0 ? 0 : 4;
        for (let b = 0; b < 3; b++) {
          const bx = 2 + off + b * 9;
          px(ctx, "#5d543c", bx, ry, 8, 6);
          px(ctx, "#776d4e", bx + 1, ry + 1, 6, 2);
          px(ctx, "#413a29", bx, ry + 5, 8, 1);
        }
      });
    }
  });
}

export function drawProp(ctx: CanvasRenderingContext2D, x: number, y: number, type: string) {
  // sprite-based props (fall through to pixel art if the atlas hasn't loaded)
  if (type === "hut" || type === "crate") {
    px(ctx, "#00000050", x + 4, y + TILE - 7, TILE - 8, 5);
    const ok =
      type === "hut"
        ? drawSprite(ctx, "shack", x - TILE * 0.35, y - TILE * 0.55, TILE * 1.7, TILE * 1.6)
        : drawSprite(ctx, "crate_big", x + 2, y, TILE - 4, TILE);
    if (ok) return;
  }
  scaled(ctx, x, y, () => {

    switch (type) {
      case "tree":
        px(ctx, "#3d2b1c", 14, 20, 4, 10);
        px(ctx, "#1c3a1c", 6, 4, 20, 18);
        px(ctx, "#254a22", 8, 6, 16, 12);
        px(ctx, "#315c2b", 10, 8, 8, 5);
        break;
      case "rock":
        px(ctx, "#3f403c", 6, 12, 20, 14);
        px(ctx, "#585953", 8, 10, 14, 8);
        px(ctx, "#242522", 6, 24, 20, 3);
        break;
      case "crate":
        px(ctx, "#4a3720", 4, 8, 24, 20);
        px(ctx, "#6b5230", 6, 10, 20, 16);
        px(ctx, "#332512", 6, 17, 20, 3);
        px(ctx, "#332512", 14, 10, 3, 16);
        px(ctx, "#a8853f", 8, 12, 4, 3);
        break;
      case "barrel":
        px(ctx, "#1f3d30", 9, 6, 14, 22);
        px(ctx, "#325c48", 11, 6, 4, 22);
        px(ctx, "#0f1f18", 9, 12, 14, 3);
        px(ctx, "#0f1f18", 9, 20, 14, 3);
        px(ctx, "#7a3a20", 18, 16, 3, 5);
        break;
      case "truck":
        px(ctx, "#15170f", 5, 3, 22, 27);
        px(ctx, "#4b5637", 6, 4, 20, 25);
        px(ctx, "#5d6a45", 8, 6, 16, 8);
        px(ctx, "#2b3122", 9, 7, 14, 5);
        px(ctx, "#3c452c", 7, 15, 18, 13);
        for (let i = 0; i < 4; i++) px(ctx, "#2f3724", 8, 17 + i * 3, 16, 1);
        px(ctx, "#191a15", 3, 7, 4, 6);
        px(ctx, "#191a15", 25, 7, 4, 6);
        px(ctx, "#191a15", 3, 21, 4, 6);
        px(ctx, "#191a15", 25, 21, 4, 6);
        px(ctx, "#7a3a20", 10, 24, 5, 4);
        break;
      case "tanker":
        px(ctx, "#131410", 3, 2, 26, 29);
        px(ctx, "#6d6a5c", 5, 4, 22, 25);
        px(ctx, "#8b8878", 8, 5, 6, 23);
        px(ctx, "#4a473d", 21, 5, 5, 23);
        px(ctx, "#7a4322", 15, 9, 4, 9);
        px(ctx, "#5c3018", 12, 20, 6, 5);
        px(ctx, "#2a2822", 5, 11, 22, 2);
        px(ctx, "#2a2822", 5, 21, 22, 2);
        px(ctx, "#c9a227", 13, 3, 6, 3);
        px(ctx, "#191a15", 2, 24, 4, 6);
        px(ctx, "#191a15", 26, 24, 4, 6);
        break;
      case "forklift":
        // motorized lift — factory landmark
        px(ctx, "#14150f", 4, 8, 22, 22);
        px(ctx, "#b8860f", 6, 12, 18, 15);
        px(ctx, "#d8a41c", 8, 14, 14, 5);
        px(ctx, "#2a2b23", 9, 20, 12, 6);
        px(ctx, "#5b5a4e", 6, 2, 3, 12);
        px(ctx, "#5b5a4e", 21, 2, 3, 12);
        px(ctx, "#8c8a78", 6, 2, 18, 2);
        px(ctx, "#7a4a12", 10, 6, 10, 3);
        px(ctx, "#111209", 4, 26, 6, 5);
        px(ctx, "#111209", 20, 26, 6, 5);
        break;
      case "office":
        // office passage block — concrete walls + lit window
        px(ctx, "#191b1d", 0, 2, 32, 28);
        px(ctx, "#4b4f52", 2, 4, 28, 24);
        px(ctx, "#5c6165", 2, 4, 28, 3);
        for (let i = 0; i < 3; i++) px(ctx, "#3a3e41", 4 + i * 9, 10, 7, 7);
        for (let i = 0; i < 3; i++) px(ctx, "#8a7a3c", 5 + i * 9, 11, 5, 4);
        px(ctx, "#23262a", 12, 20, 8, 8);
        px(ctx, "#0e1012", 14, 22, 4, 6);
        px(ctx, "#2f3336", 2, 28, 28, 2);
        break;
      case "hut":
        // rusted container-style shack
        px(ctx, "#2b2a26", 1, 9, 30, 21);
        px(ctx, "#3f4a41", 3, 11, 26, 17);
        for (let i = 0; i < 6; i++) px(ctx, "#333c35", 4 + i * 4, 11, 2, 17);
        px(ctx, "#6a4a2c", 5, 20, 4, 7);
        px(ctx, "#151713", 13, 17, 8, 11);
        px(ctx, "#5b5548", 0, 4, 32, 7);
        px(ctx, "#7a725f", 0, 4, 32, 2);
        break;
    }
  });
}

export function drawCheckpoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: string,
) {
  scaled(ctx, x, y, () => {
    if (type === "booth") {
      px(ctx, "#1b1c17", 3, 6, 26, 24);
      px(ctx, "#585141", 5, 8, 22, 20);
      px(ctx, "#6e6754", 5, 8, 22, 3);
      px(ctx, "#141712", 9, 14, 14, 8);
      px(ctx, "#2d3a2c", 10, 15, 12, 6);
      px(ctx, "#c9a227", 6, 24, 20, 2);
      px(ctx, "#7a2f2f", 12, 10, 8, 2);
      px(ctx, "#3f3a2c", 2, 27, 28, 4);
    } else if (type === "post") {
      px(ctx, "#1d1e1a", 4, 22, 24, 4);
      px(ctx, "#5d543c", 4, 16, 10, 6);
      px(ctx, "#776d4e", 5, 17, 8, 2);
      px(ctx, "#5d543c", 16, 16, 10, 6);
      px(ctx, "#776d4e", 17, 17, 8, 2);
      px(ctx, "#5b5c55", 13, 6, 6, 16);
      px(ctx, "#767769", 14, 7, 4, 4);
      px(ctx, "#c9a227", 13, 12, 6, 2);
    } else {
      const vertical = type === "gate2";
      px(ctx, "#2a2b26", vertical ? 13 : 0, vertical ? 0 : 13, vertical ? 6 : 5, vertical ? 5 : 6);
      for (let i = 0; i < 8; i++) {
        const c = i % 2 === 0 ? "#c23b2c" : "#dedad0";
        if (vertical) px(ctx, c, 14, 3 + i * 3.5, 4, 3);
        else px(ctx, c, 3 + i * 3.5, 14, 3, 4);
      }
      px(ctx, "#3f4238", vertical ? 12 : 26, vertical ? 27 : 12, vertical ? 8 : 5, vertical ? 5 : 8);
      px(ctx, "#f0b400", vertical ? 14 : 28, vertical ? 28 : 14, 2, 2);
    }
  });
}

export function drawCrate(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  progress: number,
  opened: boolean,
) {
  const x = tx * TILE;
  const y = ty * TILE;
  px(ctx, "#00000050", x + 5, y + TILE - 7, TILE - 10, 5);
  const drawn = false;
  if (!drawn)
    scaled(ctx, x, y, () => {
      px(ctx, "#14150f", 3, 10, 26, 19);
      px(ctx, opened ? "#3c3226" : "#5c4a2a", 4, 11, 24, 17);
      px(ctx, opened ? "#4a3d2c" : "#7a6234", 6, 13, 20, 6);
      px(ctx, "#2c2314", 6, 20, 20, 3);
      px(ctx, "#c9a227", 12, 22, 8, 3);
      if (opened) px(ctx, "#1a1a14", 8, 12, 16, 5);
    });
  if (!opened) px(ctx, "#f0b400", x + TILE / 2 - 2, y + TILE - 12, 4, 4);

  if (!opened && progress > 0) {
    const w = TILE - 10;
    px(ctx, "#14150f", x + 5, y + 2, w, 5);
    px(ctx, "#f0b400", x + 6, y + 3, (w - 2) * Math.min(1, progress), 3);
  }
}

export function drawDropBag(ctx: CanvasRenderingContext2D, tx: number, ty: number, time: number) {
  const bob = Math.sin(time / 320 + tx) > 0 ? 0 : 1;
  scaled(ctx, tx * TILE, ty * TILE, () => {
    px(ctx, "#00000055", 6, 24, 20, 4);
    px(ctx, "#3a3527", 6, 14 + bob, 20, 11);
    px(ctx, "#4d4633", 7, 15 + bob, 18, 4);
    px(ctx, "#221f16", 12, 14 + bob, 8, 11);
    px(ctx, "#f0b400", 14, 18 + bob, 4, 3);
  });
}

/** Core operator sprite. Drawn in the 32px art grid around (cx, cy) at `scale`. */
export function drawOperator(
  ctx: CanvasRenderingContext2D,
  t: Tower,
  cx: number,
  cy: number,
  scale: number,
  time: number,
  opts: { pad?: boolean; angle?: number } = {},
) {
  const w = WEAPONS[t.weapon] ?? WEAPONS["toz"]!;
  const armor = t.armor ? ARMORS[t.armor] : undefined;
  const lv = Math.min(5, 1 + t.attachments.length + (w.cls === "sniper" || w.cls === "launcher" ? 1 : 0));
  const hurt = t.hurt > 0;
  const angle = opts.angle ?? t.angle;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  if (opts.pad !== false) {
    px(ctx, "#1c1d17", -15, 8, 30, 8);
    px(ctx, "#5d5540", -15, 5, 30, 7);
    px(ctx, "#7a7156", -13, 6, 7, 3);
    px(ctx, "#7a7156", -3, 6, 7, 3);
    px(ctx, "#7a7156", 7, 6, 6, 3);
  }

  const bob = Math.sin(time / 260 + t.id) > 0 ? 0 : 1;
  const body = hurt ? "#ff8d7a" : w.color;
  const y = bob;
  const drewBody = drawGear(ctx, (bob ? "unk_2" : "unk_1") as GearFrameName, 0, -1 + y, 18, {
    anchor: "center",
  });

  if (!drewBody) {
  // legs + boots
  px(ctx, "#22201a", -6, 3 + y, 4, 7);
  px(ctx, "#22201a", 2, 3 + y, 4, 7);
  px(ctx, "#15140f", -7, 9 + y, 5, 3);
  px(ctx, "#15140f", 2, 9 + y, 5, 3);

  // torso
  px(ctx, body, -8, -8 + y, 16, 13);
  px(ctx, "#00000022", -8, 2 + y, 16, 3);

  if (armor) {
    // hard plate carrier over the torso
    px(ctx, armor.plate, -9, -9 + y, 18, 14);
    px(ctx, armor.trim, -9, -9 + y, 18, 2);
    px(ctx, "#00000055", -9, 3 + y, 18, 2);
    px(ctx, armor.trim, -9, -5 + y, 2, 8);
    px(ctx, armor.trim, 7, -5 + y, 2, 8);
    const dur = t.armorHp != null && armor.durability ? t.armorHp / armor.durability : 1;
    if (dur < 0.6) px(ctx, "#8a3a2a", -4, -4 + y, 5, 4);
    if (dur < 0.3) px(ctx, "#5a1f16", 1, 0 + y, 4, 3);
  } else {
    const rigH = 6 + Math.min(3, lv - 1);
    px(ctx, "#2a2e22", -7, -5 + y, 14, rigH);
    px(ctx, "#3a4030", -7, -5 + y, 14, 2);
  }
  px(ctx, w.accent, -6, -3 + y, 3, 3);
  if (lv >= 2) {
    px(ctx, "#1c1f17", -5, -1 + y, 3, 4);
    px(ctx, "#1c1f17", -1, -1 + y, 3, 4);
    px(ctx, "#1c1f17", 3, -1 + y, 3, 4);
  }
  if (lv >= 3) {
    px(ctx, "#3b3a2b", -11, -6 + y, 4, 10);
    px(ctx, "#4c4a37", -11, -6 + y, 4, 3);
  }
  if (lv >= 5) {
    px(ctx, "#4a4f3c", -10, -7 + y, 3, 5);
    px(ctx, "#4a4f3c", 7, -7 + y, 3, 5);
  }

  // head
  px(ctx, "#c9a883", -4, -15 + y, 8, 7);
  if (lv >= 2) px(ctx, "#23261d", -4, -11 + y, 8, 3);
  if (lv >= 4) {
    px(ctx, "#2b3126", -5, -18 + y, 10, 6);
    px(ctx, "#161a13", -5, -12 + y, 10, 2);
    px(ctx, "#6fd6ff", -4, -13 + y, 8, 2);
  } else if (lv >= 3) {
    px(ctx, "#20241b", -5, -17 + y, 10, 5);
    px(ctx, "#151811", -5, -12 + y, 10, 2);
    px(ctx, "#3b4231", 4, -16 + y, 2, 3);
  } else {
    px(ctx, "#20241b", -5, -16 + y, 10, 4);
    px(ctx, "#151811", -5, -12 + y, 10, 2);
  }
  if (lv >= 5) {
    px(ctx, "#2e3327", -3, -20 + y, 6, 3);
    px(ctx, "#7ddc5a", -2, -19 + y, 2, 2);
    px(ctx, "#7ddc5a", 1, -19 + y, 2, 2);
  }
  }
  if (t.pmc) {
    // gold rank chevrons over the shoulder — one per level, capped
    const lvl = Math.min(6, t.level ?? 1);
    for (let i = 0; i < lvl; i++) px(ctx, "#f0b400", -9 + i * 3, -10 + y, 2, 2);
  }
  if (drewBody && hurt) {
    ctx.globalAlpha = 0.45;
    px(ctx, "#ff8d7a", -10, -16, 20, 26);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // weapon
  const len = w.gunLen;
  const has = (id: string) => t.attachments.includes(id);
  ctx.save();
  ctx.translate(cx, cy - 1 * scale);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  const gunArt = gunFrame(w.cls, t.flash > 0);
  const drewGun = drawGear(ctx, gunArt, -3, 1, len + 14);
  if (!drewGun) {
    px(ctx, "#3a3428", 0, -3, 7, 6);
    px(ctx, "#171713", 2, -2, len, 4);
    if (w.cls === "lmg") px(ctx, "#2a2a22", 4, 2, 9, 4);
    if (w.cls === "launcher") px(ctx, "#2b241c", 3, -4, 8, 8);
  }
  if (has("grip")) px(ctx, "#2a2a22", 8, 2, 5, 4);
  if (has("mag")) px(ctx, "#1d1d17", 4, 2, 4, 7);
  if (has("optic") || has("thermal")) {
    px(ctx, "#111", 5, -6, 8, 3);
    px(ctx, has("thermal") ? "#ff7a2f" : "#6fd6ff", 6, -5, 3, 2);
  }
  if (has("laser")) px(ctx, "#c23b2c", 9, -5, 3, 2);
  if (has("supp")) px(ctx, "#20201a", len - 1, -3, 6, 6);
  else if (has("brake")) px(ctx, "#3a3a30", len - 1, -3, 3, 6);
  px(ctx, w.accent, len - 3, -2, 3, 4);
  if (t.flash > 0) {
    px(ctx, "#ffe066", len + 4, -4, 6, 8);
    px(ctx, "#fff6c2", len + 5, -2, 4, 4);
  }
  ctx.restore();
}

export function drawTower(ctx: CanvasRenderingContext2D, t: Tower, time: number) {
  const { x: cx, y: cy } = operatorWorldPos(t);
  drawOperator(ctx, t, cx, cy, SCALE, time);

  // attachment pips
  for (let i = 0; i < t.attachments.length; i++)
    px(ctx, "#f0b400", cx - 9 * SCALE + i * 4 * SCALE, cy + TILE / 2 - 6, 3, 3);

  if (t.pmc) {
    px(ctx, "#f0b400", cx - 3, cy - TILE / 2 - 3, 6, 2);
    px(ctx, "#f0b400", cx - 1, cy - TILE / 2 - 6, 2, 3);
  }

  const bw = 26;
  if (t.hp < t.maxHp) {
    px(ctx, "#140f0d", cx - bw / 2, cy - TILE / 2 + 1, bw, 4);
    px(
      ctx,
      t.hp / t.maxHp > 0.4 ? "#6fd6ff" : "#ff5a3c",
      cx - bw / 2 + 1,
      cy - TILE / 2 + 2,
      (bw - 2) * Math.max(0, t.hp / t.maxHp),
      2,
    );
  }
  const armor = t.armor ? ARMORS[t.armor] : undefined;
  if (armor && t.armorHp != null && t.armorHp > 0) {
    px(ctx, "#140f0d", cx - bw / 2, cy - TILE / 2 + 6, bw, 3);
    px(ctx, armor.trim, cx - bw / 2 + 1, cy - TILE / 2 + 7, (bw - 2) * Math.max(0, Math.min(1, t.armorHp / armor.durability)), 1);
  }
}



export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
  const def = effectiveEnemy(e.kind);
  const x = Math.round(e.x);
  const y = Math.round(e.y);
  const s = def.size;
  const walk = Math.floor(e.step) % 2 === 0 ? 0 : 1;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x - s / 2, y + s / 2 - 1, s, 3);

  const body = e.hitFlash > 0 ? "#ffffff" : def.body;
  const gear = e.hitFlash > 0 ? "#ffd7d7" : def.gear;
  const h = Math.round(s * 0.85);

  // scavs/shotgun scavs use joe; rifle/raider/enforcer use unk
  const bodyW = e.kind === "boss" ? s + 12 : s + 6;
  const bodyArt = drawGear(ctx, enemyBodyFrame(e.kind, walk === 1), x, y - 1, bodyW, { anchor: "center" });
  if (bodyArt && e.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    px(ctx, "#ffffff", x - bodyW / 2, y - s / 2 - 8, bodyW, s + 10);
    ctx.restore();
  }
  if (!bodyArt) {
  // legs + boots
  px(ctx, gear, x - 4, y + s / 2 - 7 + walk, 3, 7);
  px(ctx, gear, x + 1, y + s / 2 - 7 - walk, 3, 7);
  px(ctx, "#15140f", x - 4, y + s / 2 - 2 + walk, 3, 2);
  px(ctx, "#15140f", x + 1, y + s / 2 - 2 - walk, 3, 2);
  // torso
  px(ctx, body, x - s / 2, y - s / 2, s, h - 3);
  px(ctx, "#00000030", x - s / 2, y + h / 2 - 5, s, 2);
  // rig / armor
  px(ctx, gear, x - s / 2 + 1, y - 3, s - 2, 6);
  px(ctx, "#00000040", x - s / 2 + 1, y - 3, s - 2, 1);
  if (e.kind === "pmc" || e.kind === "boss") {
    px(ctx, "#a8853f", x - 3, y - 2, 4, 3);
    px(ctx, "#2d3038", x - s / 2 - 2, y - 4, 3, 8); // pack
  }
  if (e.kind === "raider") px(ctx, "#1c1f17", x - 2, y - 2, 3, 4);
  // head
  px(ctx, "#c9a883", x - 3, y - s / 2 - 7, 6, 7);
  // headgear
  if (e.kind === "scav") {
    px(ctx, "#7a3a2a", x - 4, y - s / 2 - 8, 8, 3);
    px(ctx, "#4b4030", x - 3, y - s / 2 - 3, 6, 3); // rag mask
  }
  if (e.kind === "raider") {
    px(ctx, "#1f2419", x - 4, y - s / 2 - 9, 9, 5);
    px(ctx, "#0f120c", x - 3, y - s / 2 - 4, 7, 3);
  }
  if (e.kind === "sniperScav") {
    px(ctx, "#4d4426", x - 5, y - s / 2 - 9, 10, 4);
    px(ctx, "#5c5330", x - 4, y - s / 2 - 5, 8, 2);
  }
  if (e.kind === "pmc") {
    px(ctx, "#22282f", x - 4, y - s / 2 - 9, 9, 5);
    px(ctx, "#5fd0e0", x - 3, y - s / 2 - 5, 7, 2);
  }
  if (e.kind === "boss") {
    px(ctx, "#c9a227", x - 6, y - s / 2 - 10, 12, 5);
    px(ctx, "#e8d16b", x - 2, y - s / 2 - 13, 4, 4);
    px(ctx, "#3a1414", x - 4, y - s / 2 - 5, 8, 3);
  }
  }

  // weapon aimed at target when shooting, else forward
  const gunLen = e.kind === "sniperScav" ? 13 : e.kind === "boss" ? 12 : 9;
  ctx.save();
  ctx.translate(x, y - 1);
  ctx.rotate(e.aim);
  const eArt = enemyGunFrame(e.kind, e.muzzle > 0);
  if (!drawGear(ctx, eArt, -4, 0, gunLen + 8)) px(ctx, "#1a1a16", 2, -1, gunLen, 3);
  if (e.muzzle > 0) {
    px(ctx, "#ffd166", gunLen + 2, -3, 5, 6);
    px(ctx, "#fff3c4", gunLen + 3, -1, 3, 3);
  }
  ctx.restore();
  ctx.restore();

  // hp bar
  if (e.hp < e.maxHp) {
    const w = Math.max(16, s + 6);
    px(ctx, "#140f0d", x - w / 2, y - s / 2 - 16, w, 4);
    px(ctx, e.kind === "boss" ? "#ff5a3c" : "#7ddc5a", x - w / 2 + 1, y - s / 2 - 15, (w - 2) * Math.max(0, e.hp / e.maxHp), 2);
  }
  if (e.slow > 0) px(ctx, "#6fd6ff", x - 1, y + s / 2 + 1, 3, 2);
}
