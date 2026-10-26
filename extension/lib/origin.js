// Host-permission helpers: which optional permission is needed to fetch an image URL. Pure module.

/** Optional host permissions declared in the manifest (requested only at the moment of need). */
export const ALL_SITES = ['http://*/*', 'https://*/*'];

/**
 * Match pattern for the host of an http(s) URL ("https://cdn.example.com/*"), or null for
 * data:, blob:, file: and invalid URLs (those never need a host permission).
 * @param {string} url
 */
export function originPattern(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

/** Host shown to the user ("cdn.example.com"), '' when not an http(s) URL. @param {string} url */
export function hostLabel(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : '';
  } catch {
    return '';
  }
}

/** Host of a match pattern for the options list ("https://cdn.example.com/*" → "cdn.example.com"). @param {string} p */
export function patternHost(p) {
  const m = /^(\*|https?):\/\/([^/]+)\//.exec(String(p));
  return m ? m[2] : String(p);
}

/**
 * How to obtain the bytes of an image URL.
 * - data:  → decode inside the extension (no page, no permission);
 * - blob:  → only readable from the page that created it;
 * - http(s) → from the extension when the host is already allowed, otherwise from the page
 *   (works for same-origin and CORS images), otherwise ask for the host permission;
 * - anything else (file:, ftp:, chrome:) → try the page, then give up.
 * @param {string} url
 * @returns {'data' | 'blob' | 'http' | 'other'}
 */
export function urlKind(url) {
  const p = String(url).slice(0, 8).toLowerCase();
  if (p.startsWith('data:')) return 'data';
  if (p.startsWith('blob:')) return 'blob';
  if (p.startsWith('http:') || p.startsWith('https:')) return 'http';
  return 'other';
}
