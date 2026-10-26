// File names for saved images: a readable base name from the URL / alt text, a user pattern with
// tokens, Windows-safe characters and the correct new extension. Pure module.

export const DEFAULT_PATTERN = '{name}';

/** Tokens accepted in the pattern (shown on the options page). */
export const TOKENS = ['name', 'alt', 'title', 'site', 'date', 'time', 'width', 'height', 'format'];

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const GENERIC = /^(image|img|images|picture|pic|photo|file|download|index|default|thumb|thumbnail|original|orig|large|medium|small|raw|full|src|media|blob|preview|get|view|show|render|display|\d{1,6}|[0-9a-f]{20,}|[A-Za-z0-9_-]{40,})$/i;
const MAX_SEGMENT = 100;

/** @param {string} s */
function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Remove a trailing ".ext" (1–5 letters/digits). @param {string} s */
export function stripExtension(s) {
  return s.replace(/\.[A-Za-z0-9]{1,5}$/, '');
}

/**
 * Base name from an image URL: the last meaningful path segment without its extension.
 * data:/blob: URLs and query-only endpoints give ''.
 * @param {string} url
 */
export function nameFromUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'file:') return '';
  const segments = u.pathname.split('/').filter(Boolean).map(safeDecode).reverse();
  for (const seg of segments) {
    if (/[=,]/.test(seg) || /^\d+x\d+$/i.test(seg) || /^[wh]_?\d+$/i.test(seg)) continue; // CDN resize params
    const base = stripExtension(seg).replace(/^\d+px-/, '').trim(); // "640px-Cat.jpg" (wiki thumbnails)
    if (base) return base;
  }
  return '';
}

/** @param {string} s */
export function isGenericName(s) {
  return !s || GENERIC.test(s.trim());
}

/**
 * Make one path segment safe on Windows, macOS and Linux.
 * @param {string} s
 */
export function sanitizeSegment(s) {
  let out = String(s ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const chars = [...out];
  if (chars.length > MAX_SEGMENT) out = chars.slice(0, MAX_SEGMENT).join('').trim().replace(/[.\s]+$/, '');
  if (RESERVED.test(out)) out = `_${out}`;
  return out;
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * @typedef {object} NameContext
 * @property {string} srcUrl
 * @property {string} [alt]
 * @property {string} [pageTitle]
 * @property {string} [pageUrl]
 * @property {Date} [now]
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [format]  e.g. "PNG"
 */

/**
 * The best human name for the image: URL name, unless it is generic ("image", a hash…), then alt,
 * then the page title, then "image".
 * @param {NameContext} ctx
 */
export function bestName(ctx) {
  const fromUrl = nameFromUrl(ctx.srcUrl);
  if (!isGenericName(fromUrl)) return fromUrl;
  const alt = (ctx.alt || '').trim();
  if (alt) return alt;
  const title = (ctx.pageTitle || '').trim();
  if (fromUrl) return fromUrl;
  return title || 'image';
}

/** @param {string | undefined} url */
function siteOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Render a pattern like "{site}/{name}_{width}x{height}" into a relative download path with the
 * given extension. "/" in the pattern makes sub-folders inside the downloads folder; ".." and empty
 * segments are dropped, so the result never leaves the downloads folder.
 * @param {string} pattern
 * @param {NameContext} ctx
 * @param {string} ext without the dot
 */
export function buildFilename(pattern, ctx, ext) {
  const now = ctx.now || new Date();
  const values = /** @type {Record<string, string>} */ ({
    name: bestName(ctx),
    alt: (ctx.alt || '').trim(),
    title: (ctx.pageTitle || '').trim(),
    site: siteOf(ctx.pageUrl || ctx.srcUrl),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`,
    width: ctx.width ? String(ctx.width) : '',
    height: ctx.height ? String(ctx.height) : '',
    format: ctx.format || ext.toUpperCase(),
  });
  const rendered = String(pattern || DEFAULT_PATTERN).replace(/\{([a-z]+)\}/gi, (m, k) => (k.toLowerCase() in values ? values[k.toLowerCase()] : m));
  const parts = rendered
    .split(/[\\/]+/)
    .map((p) => sanitizeSegment(p))
    .filter((p) => p && p !== '.' && p !== '..');
  let file = parts.pop() || '';
  const dotExt = `.${ext.toLowerCase()}`;
  if (file.toLowerCase().endsWith(dotExt)) file = file.slice(0, -dotExt.length);
  file = sanitizeSegment(file) || sanitizeSegment(values.name) || 'image';
  return [...parts, `${file}${dotExt}`].join('/');
}

/**
 * Validate a pattern for the options page.
 * @param {string} pattern
 * @returns {{ok: true} | {ok: false, error: 'empty' | 'unknown-token', token?: string}}
 */
export function checkPattern(pattern) {
  if (!String(pattern || '').trim()) return { ok: false, error: 'empty' };
  for (const m of String(pattern).matchAll(/\{([^}]*)\}/g)) {
    if (!TOKENS.includes(m[1].toLowerCase())) return { ok: false, error: 'unknown-token', token: m[1] };
  }
  return { ok: true };
}
