// Image format sniffing by magic bytes, animation detection and header-only size reading.
// Pure module: no chrome.* or DOM calls — unit tested with node --test.

/** @typedef {'png'|'jpeg'|'gif'|'webp'|'avif'|'svg'|'bmp'|'ico'|'tiff'|'heic'} ImageType */

/** MIME type and file extension of every type we recognise. */
export const TYPES = /** @type {Record<ImageType, {mime: string, ext: string}>} */ ({
  png: { mime: 'image/png', ext: 'png' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  gif: { mime: 'image/gif', ext: 'gif' },
  webp: { mime: 'image/webp', ext: 'webp' },
  avif: { mime: 'image/avif', ext: 'avif' },
  svg: { mime: 'image/svg+xml', ext: 'svg' },
  bmp: { mime: 'image/bmp', ext: 'bmp' },
  ico: { mime: 'image/x-icon', ext: 'ico' },
  tiff: { mime: 'image/tiff', ext: 'tiff' },
  heic: { mime: 'image/heic', ext: 'heic' },
});

/** @param {Uint8Array} b @param {number} at @param {string} s */
function ascii(b, at, s) {
  if (b.length < at + s.length) return false;
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
}

const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b, i) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const u32le = (b, i) => ((b[i + 3] << 24) >>> 0) + ((b[i + 2] << 16) | (b[i + 1] << 8) | b[i]);

/** ISO-BMFF major/compatible brands of an "ftyp" box, or []. @param {Uint8Array} b */
function ftypBrands(b) {
  if (!ascii(b, 4, 'ftyp')) return [];
  const size = Math.min(u32be(b, 0), b.length);
  const brands = [];
  for (let i = 8; i + 4 <= size; i += 4) {
    if (i === 12) continue; // minor version
    brands.push(String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]));
  }
  return brands;
}

/** Does the text start like an SVG document (BOM, XML prolog, comments, doctype allowed)? @param {Uint8Array} b */
function looksLikeSvg(b) {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 4096)).replace(/^﻿/, '');
  const s = head.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').trimStart();
  return /^<svg[\s>]/i.test(s);
}

/**
 * Detect the image type from the first bytes.
 * @param {Uint8Array} b
 * @returns {ImageType | null}
 */
export function sniffType(b) {
  if (!b || b.length < 4) return null;
  if (b[0] === 0x89 && ascii(b, 1, 'PNG')) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a')) return 'gif';
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'webp';
  const brands = ftypBrands(b);
  if (brands.some((x) => x === 'avif' || x === 'avis')) return 'avif';
  if (brands.some((x) => ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1'].includes(x))) return 'heic';
  if (ascii(b, 0, 'BM') && b.length >= 26) return 'bmp';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico';
  if (ascii(b, 0, 'II*\0') || ascii(b, 0, 'MM\0*')) return 'tiff';
  if (looksLikeSvg(b)) return 'svg';
  return null;
}

/**
 * Type from a MIME string such as "image/webp; charset=…".
 * @param {string | undefined | null} mime
 * @returns {ImageType | null}
 */
export function typeFromMime(mime) {
  const m = String(mime || '').toLowerCase().split(';')[0].trim();
  if (m === 'image/jpg' || m === 'image/pjpeg') return 'jpeg';
  if (m === 'image/vnd.microsoft.icon') return 'ico';
  if (m === 'image/heif') return 'heic';
  for (const [k, v] of Object.entries(TYPES)) if (v.mime === m) return /** @type {ImageType} */ (k);
  return null;
}

/** Number of frames in a GIF (stops counting at `limit`). @param {Uint8Array} b */
export function gifFrameCount(b, limit = 2) {
  if (!(ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a')) || b.length < 13) return 0;
  let i = 13;
  if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1)); // global colour table
  let frames = 0;
  const skipSubBlocks = () => {
    while (i < b.length) {
      const n = b[i++];
      if (n === 0) return;
      i += n;
    }
  };
  while (i < b.length) {
    const block = b[i++];
    if (block === 0x3b) break; // trailer
    if (block === 0x21) {
      i++; // label
      skipSubBlocks();
    } else if (block === 0x2c) {
      frames++;
      if (frames >= limit) return frames;
      if (i + 9 > b.length) break;
      const flags = b[i + 8];
      i += 9;
      if (flags & 0x80) i += 3 * (1 << ((flags & 7) + 1)); // local colour table
      i++; // LZW minimum code size
      skipSubBlocks();
    } else break; // corrupt
  }
  return frames;
}

/** True for an APNG: an acTL chunk before the first IDAT. @param {Uint8Array} b */
function pngAnimated(b) {
  let i = 8;
  while (i + 8 <= b.length) {
    const len = u32be(b, i);
    if (ascii(b, i + 4, 'acTL')) return true;
    if (ascii(b, i + 4, 'IDAT')) return false;
    i += 12 + len;
  }
  return false;
}

/** @param {Uint8Array} b */
function webpAnimated(b) {
  return ascii(b, 12, 'VP8X') && b.length > 20 && (b[20] & 0x02) !== 0;
}

/**
 * Is the image animated (more than one frame)?
 * @param {Uint8Array} b
 * @param {ImageType | null} [type]
 */
export function isAnimated(b, type = sniffType(b)) {
  if (type === 'gif') return gifFrameCount(b) > 1;
  if (type === 'png') return pngAnimated(b);
  if (type === 'webp') return webpAnimated(b);
  if (type === 'avif') return ftypBrands(b).includes('avis');
  return false;
}

/** @param {Uint8Array} b @returns {{width: number, height: number} | null} */
function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = u16be(b, i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    if (marker === 0xda || marker === 0xd9) return null; // start of scan / end: no SOF seen
    i += 2 + len;
  }
  return null;
}

/** @param {Uint8Array} b */
function webpSize(b) {
  if (ascii(b, 12, 'VP8X') && b.length >= 30) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (ascii(b, 12, 'VP8 ') && b.length >= 30) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (ascii(b, 12, 'VP8L') && b.length >= 25) {
    const bits = u32le(b, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * Pixel size read from the file header (no decoding), or null when unknown.
 * Used to refuse decompression bombs before the browser decodes them.
 * @param {Uint8Array} b
 * @param {ImageType | null} [type]
 * @returns {{width: number, height: number} | null}
 */
export function headerSize(b, type = sniffType(b)) {
  try {
    if (type === 'png' && b.length >= 24 && ascii(b, 12, 'IHDR')) return { width: u32be(b, 16), height: u32be(b, 20) };
    if (type === 'gif' && b.length >= 10) return { width: u16le(b, 6), height: u16le(b, 8) };
    if (type === 'jpeg') return jpegSize(b);
    if (type === 'webp') return webpSize(b);
    if (type === 'bmp') return { width: Math.abs(u32le(b, 18) | 0), height: Math.abs(u32le(b, 22) | 0) };
  } catch {
    /* truncated header */
  }
  return null;
}

/**
 * Everything the converter needs to know about the source bytes.
 * @param {Uint8Array} bytes
 * @param {string} [mime] Content-Type, used only when the bytes are not recognised
 */
export function describe(bytes, mime) {
  const type = sniffType(bytes) || typeFromMime(mime);
  return {
    type,
    mime: type ? TYPES[type].mime : String(mime || ''),
    ext: type ? TYPES[type].ext : 'bin',
    animated: type ? isAnimated(bytes, type) : false,
    size: type ? headerSize(bytes, type) : null,
  };
}
