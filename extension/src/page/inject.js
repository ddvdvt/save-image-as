// Functions injected into the page with chrome.scripting.executeScript (activeTab, after the user's
// context-menu click). Each one is self-contained (it is serialised by Chrome), never throws into
// the page and leaves no listeners behind.

/**
 * Read an image the user right-clicked, from inside the page:
 * 1) fetch(srcUrl) as the page — works for same-origin, CORS-enabled and blob: images and usually
 *    comes from the HTTP cache (no extra download);
 * 2) otherwise, draw the already loaded <img> to a canvas (same-origin pixels only).
 * Also returns the alt text and the page title for the file name.
 * @param {string} srcUrl
 * @param {{ fetch: boolean, maxBytes: number }} opts
 */
export async function readImageInPage(srcUrl, opts) {
  /** @type {{ ok: boolean, reason?: string, status?: number, exact?: boolean, dataUrl?: string, mime?: string, alt: string, pageTitle: string, width: number, height: number }} */
  const out = { ok: false, alt: '', pageTitle: '', width: 0, height: 0 };
  try {
    out.pageTitle = String(document.title || '').slice(0, 200);
    /** @type {HTMLImageElement | undefined} */
    let el;
    for (const img of Array.from(document.images)) {
      if (img.currentSrc === srcUrl || img.src === srcUrl) {
        el = img;
        break;
      }
    }
    if (el) {
      out.alt = String(el.alt || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      out.width = el.naturalWidth || 0;
      out.height = el.naturalHeight || 0;
    }
    if (!opts.fetch) {
      out.reason = 'skipped';
      return out;
    }
    const toDataUrl = (/** @type {Blob} */ blob) =>
      new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
    try {
      const r = await fetch(srcUrl, { credentials: 'same-origin' });
      if (!r.ok) {
        out.status = r.status;
        out.reason = 'http';
      } else {
        const blob = await r.blob();
        if (blob.size > opts.maxBytes) {
          out.reason = 'too-large';
          return out;
        }
        out.dataUrl = /** @type {string} */ (await toDataUrl(blob));
        out.mime = blob.type;
        out.exact = true;
        out.ok = true;
        return out;
      }
    } catch {
      out.reason = 'cors';
    }
    if (el && el.complete && el.naturalWidth > 0 && out.reason !== 'http') {
      try {
        const c = document.createElement('canvas');
        c.width = el.naturalWidth;
        c.height = el.naturalHeight;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(el, 0, 0);
          out.dataUrl = c.toDataURL('image/png'); // throws on a cross-origin (tainted) canvas
          out.mime = 'image/png';
          out.exact = false;
          out.ok = true;
          return out;
        }
      } catch {
        /* tainted canvas: needs a host permission */
      }
    }
    return out;
  } catch {
    out.reason = out.reason || 'error';
    return out;
  }
}

/**
 * Put a PNG on the clipboard from the page (the page has focus right after the context-menu click).
 * @param {string} dataUrl image/png data URL
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function copyPngInPage(dataUrl) {
  try {
    if (!window.isSecureContext || !navigator.clipboard || typeof ClipboardItem === 'undefined') return { ok: false, reason: 'insecure' };
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e && /** @type {any} */ (e).name === 'NotAllowedError' ? 'denied' : 'error' };
  }
}

/**
 * Show a small notice in the bottom-right corner of the page (Shadow DOM, so page CSS can neither
 * break it nor be broken by it). One notice at a time; it disappears by itself.
 * @param {{ text: string, kind: 'ok' | 'info' | 'error', closeLabel: string, actionLabel?: string, actionMessage?: object, ms?: number }} o
 */
export function showToastInPage(o) {
  try {
    const ID = 'save-image-as-toast';
    document.getElementById(ID)?.remove();
    const host = document.createElement('div');
    host.id = ID;
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;';
    const root = host.attachShadow({ mode: 'open' });
    const css = `
      .t{all:initial;box-sizing:border-box;display:flex;gap:10px;align-items:flex-start;max-width:min(420px,calc(100vw - 32px));
        padding:12px 12px 12px 14px;border-radius:10px;background:#fff;color:#1d2330;border:1px solid #d8dde6;border-left:4px solid #0e7c66;
        box-shadow:0 8px 28px rgba(0,0,0,.18);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;animation:in .16s ease-out}
      .t.error{border-left-color:#b3261e}.t.info{border-left-color:#9a5b00}
      .m{flex:1;white-space:pre-line;word-break:break-word}
      button{all:initial;cursor:pointer;font:600 12px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:6px 9px;border-radius:6px;color:#0e7c66;border:1px solid currentColor;white-space:nowrap}
      button.x{border:0;color:#5d6676;font-size:16px;padding:2px 4px}
      button:focus-visible{outline:2px solid #1f5fbf;outline-offset:1px}
      @keyframes in{from{opacity:0;transform:translateY(6px)}}
      @media (prefers-color-scheme: dark){.t{background:#20242d;color:#e6e9ef;border-color:#343a46;border-left-color:#3fc1a0}
        .t.error{border-left-color:#ff8a80}.t.info{border-left-color:#e8b04b}button{color:#3fc1a0}button.x{color:#9aa3b2}}
      @media (prefers-reduced-motion: reduce){.t{animation:none}}`;
    const box = document.createElement('div');
    box.className = `t ${o.kind}`;
    box.setAttribute('role', o.kind === 'error' ? 'alert' : 'status');
    const msg = document.createElement('div');
    msg.className = 'm';
    msg.textContent = o.text;
    box.append(msg);
    let timer = 0;
    const close = () => {
      clearTimeout(timer);
      host.remove();
    };
    if (o.actionLabel && o.actionMessage) {
      const act = document.createElement('button');
      act.type = 'button';
      act.textContent = o.actionLabel;
      act.addEventListener('click', () => {
        try {
          chrome.runtime.sendMessage(o.actionMessage).catch(() => {});
        } catch {
          /* extension reloaded */
        }
        close();
      });
      box.append(act);
    }
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'x';
    x.textContent = '×';
    x.setAttribute('aria-label', o.closeLabel);
    x.addEventListener('click', close);
    box.append(x);
    // a constructed stylesheet is not blocked by a strict page CSP (style-src without 'unsafe-inline')
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = css;
      root.append(style);
    }
    root.append(box);
    (document.body || document.documentElement).append(host);
    const ms = o.ms || 6000;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(close, ms);
    };
    box.addEventListener('mouseenter', () => clearTimeout(timer));
    box.addEventListener('mouseleave', arm);
    box.addEventListener('focusin', () => clearTimeout(timer));
    arm();
    return true;
  } catch {
    return false;
  }
}
