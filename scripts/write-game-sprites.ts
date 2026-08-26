/**
 * BOOTSTRAP / PLACEHOLDER sprite generator — not production art.
 *
 * public/game/{atlas,gear,floor}.png were programmatically authored to match
 * atlas.json / gear-atlas.json frame rects. They are NOT the original Lovable
 * pixel sheets (those PNGs were never in git).
 *
 * Refuses to overwrite existing files unless you pass --force.
 *
 *   bun run scripts/write-game-sprites.ts
 *   bun run scripts/write-game-sprites.ts --force
 */
import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import atlasFrames from "../src/game/atlas.json";
import gearFrames from "../src/game/gear-atlas.json";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "game");

class Pix {
  w: number;
  h: number;
  data: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  set(x: number, y: number, r: number, g: number, b: number, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }
  rect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 255) {
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, r, g, b, a);
  }
  png(): Uint8Array {
    const raw = new Uint8Array((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      const row = y * (this.w * 4 + 1);
      raw[row] = 0;
      raw.set(this.data.subarray(y * this.w * 4, (y + 1) * this.w * 4), row + 1);
    }
    const ihdr = new Uint8Array(13);
    new DataView(ihdr.buffer).setUint32(0, this.w);
    new DataView(ihdr.buffer).setUint32(4, this.h);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const chunks = [
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", new Uint8Array()),
    ];
    const sig = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
    const total = sig.length + chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    out.set(sig, 0);
    let o = sig.length;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcSrc = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcSrc));
  return out;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type RGB = [number, number, number];

function human(
  p: Pix,
  ox: number,
  oy: number,
  w: number,
  h: number,
  walk: boolean,
  pal: { skin: RGB; shirt: RGB; pants: RGB; boot: RGB; hat: RGB; mask?: RGB },
) {
  const bob = walk ? 1 : 0;
  const cx = ox + Math.floor(w / 2);
  // legs
  p.rect(cx - 4, oy + h - 8 + bob, 3, 6, ...pal.pants);
  p.rect(cx + 1, oy + h - 8 - bob, 3, 6, ...pal.pants);
  p.rect(cx - 5, oy + h - 3 + bob, 4, 2, ...pal.boot);
  p.rect(cx + 1, oy + h - 3 - bob, 4, 2, ...pal.boot);
  // torso
  p.rect(cx - 5, oy + 7, 10, 9, ...pal.shirt);
  p.rect(cx - 5, oy + 7, 10, 2, pal.shirt[0] + 18, pal.shirt[1] + 18, pal.shirt[2] + 10);
  // head
  p.rect(cx - 3, oy + 2, 6, 5, ...pal.skin);
  p.rect(cx - 4, oy + 1, 8, 3, ...pal.hat);
  if (pal.mask) p.rect(cx - 3, oy + 5, 6, 2, ...pal.mask);
}

function gun(
  p: Pix,
  ox: number,
  oy: number,
  w: number,
  h: number,
  kind: "ak" | "uzi" | "sg",
  fire: boolean,
) {
  const y = oy + Math.floor(h / 2) - 2;
  const body: RGB = kind === "sg" ? [90, 70, 48] : kind === "uzi" ? [50, 52, 48] : [62, 68, 52];
  const len = kind === "uzi" ? Math.max(16, w - 10) : w - 6;
  p.rect(ox + 2, y, 5, 5, 58, 52, 40);
  p.rect(ox + 6, y + 1, len - 4, 3, ...body);
  if (kind === "ak") p.rect(ox + 10, y + 4, 8, 3, 40, 40, 34);
  if (kind === "sg") p.rect(ox + 8, y - 1, 10, 6, 70, 55, 38);
  if (kind === "uzi") p.rect(ox + 8, y + 4, 4, 6, 30, 30, 28);
  p.rect(ox + len - 2, y, 3, 4, 30, 30, 26);
  if (fire) {
    p.rect(ox + len + 1, y - 2, 5, 7, 255, 224, 102);
    p.rect(ox + len + 2, y, 3, 3, 255, 246, 194);
  }
}

function paintGear() {
  let maxX = 0;
  let maxY = 0;
  for (const f of Object.values(gearFrames)) {
    maxX = Math.max(maxX, f.x + f.w);
    maxY = Math.max(maxY, f.y + f.h);
  }
  const p = new Pix(maxX, maxY);
  const joe = {
    skin: [201, 168, 131] as RGB,
    shirt: [122, 106, 74] as RGB,
    pants: [58, 50, 38] as RGB,
    boot: [28, 24, 18] as RGB,
    hat: [122, 58, 42] as RGB,
    mask: [75, 64, 48] as RGB,
  };
  const unk = {
    skin: [186, 150, 118] as RGB,
    shirt: [48, 56, 62] as RGB,
    pants: [36, 40, 44] as RGB,
    boot: [18, 18, 16] as RGB,
    hat: [34, 40, 46] as RGB,
  };
  const at = (
    name: keyof typeof gearFrames,
    fn: (x: number, y: number, w: number, h: number) => void,
  ) => {
    const f = gearFrames[name];
    fn(f.x, f.y, f.w, f.h);
  };
  at("ak_idle", (x, y, w, h) => gun(p, x, y, w, h, "ak", false));
  at("ak_fire", (x, y, w, h) => gun(p, x, y, w, h, "ak", true));
  at("uzi_idle", (x, y, w, h) => gun(p, x, y, w, h, "uzi", false));
  at("uzi_fire", (x, y, w, h) => gun(p, x, y, w, h, "uzi", true));
  at("sg_idle", (x, y, w, h) => gun(p, x, y, w, h, "sg", false));
  at("sg_fire", (x, y, w, h) => gun(p, x, y, w, h, "sg", true));
  at("joe_1", (x, y, w, h) => human(p, x, y, w, h, false, joe));
  at("joe_2", (x, y, w, h) => human(p, x, y, w, h, true, joe));
  at("unk_1", (x, y, w, h) => human(p, x, y, w, h, false, unk));
  at("unk_2", (x, y, w, h) => human(p, x, y, w, h, true, unk));
  return p;
}

function paintAtlas() {
  let maxX = 0;
  let maxY = 0;
  for (const f of Object.values(atlasFrames)) {
    maxX = Math.max(maxX, f.x + f.w);
    maxY = Math.max(maxY, f.y + f.h);
  }
  const p = new Pix(maxX, maxY);
  const at = (
    name: keyof typeof atlasFrames,
    fn: (x: number, y: number, w: number, h: number) => void,
  ) => {
    const f = atlasFrames[name];
    fn(f.x, f.y, f.w, f.h);
  };
  const tuft = (x: number, y: number, w: number, h: number, a: RGB, b: RGB) => {
    for (let i = 0; i < 40; i++) {
      const px = x + 4 + ((i * 17) % (w - 8));
      const py = y + 8 + ((i * 13) % (h - 12));
      const c = i % 2 === 0 ? a : b;
      p.rect(px, py, 3, 6, ...c);
      p.rect(px - 2, py + 2, 7, 2, ...c);
    }
  };
  at("grass1", (x, y, w, h) => tuft(x, y, w, h, [58, 78, 42], [42, 58, 32]));
  at("grass2", (x, y, w, h) => tuft(x, y, w, h, [70, 88, 48], [48, 64, 36]));
  at("grass3", (x, y, w, h) => tuft(x, y, w, h, [50, 68, 38], [36, 50, 28]));
  const bag = (x: number, y: number, w: number, h: number) => {
    p.rect(x, y + 2, w, h - 2, 93, 84, 60);
    p.rect(x + 1, y + 3, w - 2, 3, 119, 109, 78);
    p.rect(x, y + h - 2, w, 2, 65, 58, 41);
  };
  at("sandbag_h", bag);
  at("sandbag_h2", bag);
  at("sandbag_v", bag);
  at("sandbag_v2", bag);
  const crate = (x: number, y: number, w: number, h: number) => {
    p.rect(x + 1, y + 2, w - 2, h - 3, 92, 70, 38);
    p.rect(x + 3, y + 4, w - 6, 3, 58, 42, 20);
    p.rect(x + Math.floor(w / 2) - 1, y + 4, 3, h - 8, 58, 42, 20);
    p.rect(x + 4, y + 6, 4, 3, 168, 133, 63);
  };
  at("crate_big", crate);
  at("crate_mid", crate);
  at("crate_small", crate);
  at("table", (x, y, w, h) => {
    p.rect(x, y + 4, w, 4, 90, 72, 48);
    p.rect(x + 2, y + 8, 3, h - 8, 60, 48, 32);
    p.rect(x + w - 5, y + 8, 3, h - 8, 60, 48, 32);
  });
  at("bench", (x, y, w, h) => {
    p.rect(x, y + 8, w, 4, 80, 70, 50);
    p.rect(x + 2, y + 12, 3, h - 12, 50, 42, 30);
    p.rect(x + w - 5, y + 12, 3, h - 12, 50, 42, 30);
  });
  const tower = (x: number, y: number, w: number, h: number, lvl: number) => {
    p.rect(x + 4, y + 8, w - 8, h - 10, 90, 78, 52);
    p.rect(x + 4, y + 8, w - 8, 4, 120, 104, 70);
    if (lvl >= 2) p.rect(x + 3, y + 4, w - 6, 6, 93, 84, 60);
    if (lvl >= 3) p.rect(x + 5, y + 14, w - 10, 8, 75, 80, 88);
    p.rect(x + 6, y + h - 6, 4, 4, 240, 180, 0);
  };
  at("tower1", (x, y, w, h) => tower(x, y, w, h, 1));
  at("tower2", (x, y, w, h) => tower(x, y, w, h, 2));
  at("tower3", (x, y, w, h) => tower(x, y, w, h, 3));
  at("shack", (x, y, w, h) => {
    p.rect(x + 8, y + 28, w - 16, h - 36, 63, 74, 65);
    p.rect(x + 6, y + 18, w - 12, 12, 122, 114, 95);
    p.rect(x + Math.floor(w / 2) - 8, y + h - 28, 16, 22, 21, 23, 19);
    p.rect(x + 18, y + 40, 10, 8, 90, 74, 44);
  });
  at("garage", (x, y, w, h) => {
    p.rect(x + 6, y + 10, w - 12, h - 16, 70, 68, 58);
    p.rect(x + 20, y + 28, w - 50, h - 40, 30, 28, 24);
    p.rect(x + 10, y + 10, w - 20, 8, 90, 86, 72);
  });
  return p;
}

function paintFloor() {
  const p = new Pix(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const n = ((x * 13 + y * 7) ^ (x * y)) & 7;
      const v = 48 + n * 4;
      p.set(x, y, v + 8, v + 4, v - 6, 255);
    }
  }
  return p;
}

const force = process.argv.includes("--force");
const targets = ["gear.png", "atlas.png", "floor.png"].map((name) => join(outDir, name));
const existing = targets.filter((p) => existsSync(p));
if (existing.length && !force) {
  console.error(
    "Refusing to overwrite existing sprite sheets:\n" +
      existing.map((p) => `  ${p}`).join("\n") +
      "\nPass --force if you intend to replace bootstrap placeholder art.",
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "gear.png"), paintGear().png());
writeFileSync(join(outDir, "atlas.png"), paintAtlas().png());
writeFileSync(join(outDir, "floor.png"), paintFloor().png());
console.log("wrote", outDir);
