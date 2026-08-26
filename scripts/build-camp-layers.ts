/**
 * Derives M2.2 animation frames from public/game/hub/camp-base.png.
 * Does not overwrite the approved source. Run: bun scripts/build-camp-layers.ts
 */
import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1448;
const H = 1086;
const SRC = "public/game/hub/camp-base.png";
const OUT = "public/game/hub/animated";

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function readPngRgb(path: string) {
  const file = readFileSync(path);
  const chunks: Buffer[] = [];
  let off = 8;
  while (off < file.length) {
    const len = file.readUInt32BE(off);
    const type = file.toString("ascii", off + 4, off + 8);
    const data = file.subarray(off + 8, off + 8 + len);
    if (type === "IDAT") chunks.push(data);
    off += 12 + len;
    if (type === "IEND") break;
  }
  const inflated = inflateSync(Buffer.concat(chunks));
  const stride = W * 3;
  const px = Buffer.alloc(W * H * 3);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const filter = inflated[src++]!;
    const row = inflated.subarray(src, src + stride);
    src += stride;
    const out = Buffer.alloc(stride);
    if (filter === 0) row.copy(out);
    else if (filter === 1) {
      for (let i = 0; i < stride; i++) out[i] = (row[i]! + (i >= 3 ? out[i - 3]! : 0)) & 255;
    } else if (filter === 2) {
      for (let i = 0; i < stride; i++) out[i] = (row[i]! + prev[i]!) & 255;
    } else if (filter === 3) {
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? out[i - 3]! : 0;
        out[i] = (row[i]! + Math.floor((a + prev[i]!) / 2)) & 255;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? out[i - 3]! : 0;
        const b = prev[i]!;
        const c = i >= 3 ? prev[i - 3]! : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        out[i] = (row[i]! + pr) & 255;
      }
    } else throw new Error(`filter ${filter}`);
    out.copy(px, y * stride);
    prev = out;
  }
  return px;
}

function writePngRgba(path: string, w: number, h: number, rgba: Buffer) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

function rgbAt(px: Buffer, x: number, y: number) {
  const i = (y * W + x) * 3;
  return [px[i]!, px[i + 1]!, px[i + 2]!] as const;
}

function isFlame(r: number, g: number, b: number) {
  return r > 190 && g > 80 && g < 200 && b < 70 && r > g + 30;
}

function extract(px: Buffer, x0: number, y0: number, x1: number, y1: number) {
  const w = x1 - x0;
  const h = y1 - y0;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = rgbAt(px, x0 + x, y0 + y);
      const o = (y * w + x) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }
  return { w, h, rgba };
}

function cloneRgba(src: Buffer) {
  return Buffer.from(src);
}

const src = readPngRgb(SRC);

const FIRE = { x0: 630, y0: 598, x1: 758, y1: 778 };
const SCAV = { x0: 704, y0: 428, x1: 892, y1: 638 };
const LANTERN_L = { x0: 548, y0: 512, x1: 592, y1: 560 };
const LANTERN_R = { x0: 1204, y0: 472, x1: 1244, y1: 518 };

function pct(box: { x0: number; y0: number; x1: number; y1: number }) {
  return {
    xPercent: +((box.x0 / W) * 100).toFixed(3),
    yPercent: +((box.y0 / H) * 100).toFixed(3),
    widthPercent: +(((box.x1 - box.x0) / W) * 100).toFixed(3),
    heightPercent: +(((box.y1 - box.y0) / H) * 100).toFixed(3),
  };
}

mkdirSync(join(OUT, "fire"), { recursive: true });
mkdirSync(join(OUT, "scavlord"), { recursive: true });
mkdirSync(join(OUT, "lantern"), { recursive: true });

const fire = extract(src, FIRE.x0, FIRE.y0, FIRE.x1, FIRE.y1);
writePngRgba(join(OUT, "fire/f0.png"), fire.w, fire.h, fire.rgba);

function mutateFire(base: Buffer, w: number, h: number, mode: 1 | 2 | 3) {
  const out = cloneRgba(base);
  const at = (x: number, y: number) => (y * w + x) * 4;
  const flame: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = at(x, y);
      if (isFlame(out[o]!, out[o + 1]!, out[o + 2]!)) flame.push([x, y]);
    }
  }
  const fill: Array<[number, number, number]> = [];
  for (const [x, y] of flame) {
    const o = at(x, y);
    let srcY = y;
    if (mode === 1) srcY = Math.min(h - 1, y + 1);
    if (mode === 2) srcY = Math.max(0, y - 1);
    if (mode === 3 && y < h * 0.28) {
      fill.push([x, y, o]);
      continue;
    }
    const so = at(Math.max(0, Math.min(w - 1, x + (mode === 2 ? 1 : 0))), srcY);
    out[o] = base[so]!;
    out[o + 1] = base[so + 1]!;
    out[o + 2] = base[so + 2]!;
  }
  for (const [x, y, o] of fill) {
    const below = at(x, Math.min(h - 1, y + 3));
    out[o] = base[below]!;
    out[o + 1] = base[below + 1]!;
    out[o + 2] = base[below + 2]!;
  }
  return out;
}

writePngRgba(join(OUT, "fire/f1.png"), fire.w, fire.h, mutateFire(fire.rgba, fire.w, fire.h, 1));
writePngRgba(join(OUT, "fire/f2.png"), fire.w, fire.h, mutateFire(fire.rgba, fire.w, fire.h, 2));
writePngRgba(join(OUT, "fire/f3.png"), fire.w, fire.h, mutateFire(fire.rgba, fire.w, fire.h, 3));

const scav = extract(src, SCAV.x0, SCAV.y0, SCAV.x1, SCAV.y1);

function punchFlames(rgba: Buffer, w: number, h: number) {
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (isFlame(rgba[o]!, rgba[o + 1]!, rgba[o + 2]!)) rgba[o + 3] = 0;
  }
  return rgba;
}

function isFigure(r: number, g: number, b: number, a: number) {
  if (a === 0) return false;
  if (isFlame(r, g, b)) return false;
  const lum = r + g + b;
  if (lum < 48 && g + 8 >= r && b + 14 >= r) return false;
  if (g > r + 10 && g > b && r < 42 && lum < 110) return false;
  return lum >= 48;
}

function mutateScav(base: Buffer, w: number, h: number, mode: 1 | 2) {
  const out = cloneRgba(base);
  const band = mode === 1 ? Math.floor(h * 0.48) : Math.floor(h * 0.34);
  const dx = mode === 2 ? 1 : 0;
  const dy = mode === 1 ? -1 : 0;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const figureAt = (x: number, y: number) => {
    const o = at(x, y);
    return isFigure(base[o]!, base[o + 1]!, base[o + 2]!, base[o + 3]!);
  };
  for (let y = 0; y < band; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.max(0, Math.min(w - 1, x - dx));
      const sy = Math.max(0, Math.min(h - 1, y - dy));
      if (!figureAt(x, y) && !figureAt(sx, sy)) continue;
      const o = at(x, y);
      const s = at(sx, sy);
      out[o] = base[s]!;
      out[o + 1] = base[s + 1]!;
      out[o + 2] = base[s + 2]!;
      out[o + 3] = base[s + 3]!;
    }
  }
  return punchFlames(out, w, h);
}

punchFlames(scav.rgba, scav.w, scav.h);
writePngRgba(join(OUT, "scavlord/s0.png"), scav.w, scav.h, scav.rgba);
writePngRgba(join(OUT, "scavlord/s1.png"), scav.w, scav.h, mutateScav(scav.rgba, scav.w, scav.h, 1));
writePngRgba(join(OUT, "scavlord/s2.png"), scav.w, scav.h, mutateScav(scav.rgba, scav.w, scav.h, 2));

function mutateLantern(base: Buffer, w: number, h: number, mul: number) {
  const out = cloneRgba(base);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const r = out[o]!;
    const g = out[o + 1]!;
    const b = out[o + 2]!;
    if (r > 160 && g > 90 && b < 100) {
      out[o] = Math.max(0, Math.min(255, Math.round(r * mul)));
      out[o + 1] = Math.max(0, Math.min(255, Math.round(g * mul)));
      out[o + 2] = Math.max(0, Math.min(255, Math.round(b * 0.92 * mul)));
    }
  }
  return out;
}

const left = extract(src, LANTERN_L.x0, LANTERN_L.y0, LANTERN_L.x1, LANTERN_L.y1);
const right = extract(src, LANTERN_R.x0, LANTERN_R.y0, LANTERN_R.x1, LANTERN_R.y1);
writePngRgba(join(OUT, "lantern/left-0.png"), left.w, left.h, left.rgba);
writePngRgba(join(OUT, "lantern/left-1.png"), left.w, left.h, mutateLantern(left.rgba, left.w, left.h, 0.82));
writePngRgba(join(OUT, "lantern/left-2.png"), left.w, left.h, mutateLantern(left.rgba, left.w, left.h, 1.12));
writePngRgba(join(OUT, "lantern/right-0.png"), right.w, right.h, right.rgba);
writePngRgba(join(OUT, "lantern/right-1.png"), right.w, right.h, mutateLantern(right.rgba, right.w, right.h, 0.78));
writePngRgba(join(OUT, "lantern/right-2.png"), right.w, right.h, mutateLantern(right.rgba, right.w, right.h, 1.08));

console.log(
  JSON.stringify(
    {
      fire: pct(FIRE),
      scavlord: pct(SCAV),
      lanternLeft: pct(LANTERN_L),
      lanternRight: pct(LANTERN_R),
    },
    null,
    2,
  ),
);
