import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameFromUrl, isGenericName, sanitizeSegment, bestName, buildFilename, checkPattern, stripExtension, TOKENS } from '../extension/lib/filename.js';

const now = new Date(2026, 9, 5, 7, 8, 9);

test('nameFromUrl: last segment without extension, decoded', () => {
  assert.equal(nameFromUrl('https://cdn.example.com/a/b/mountain-lake.webp?w=800'), 'mountain-lake');
  assert.equal(nameFromUrl('https://ex.com/%D0%BA%D0%BE%D1%82.avif'), 'кот');
  assert.equal(nameFromUrl('https://upload.example.org/thumb/a/ab/Cat.jpg/640px-Cat.jpg'), 'Cat');
  assert.equal(nameFromUrl('https://img.example/photos/sunset/w=800,h=600'), 'sunset');
  assert.equal(nameFromUrl('https://img.example/photos/sunset/800x600'), 'sunset');
  assert.equal(nameFromUrl('https://ex.com/'), '');
  assert.equal(nameFromUrl('https://ex.com/bad%E0%A4%A.png'), 'bad%E0%A4%A');
  assert.equal(nameFromUrl('data:image/png;base64,AAAA'), '');
  assert.equal(nameFromUrl('blob:https://ex.com/1234-5678'), '');
  assert.equal(nameFromUrl('not a url'), '');
  assert.equal(stripExtension('archive.tar.gz'), 'archive.tar');
});

test('generic names are replaced by the alt text', () => {
  for (const g of ['image', 'IMG', 'download', '12345', 'a3f9c0e1b2d4a3f9c0e1b2d4', 'x'.repeat(41), '']) assert.ok(isGenericName(g), g);
  for (const g of ['cat', 'mountain-lake', 'IMG_2041']) assert.ok(!isGenericName(g), g);
  assert.equal(bestName({ srcUrl: 'https://ex.com/image.php?id=5', alt: 'Красный велосипед' }), 'Красный велосипед');
  assert.equal(bestName({ srcUrl: 'https://ex.com/image.php?id=5' }), 'image');
  assert.equal(bestName({ srcUrl: 'https://ex.com/cat.png', alt: 'whatever' }), 'cat');
  assert.equal(bestName({ srcUrl: 'data:image/png;base64,AA', pageTitle: 'Отчёт' }), 'Отчёт');
  assert.equal(bestName({ srcUrl: 'blob:https://ex.com/uuid' }), 'image');
});

test('sanitizeSegment: Windows-safe', () => {
  assert.equal(sanitizeSegment('a<b>c:d"e/f\\g|h?i*j'), 'a_b_c_d_e_f_g_h_i_j');
  assert.equal(sanitizeSegment('  ..hidden.  '), 'hidden');
  assert.equal(sanitizeSegment('con'), '_con');
  assert.equal(sanitizeSegment('LPT1.txt'), '_LPT1.txt');
  assert.equal(sanitizeSegment('tab\there\nnew'), 'tab_here_new');
  assert.equal(sanitizeSegment('много   пробелов'), 'много пробелов');
  assert.equal([...sanitizeSegment('я'.repeat(300))].length, 100);
  assert.equal(sanitizeSegment(''), '');
});

test('buildFilename: default pattern gets the new extension', () => {
  assert.equal(buildFilename('{name}', { srcUrl: 'https://cdn.ex.com/photo-1.webp' }, 'png'), 'photo-1.png');
  assert.equal(buildFilename('{name}', { srcUrl: 'https://cdn.ex.com/photo-1.webp' }, 'jpg'), 'photo-1.jpg');
  assert.equal(buildFilename('', { srcUrl: 'data:image/webp;base64,AA' }, 'png'), 'image.png');
});

test('buildFilename: tokens, folders and safety', () => {
  const ctx = { srcUrl: 'https://cdn.ex.com/p/lake.avif', pageUrl: 'https://www.travel.example/altai', alt: 'Горное озеро', pageTitle: 'Алтай: лето', width: 1600, height: 900, now };
  assert.equal(buildFilename('{site}/{name}_{width}x{height}', ctx, 'webp'), 'travel.example/lake_1600x900.webp');
  assert.equal(buildFilename('{date} {time} {alt}', ctx, 'jpg'), '2026-10-05 07-08-09 Горное озеро.jpg');
  assert.equal(buildFilename('{title}', ctx, 'png'), 'Алтай_ лето.png');
  assert.equal(buildFilename('{format}-{name}', { ...ctx, format: 'JPG' }, 'jpg'), 'JPG-lake.jpg');
  assert.equal(buildFilename('../../{name}', ctx, 'png'), 'lake.png', 'cannot escape the downloads folder');
  assert.equal(buildFilename('a\\b/{name}', ctx, 'png'), 'a/b/lake.png');
  assert.equal(buildFilename('{name}.png', ctx, 'png'), 'lake.png', 'no double extension');
  assert.equal(buildFilename('{alt}', { srcUrl: 'https://ex.com/x.png', now }, 'png'), 'x.png', 'empty token falls back to the name');
  assert.equal(buildFilename('{site}/', ctx, 'png'), 'travel.example.png');
});

test('checkPattern', () => {
  assert.deepEqual(checkPattern('{site}/{name}'), { ok: true });
  assert.deepEqual(checkPattern('   '), { ok: false, error: 'empty' });
  assert.deepEqual(checkPattern('{nmae}'), { ok: false, error: 'unknown-token', token: 'nmae' });
  for (const tok of TOKENS) assert.ok(checkPattern(`{${tok}}`).ok);
});
