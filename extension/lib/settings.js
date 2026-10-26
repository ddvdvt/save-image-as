// Settings: defaults and normalisation of whatever is in chrome.storage. Pure module.
import { isFormat } from './plan.js';
import { DEFAULT_PATTERN, checkPattern } from './filename.js';

/**
 * @typedef {object} Settings
 * @property {import('./plan.js').Format} defaultFormat  shown first in the context menu
 * @property {number} quality      1..100, for JPG / WebP / AVIF
 * @property {string} background   #rrggbb, fills transparency in JPG
 * @property {boolean} askWhere    chrome.downloads saveAs dialog
 * @property {string} pattern      file name pattern, see lib/filename.js
 * @property {1 | 2} svgScale      SVG rasterisation scale
 * @property {boolean} toastOnSave show a short confirmation on the page after saving
 */

/** @type {Readonly<Settings>} */
export const DEFAULTS = Object.freeze({
  defaultFormat: 'png',
  quality: 92,
  background: '#ffffff',
  askWhere: false,
  pattern: DEFAULT_PATTERN,
  svgScale: 2,
  toastOnSave: false,
});

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
export function normalizeSettings(raw) {
  const r = /** @type {Record<string, any>} */ (raw && typeof raw === 'object' ? raw : {});
  const q = Math.round(Number(r.quality));
  return {
    defaultFormat: isFormat(r.defaultFormat) ? r.defaultFormat : DEFAULTS.defaultFormat,
    quality: Number.isFinite(q) && q >= 1 && q <= 100 ? q : DEFAULTS.quality,
    background: typeof r.background === 'string' && /^#[0-9a-f]{6}$/i.test(r.background) ? r.background.toLowerCase() : DEFAULTS.background,
    askWhere: typeof r.askWhere === 'boolean' ? r.askWhere : DEFAULTS.askWhere,
    pattern: typeof r.pattern === 'string' && checkPattern(r.pattern).ok ? r.pattern.trim() : DEFAULTS.pattern,
    svgScale: Number(r.svgScale) === 1 ? 1 : 2,
    toastOnSave: typeof r.toastOnSave === 'boolean' ? r.toastOnSave : DEFAULTS.toastOnSave,
  };
}
