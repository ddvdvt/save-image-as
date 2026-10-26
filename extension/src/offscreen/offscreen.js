// Offscreen document (reason BLOBS): fetches or decodes the image, converts it on a canvas and hands
// a blob: URL back to the service worker for chrome.downloads. Everything happens on the device.
import { describe } from '../../lib/sniff.js';
import { FORMATS, LIMITS, planConversion, fitsCanvas, svgOutputSize, encoderQuality } from '../../lib/plan.js';
import { svgSize } from '../../lib/svg.js';

/** blob: URLs handed out and not yet revoked. */
const live = new Set();

class Fail extends Error {
  /** @param {string} code @param {number} [status] */
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** @param {{ url: string }} source */
async function load(source) {
  let r;
  try {
    r = await fetch(source.url, { credentials: 'include' });
  } catch {
    throw new Fail('network');
  }
  if (!r.ok) throw new Fail('http', r.status);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > LIMITS.fetchBytes) throw new Fail('too-large');
  const blob = await r.blob();
  if (blob.size > LIMITS.fetchBytes) throw new Fail('too-large');
  if (blob.size === 0) throw new Fail('not-image');
  return blob;
}

/** @param {string} url @returns {Promise<HTMLImageElement>} */
function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Fail('decode'));
    img.src = url;
  });
}

/**
 * Decode to something drawable, at the size it should be drawn.
 * @param {Blob} blob
 * @param {Uint8Array} bytes
 * @param {string} type
 * @param {number} svgScale
 * @param {string[]} notes
 */
async function decode(blob, bytes, type, svgScale, notes) {
  if (type === 'svg') {
    const natural = svgSize(new TextDecoder().decode(bytes));
    const size = svgOutputSize(natural, svgScale);
    if (size.reduced) notes.push('noteSvgReduced');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }));
    try {
      const img = await loadImg(url);
      return { source: img, width: size.width, height: size.height, close: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  try {
    const bmp = await createImageBitmap(blob);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImg(url);
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** @param {Blob} blob @returns {Promise<string>} */
function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/**
 * @param {{
 *   source: { url: string, exact?: boolean, mime?: string },
 *   action: { kind: 'save', format: import('../../lib/plan.js').Format } | { kind: 'copy' } | { kind: 'original' },
 *   settings: { quality: number, background: string, svgScale: number },
 *   output: 'url' | 'dataUrl'
 * }} req
 */
async function convert(req) {
  const blob = await load(req.source);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const info = describe(bytes, blob.type || req.source.mime);
  /** @type {Blob} */
  let out;
  let ext;
  let width = info.size?.width || 0;
  let height = info.size?.height || 0;
  /** @type {string[]} */
  let notes = [];

  if (req.action.kind === 'original') {
    if (!info.type) throw new Fail('not-image');
    out = new Blob([bytes], { type: info.mime });
    ext = info.ext;
  } else {
    const target = req.action.kind === 'copy' ? 'png' : req.action.format;
    const plan = planConversion({ ...info, exact: req.source.exact }, target);
    if (plan.mode === 'error') throw new Fail(plan.error || 'decode');
    notes = [...plan.notes];
    const fmt = FORMATS[target];
    ext = fmt.ext;
    if (plan.mode === 'original') {
      out = new Blob([bytes], { type: fmt.mime });
    } else {
      const img = await decode(blob, bytes, /** @type {string} */ (info.type), req.settings.svgScale, notes);
      try {
        width = img.width;
        height = img.height;
        if (!fitsCanvas(width, height)) throw new Fail('too-large');
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Fail('too-large');
        if (!fmt.alpha) {
          ctx.fillStyle = req.settings.background || '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img.source, 0, 0, width, height);
        try {
          out = await canvas.convertToBlob(fmt.lossy ? { type: fmt.mime, quality: encoderQuality(req.settings.quality) } : { type: fmt.mime });
        } catch {
          throw new Fail('too-large'); // the encoder runs out of memory first
        }
        if (out.type !== fmt.mime) throw new Fail('encode-unsupported');
      } finally {
        img.close();
      }
    }
  }
  const base = { ok: true, ext, width, height, notes, sourceType: info.type, size: out.size };
  if (req.output === 'dataUrl') return { ...base, dataUrl: await toDataUrl(out) };
  const url = URL.createObjectURL(out);
  live.add(url);
  return { ...base, url };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;
  if (msg.type === 'convert') {
    convert(msg.request).then(sendResponse, (e) =>
      sendResponse({ ok: false, error: e instanceof Fail ? e.code : 'decode', status: e instanceof Fail ? e.status : undefined }),
    );
    return true;
  }
  if (msg.type === 'revoke') {
    if (live.delete(msg.url)) URL.revokeObjectURL(msg.url);
    sendResponse({ ok: true, live: live.size });
    return false;
  }
  return false;
});
