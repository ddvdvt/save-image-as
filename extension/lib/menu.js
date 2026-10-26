// Context-menu model: ids, order (default format first) and which formats this browser can encode.
// Pure module: the service worker turns the model into chrome.contextMenus.create calls.
import { FORMATS, isFormat } from './plan.js';

export const PARENT_ID = 'sia';
export const COPY_ID = 'sia-copy-png';
export const ORIGINAL_ID = 'sia-original';
const SAVE_PREFIX = 'sia-save-';

/**
 * @typedef {object} MenuItem
 * @property {string} id
 * @property {string} [parentId]
 * @property {string} title
 * @property {'normal' | 'separator'} [type]
 */

/**
 * @param {{ defaultFormat: string }} settings
 * @param {{ avif?: boolean, webp?: boolean }} caps  formats the browser's canvas can encode
 * @param {(key: string, subs?: string[]) => string} t  i18n lookup
 * @returns {MenuItem[]}
 */
export function buildMenu(settings, caps, t) {
  /** @type {import('./plan.js').Format[]} */
  const formats = ['png', 'jpg'];
  if (caps.webp !== false) formats.push('webp');
  if (caps.avif) formats.push('avif');
  const first = isFormat(settings.defaultFormat) && formats.includes(settings.defaultFormat) ? settings.defaultFormat : 'png';
  const ordered = [first, ...formats.filter((f) => f !== first)];
  /** @type {MenuItem[]} */
  const items = [{ id: PARENT_ID, title: t('menuParent') }];
  for (const f of ordered) items.push({ id: SAVE_PREFIX + f, parentId: PARENT_ID, title: t('menuSaveAs', [FORMATS[f].label]) });
  items.push({ id: 'sia-sep-1', parentId: PARENT_ID, title: '', type: 'separator' });
  items.push({ id: COPY_ID, parentId: PARENT_ID, title: t('menuCopyPng') });
  items.push({ id: ORIGINAL_ID, parentId: PARENT_ID, title: t('menuOriginal') });
  return items;
}

/**
 * What a clicked menu id means.
 * @param {string | number} id
 * @returns {{ kind: 'save', format: import('./plan.js').Format } | { kind: 'copy' } | { kind: 'original' } | null}
 */
export function parseMenuId(id) {
  const s = String(id);
  if (s === COPY_ID) return { kind: 'copy' };
  if (s === ORIGINAL_ID) return { kind: 'original' };
  if (s.startsWith(SAVE_PREFIX)) {
    const f = s.slice(SAVE_PREFIX.length);
    return isFormat(f) ? { kind: 'save', format: f } : null;
  }
  return null;
}
