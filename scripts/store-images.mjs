// Renders the Chrome Web Store images into store/:
//   screenshot-1..4.png (1280×800), promo-small.png (440×280), promo-marquee.png (1400×560).
// The extension UI is real (loaded unpacked into the installed Chromium): the notice on the page,
// the permission window and the options page. The browser's own context menu cannot be captured
// in headless mode, so screenshot 1 draws it in HTML with the extension's real menu labels from
// _locales/ru. Pages are a local fictional blog (store/fixtures/) under *.example host names.
// Run: node scripts/store-images.mjs      (REVIEW_DIR=<dir> also saves raw light/dark UI shots)
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, prepareExtension, launch, hideScrollbars, dataUrl, fileDataUrl, browserWindow, stage, render, promo } from './store-kit.mjs';
import { gif } from '../test/helpers/images.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store');
const FIX = join(OUT, 'fixtures');
const REVIEW = process.env.REVIEW_DIR;
const ru = JSON.parse(await readFile(join(ROOT, 'extension', '_locales', 'ru', 'messages.json'), 'utf8'));
const msg = (k, sub) => ru[k].message.replace('$1', sub ?? '');

// marmot.gif: two-frame pixel picture (hills, sun, a marmot that raises its head)
const pal = [[150, 205, 240], [96, 160, 72], [70, 128, 56], [150, 104, 60], [110, 74, 40], [255, 216, 77], [30, 30, 30], [250, 250, 250]];
const marmot = (up) => (x, y) => {
  const W = 398;
  const H = 220;
  if ((x - 330) ** 2 + (y - 50) ** 2 < 22 ** 2) return 5;
  const hill = H * 0.62 + Math.sin(x / 60) * 14;
  const cx = W * 0.42;
  const by = H * 0.66;
  const head = up ? by - 52 : by - 36;
  if ((x - cx) ** 2 / 34 ** 2 + (y - by) ** 2 / 40 ** 2 < 1) return 3;
  if ((x - cx) ** 2 + (y - head) ** 2 < 20 ** 2) return (x - cx + 7) ** 2 + (y - head + 4) ** 2 < 9 || (x - cx - 7) ** 2 + (y - head + 4) ** 2 < 9 ? 6 : 4;
  if (y > hill) return y > hill + 40 ? 2 : 1;
  return 0;
};
const GIF = gif(398, 220, pal, [marmot(false), marmot(true)]);
const SVG = await readFile(join(FIX, 'route.svg'));
let lakeWebp = Buffer.alloc(0);

const { server, port } = await startServer(async (path, host) => {
  if (path.startsWith('/brand/')) return { body: '<!doctype html><title>brand</title>' };
  if (host.startsWith('img.travel-cdn.example') && path === '/photos/altai-lake.webp') return { body: lakeWebp, type: 'image/webp' };
  if (path === '/blog/altai') return { body: await readFile(join(FIX, 'blog.html')) };
  if (path === '/img/marmot.gif') return { body: GIF, type: 'image/gif' };
  if (path === '/img/route.svg') return { body: SVG, type: 'image/svg+xml' };
  return null;
});
const BLOG = 'http://travel.example/blog/altai';

const ext = await prepareExtension(join(ROOT, 'extension'), {
  base: `http://127.0.0.1:${port}/brand/`,
  // activeTab cannot be granted in automation: the temporary copy may script the blog host only.
  patchManifest: (m) => (m.host_permissions = ['http://travel.example/*']),
});
const { context, sw, extId } = await launch(ext.extDir, ext.profile, {
  args: [`--host-resolver-rules=MAP travel.example 127.0.0.1:${port}, MAP img.travel-cdn.example 127.0.0.1:${port}`],
});
const icon = await fileDataUrl(join(ROOT, 'extension', 'icons', 'icon128.png'));

/** A Chrome-like context menu (Windows 11 look) with the extension's submenu open. */
function contextMenuCss() {
  return `
  .cm{position:absolute;z-index:99;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.08);padding:4px 0;font:14px "Segoe UI",system-ui,sans-serif;color:#202124;min-width:300px}
  .cm div{height:32px;display:flex;align-items:center;gap:10px;padding:0 16px 0 14px;white-space:nowrap}
  .cm .sep{height:1px;background:#e3e3e3;margin:4px 0;padding:0}
  .cm .on{background:#e8eaed}
  .cm .ico{width:16px;height:16px;flex:none}
  .cm .sp{width:16px;flex:none}
  .cm .arr{margin-left:auto;padding-left:24px;color:#5f6368}
  .cm .first{font-weight:600}`;
}

async function openBlog() {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1164, height: 591 });
  await page.goto(BLOG);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  await hideScrollbars(page);
  return page;
}

async function tabIdOf(url) {
  const helper = await context.newPage();
  await helper.goto(`chrome-extension://${extId}/src/options/options.html`);
  const id = await helper.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id, url);
  await helper.close();
  return id;
}

async function menuClick(tabId, menuItemId, srcUrl) {
  await sw.evaluate(
    async ([tabId, menuItemId, srcUrl, pageUrl]) => {
      const tab = await chrome.tabs.get(tabId);
      await self.SaveImageAs.handleMenuClick({ menuItemId, srcUrl, pageUrl, frameId: 0, editable: false }, tab);
    },
    [tabId, menuItemId, srcUrl, BLOG],
  );
}

try {
  await mkdir(OUT, { recursive: true });
  for (const p of context.pages()) if (p.url().includes('/brand/')) await p.close();

  // the lake photo, painted and WebP-encoded by Chromium
  const painter = await context.newPage();
  lakeWebp = Buffer.from(
    await painter.evaluate(() => {
      const W = 1624;
      const H = 800;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const x = c.getContext('2d');
      const sky = x.createLinearGradient(0, 0, 0, H * 0.55);
      sky.addColorStop(0, '#f6b26b');
      sky.addColorStop(0.6, '#fbd9a5');
      sky.addColorStop(1, '#fdeccf');
      x.fillStyle = sky;
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff3d6';
      x.beginPath();
      x.arc(W * 0.7, H * 0.3, 60, 0, Math.PI * 2);
      x.fill();
      const ridge = (base, amp, color, seed) => {
        x.fillStyle = color;
        x.beginPath();
        x.moveTo(0, H);
        for (let i = 0; i <= W; i += 8) x.lineTo(i, base - Math.abs(Math.sin(i / 170 + seed)) * amp - Math.sin(i / 53 + seed * 3) * amp * 0.12);
        x.lineTo(W, H);
        x.fill();
      };
      ridge(H * 0.5, 190, '#8a7ca8', 1.3);
      ridge(H * 0.56, 140, '#5d5a86', 2.1);
      ridge(H * 0.6, 90, '#3b4a62', 0.4);
      const lake = x.createLinearGradient(0, H * 0.6, 0, H);
      lake.addColorStop(0, '#6f8fb3');
      lake.addColorStop(1, '#22364f');
      x.fillStyle = lake;
      x.fillRect(0, H * 0.6, W, H * 0.4);
      x.fillStyle = 'rgba(255,240,210,.35)';
      for (let i = 0; i < 14; i++) x.fillRect(W * 0.7 - 120 + Math.sin(i) * 30, H * 0.62 + i * 12, 240 - i * 12, 3);
      return c.toDataURL('image/webp', 0.9).split(',')[1];
    }),
    'base64',
  );
  await painter.close();

  // 1 — context menu over a WebP photo
  const blog = await openBlog();
  await blog.evaluate(
    ([css, labels, icon]) => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.append(s);
      const hero = document.getElementById('hero').getBoundingClientRect();
      const x0 = hero.left + 300;
      const y0 = hero.top + 70;
      const main = document.createElement('div');
      main.className = 'cm';
      main.style.cssText = `left:${x0}px;top:${y0}px`;
      const row = (text, cls = '', arrow = false, img = '') =>
        `<div class="${cls}">${img ? `<img class="ico" src="${img}">` : '<span class="sp"></span>'}<span>${text}</span>${arrow ? '<span class="arr">&#9656;</span>' : ''}</div>`;
      main.innerHTML = [
        row('Открыть картинку в новой вкладке'),
        row('Сохранить картинку как...'),
        row('Копировать картинку'),
        row('Копировать адрес картинки'),
        '<div class="sep"></div>',
        row(labels.parent, 'on', true, icon),
        '<div class="sep"></div>',
        row('Просмотреть код'),
      ].join('');
      document.body.append(main);
      const parentRow = main.children[5].getBoundingClientRect();
      const sub = document.createElement('div');
      sub.className = 'cm';
      sub.style.cssText = `left:${parentRow.right - 4}px;top:${parentRow.top - 4}px`;
      sub.innerHTML = [row(labels.png, 'on first'), row(labels.jpg), row(labels.webp), '<div class="sep"></div>', row(labels.copy), row(labels.original)].join('');
      document.body.append(sub);
    },
    [contextMenuCss(), { parent: msg('menuParent'), png: msg('menuSaveAs', 'PNG'), jpg: msg('menuSaveAs', 'JPG'), webp: msg('menuSaveAs', 'WebP'), copy: msg('menuCopyPng'), original: msg('menuOriginal') }, icon],
  );
  const s1 = stage({
    eyebrow: 'Сохранить картинку как… · контекстное меню',
    caption: 'Правый клик по картинке — и вместо .webp у вас <mark>PNG, JPG или WebP</mark>',
    body: browserWindow({ tab: 'Алтай летом: пять озёр за неделю', address: 'travel.example/blog/altai', page: await dataUrl(blog), icon }),
  });
  await render(context, s1, join(OUT, 'screenshot-1.png'));
  await blog.close();

  // 2 — animated GIF: first frame + "Save original" notice (real notice from the extension)
  const blog2 = await openBlog();
  await blog2.evaluate(() => window.scrollTo(0, document.getElementById('anim').getBoundingClientRect().top + window.scrollY - 160));
  const tab2 = await tabIdOf(BLOG);
  await menuClick(tab2, 'sia-save-png', 'http://travel.example/img/marmot.gif');
  await blog2.waitForFunction(() => document.getElementById('save-image-as-toast')?.shadowRoot?.textContent);
  await blog2.evaluate(() => {
    // keep the notice on screen for the screenshot (it hides by itself after 12 s)
    document.getElementById('save-image-as-toast').shadowRoot.querySelector('.t').dispatchEvent(new MouseEvent('mouseenter'));
  });
  const s2 = stage({
    eyebrow: 'Сохранить картинку как… · GIF, SVG, data: и blob:',
    caption: 'Анимация? Сохранится первый кадр — или <mark>оригинал одной кнопкой</mark>',
    body: browserWindow({ tab: 'Алтай летом: пять озёр за неделю', address: 'travel.example/blog/altai', page: await dataUrl(blog2), icon }),
  });
  await render(context, s2, join(OUT, 'screenshot-2.png'));
  if (REVIEW) await blog2.screenshot({ path: join(REVIEW, 'sia-toast-light.png') });

  // 3 — the permission window for one CDN host (real extension page)
  const opened = context.waitForEvent('page', { predicate: (p) => p.url().includes('/permission/'), timeout: 15000 });
  await blog2.evaluate(() => window.scrollTo(0, 0));
  await blog2.evaluate(() => document.getElementById('save-image-as-toast')?.remove());
  await menuClick(tab2, 'sia-save-jpg', 'http://img.travel-cdn.example/photos/altai-lake.webp');
  const perm = await opened;
  await perm.setViewportSize({ width: 500, height: 445 });
  await perm.waitForSelector('body[data-ready="1"]');
  await perm.evaluate(() => document.activeElement && /** @type {HTMLElement} */ (document.activeElement).blur());
  const s3 = stage({
    eyebrow: 'Сохранить картинку как… · минимум разрешений',
    caption: 'Без доступа ко всем сайтам: разрешение просится <mark>для одного сервера</mark> и только когда нужно',
    body: browserWindow({ tab: 'Алтай летом: пять озёр за неделю', address: 'travel.example/blog/altai', page: await dataUrl(blog2), icon, popup: await dataUrl(perm), popupWidth: 500 }),
    extraCss: '.popup{right:auto;left:330px;top:110px}',
  });
  await render(context, s3, join(OUT, 'screenshot-3.png'));
  if (REVIEW) await perm.screenshot({ path: join(REVIEW, 'sia-permission-light.png') });
  await perm.close();
  await blog2.close();

  // 4 — options page
  const opt = await context.newPage();
  await opt.setViewportSize({ width: 1164, height: 591 });
  await opt.goto(`chrome-extension://${extId}/src/options/options.html`);
  await opt.waitForSelector('body[data-ready="1"]');
  await opt.evaluate(() => chrome.storage.local.set({ settings: { defaultFormat: 'png', quality: 90, pattern: '{site}/{name}' } }));
  await opt.reload();
  await opt.waitForSelector('body[data-ready="1"]');
  await hideScrollbars(opt);
  // zoom out a little so the format and file-name sections fit in one screenshot
  await opt.evaluate(() => (document.body.style.zoom = '0.8'));
  const s4 = stage({
    eyebrow: 'Сохранить картинку как… · настройки',
    caption: 'Формат по умолчанию, качество JPG, шаблон имени файла. <mark>Всё конвертируется у вас</mark>',
    body: browserWindow({ tab: 'Сохранить картинку как… — настройки', page: await dataUrl(opt), icon }),
  });
  await render(context, s4, join(OUT, 'screenshot-4.png'));
  if (REVIEW) await opt.screenshot({ path: join(REVIEW, 'sia-options-light.png'), fullPage: true });
  await opt.evaluate(() => chrome.storage.local.remove('settings'));
  await opt.close();

  // promo tiles
  const tile = {
    icon,
    name: 'PNG · JPG · WebP',
    eyebrow: 'Честные расширения',
    tagline: 'Правый клик по картинке — и <mark>никаких .webp</mark>, которые не открываются',
    facts: [['Цена', '0 ₽'], ['Аккаунт', 'не нужен'], ['Реклама', '0'], ['Трекеры', '0'], ['Конвертация', 'на устройстве']],
  };
  await render(context, promo({ ...tile, size: 'small' }), join(OUT, 'promo-small.png'), 440, 280);
  await render(context, promo({ ...tile, size: 'marquee' }), join(OUT, 'promo-marquee.png'), 1400, 560);

  if (REVIEW) {
    // dark theme of the extension pages (not store assets)
    const dark = await context.newPage();
    await dark.emulateMedia({ colorScheme: 'dark' });
    await dark.setViewportSize({ width: 1000, height: 800 });
    await dark.goto(`chrome-extension://${extId}/src/options/options.html`);
    await dark.waitForSelector('body[data-ready="1"]');
    await dark.screenshot({ path: join(REVIEW, 'sia-options-dark.png'), fullPage: true });
    await dark.goto(`chrome-extension://${extId}/src/permission/permission.html?job=expired`);
    await dark.setViewportSize({ width: 500, height: 430 });
    await dark.waitForSelector('body[data-ready="expired"]');
    await dark.screenshot({ path: join(REVIEW, 'sia-permission-expired-dark.png') });
    const blog3 = await openBlog();
    await blog3.emulateMedia({ colorScheme: 'dark' });
    await menuClick(await tabIdOf(BLOG), 'sia-save-png', 'http://travel.example/img/missing.png');
    await blog3.waitForFunction(() => document.getElementById('save-image-as-toast')?.shadowRoot?.textContent);
    await blog3.waitForTimeout(400);
    await blog3.screenshot({ path: join(REVIEW, 'sia-toast-error-dark.png') });
    await dark.close();
    await blog3.close();
  }
  console.log('store images written to', OUT);
} finally {
  await context.close();
  server.close();
  await ext.cleanup();
}
