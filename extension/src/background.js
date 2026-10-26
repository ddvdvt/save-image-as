// Service worker: the "Save image as…" context menu, the conversion pipeline and the brand pages.
//
// Pipeline for one click (a "job"):
//   1. get the image bytes without a permanent host permission:
//      data: URL → decoded in the extension; blob: URL / same-origin / CORS image → read inside the
//      page (activeTab + scripting, granted by the click); other hosts → the extension fetches it
//      itself if the user has allowed that host, otherwise a small window asks for that one host;
//   2. the offscreen document converts it on a canvas (lib/plan.js decides what to do);
//   3. chrome.downloads saves it (or the page puts a PNG on the clipboard);
//   4. errors and notes are shown as a small notice on the page.
import { brandUrls, welcomeUrlFor } from '../lib/brand.js';
import { buildMenu, parseMenuId } from '../lib/menu.js';
import { normalizeSettings } from '../lib/settings.js';
import { buildFilename } from '../lib/filename.js';
import { FORMATS, LIMITS, visibleNotes } from '../lib/plan.js';
import { originPattern, hostLabel, urlKind } from '../lib/origin.js';
import { readImageInPage, copyPngInPage, showToastInPage } from './page/inject.js';

const OFFSCREEN = 'src/offscreen/offscreen.html';
const t = (/** @type {string} */ key, /** @type {string[]=} */ subs) => chrome.i18n.getMessage(key, subs) || key;

/**
 * @typedef {object} Job
 * @property {string} id
 * @property {{ kind: 'save', format: import('../lib/plan.js').Format } | { kind: 'copy' } | { kind: 'original' }} action
 * @property {string} srcUrl
 * @property {string} pageUrl
 * @property {string} pageTitle
 * @property {number} tabId
 * @property {number} frameId
 * @property {number} created
 */

// ---------- settings & capabilities ----------

async function loadSettings() {
  const r = await chrome.storage.local.get('settings');
  return normalizeSettings(r.settings);
}

/** Can this browser's canvas encode `mime`? (Chrome: PNG/JPEG/WebP yes, AVIF not yet.) */
async function canEncode(mime) {
  try {
    const c = new OffscreenCanvas(1, 1);
    c.getContext('2d');
    const b = await c.convertToBlob({ type: mime });
    return b.type === mime;
  } catch {
    return false;
  }
}

let menuQueue = Promise.resolve();
function rebuildMenu() {
  menuQueue = menuQueue.then(async () => {
    const settings = await loadSettings();
    const caps = { webp: await canEncode('image/webp'), avif: await canEncode('image/avif') };
    await chrome.contextMenus.removeAll();
    for (const { title, ...item } of buildMenu(settings, caps, t)) {
      const props = item.type === 'separator' ? item : { ...item, title };
      chrome.contextMenus.create({ ...props, contexts: ['image'] }, () => void chrome.runtime.lastError);
    }
  }).catch(() => {});
  return menuQueue;
}

// ---------- offscreen converter ----------

let creating = null;
async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN);
  const found = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (found.length) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({ url: OFFSCREEN, reasons: ['BLOBS'], justification: 'Decode the image and encode PNG/JPG/WebP on a canvas, then hand a blob: URL to chrome.downloads.' })
      .catch((e) => {
        if (!String(e).includes('Only a single offscreen')) throw e;
      })
      .finally(() => (creating = null));
  }
  await creating;
}

async function closeOffscreenIfIdle() {
  const { pending = {} } = await chrome.storage.session.get('pending');
  if (Object.keys(pending).length) return;
  try {
    await chrome.offscreen.closeDocument();
  } catch {
    /* already closed */
  }
}

/** @param {object} request */
async function convertInOffscreen(request) {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'convert', request });
  return res || { ok: false, error: 'decode' };
}

// ---------- page helpers (activeTab) ----------

/** @param {Job} job @param {boolean} wantBytes */
async function readFromPage(job, wantBytes) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: job.tabId, frameIds: [job.frameId] },
      func: readImageInPage,
      args: [job.srcUrl, { fetch: wantBytes, maxBytes: LIMITS.pageBytes }],
    });
    return r && r.result ? r.result : null;
  } catch {
    return null; // no access to this tab/frame (browser page, cross-origin frame…)
  }
}

/**
 * Notice on the page; if the page cannot be scripted, fall back to the toolbar badge + tooltip.
 * @param {Job} job
 * @param {{ text: string, kind: 'ok' | 'info' | 'error', actionLabel?: string, actionMessage?: object }} o
 */
async function notify(job, o) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: job.tabId, frameIds: [0] },
      func: showToastInPage,
      args: [{ ...o, closeLabel: t('close'), ms: o.kind === 'error' || o.actionLabel ? 12000 : 6000 }],
    });
    if (r && r.result) return;
  } catch {
    /* fall through */
  }
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId: job.tabId, color: o.kind === 'error' ? '#b3261e' : '#0e7c66' });
    await chrome.action.setBadgeText({ tabId: job.tabId, text: o.kind === 'error' ? '!' : '✓' });
    await chrome.action.setTitle({ tabId: job.tabId, title: o.text });
  } catch {
    /* tab closed */
  }
}

// ---------- jobs ----------

/** @param {Job} job */
async function remember(job) {
  const all = await chrome.storage.session.get(null);
  const stale = Object.keys(all).filter((k) => k.startsWith('job:') && Date.now() - (all[k].created || 0) > 3600_000);
  if (stale.length) await chrome.storage.session.remove(stale);
  await chrome.storage.session.set({ [`job:${job.id}`]: job });
}

/** @param {string} id @returns {Promise<Job | null>} */
async function recall(id) {
  const key = `job:${id}`;
  const r = await chrome.storage.session.get(key);
  return r[key] || null;
}

/** @param {string} code @param {number} [status] */
function errorText(code, status) {
  switch (code) {
    case 'http':
      return t('errHttp', [String(status || '?')]);
    case 'network':
      return t('errNetwork');
    case 'not-image':
      return t('errNotImage');
    case 'too-large':
      return t('errTooLarge');
    case 'encode-unsupported':
      return t('errEncode');
    case 'blob':
      return t('errBlob');
    case 'unreachable':
      return t('errUnreachable');
    default:
      return t('errDecode');
  }
}

/** @param {Job} job @param {string} code @param {number} [status] */
async function fail(job, code, status) {
  const offerOriginal = job.action.kind !== 'original' && ['too-large', 'decode', 'encode-unsupported'].includes(code);
  await notify(job, {
    kind: 'error',
    text: errorText(code, status),
    ...(offerOriginal ? { actionLabel: t('actionOriginal'), actionMessage: { type: 'sia:toastAction', do: 'original', jobId: job.id } } : {}),
  });
}

/** Open the small window that asks for access to one host. @param {Job} job */
async function askPermission(job) {
  await chrome.windows.create({
    url: chrome.runtime.getURL(`src/permission/permission.html?job=${encodeURIComponent(job.id)}`),
    type: 'popup',
    width: 500,
    height: 520,
    focused: true,
  });
}

/**
 * Find a source the converter can read. Returns null when the job has been handed to the
 * permission window or failed (the user has already been told).
 * @param {Job} job
 * @param {boolean} afterGrant
 */
async function acquire(job, afterGrant) {
  const kind = urlKind(job.srcUrl);
  const pattern = originPattern(job.srcUrl);
  const allowed = pattern ? await chrome.permissions.contains({ origins: [pattern] }).catch(() => false) : false;
  const wantPageBytes = kind === 'blob' || kind === 'other' || (kind === 'http' && !allowed);
  const page = await readFromPage(job, wantPageBytes);
  const meta = { alt: page?.alt || '', pageTitle: page?.pageTitle || job.pageTitle || '' };

  if (kind === 'data') return { meta, source: { url: job.srcUrl, exact: true } };
  if (kind === 'http' && allowed) return { meta, source: { url: job.srcUrl, exact: true } };
  if (page?.ok && page.dataUrl && (page.exact || job.action.kind !== 'original' || kind !== 'http')) {
    return { meta, source: { url: page.dataUrl, exact: !!page.exact, mime: page.mime } };
  }
  if (page?.reason === 'http') {
    await fail(job, 'http', page.status);
    return null;
  }
  if (kind === 'http') {
    if (afterGrant) await fail(job, 'network');
    else await askPermission(job);
    return null;
  }
  await fail(job, page?.reason === 'too-large' ? 'too-large' : kind === 'blob' ? 'blob' : 'unreachable');
  return null;
}

/** @param {Job} job @param {{ afterGrant?: boolean }} [opts] */
async function runJob(job, opts = {}) {
  await remember(job);
  const settings = await loadSettings();
  const got = await acquire(job, !!opts.afterGrant);
  if (!got) return;
  const copy = job.action.kind === 'copy';
  const res = await convertInOffscreen({
    source: got.source,
    action: job.action,
    settings: { quality: settings.quality, background: settings.background, svgScale: settings.svgScale },
    output: copy ? 'dataUrl' : 'url',
  });
  if (!res.ok) {
    await fail(job, res.error, res.status);
    return closeOffscreenIfIdle();
  }

  const notes = visibleNotes(res.notes || []).map((k) => t(k));
  const animatedNote = (res.notes || []).includes('noteFirstFrame');

  if (copy) {
    await closeOffscreenIfIdle();
    let r = { ok: false, reason: 'error' };
    try {
      const [x] = await chrome.scripting.executeScript({ target: { tabId: job.tabId, frameIds: [job.frameId] }, func: copyPngInPage, args: [res.dataUrl] });
      r = (x && x.result) || r;
    } catch {
      /* no access to the frame */
    }
    if (!r.ok) return notify(job, { kind: 'error', text: r.reason === 'insecure' ? t('errCopyInsecure') : t('errCopy') });
    return notify(job, { kind: animatedNote ? 'info' : 'ok', text: [t('copied', [`${res.width}×${res.height}`]), ...notes].join('\n') });
  }

  const format = job.action.kind === 'save' ? FORMATS[job.action.format].label : String(res.ext).toUpperCase();
  const name = buildFilename(settings.pattern, { srcUrl: job.srcUrl, pageUrl: job.pageUrl, alt: got.meta.alt, pageTitle: got.meta.pageTitle, width: res.width, height: res.height, format }, res.ext);
  let id;
  try {
    id = await chrome.downloads.download({ url: res.url, filename: name, saveAs: settings.askWhere, conflictAction: 'uniquify' });
  } catch {
    try {
      id = await chrome.downloads.download({ url: res.url, filename: `image.${res.ext}`, saveAs: settings.askWhere, conflictAction: 'uniquify' });
    } catch {
      await revoke(res.url);
      return fail(job, 'decode');
    }
  }
  const { pending = {} } = await chrome.storage.session.get('pending');
  pending[id] = res.url;
  await chrome.storage.session.set({ pending });

  if (notes.length) {
    await notify(job, {
      kind: 'info',
      text: notes.join('\n'),
      ...(animatedNote ? { actionLabel: t('actionOriginal'), actionMessage: { type: 'sia:toastAction', do: 'original', jobId: job.id } } : {}),
    });
  } else if (settings.toastOnSave) {
    await notify(job, { kind: 'ok', text: t('saved', [name.split('/').pop() || name]) });
  }
}

/** @param {string} url */
async function revoke(url) {
  try {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'revoke', url });
  } catch {
    /* offscreen already gone: its blob URLs died with it */
  }
}

/**
 * Entry point for a context-menu click (also used by the e2e test through self.SaveImageAs).
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab | undefined} tab
 */
async function handleMenuClick(info, tab) {
  const action = parseMenuId(info.menuItemId);
  if (!action || !info.srcUrl || !tab || tab.id == null || tab.id < 0) return;
  /** @type {Job} */
  const job = {
    id: crypto.randomUUID(),
    action,
    srcUrl: info.srcUrl,
    pageUrl: info.pageUrl || tab.url || '',
    pageTitle: tab.title || '',
    tabId: tab.id,
    frameId: info.frameId || 0,
    created: Date.now(),
  };
  try {
    await runJob(job);
  } catch {
    await fail(job, 'decode');
  }
}

// ---------- wiring ----------

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleMenuClick(info, tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;
  if (msg.type === 'sia:resume' || msg.type === 'sia:toastAction') {
    (async () => {
      const job = await recall(String(msg.jobId || ''));
      if (!job) return sendResponse({ ok: false });
      sendResponse({ ok: true });
      if (msg.type === 'sia:resume') await runJob(job, { afterGrant: true });
      else if (msg.do === 'original') await runJob({ ...job, id: crypto.randomUUID(), action: { kind: 'original' }, created: Date.now() });
    })().catch(() => {});
    return true;
  }
  if (msg.type === 'sia:host') {
    // the permission window asks which host the job needs
    recall(String(msg.jobId || '')).then((job) =>
      sendResponse(job ? { ok: true, host: hostLabel(job.srcUrl), pattern: originPattern(job.srcUrl), srcUrl: job.srcUrl.slice(0, 300) } : { ok: false }),
    );
    return true;
  }
  return false;
});

chrome.downloads.onChanged.addListener(async (delta) => {
  const state = delta.state && delta.state.current;
  if (state !== 'complete' && state !== 'interrupted') return;
  const { pending = {} } = await chrome.storage.session.get('pending');
  const url = pending[delta.id];
  if (!url) return;
  delete pending[delta.id];
  await chrome.storage.session.set({ pending });
  await revoke(url);
  await closeOffscreenIfIdle();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) rebuildMenu();
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage().catch(() => {});
});

chrome.runtime.onInstalled.addListener((details) => {
  rebuildMenu();
  const url = welcomeUrlFor(details && details.reason);
  if (url) chrome.tabs.create({ url }).catch(() => {});
});
chrome.runtime.onStartup.addListener(rebuildMenu);

// Page shown after the extension is removed (no data is sent: it is a plain static page).
try {
  chrome.runtime.setUninstallURL(brandUrls().bye).catch(() => {});
} catch {
  /* not available in this context */
}

/** Automation hook for the e2e test (a context-menu click cannot be simulated). */
Object.assign(self, { SaveImageAs: { handleMenuClick, rebuildMenu } });
