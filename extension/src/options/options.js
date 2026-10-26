// Options page: format, quality, background, SVG scale, save dialog, file name pattern, site access.
import { applyI18n, t } from '../shared/i18n.js';
import { wireBrandLinks } from '../shared/brand-link.js';
import { DEFAULTS, normalizeSettings } from '../../lib/settings.js';
import { TOKENS, buildFilename, checkPattern } from '../../lib/filename.js';
import { ALL_SITES, patternHost } from '../../lib/origin.js';

const $ = (id) => /** @type {any} */ (document.getElementById(id));
const SAMPLE = {
  srcUrl: 'https://cdn.example.com/photos/mountain-lake.webp',
  pageUrl: 'https://www.example.com/travel/altai',
  alt: 'Горное озеро',
  pageTitle: 'Алтай летом',
  width: 1600,
  height: 900,
};

/** @type {import('../../lib/settings.js').Settings} */
let settings = { ...DEFAULTS };
let toastTimer = 0;

function flash(text) {
  $('toast').textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').textContent = ''), 1800);
}

/** @param {Partial<import('../../lib/settings.js').Settings>} patch */
async function save(patch) {
  settings = normalizeSettings({ ...settings, ...patch });
  await chrome.storage.local.set({ settings });
  flash(t('savedSettings'));
}

function renderPreview() {
  const value = $('pattern').value;
  const check = checkPattern(value);
  $('patternError').textContent = check.ok ? '' : check.error === 'empty' ? t('patternEmpty') : t('patternUnknown', [`{${check.token}}`]);
  $('pattern').setAttribute('aria-invalid', String(!check.ok));
  const ext = settings.defaultFormat === 'jpg' ? 'jpg' : settings.defaultFormat;
  $('patternPreview').textContent = buildFilename(check.ok ? value : settings.pattern, { ...SAMPLE, now: new Date() }, ext);
  return check.ok;
}

function render() {
  for (const r of document.querySelectorAll('input[name="defaultFormat"]')) r.checked = r.value === settings.defaultFormat;
  for (const r of document.querySelectorAll('input[name="svgScale"]')) r.checked = Number(r.value) === settings.svgScale;
  $('quality').value = String(settings.quality);
  $('qualityOut').textContent = String(settings.quality);
  $('background').value = settings.background;
  $('askWhere').checked = settings.askWhere;
  $('toastOnSave').checked = settings.toastOnSave;
  if (document.activeElement !== $('pattern')) $('pattern').value = settings.pattern;
  renderPreview();
}

async function canEncodeAvif() {
  try {
    const c = new OffscreenCanvas(1, 1);
    c.getContext('2d');
    return (await c.convertToBlob({ type: 'image/avif' })).type === 'image/avif';
  } catch {
    return false;
  }
}

async function renderAccess() {
  const all = await chrome.permissions.contains({ origins: ALL_SITES });
  $('allStatus').textContent = all ? t('allSitesOn') : t('allSitesOff');
  $('allToggle').textContent = all ? t('revokeAll') : t('grantAll');
  $('allToggle').dataset.on = all ? '1' : '';
  const { origins = [] } = await chrome.permissions.getAll();
  const hosts = origins.filter((o) => !ALL_SITES.includes(o));
  const list = $('hosts');
  list.textContent = '';
  for (const o of hosts) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = patternHost(o);
    code.title = o;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.textContent = t('revoke');
    btn.setAttribute('aria-label', `${t('revoke')}: ${patternHost(o)}`);
    btn.addEventListener('click', async () => {
      await chrome.permissions.remove({ origins: [o] }).catch(() => false);
      renderAccess();
    });
    li.append(code, btn);
    list.append(li);
  }
  $('hostsEmpty').classList.toggle('hidden', hosts.length > 0);
}

async function main() {
  applyI18n();
  wireBrandLinks();
  const r = await chrome.storage.local.get('settings');
  settings = normalizeSettings(r.settings);

  if (await canEncodeAvif()) $('avifPill').classList.remove('hidden');
  else if (settings.defaultFormat === 'avif') settings.defaultFormat = 'png';

  for (const tok of TOKENS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `{${tok}}`;
    b.title = t(`token_${tok}`);
    b.addEventListener('click', () => {
      const input = $('pattern');
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.setRangeText(`{${tok}}`, start, end, 'end');
      input.focus();
      input.dispatchEvent(new Event('input'));
    });
    $('tokens').append(b);
  }

  for (const r of document.querySelectorAll('input[name="defaultFormat"]')) r.addEventListener('change', () => save({ defaultFormat: r.value }).then(renderPreview));
  for (const r of document.querySelectorAll('input[name="svgScale"]')) r.addEventListener('change', () => save({ svgScale: Number(r.value) }));
  $('quality').addEventListener('input', () => ($('qualityOut').textContent = $('quality').value));
  $('quality').addEventListener('change', () => save({ quality: Number($('quality').value) }));
  $('background').addEventListener('change', () => save({ background: $('background').value }));
  $('bgWhite').addEventListener('click', () => save({ background: '#ffffff' }).then(render));
  $('askWhere').addEventListener('change', () => save({ askWhere: $('askWhere').checked }));
  $('toastOnSave').addEventListener('change', () => save({ toastOnSave: $('toastOnSave').checked }));
  $('pattern').addEventListener('input', () => {
    if (renderPreview()) save({ pattern: $('pattern').value });
  });
  $('pattern').addEventListener('blur', () => render());
  $('reset').addEventListener('click', async () => {
    settings = { ...DEFAULTS };
    await chrome.storage.local.set({ settings });
    render();
    flash(t('resetDone'));
  });
  $('allToggle').addEventListener('click', async () => {
    try {
      if ($('allToggle').dataset.on) await chrome.permissions.remove({ origins: ALL_SITES });
      else await chrome.permissions.request({ origins: ALL_SITES });
    } catch {
      /* dialog dismissed */
    }
    renderAccess();
  });
  chrome.permissions.onAdded.addListener(renderAccess);
  chrome.permissions.onRemoved.addListener(renderAccess);

  render();
  await renderAccess();
  document.body.dataset.ready = '1';
}

main();
