import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalizeSettings } from '../extension/lib/settings.js';
import { buildMenu, parseMenuId, PARENT_ID, COPY_ID, ORIGINAL_ID } from '../extension/lib/menu.js';
import { originPattern, hostLabel, patternHost, urlKind, ALL_SITES } from '../extension/lib/origin.js';

const t = (k, subs) => (subs ? `${k}:${subs.join(',')}` : k);

test('normalizeSettings: defaults and validation', () => {
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULTS });
  assert.deepEqual(normalizeSettings('junk'), { ...DEFAULTS });
  const s = normalizeSettings({ defaultFormat: 'webp', quality: '80', background: '#FFAA00', askWhere: true, pattern: ' {site}/{name} ', svgScale: '1', toastOnSave: true });
  assert.deepEqual(s, { defaultFormat: 'webp', quality: 80, background: '#ffaa00', askWhere: true, pattern: '{site}/{name}', svgScale: 1, toastOnSave: true });
  const bad = normalizeSettings({ defaultFormat: 'gif', quality: 0, background: 'red', askWhere: 'yes', pattern: '{bogus}', svgScale: 3 });
  assert.deepEqual(bad, { ...DEFAULTS });
  assert.equal(normalizeSettings({ quality: 100 }).quality, 100);
});

test('menu: default format first, AVIF only when the browser can encode it', () => {
  const items = buildMenu({ defaultFormat: 'jpg' }, { webp: true, avif: false }, t);
  assert.equal(items[0].id, PARENT_ID);
  assert.deepEqual(items.slice(1, 4).map((i) => i.id), ['sia-save-jpg', 'sia-save-png', 'sia-save-webp']);
  assert.equal(items[1].title, 'menuSaveAs:JPG');
  assert.ok(items.every((i) => i.id === PARENT_ID || i.parentId === PARENT_ID));
  assert.ok(!items.some((i) => i.id === 'sia-save-avif'));
  assert.deepEqual(items.slice(-3).map((i) => i.type || i.id), ['separator', COPY_ID, ORIGINAL_ID]);
  const withAvif = buildMenu({ defaultFormat: 'avif' }, { webp: true, avif: true }, t);
  assert.equal(withAvif[1].id, 'sia-save-avif');
  const noAvif = buildMenu({ defaultFormat: 'avif' }, { avif: false }, t);
  assert.equal(noAvif[1].id, 'sia-save-png', 'falls back to PNG');
  const noWebp = buildMenu({ defaultFormat: 'png' }, { webp: false }, t);
  assert.ok(!noWebp.some((i) => i.id === 'sia-save-webp'));
  const ids = items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'ids unique');
});

test('parseMenuId', () => {
  assert.deepEqual(parseMenuId('sia-save-webp'), { kind: 'save', format: 'webp' });
  assert.deepEqual(parseMenuId(COPY_ID), { kind: 'copy' });
  assert.deepEqual(parseMenuId(ORIGINAL_ID), { kind: 'original' });
  assert.equal(parseMenuId('sia-save-gif'), null);
  assert.equal(parseMenuId(PARENT_ID), null);
  assert.equal(parseMenuId(42), null);
});

test('origin helpers', () => {
  assert.equal(originPattern('https://cdn.example.com:8443/a/b.webp?x=1'), 'https://cdn.example.com/*');
  assert.equal(originPattern('http://127.0.0.1:5000/x.png'), 'http://127.0.0.1/*');
  assert.equal(originPattern('data:image/png;base64,AA'), null);
  assert.equal(originPattern('blob:https://ex.com/uuid'), null);
  assert.equal(originPattern('file:///C:/x.png'), null);
  assert.equal(originPattern('nope'), null);
  assert.equal(hostLabel('https://cdn.example.com/x'), 'cdn.example.com');
  assert.equal(hostLabel('data:,x'), '');
  assert.equal(patternHost('https://cdn.example.com/*'), 'cdn.example.com');
  assert.equal(patternHost('*://*.example.com/*'), '*.example.com');
  assert.deepEqual(ALL_SITES, ['http://*/*', 'https://*/*']);
  assert.equal(urlKind('data:image/png;base64,'), 'data');
  assert.equal(urlKind('BLOB:https://x'), 'blob');
  assert.equal(urlKind('https://x/y.png'), 'http');
  assert.equal(urlKind('file:///x.png'), 'other');
});
