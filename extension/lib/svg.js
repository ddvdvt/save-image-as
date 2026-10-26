// Intrinsic size of an SVG document (for rasterising it into PNG/JPG/WebP). Pure module.

const UNIT_PX = /** @type {Record<string, number>} */ ({ '': 1, px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, em: 16, rem: 16, ex: 8 });

/**
 * Parse an SVG length ("120", "120px", "2in"). Percentages and garbage → null.
 * @param {string | null | undefined} v
 * @returns {number | null}
 */
export function parseLength(v) {
  const m = /^\s*([+]?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(String(v ?? ''));
  if (!m) return null;
  const k = UNIT_PX[m[2].toLowerCase()];
  if (k === undefined) return null;
  const n = parseFloat(m[1]) * k;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Value of an attribute on the root <svg> tag. @param {string} tag @param {string} name */
function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[1] ?? m[2]) : null;
}

/**
 * Size of an SVG in CSS pixels: width/height attributes, else the viewBox (scaled to a missing
 * dimension by its aspect ratio), else the HTML default replaced-element size 300×150.
 * @param {string} text SVG source
 * @returns {{width: number, height: number, fromViewBox: boolean}}
 */
export function svgSize(text) {
  const tag = (/<svg\b[^>]*>/i.exec(String(text || '')) || [''])[0];
  let w = parseLength(attr(tag, 'width'));
  let h = parseLength(attr(tag, 'height'));
  const vb = (attr(tag, 'viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const hasVb = vb.length === 4 && vb[2] > 0 && vb[3] > 0 && vb.every(Number.isFinite);
  if (w && h) return { width: w, height: h, fromViewBox: false };
  if (hasVb) {
    const ratio = vb[2] / vb[3];
    if (w) return { width: w, height: w / ratio, fromViewBox: true };
    if (h) return { width: h * ratio, height: h, fromViewBox: true };
    return { width: vb[2], height: vb[3], fromViewBox: true };
  }
  return { width: w || 300, height: h || 150, fromViewBox: false };
}
