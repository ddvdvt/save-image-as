// E2E smoke test: load the unpacked extension into the locally installed Chromium and run every
// context-menu action against a local fixture gallery. Nothing leaves 127.0.0.1: the *.test host
// names are mapped to the local server with --host-resolver-rules.
//
// A context-menu click cannot be simulated, so the test calls the same handler through the
// service worker hook self.SaveImageAs.handleMenuClick(info, tab).
// activeTab cannot be granted in automation either: the temporary copy of the extension gets host
// permissions for the fixture page hosts (test-only change, never in the real manifest).
// granted.test is "pre-allowed" (like a host the user has allowed); cdn.test and cors.test are not.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe } from '../extension/lib/sniff.js';
import { png, gif } from '../test/helpers/images.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe =
  process.env.CHROMIUM_PATH ||
  join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe');
if (!existsSync(exe)) {
  console.error(`Chromium not found at ${exe}. Set CHROMIUM_PATH.`);
  process.exit(1);
}

let passed = 0;
async function step(name, fn) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

// ---------- fixtures ----------
const palette = [[220, 40, 40], [40, 90, 220], [250, 250, 250]];
const FILES = {
  // 64×40, transparent left half → JPG must fill it with the background colour
  '/img/logo.png': png(64, 40, (x) => (x < 32 ? [0, 0, 0, 0] : [14, 124, 102, 255])),
  '/img/anim.gif': gif(16, 16, palette, [() => 0, () => 1]),
  '/img/icon.svg': Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#ffd84d"/><circle cx="60" cy="40" r="30" fill="#0e7c66"/></svg>'),
  '/img/fake.jpg': Buffer.from('<!doctype html><title>Not found</title><h1>Oops</h1>'),
  // header claims 40000×30000: refused before decoding
  '/img/bomb.png': Buffer.concat([png(1, 1, () => [0, 0, 0, 255]).subarray(0, 16), Buffer.from([0, 0, 0x9c, 0x40, 0, 0, 0x75, 0x30]), png(1, 1, () => [0, 0, 0, 255]).subarray(24)]),
};
const TYPES = { png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', jpg: 'image/jpeg', webp: 'image/webp' };
let webpBytes = Buffer.alloc(0); // made by the browser itself (node has no WebP encoder)

const server = createServer(async (req, res) => {
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
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
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
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = /** @type {any} */ (server.address()).port;
const SITE = 'http://site.test/page.html';
const LOCAL = `http://127.0.0.1:${port}/page.html`; // secure context (clipboard works there)

// ---------- extension copy ----------
const work = await mkdtemp(join(tmpdir(), 'save-image-as-e2e-'));
const extDir = join(work, 'extension');
const profile = join(work, 'profile');
await cp(join(ROOT, 'extension'), extDir, { recursive: true });
const manifest = JSON.parse(await readFile(join(extDir, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://site.test/*', 'http://granted.test/*', 'http://127.0.0.1/*'];
await writeFile(join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
const brandBase = `http://127.0.0.1:${port}/brand/`;
const brandFile = join(extDir, 'lib', 'brand.js');
const brandSrc = await readFile(brandFile, 'utf8');
const patchedBrand = brandSrc.replace(/export const BASE = '[^']*';/, `export const BASE = '${brandBase}';`);
assert.notEqual(patchedBrand, brandSrc, 'BASE constant found in lib/brand.js');
await writeFile(brandFile, patchedBrand);

const context = await chromium.launchPersistentContext(profile, {
  executablePath: exe,
  headless: false,
  acceptDownloads: true,
  viewport: { width: 1000, height: 700 },
  args: [
    '--headless=new',
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    `--host-resolver-rules=MAP *.test 127.0.0.1:${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--renderer-process-limit=3',
  ],
});

/** Console errors of extension pages and the fixture pages. */
const consoleErrors = [];
const watch = (p) => {
  p.on('console', (m) => m.type() === 'error' && consoleErrors.push(`${p.url()}: ${m.text()}`));
  p.on('pageerror', (e) => consoleErrors.push(`${p.url()}: ${e.message}`));
};
context.on('page', watch);

let exitCode = 0;
try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  sw.on('console', (m) => m.type() === 'error' && consoleErrors.push(`sw: ${m.text()}`));

  await step('fresh install opens the welcome page of the brand site', async () => {
    const welcome = `${brandBase}welcome/save-image-as.html`;
    let found = null;
    for (let i = 0; i < 50 && !found; i++) {
      found = context.pages().find((p) => p.url() === welcome);
      if (!found) await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(found, 'welcome tab opened');
    await found.close();
  });

  // WebP fixture bytes, encoded by Chromium
  const helper = await context.newPage();
  await helper.goto(`chrome-extension://${extId}/src/options/options.html`);
  await helper.waitForSelector('body[data-ready]');
  // Under automation Chromium stores downloads under GUID names, so record the file name the
  // extension asked for (that is what a user gets) by wrapping chrome.downloads.download.
  await sw.evaluate(() => {
    const orig = chrome.downloads.download.bind(chrome.downloads);
    self.__requested = {};
    chrome.downloads.download = async (opts) => {
      const id = await orig(opts);
      self.__requested[id] = opts;
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
  assert.equal(describe(new Uint8Array(webpBytes)).type, 'webp');

  await step('context menu: PNG/JPG/WebP, copy and original; AVIF only if the browser encodes it', async () => {
    const r = await sw.evaluate(async () => {
      await self.SaveImageAs.rebuildMenu();
      const exists = (id) => new Promise((res) => chrome.contextMenus.update(id, {}, () => res(!chrome.runtime.lastError)));
      const c = new OffscreenCanvas(1, 1);
      c.getContext('2d');
      const avif = (await c.convertToBlob({ type: 'image/avif' })).type === 'image/avif';
      return { png: await exists('sia-save-png'), jpg: await exists('sia-save-jpg'), webp: await exists('sia-save-webp'), copy: await exists('sia-copy-png'), orig: await exists('sia-original'), avifItem: await exists('sia-save-avif'), avif };
    });
    assert.deepEqual({ ...r, avifItem: undefined, avif: undefined }, { png: true, jpg: true, webp: true, copy: true, orig: true, avifItem: undefined, avif: undefined });
    assert.equal(r.avifItem, r.avif, 'AVIF item present exactly when the encoder exists');
  });

  const page = await context.newPage();
  await page.goto(SITE);
  await page.waitForSelector('body[data-blob="1"]');
  await page.waitForFunction(() => Array.from(document.images).filter((i) => i.id !== 'cdn').every((i) => i.complete));
  const tabIdOf = (url) => helper.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id, url);
  const siteTab = await tabIdOf(SITE);
  assert.ok(siteTab, 'fixture tab found');

  let lastId = 0;
  /** Simulate a context-menu click and wait for the resulting download (if any). */
  async function click(menuItemId, srcUrl, { tabId = siteTab, pageUrl = SITE, expectDownload = true } = {}) {
    await page.evaluate(() => document.getElementById('save-image-as-toast')?.remove()).catch(() => {});
    await sw.evaluate(
      async ([menuItemId, srcUrl, tabId, pageUrl]) => {
        const tab = await chrome.tabs.get(tabId);
        await self.SaveImageAs.handleMenuClick({ menuItemId, srcUrl, pageUrl, frameId: 0, editable: false }, tab);
      },
      [menuItemId, srcUrl, tabId, pageUrl],
    );
    if (!expectDownload) return null;
    const item = await sw.evaluate(async (since) => {
      for (let i = 0; i < 150; i++) {
        const [d] = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 });
        if (d && d.id > since && d.state !== 'in_progress') return d;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    }, lastId);
    assert.ok(item, `download for ${menuItemId} ${srcUrl}`);
    assert.equal(item.state, 'complete', `download state (${item.error || ''})`);
    lastId = item.id;
    const requested = await sw.evaluate((id) => self.__requested[id], item.id);
    const bytes = new Uint8Array(readFileSync(item.filename));
    return { item, requested, name: requested.filename, bytes, info: describe(bytes) };
  }

  async function toastText(p = page, timeout = 8000) {
    await p.waitForFunction(() => document.getElementById('save-image-as-toast')?.shadowRoot?.textContent, null, { timeout });
    return p.evaluate(() => document.getElementById('save-image-as-toast').shadowRoot.querySelector('.m').textContent);
  }

  /** Decode a saved file in an extension page and read one pixel. */
  const pixel = (bytes, mime, x, y) =>
    helper.evaluate(
      async ([b64, mime, x, y]) => {
        const blob = await (await fetch(`data:${mime};base64,${b64}`)).blob();
        const bmp = await createImageBitmap(blob);
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        return Array.from(ctx.getImageData(x, y, 1, 1).data);
      },
      [Buffer.from(bytes).toString('base64'), mime, x, y],
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
    const text = await toastText();
    assert.match(text, /первый кадр|first frame/i);
    await page.evaluate(() => document.getElementById('save-image-as-toast').shadowRoot.querySelector('button:not(.x)').click());
    const item = await sw.evaluate(async (since) => {
      for (let i = 0; i < 100; i++) {
        const [x] = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 });
        if (x && x.id > since && x.state === 'complete') return x;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    }, lastId);
    assert.ok(item, 'original downloaded');
    lastId = item.id;
    const orig = describe(new Uint8Array(readFileSync(item.filename)));
    assert.equal(orig.type, 'gif');
    assert.equal(orig.animated, true);
    assert.equal((await sw.evaluate((id) => self.__requested[id], item.id)).filename, 'anim.gif');
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

  await step('cross-origin image without access: the permission window asks for that one host', async () => {
    const opened = context.waitForEvent('page', { predicate: (p) => p.url().includes('/permission/permission.html'), timeout: 10000 });
    await click('sia-save-png', 'http://cdn.test/img/cdn-photo.webp', { expectDownload: false });
    const win = await opened;
    await win.waitForSelector('body[data-ready="1"]');
    assert.equal(await win.textContent('#host'), 'cdn.test');
    assert.match(await win.textContent('#lead'), /скачать|download/i);
    // "Allow" would open Chrome's own dialog (not automatable); resuming without the grant
    // must end with a clear error on the page instead of a silent failure.
    const jobId = new URL(win.url()).searchParams.get('job');
    await win.evaluate((jobId) => chrome.runtime.sendMessage({ type: 'sia:resume', jobId }), jobId);
    assert.match(await toastText(), /Не удалось загрузить|Could not load/);
    await win.close();
  });

  await step('image that fails to load (404) → clear error', async () => {
    await click('sia-save-png', `http://site.test/img/missing.png`, { expectDownload: false });
    assert.match(await toastText(), /404/);
  });

  await step('URL that returns HTML instead of an image → clear error', async () => {
    await click('sia-save-png', `http://site.test/img/fake.jpg`, { expectDownload: false });
    assert.match(await toastText(), /не картинка|does not return an image/);
  });

  await step('huge image (40000×30000 header) is refused before decoding, original offered', async () => {
    await click('sia-save-jpg', `http://site.test/img/bomb.png`, { expectDownload: false });
    assert.match(await toastText(), /слишком большая|too large/);
    const label = await page.evaluate(() => document.getElementById('save-image-as-toast').shadowRoot.querySelector('button:not(.x)')?.textContent);
    assert.match(String(label), /оригинал|original/i);
  });

  await step('copy as PNG on a non-secure (http) page → explained error', async () => {
    await click('sia-copy-png', await img('png'), { expectDownload: false });
    assert.match(await toastText(), /https/);
  });

  await step('copy as PNG puts image/png on the clipboard', async () => {
    const local = await context.newPage();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${port}` });
    await local.goto(LOCAL);
    await local.waitForFunction(() => document.getElementById('webp').complete);
    await local.bringToFront();
    const tabId = await tabIdOf(LOCAL);
    await sw.evaluate(
      async ([tabId, src, pageUrl]) => {
        const tab = await chrome.tabs.get(tabId);
        await self.SaveImageAs.handleMenuClick({ menuItemId: 'sia-copy-png', srcUrl: src, pageUrl, frameId: 0, editable: false }, tab);
      },
      [tabId, `http://127.0.0.1:${port}/img/lake.webp`, LOCAL],
    );
    assert.match(await toastText(local), /скопирована|copied/i);
    const clip = await local.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const blob = await item.getType('image/png');
      const bmp = await createImageBitmap(blob);
      return { types: item.types, w: bmp.width, h: bmp.height };
    });
    assert.ok(clip.types.includes('image/png'));
    assert.deepEqual([clip.w, clip.h], [320, 200]);
    await local.close();
  });

  await step('settings: file name pattern with folder and size, JPG quality, default format first', async () => {
    await helper.evaluate(() => chrome.storage.local.set({ settings: { defaultFormat: 'webp', quality: 60, pattern: '{site}/{name}_{width}x{height}', toastOnSave: true } }));
    const d = await click('sia-save-jpg', await img('webp'));
    assert.equal(d.name, 'site.test/lake_320x200.jpg');
    assert.equal(d.requested.conflictAction, 'uniquify');
    assert.equal(d.requested.saveAs, false);
    assert.match(await toastText(), /lake_320x200\.jpg/);
    const low = d.bytes.length;
    await helper.evaluate(() => chrome.storage.local.set({ settings: { quality: 100, pattern: '{name}-q100' } }));
    const hi = await click('sia-save-jpg', await img('webp'));
    assert.ok(hi.bytes.length > low, `quality 100 (${hi.bytes.length}) > quality 60 (${low})`);
    await helper.evaluate(() => chrome.storage.local.remove('settings'));
  });

  await step('options page renders, saves settings and lists site access', async () => {
    await helper.reload();
    await helper.waitForSelector('body[data-ready="1"]');
    await helper.click('label.pill:has(input[value="jpg"])');
    await helper.fill('#pattern', '{date}/{name}');
    await helper.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.pattern === '{date}/{name}');
    const s = await helper.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    assert.equal(s.defaultFormat, 'jpg');
    assert.match(await helper.textContent('#patternPreview'), /^\d{4}-\d\d-\d\d\/mountain-lake\.jpg$/);
    await helper.fill('#pattern', '{nope}');
    assert.match(await helper.textContent('#patternError'), /nope/);
    assert.match(await helper.textContent('#allStatus'), /нет|no/i);
    assert.equal(await helper.isVisible('#avifPill'), await helper.evaluate(async () => {
      const c = new OffscreenCanvas(1, 1);
      c.getContext('2d');
      return (await c.convertToBlob({ type: 'image/avif' })).type === 'image/avif';
    }));
    const footer = await helper.getAttribute('a[data-brand-link="other"]', 'href');
    assert.equal(footer, `${brandBase}#save-image-as`);
  });

  if (process.env.E2E_SCREENSHOTS) {
    await helper.setViewportSize({ width: 900, height: 1400 });
    await helper.screenshot({ path: join(process.env.E2E_SCREENSHOTS, 'options.png'), fullPage: true });
  }

  await step('no console errors in the service worker, options, permission window or pages', async () => {
    // expected noise: the 404 fixture, and the blocked CORS read of cdn.test inside the page (the
    // browser logs "net::ERR_FAILED" for it before the extension falls back to asking for access)
    const expected = (e) =>
      /404/.test(e) ||
      e === 'http://site.test/page.html: Failed to load resource: net::ERR_FAILED' ||
      (e.startsWith("http://site.test/page.html: Access to fetch at 'http://cdn.test/") && e.includes('blocked by CORS policy'));
    assert.deepEqual(consoleErrors.filter((e) => !expected(e)), []);
  });
} catch (e) {
  exitCode = 1;
  console.error('FAILED:', e);
} finally {
  await context.close();
  server.close();
  await rm(work, { recursive: true, force: true }).catch(() => {});
}
console.log(`${passed} passed${exitCode ? ', FAILED' : ''}`);
process.exit(exitCode);
