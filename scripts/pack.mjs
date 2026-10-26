// Packs extension/ into dist/save-image-as-<version>.zip for the Chrome Web Store (no dependencies)
// and verifies the archive: manifest at the root, all locales, forward slashes, nothing extra.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createZip, readZip } from './zip.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'extension');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || name === 'Thumbs.db') continue; // no dotfiles in the store package
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push({ name: relative(ext, p).split(sep).join('/'), data: new Uint8Array(readFileSync(p)) });
  }
})(ext);
const { version } = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `save-image-as-${version}.zip`);
writeFileSync(out, createZip(files));

// verify what was written
const entries = readZip(new Uint8Array(readFileSync(out)));
const names = entries.map((e) => e.name);
assert.ok(names.includes('manifest.json'), 'manifest.json at the root');
const manifest = JSON.parse(new TextDecoder().decode(entries.find((e) => e.name === 'manifest.json').data));
assert.equal(manifest.version, version);
for (const l of ['ru', 'en', 'kk']) assert.ok(names.includes(`_locales/${l}/messages.json`), `locale ${l}`);
for (const p of [manifest.background.service_worker, manifest.options_ui.page, 'src/offscreen/offscreen.html', 'src/permission/permission.html', ...Object.values(manifest.icons)]) {
  assert.ok(names.includes(p), `${p} packed`);
}
for (const n of names) {
  assert.ok(!n.includes('\\'), `${n}: backslash`);
  assert.ok(!/(^|\/)\./.test(n), `${n}: dotfile`);
  assert.ok(!/(^|\/)(node_modules|test|e2e|scripts|store|dist)\//.test(n), `${n}: not part of the extension`);
}
for (const e of entries) {
  const original = files.find((f) => f.name === e.name);
  assert.ok(original && Buffer.compare(Buffer.from(original.data), Buffer.from(e.data)) === 0, `${e.name}: content matches`);
}
console.log(`${files.length} files, ${statSync(out).size} bytes -> ${out} (verified)`);
