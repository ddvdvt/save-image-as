# Firefox Add-ons (AMO) — listing and review notes (Save Picture As)

Upload `dist/save-image-as-<version>-firefox.zip` (built by `npm run zip:firefox`).
Add-on ID: `save-image-as@ddvdvt.github.io`. Minimum version: Firefox 140.0 (Android: 142.0).
The Russian listing texts can be reused from `listing.ru.md`; the UI is localized (ru, en, kk).

## Name

Save Picture As… — PNG, JPG, WebP

## Summary (≤ 250 characters)

Right-click any image and save it as PNG, JPG or WebP, copy it as PNG, or save the original. Converted locally in your browser: no servers, no tracking, no access to all sites at install.

## Description

Downloaded an image and got a .webp or .avif file that your viewer or an upload form won't accept? This add-on adds "Save as PNG / JPG / WebP" to the context menu of every image, and the file is saved in the format you picked.

- Three formats in the context menu, your default one first.
- Copy to the clipboard as PNG, ready to paste into a document, chat or editor.
- Save the original file without conversion.
- No needless quality loss: a file already in the chosen format is saved as is.
- JPG: adjustable quality; transparent areas are filled with white or a colour you choose.
- Sensible file names with the right extension, from the address, the alt text or the page title. Custom name pattern with site, date, size and sub-folders.
- Handles the hard cases: data: and blob: images, SVG (rasterized at 2×), animated GIF/WebP (first frame, with a one-click "save original"), broken links and huge images (refused before decoding).
- Clear notices on the page, options page with light and dark theme, Russian, English and Kazakh.

Privacy: images are converted on your computer and never uploaded. No analytics, no ads, no account.

## Categories

- Photos, Music & Videos
- Download Management

## Tags

images, webp, png, jpg, save image, convert, download

## Homepage / support

- Homepage: https://ddvdvt.github.io/
- Privacy policy: https://ddvdvt.github.io/privacy/save-image-as.html (also paste the text of `PRIVACY.md` into the AMO privacy policy field)
- License: MIT

## Data collection (data_collection_permissions)

`"required": ["none"]` — the add-on collects and transmits no user data. The only network request is downloading the image the user right-clicked from its own address (as the browser itself does); conversion happens locally.

## Notes for reviewers

**Source code:** not minified, not bundled, no build step, no remote code. The package is the `extension/` folder of the repository as is; only `manifest.json` is generated for Firefox by `scripts/firefox.mjs` (service worker → event page, gecko id, Chrome-only `offscreen` permission dropped, `clipboardWrite` added). The Chrome-only offscreen document is not included.

**Permissions:**

- `contextMenus` — the "Save picture as…" submenu on images; the only way the add-on is used.
- `activeTab` + `scripting` — after the user's menu click, three bundled functions (`src/page/inject.js`) run in that tab: read the clicked image from inside the page (same-origin/CORS/blob: images), and show a small notice in a Shadow DOM. No content scripts, nothing injected persistently.
- `downloads` — saves the converted file (`downloads.download`, optional "Save as" dialog).
- `clipboardWrite` — "Copy as PNG": `browser.clipboard.setImageData` from the background page, only after the user picks that menu item.
- `storage` — settings in `storage.local`; `storage.session` holds a pending save while the permission window is open.
- Optional host permissions `http://*/*`, `https://*/*` — **not requested at install.** Only when an image is on another server that does not allow the page to read it, a small add-on window asks for that one host (`permissions.request`), or for all sites if the user prefers. Granted hosts are listed on the options page and can be revoked there.
- `content_security_policy.extension_pages` is `script-src 'self'` — the default script policy without `upgrade-insecure-requests`, so images on http-only servers can still be downloaded by the background page. No remote scripts, no eval.

**How to test:**

1. Install, right-click any image on a web page (e.g. a .webp photo on Wikipedia or an image search result) → "Save picture as…" → "Save as PNG". A PNG with a sensible name appears in Downloads.
2. "Save as JPG" on a transparent PNG → white background. "Copy as PNG" → paste into an image editor.
3. An image from another CDN that does not send CORS headers → a small window asks for access to that host; "Allow for this site" → Firefox's permission prompt → the image is saved.
4. Options (toolbar button): change the default format / name pattern; the menu updates immediately.

The add-on also opens a static welcome page on install and sets a static uninstall page (https://ddvdvt.github.io/); nothing is sent to them.
