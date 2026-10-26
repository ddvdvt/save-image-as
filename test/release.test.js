// Release checks: brand-site links, manifest fields required by the Chrome Web Store,
// locales, permissions actually used by the code, no remote code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, SLUG, brandUrls, welcomeUrlFor } from '../extension/lib/brand.js';
import { ALL_SITES } from '../extension/lib/origin.js';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const read = (p) => readFileSync(join(EXT, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const LOCALES = readdirSync(join(EXT, '_locales'));

/** @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(EXT);
const code = files.filter((f) => /\.(js|html)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');

/** Which code proves that a permission is used. */
const USAGE = {
  activeTab: /chrome\.scripting\.executeScript/,
  scripting: /chrome\.scripting\./,
  storage: /chrome\.storage\./,
  contextMenus: /chrome\.contextMenus\./,
  downloads: /chrome\.downloads\.download\(/,
  offscreen: /chrome\.offscreen\s*\.createDocument\(/,
};

test('brand URLs are built from one BASE', () => {
  assert.equal(SLUG, 'save-image-as');
  assert.match(BASE, /^https:\/\/.+\/$/);
  const u = brandUrls();
  assert.equal(u.welcome, `${BASE}welcome/save-image-as.html`);
  assert.equal(u.bye, `${BASE}bye/save-image-as.html`);
  assert.equal(u.privacy, `${BASE}privacy/save-image-as.html`);
  assert.equal(u.other, `${BASE}#save-image-as`);
  assert.equal(brandUrls('https://a.example/site', 'x').welcome, 'https://a.example/site/welcome/x.html');
});

test('welcome page opens only on a fresh install', () => {
  assert.equal(welcomeUrlFor('install'), `${BASE}welcome/save-image-as.html`);
  for (const r of ['update', 'chrome_update', 'shared_module_update', undefined]) assert.equal(welcomeUrlFor(r), null);
});

test('service worker wires the welcome and uninstall pages', () => {
  const sw = read(manifest.background.service_worker);
  assert.match(sw, /from '\.\.\/lib\/brand\.js'/);
  assert.match(sw, /welcomeUrlFor\(details/);
  assert.match(sw, /setUninstallURL\(brandUrls\(\)\.bye\)/);
});

test('"other extensions" links go to the brand site, no placeholders left', () => {
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    const html = readFileSync(f, 'utf8');
    assert.ok(!html.includes('https://github.com/'), `${f} still links to the github.com placeholder`);
    for (const m of html.matchAll(/<a [^>]*data-i18n="otherExtensions"[^>]*>/g)) assert.match(m[0], /data-brand-link="other"/, f);
  }
});

test('manifest: CWS fields', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.homepage_url, BASE, 'homepage_url must equal BASE from lib/brand.js');
  assert.equal(manifest.default_locale, 'ru');
  assert.equal(manifest.content_security_policy, undefined, 'default CSP');
  for (const size of ['16', '32', '48', '128']) {
    const png = readFileSync(join(EXT, manifest.icons[size]));
    assert.equal(png.readUInt32BE(16), Number(size), `icon ${size} width`);
    assert.equal(png.readUInt32BE(20), Number(size), `icon ${size} height`);
  }
});

test('manifest: every permission is used by the code', () => {
  assert.deepEqual([...manifest.permissions].sort(), Object.keys(USAGE).sort());
  for (const p of manifest.permissions) assert.match(code, USAGE[p], `permission ${p} unused`);
  assert.equal(manifest.host_permissions, undefined, 'no install-time host access');
});

test('manifest: host access is optional and requested only at the moment of need', () => {
  assert.deepEqual(manifest.optional_host_permissions, ALL_SITES);
  assert.equal(manifest.optional_permissions, undefined);
  assert.match(code, /chrome\.permissions\.request\(/);
  assert.match(code, /chrome\.permissions\.remove\(/, 'the user can revoke access in the options');
  assert.equal(manifest.content_scripts, undefined, 'nothing runs on pages until the user clicks');
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('locales: ru and en complete, CWS length limits', () => {
  assert.deepEqual(LOCALES.sort(), ['en', 'kk', 'ru']);
  const all = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read(`_locales/${l}/messages.json`))]));
  const keys = Object.keys(all.ru).sort();
  const used = new Set([...code.matchAll(/data-i18n(?:-[a-z]+)?="([A-Za-z0-9_]+)"/g), ...code.matchAll(/\bt\('([A-Za-z0-9_]+)'[,)]/g)].map((m) => m[1]));
  for (const m of JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(m[1]);
  for (const l of LOCALES) {
    assert.deepEqual(Object.keys(all[l]).sort(), keys, `${l} keys`);
    for (const k of used) assert.ok(all[l][k], `${l}: missing ${k}`);
    assert.ok([...all[l].extName.message].length <= 75, `${l} name too long`);
    assert.ok([...all[l].extShortName.message].length <= 12, `${l} short_name too long`);
    assert.ok([...all[l].extDescription.message].length <= 132, `${l} description too long`);
  }
});

test('no remote code, eval or debug leftovers', () => {
  for (const f of files.filter((x) => /\.(js|html)$/.test(x))) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/<script[^>]+src="https?:/.test(src), `${f}: remote script`);
    assert.ok(!/\beval\(|new Function\(|debugger;/.test(src), `${f}: eval/debugger`);
    assert.ok(!/console\.log\(/.test(src), `${f}: console.log`);
    assert.ok(!/\b(TODO|FIXME)\b/.test(src) || f.endsWith('brand.js'), `${f}: TODO left`);
  }
});
