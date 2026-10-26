// Firefox build: manifest transform and package contents (scripts/firefox.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefoxManifest, firefoxFiles, MIN_FIREFOX, SLUG } from '../scripts/firefox.mjs';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const chrome = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
const ff = firefoxManifest(chrome);

test('Firefox manifest: event page instead of the service worker, same module', () => {
  assert.deepEqual(ff.background, { scripts: [chrome.background.service_worker], type: 'module' });
});

test('Firefox manifest: gecko id, minimum version, AMO data collection = none', () => {
  assert.deepEqual(ff.browser_specific_settings, {
    gecko: { id: `${SLUG}@ddvdvt.github.io`, strict_min_version: MIN_FIREFOX, data_collection_permissions: { required: ['none'] } },
    gecko_android: { strict_min_version: '142.0' },
  });
  assert.ok(Number.parseFloat(MIN_FIREFOX) >= 140, 'data_collection_permissions needs Firefox 140+');
});

test('Firefox manifest: Chrome-only keys dropped, clipboardWrite added, CSP without upgrade-insecure-requests', () => {
  assert.equal(ff.minimum_chrome_version, undefined);
  assert.ok(!ff.permissions.includes('offscreen'));
  assert.ok(ff.permissions.includes('clipboardWrite'));
  for (const p of chrome.permissions.filter((x) => x !== 'offscreen')) assert.ok(ff.permissions.includes(p), p);
  assert.deepEqual(ff.optional_host_permissions, chrome.optional_host_permissions);
  assert.equal(ff.host_permissions, undefined);
  assert.equal(ff.content_security_policy.extension_pages, "script-src 'self'");
  // everything else is unchanged
  for (const k of ['name', 'version', 'default_locale', 'icons', 'action', 'options_ui', 'homepage_url']) assert.deepEqual(ff[k], chrome[k], k);
});

test('Firefox manifest: the Chrome manifest object is not modified', () => {
  const copy = structuredClone(chrome);
  firefoxManifest(copy);
  assert.deepEqual(copy, chrome);
});

test('Firefox package: same sources minus the offscreen document, Firefox manifest inside', () => {
  const files = firefoxFiles();
  const names = files.map((f) => f.name);
  assert.ok(!names.includes('src/offscreen/offscreen.html'));
  assert.ok(!names.includes('src/offscreen/offscreen.js'));
  assert.ok(names.includes('src/offscreen/convert.js'), 'the converter itself is shared');
  const packed = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'manifest.json').data));
  assert.deepEqual(packed, ff);
  const src = new TextDecoder().decode(files.find((f) => f.name === 'src/background.js').data);
  assert.equal(src, readFileSync(join(EXT, 'src', 'background.js'), 'utf8'), 'background.js is the same file');
});
