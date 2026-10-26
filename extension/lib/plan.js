// Target formats, size limits and the conversion plan (what to do with a given source). Pure module.

/** @typedef {'png'|'jpg'|'webp'|'avif'} Format */

/** Output formats. `lossy` formats use the quality setting; JPG has no alpha → background fill. */
export const FORMATS = /** @type {Record<Format, {mime: string, ext: string, label: string, lossy: boolean, alpha: boolean}>} */ ({
  png: { mime: 'image/png', ext: 'png', label: 'PNG', lossy: false, alpha: true },
  jpg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPG', lossy: true, alpha: false },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true, alpha: true },
  avif: { mime: 'image/avif', ext: 'avif', label: 'AVIF', lossy: true, alpha: true },
});

/** @param {unknown} f @returns {f is Format} */
export const isFormat = (f) => typeof f === 'string' && Object.prototype.hasOwnProperty.call(FORMATS, f);

/** Source type (from lib/sniff.js) that is the same thing as a target format. */
const SAME = /** @type {Record<string, Format>} */ ({ png: 'png', jpeg: 'jpg', webp: 'webp', avif: 'avif' });

/**
 * Hard limits. Bytes: what may travel from the page to the extension in one message (base64
 * inflates by 4/3; Chrome caps messages at 64 MiB). Pixels: a decoded RGBA canvas of this size is
 * ~400 MB, more is likely to crash the converter. Side: Chrome's canvas dimension limit.
 */
export const LIMITS = Object.freeze({
  pageBytes: 40 * 1024 * 1024,
  fetchBytes: 200 * 1024 * 1024,
  pixels: 100_000_000,
  side: 32_767,
});

/**
 * Does a w×h image fit the canvas limits?
 * @param {number} w @param {number} h
 */
export function fitsCanvas(w, h, limits = LIMITS) {
  return w > 0 && h > 0 && w <= limits.side && h <= limits.side && w * h <= limits.pixels;
}

/**
 * Output size for a rasterised SVG: natural size × scale, reduced (keeping the ratio) until it fits.
 * @param {{width: number, height: number}} natural
 * @param {number} scale
 * @returns {{width: number, height: number, reduced: boolean}}
 */
export function svgOutputSize(natural, scale, limits = LIMITS) {
  let s = scale > 0 ? scale : 1;
  const base = { w: Math.max(1, natural.width), h: Math.max(1, natural.height) };
  let w = Math.round(base.w * s);
  let h = Math.round(base.h * s);
  let reduced = false;
  if (!fitsCanvas(w, h, limits)) {
    s = Math.min(s, limits.side / base.w, limits.side / base.h, Math.sqrt(limits.pixels / (base.w * base.h)));
    w = Math.max(1, Math.floor(base.w * s));
    h = Math.max(1, Math.floor(base.h * s));
    reduced = true;
  }
  return { width: w, height: h, reduced };
}

/**
 * @typedef {object} Plan
 * @property {'original'|'convert'|'error'} mode  original = save the source bytes unchanged
 * @property {string[]} notes                    message keys to show the user (lib → _locales)
 * @property {string} [error]                    error code when mode === 'error'
 */

/**
 * Decide what to do with a source image for a target format.
 * - Same format and not an SVG → keep the original bytes (no recompression, no quality loss).
 * - Animated source → the first frame is converted, with a note (the original can be saved instead).
 * - Header size over the limits → error before decoding.
 * @param {{type: string | null, animated?: boolean, size?: {width: number, height: number} | null, exact?: boolean}} source
 * @param {Format} target
 * @returns {Plan}
 */
export function planConversion(source, target) {
  if (!isFormat(target)) return { mode: 'error', notes: [], error: 'bad-format' };
  if (!source.type) return { mode: 'error', notes: [], error: 'not-image' };
  if (source.size && !fitsCanvas(source.size.width, source.size.height)) return { mode: 'error', notes: [], error: 'too-large' };
  if (SAME[source.type] === target && source.exact !== false) {
    return { mode: 'original', notes: [source.animated ? 'noteAnimatedKept' : 'noteSameFormat'] };
  }
  /** @type {string[]} */
  const notes = [];
  if (source.animated) notes.push('noteFirstFrame');
  if (source.type === 'svg') notes.push('noteSvgRaster');
  if (!FORMATS[target].alpha) notes.push('noteJpgBackground');
  return { mode: 'convert', notes };
}

/**
 * Which notes are worth a toast: the background fill and "same format" are silent details.
 * @param {string[]} notes
 */
export function visibleNotes(notes) {
  return notes.filter((n) => n === 'noteFirstFrame' || n === 'noteSvgReduced');
}

/** Clamp quality 1..100 → 0..1 for canvas encoders. @param {number} q */
export function encoderQuality(q) {
  const n = Math.round(Number(q));
  return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) / 100 : 0.92;
}
