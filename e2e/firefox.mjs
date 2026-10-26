// E2E in real Firefox: the Firefox build (scripts/firefox.mjs) is installed as a temporary add-on in
// a fresh profile and every context-menu action runs against the local fixture gallery (same
// fixtures as the Chrome smoke test). Nothing leaves 127.0.0.1: the fixture server is also the
// browser's HTTP proxy, so http://site.test/, cdn.test, cors.test and granted.test are answered locally.
//
// A context-menu click cannot be simulated: the test calls the same handler through the background
// hook self.SaveImageAs.handleMenuClick(info, tab). activeTab cannot be granted in automation: the
// temporary copy gets host permissions for site.test / granted.test / 127.0.0.1 (test-only change).
// Firefox-only differences checked here: conversion runs in the event page (no offscreen document),
// "Copy as PNG" uses clipboard.setImageData (works on http:// pages too), no AVIF encoder.
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe } from '../extension/lib/sniff.js';
import { png, gif } from '../test/helpers/images.js';
import { writeUnpacked, SLUG } from '../scripts/firefox.mjs';
import { startFirefox, proxyAware } from './firefox-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
async function step(name, fn) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

// ---------- fixtures (same as e2e/smoke.mjs) ----------
const palette = [[220, 40, 40], [40, 90, 220], [250, 250, 250]];
const FILES = {
  '/img/logo.png': png(64, 40, (x) => (x < 32 ? [0, 0, 0, 0] : [14, 124, 102, 255])),
  '/img/anim.gif': gif(16, 16, palette, [() => 0, () => 1]),
  '/img/icon.svg': Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#ffd84d"/><circle cx="60" cy="40" r="30" fill="#0e7c66"/></svg>'),
  '/img/fake.jpg': Buffer.from('<!doctype html><title>Not found</title><h1>Oops</h1>'),
  '/img/bomb.png': Buffer.concat([png(1, 1, () => [0, 0, 0, 255]).subarray(0, 16), Buffer.from([0, 0, 0x9c, 0x40, 0, 0, 0x75, 0x30]), png(1, 1, () => [0, 0, 0, 255]).subarray(24)]),
};
const TYPES = { png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', jpg: 'image/jpeg', webp: 'image/webp' };
let webpBytes = Buffer.alloc(0); // made by the browser itself (node has no WebP encoder)

const server = createServer(
  proxyAware(async (req, res) => {
    try {
      const host = String(req.headers.host || '').split(':')[0];
      const path = (req.url || '/').split('?')[0];
      if (path.startsWith('/brand/')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><title>brand ${path}</title>`);
      }
      if (path === '/page.html') {
        const dataPng = 'data:image/png;base64,' + png(8, 8, (x, y) => ((x + y) % 2 ? [255, 255, 255, 255] : [40, 90, 220, 255])).toString('base64');
        const html = (await readFile(join(ROOT, 'e2e', 'fixtures', 'page.html'), 'utf8')).replace('{{DATA_PNG}}', dataPng);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "style-src 'self'; object-src 'none'" });
        return res.end(html);
      }
      if (path.endsWith('.webp') && path.startsWith('/img/')) {
        const headers = { 'content-type': 'image/webp' };
        if (host === 'cors.test') headers['access-control-allow-origin'] = '*';
        res.writeHead(200, headers);
        return res.end(webpBytes);
      }
      const body = FILES[path];
      if (!body) throw new Error('404');
      const ext = path.split('.').pop() || '';
      res.writeHead(200, { 'content-type': path === '/img/fake.jpg' ? 'text/html' : TYPES[ext] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  }),
);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = /** @type {any} */ (server.address()).port;
const SITE = 'http://site.test/page.html';
const LOCAL = `http://127.0.0.1:${port}/page.html`;

// ---------- Firefox build, test copy ----------
const work = await mkdtemp(join(tmpdir(), `${SLUG}-ff-e2e-`));
const extDir = writeUnpacked(join(work, 'extension'));
const manifest = JSON.parse(await readFile(join(extDir, 'manifest.json'), 'utf8'));
assert.equal(manifest.background.scripts[0], 'src/background.js');
manifest.host_permissions = ['http://site.test/*', 'http://granted.test/*', 'http://127.0.0.1/*'];
manifest.permissions.push('clipboardRead'); // test-only: read the clipboard back
await writeFile(join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
const brandBase = `http://127.0.0.1:${port}/brand/`;
const brandFile = join(extDir, 'lib', 'brand.js');
const brandSrc = await readFile(brandFile, 'utf8');
const patchedBrand = brandSrc.replace(/export const BASE = '[^']*';/, `export const BASE = '${brandBase}';`);
assert.notEqual(patchedBrand, brandSrc, 'BASE constant found in lib/brand.js');
await writeFile(brandFile, patchedBrand);

const ff = await startFirefox({ extDir, addonId: manifest.browser_specific_settings.gecko.id, proxyPort: port });
const { bg } = ff;

let exitCode = 0;
try {
  await step('fresh install opens the welcome page of the brand site', async () => {
    const found = await ff.findPage((u) => u === `${brandBase}welcome/save-image-as.html`, 15000);
    assert.ok(found, 'welcome tab opened');
    await found.close();
  });

  const helper = await ff.helperPage();
  await ff.waitFor(helper, () => document.body.dataset.ready === '1');

  await step('Firefox build: event page, no offscreen API, no install-time errors', async () => {
    const r = await bg((b) => ({ offscreen: typeof b.chrome.offscreen, hook: typeof b.SaveImageAs?.handleMenuClick, doc: typeof b.document }));
    assert.deepEqual(r, { offscreen: 'undefined', hook: 'function', doc: 'object' });
  });

  // record the options the extension passes to downloads.download (saveAs, conflictAction)
  await bg((b) => {
    const orig = b.chrome.downloads.download.bind(b.chrome.downloads);
    b.__requested = {};
    b.chrome.downloads.download = async (opts) => {
      const id = await orig(opts);
      b.__requested[id] = opts;
      return id;
    };
  });

  const webpB64 = await helper.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 200;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 320, 200);
    g.addColorStop(0, '#2a6fdb');
    g.addColorStop(1, '#ffd84d');
    x.fillStyle = g;
    x.fillRect(0, 0, 320, 200);
    return c.toDataURL('image/webp', 0.9).split(',')[1];
  });
  webpBytes = Buffer.from(webpB64, 'base64');
  assert.equal(describe(new Uint8Array(webpBytes)).type, 'webp', 'Firefox canvas encodes WebP');

  await step('context menu: PNG/JPG/WebP, copy and original; no AVIF (Firefox has no AVIF encoder)', async () => {
    const r = await bg(async (b) => {
      await b.SaveImageAs.rebuildMenu();
      const exists = (id) => new Promise((res) => b.chrome.contextMenus.update(id, {}, () => res(!b.chrome.runtime.lastError)));
      const c = new OffscreenCanvas(1, 1);
      c.getContext('2d');
      const avif = (await c.convertToBlob({ type: 'image/avif' })).type === 'image/avif';
      return { png: await exists('sia-save-png'), jpg: await exists('sia-save-jpg'), webp: await exists('sia-save-webp'), copy: await exists('sia-copy-png'), orig: await exists('sia-original'), avifItem: await exists('sia-save-avif'), avif };
    });
    assert.deepEqual(r, { png: true, jpg: true, webp: true, copy: true, orig: true, avifItem: r.avif, avif: r.avif });
  });

  const page = await ff.open(SITE);
  await ff.waitFor(page, () => document.body.dataset.blob === '1' && Array.from(document.images).filter((i) => i.id !== 'cdn').every((i) => i.complete));
  // (match patterns with a port are invalid in Firefox: compare the URL instead)
  const tabIdOf = (url) => helper.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
  const siteTab = await tabIdOf(SITE);
  assert.ok(siteTab, 'fixture tab found');

  let lastId = 0;
  async function click(menuItemId, srcUrl, { tabId = siteTab, pageUrl = SITE, expectDownload = true, p = page } = {}) {
    await p.evaluate(() => document.getElementById('save-image-as-toast')?.remove()).catch(() => {});
    await bg(
      async (b, menuItemId, srcUrl, tabId, pageUrl) => {
        const tab = await b.chrome.tabs.get(tabId);
        await b.SaveImageAs.handleMenuClick({ menuItemId, srcUrl, pageUrl, frameId: 0, editable: false }, tab);
      },
      menuItemId,
      srcUrl,
      tabId,
      pageUrl,
    );
    if (!expectDownload) return null;
    const item = await waitDownload();
    const requested = await bg((b, id) => b.__requested[id], item.id);
    const bytes = new Uint8Array(readFileSync(item.filename));
    const name = relative(ff.downloads, item.filename).split(sep).join('/');
    return { item, requested, name, bytes, info: describe(bytes) };
  }

  async function waitDownload() {
    let item = null;
    for (let i = 0; i < 150 && !item; i++) {
      const [d] = await bg((b) => b.chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }));
      if (d && d.id > lastId && d.state !== 'in_progress') item = d;
      else await sleep(100);
    }
    if (!item) {
      const toast = await page.evaluate(() => document.getElementById('save-image-as-toast')?.shadowRoot?.textContent || '(no notice)').catch((e) => String(e));
      const all = await bg(async (b, tabId) => [await b.chrome.downloads.search({}), await b.chrome.action.getTitle({ tabId })], siteTab);
      assert.fail(`no finished download; notice: ${toast}; downloads: ${JSON.stringify(all)}`);
    }
    assert.equal(item.state, 'complete', `download state (${item.error || ''})`);
    lastId = item.id;
    return item;
  }

  async function toastText(p = page) {
    return ff.waitFor(p, () => document.getElementById('save-image-as-toast')?.shadowRoot?.querySelector('.m')?.textContent, undefined, 8000);
  }

  const pixel = (bytes, mime, x, y) =>
    helper.evaluate(
      async (b64, mime, x, y) => {
        const blob = await (await fetch(`data:${mime};base64,${b64}`)).blob();
        const bmp = await createImageBitmap(blob);
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        return Array.from(ctx.getImageData(x, y, 1, 1).data);
      },
      Buffer.from(bytes).toString('base64'),
      mime,
      x,
      y,
    );

  const img = (id) => page.evaluate((id) => document.getElementById(id).currentSrc || document.getElementById(id).src, id);

  await step('WebP → PNG: correct format, size and file name', async () => {
    const d = await click('sia-save-png', await img('webp'));
    assert.equal(d.info.type, 'png');
    assert.deepEqual(d.info.size, { width: 320, height: 200 });
    assert.equal(d.name, 'lake.png');
  });

  await step('transparent PNG → JPG: transparency filled with white', async () => {
    const d = await click('sia-save-jpg', await img('png'));
    assert.equal(d.info.type, 'jpeg');
    assert.equal(d.name, 'logo.jpg');
    const [r, g, b] = await pixel(d.bytes, 'image/jpeg', 5, 5);
    assert.ok(r > 245 && g > 245 && b > 245, `white background, got ${r},${g},${b}`);
    const [r2, g2, b2] = await pixel(d.bytes, 'image/jpeg', 50, 20);
    assert.ok(Math.abs(r2 - 14) < 20 && Math.abs(g2 - 124) < 20 && Math.abs(b2 - 102) < 20, `opaque part kept, got ${r2},${g2},${b2}`);
  });

  await step('PNG → PNG keeps the original bytes (no recompression)', async () => {
    const d = await click('sia-save-png', await img('png'));
    assert.deepEqual(Buffer.from(d.bytes), FILES['/img/logo.png']);
  });

  await step('animated GIF → PNG: first frame + notice with "Save original" that saves the .gif', async () => {
    const d = await click('sia-save-png', await img('gif'));
    assert.equal(d.info.type, 'png');
    assert.equal(d.name, 'anim.png');
    const [r] = await pixel(d.bytes, 'image/png', 3, 3);
    assert.ok(r > 200, 'first frame (red)');
    assert.match(await toastText(), /первый кадр|first frame/i);
    await page.evaluate(() => document.getElementById('save-image-as-toast').shadowRoot.querySelector('button:not(.x)').click());
    const item = await waitDownload();
    const orig = describe(new Uint8Array(readFileSync(item.filename)));
    assert.equal(orig.type, 'gif');
    assert.equal(orig.animated, true);
    assert.equal(relative(ff.downloads, item.filename), 'anim.gif');
  });

  await step('SVG without width/height → PNG at 2× of the viewBox', async () => {
    const d = await click('sia-save-png', await img('svg'));
    assert.equal(d.info.type, 'png');
    assert.deepEqual(d.info.size, { width: 240, height: 160 });
    const [r, g, b] = await pixel(d.bytes, 'image/png', 4, 4);
    assert.deepEqual([r, g, b], [255, 216, 77]);
  });

  await step('data: URL image → WebP, named after its alt text', async () => {
    const d = await click('sia-save-webp', await img('data'));
    assert.equal(d.info.type, 'webp');
    assert.equal(d.name, 'Схема.webp');
  });

  await step('blob: URL image is read from the page', async () => {
    const d = await click('sia-save-jpg', await img('blob'));
    assert.equal(d.info.type, 'jpeg');
    assert.deepEqual(d.info.size, { width: 50, height: 30 });
    assert.equal(d.name, 'Тестовая галерея.jpg');
  });

  await step('cross-origin image with CORS: read from the page, no permission needed', async () => {
    const d = await click('sia-save-png', 'http://cors.test/img/c.webp');
    assert.equal(d.info.type, 'png');
    assert.equal(d.name, 'c.png');
  });

  await step('cross-origin image on an allowed host: fetched by the extension', async () => {
    const d = await click('sia-save-jpg', 'http://granted.test/img/g.webp');
    assert.equal(d.info.type, 'jpeg');
    assert.equal(d.name, 'g.jpg');
  });

  await step('host permission not granted: the permission window asks for that one host; "Allow" opens the Firefox prompt', async () => {
    await click('sia-save-png', 'http://cdn.test/img/cdn-photo.webp', { expectDownload: false });
    const win = await ff.findPage((u) => u.includes('/permission/permission.html'), 10000);
    assert.ok(win, 'permission window opened');
    await ff.waitFor(win, () => document.body.dataset.ready === '1');
    assert.equal(await win.evaluate(() => document.getElementById('host').textContent), 'cdn.test');
    assert.match(await win.evaluate(() => document.getElementById('lead').textContent), /скачать|download/i);
    // A real click (user input) on "Allow": Firefox accepts the request and shows its own permission
    // prompt (browser UI, not automatable). permissions.request called without user input would be
    // rejected at once and the window would show "denied" — so a still-empty status proves the prompt is up.
    await win.click('#allowHost');
    await sleep(1500);
    assert.equal(await win.evaluate(() => document.getElementById('status').className.trim()), 'status', 'request pending on the Firefox prompt (not rejected)');
    // resuming without the grant must end with a clear error on the page
    const jobId = await win.evaluate(() => new URLSearchParams(location.search).get('job'));
    await win.evaluate((jobId) => chrome.runtime.sendMessage({ type: 'sia:resume', jobId }), jobId);
    assert.match(await toastText(), /Не удалось загрузить|Could not load/);
    await win.close();
  });

  await step('image that fails to load (404) → clear error; notice styled despite the page CSP', async () => {
    await click('sia-save-png', 'http://site.test/img/missing.png', { expectDownload: false });
    assert.match(await toastText(), /404/);
    const radius = await page.evaluate(() => getComputedStyle(document.getElementById('save-image-as-toast').shadowRoot.querySelector('.t')).borderTopLeftRadius);
    assert.equal(radius, '10px', 'notice styled despite the page CSP');
  });

  await step('URL that returns HTML instead of an image → clear error', async () => {
    await click('sia-save-png', 'http://site.test/img/fake.jpg', { expectDownload: false });
    assert.match(await toastText(), /не картинка|does not return an image/);
  });

  await step('huge image (40000×30000 header) is refused before decoding, original offered', async () => {
    await click('sia-save-jpg', 'http://site.test/img/bomb.png', { expectDownload: false });
    assert.match(await toastText(), /слишком большая|too large/);
    const label = await page.evaluate(() => document.getElementById('save-image-as-toast').shadowRoot.querySelector('button:not(.x)')?.textContent);
    assert.match(String(label), /оригинал|original/i);
  });

  /** Read the clipboard image back in an extension page (clipboardRead: test copy only). */
  const readClipboard = () =>
    helper.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const blob = await item.getType('image/png');
      const bmp = await createImageBitmap(blob);
      return { types: item.types, w: bmp.width, h: bmp.height };
    });

  await step('copy as PNG puts image/png on the clipboard — in Firefox also on an http:// page', async () => {
    await click('sia-copy-png', await img('png'), { expectDownload: false });
    assert.match(await toastText(), /скопирована|copied/i);
    const clip = await readClipboard();
    assert.ok(clip.types.includes('image/png'), `types ${clip.types}`);
    assert.deepEqual([clip.w, clip.h], [64, 40]);
  });

  await step('copy as PNG on a secure (127.0.0.1) page', async () => {
    const local = await ff.open(LOCAL);
    await ff.waitFor(local, () => document.getElementById('webp').complete);
    const tabId = await tabIdOf(LOCAL);
    await click('sia-copy-png', `http://127.0.0.1:${port}/img/lake.webp`, { expectDownload: false, tabId, pageUrl: LOCAL, p: local });
    assert.match(await toastText(local), /скопирована|copied/i);
    assert.deepEqual(Object.values(await readClipboard()).slice(1), [320, 200]);
    await local.close();
  });

  await step('settings: file name pattern with folder and size, JPG quality, default format first', async () => {
    await helper.evaluate(() => chrome.storage.local.set({ settings: { defaultFormat: 'webp', quality: 60, pattern: '{site}/{name}_{width}x{height}', toastOnSave: true } }));
    const d = await click('sia-save-jpg', await img('webp'));
    assert.equal(d.name, 'site.test/lake_320x200.jpg');
    assert.equal(d.requested?.conflictAction, 'uniquify');
    assert.equal(d.requested?.saveAs, false);
    assert.match(await toastText(), /lake_320x200\.jpg/);
    const low = d.bytes.length;
    await helper.evaluate(() => chrome.storage.local.set({ settings: { quality: 100, pattern: '{name}-q100' } }));
    const hi = await click('sia-save-jpg', await img('webp'));
    assert.ok(hi.bytes.length > low, `quality 100 (${hi.bytes.length}) > quality 60 (${low})`);
    await helper.evaluate(() => chrome.storage.local.remove('settings'));
  });

  await step('options page renders, saves settings and lists site access', async () => {
    await ff.navigate(helper, `${ff.base}${manifest.options_ui.page}`);
    await ff.waitFor(helper, () => document.body.dataset.ready === '1');
    await helper.click('label.pill input[value="jpg"]');
    await helper.click('#pattern', { count: 3 });
    await helper.keyboard.type('{date}/{name}');
    await ff.waitFor(helper, async () => (await chrome.storage.local.get('settings')).settings?.pattern === '{date}/{name}');
    const s = await helper.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    assert.equal(s.defaultFormat, 'jpg');
    assert.match(await helper.evaluate(() => document.getElementById('patternPreview').textContent), /^\d{4}-\d\d-\d\d\/mountain-lake\.jpg$/);
    await helper.click('#pattern', { count: 3 });
    await helper.keyboard.type('{nope}');
    await ff.waitFor(helper, () => /nope/.test(document.getElementById('patternError').textContent));
    assert.match(await helper.evaluate(() => document.getElementById('allStatus').textContent), /нет|no/i);
    assert.equal(await helper.evaluate(() => !document.getElementById('avifPill').classList.contains('hidden')), false, 'no AVIF option in Firefox');
    assert.equal(await helper.evaluate(() => document.querySelector('a[data-brand-link="other"]').href), `${brandBase}#save-image-as`);
  });

  await step('no errors in the background, options, permission window or content scripts', async () => {
    assert.deepEqual(await ff.errors(), []);
  });
} catch (e) {
  exitCode = 1;
  console.error('FAILED:', e);
  console.error('collected errors:', await ff.errors().catch(() => []));
} finally {
  await ff.close();
  server.close();
  await rm(work, { recursive: true, force: true }).catch(() => {});
}
console.log(`${passed} passed${exitCode ? ', FAILED' : ''}`);
process.exit(exitCode);
