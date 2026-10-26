// Asks for an optional host permission for ONE image host, at the moment it is needed.
// chrome.permissions.request needs a user gesture in an extension page — hence this small window.
import { applyI18n, t } from '../shared/i18n.js';
import { ALL_SITES } from '../../lib/origin.js';

const jobId = new URLSearchParams(location.search).get('job') || '';
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} text @param {'ok' | 'error' | ''} [kind] */
function status(text, kind = '') {
  $('status').textContent = text;
  $('status').className = `status ${kind}`;
}

async function main() {
  applyI18n();
  const info = await chrome.runtime.sendMessage({ type: 'sia:host', jobId }).catch(() => null);
  if (!info || !info.ok) {
    $('lead').textContent = t('permExpired');
    for (const el of document.querySelectorAll('.host, .details, #allowHost, #allowAll')) el.remove();
    $('cancel').textContent = t('close');
    $('cancel').addEventListener('click', () => window.close());
    $('cancel').focus();
    document.body.dataset.ready = 'expired';
    return;
  }
  $('lead').textContent = t('permLead');
  $('host').textContent = info.host;
  $('host').title = info.srcUrl;

  /** @param {string[]} origins */
  const ask = async (origins) => {
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins });
    } catch {
      granted = false;
    }
    if (!granted) {
      status(t('permDenied'), 'error');
      return;
    }
    status(t('permGranted'), 'ok');
    await chrome.runtime.sendMessage({ type: 'sia:resume', jobId }).catch(() => {});
    setTimeout(() => window.close(), 400);
  };
  $('allowHost').addEventListener('click', () => ask([info.pattern]));
  $('allowAll').addEventListener('click', () => ask(ALL_SITES));
  $('cancel').addEventListener('click', () => window.close());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.close();
  });
  $('allowHost').focus();
  document.body.dataset.ready = '1';
}

main();
