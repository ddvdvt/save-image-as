// Tiny image encoders for tests and fixtures (node only): RGBA PNG, palette GIF (optionally
// animated) and hand-made headers for formats node cannot encode (JPEG, WebP, AVIF).
import { deflateSync } from 'node:zlib';
import { crc32 } from '../../scripts/zip.mjs';

/**
 * @param {number} w @param {number} h
 * @param {(x: number, y: number) => [number, number, number, number]} px RGBA 0..255
 * @param {{ apng?: boolean }} [opts]
 */
export function png(w, h, px, opts = {}) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) raw.set(px(x, y), y * (w * 4 + 1) + 1 + x * 4);
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
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(1, 0);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(opts.apng ? [chunk('acTL', actl)] : []),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Palette GIF with 128 colours and "uncompressed" LZW (8-bit codes, CLEAR every 100 pixels), so no
 * real LZW encoder is needed. Each frame is a function returning a palette index 0..127.
 * @param {number} w @param {number} h
 * @param {Array<[number, number, number]>} palette up to 128 colours
 * @param {Array<(x: number, y: number) => number>} frames
 */
export function gif(w, h, palette, frames) {
  const out = [];
  const push = (...b) => out.push(...b);
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  push(...Buffer.from('GIF89a'), ...u16(w), ...u16(h), 0xf6, 0, 0); // GCT flag, 128 colours
  for (let i = 0; i < 128; i++) push(...(palette[i] || [0, 0, 0]));
  if (frames.length > 1) push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0);
  for (const frame of frames) {
    push(0x21, 0xf9, 4, 0, 10, 0, 0, 0); // graphic control: 0.1 s
    push(0x2c, 0, 0, 0, 0, ...u16(w), ...u16(h), 0);
    push(7); // LZW minimum code size → 8-bit codes
    const codes = [128];
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (n && n % 100 === 0) codes.push(128);
        codes.push(frame(x, y) & 127);
        n++;
      }
    }
    codes.push(129);
    for (let i = 0; i < codes.length; i += 255) {
      const part = codes.slice(i, i + 255);
      push(part.length, ...part);
    }
    push(0);
  }
  push(0x3b);
  return Buffer.from(out);
}

/** JPEG header up to a baseline SOF0 with the given size (not decodable, for sniffing only). */
export function jpegHeader(w, h) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
}

/** WebP RIFF header of the given kind. */
export function webpHeader(kind, w, h, { animated = false } = {}) {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0);
  b.writeUInt32LE(32, 4);
  b.write('WEBP', 8);
  if (kind === 'VP8X') {
    b.write('VP8X', 12);
    b.writeUInt32LE(10, 16);
    b[20] = animated ? 0x02 : 0x10;
    b.writeUIntLE(w - 1, 24, 3);
    b.writeUIntLE(h - 1, 27, 3);
  } else if (kind === 'VP8L') {
    b.write('VP8L', 12);
    b[20] = 0x2f;
    b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21);
  } else {
    b.write('VP8 ', 12);
    b[23] = 0x9d;
    b[24] = 0x01;
    b[25] = 0x2a;
    b.writeUInt16LE(w, 26);
    b.writeUInt16LE(h, 28);
  }
  return b;
}

/** ISO-BMFF ftyp box with brands. */
export function ftyp(major, ...compatible) {
  const brands = [major, '\0\0\0\0', ...compatible];
  const b = Buffer.alloc(8 + brands.length * 4);
  b.writeUInt32BE(b.length, 0);
  b.write('ftyp', 4);
  brands.forEach((x, i) => b.write(x, 8 + i * 4, 'latin1'));
  return b;
}
