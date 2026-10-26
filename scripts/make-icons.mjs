// Generates extension/icons/icon{16,32,48,128}.png — a teal rounded tile with a white "photo"
// (mountains and a yellow sun). No dependencies.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from './zip.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');

const TEAL = [14, 124, 102];
const DARK = [9, 88, 72];
const WHITE = [255, 255, 255];
const SUN = [255, 200, 40];

/** Is (x, y) inside the triangle with apex (ax, ay) and base y = by from bx0 to bx1? */
function tri(x, y, ax, ay, bx0, bx1, by) {
  if (y < ay || y > by) return false;
  const k = (y - ay) / (by - ay);
  return x >= ax + (bx0 - ax) * k && x <= ax + (bx1 - ax) * k;
}

/** Shape test in unit coordinates (0..1). Returns RGB or null (transparent). */
function shade(x, y) {
  const r = 0.2;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;
  // white photo card with rounded corners
  const x0 = 0.17, x1 = 0.83, y0 = 0.2, y1 = 0.8, cr = 0.06;
  const qx = Math.min(Math.max(x, x0 + cr), x1 - cr);
  const qy = Math.min(Math.max(y, y0 + cr), y1 - cr);
  if (x < x0 || x > x1 || y < y0 || y > y1 || (x - qx) ** 2 + (y - qy) ** 2 > cr * cr) return TEAL;
  const inner = x > x0 + 0.06 && x < x1 - 0.06 && y > y0 + 0.06 && y < y1 - 0.06;
  if (!inner) return WHITE;
  if ((x - 0.62) ** 2 + (y - 0.37) ** 2 < 0.075 ** 2) return SUN;
  if (tri(x, y, 0.4, 0.4, 0.14, 0.7, 0.75)) return TEAL;
  if (tri(x, y, 0.64, 0.5, 0.42, 0.9, 0.75)) return DARK;
  return WHITE;
}

function png(size) {
  const SS = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (c) {
            r += c[0]; g += c[1]; b += c[2]; a++;
          }
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(join(OUT, `icon${s}.png`), png(s));
console.log('icons written to', OUT);
