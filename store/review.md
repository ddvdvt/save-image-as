# Chrome Web Store — Privacy practices & review notes (Save Picture As)

Copy each block into the matching field of the CWS developer dashboard.
`BASE` = the brand site address from `extension/lib/brand.js` (currently `https://ddvdvt.github.io/`).

## Single purpose

Save Picture As adds "Save as PNG / JPG / WebP" items to the context menu of images: it converts the image the user right-clicked into PNG, JPG or WebP locally in the browser and saves it (or copies it to the clipboard as PNG, or saves the original file unchanged).

## Permission justifications

**contextMenus**
Adds one item with a submenu ("Save as PNG", "Save as JPG", "Save as WebP", "Copy as PNG", "Save the original") to the context menu of images. This is the only way the extension is used.

**activeTab**
Granted by the user's context-menu click for that one tab. It lets the extension read the clicked image from inside the page (same-origin, CORS-enabled and `blob:` images), put a PNG on the clipboard, and show a small notice (e.g. "only the first frame of the animation was saved", "the server returned 404") on that page. No other tabs are accessed.

**scripting**
Used with activeTab to run three functions bundled with the extension (`src/page/inject.js`) in the clicked tab via `chrome.scripting.executeScript`: read the image bytes/alt text, write the PNG to the clipboard, show the notice. Nothing is injected persistently, there are no content scripts, no remote code.

**downloads**
Saves the converted file with a proper file name and extension via `chrome.downloads.download`, optionally with the "Save as" dialog (user setting). The extension does not read the download history; it only listens to the state of its own downloads to free the temporary blob URL.

**offscreen**
An offscreen document (reason BLOBS) decodes the image and encodes PNG/JPG/WebP on a canvas, then creates the `blob:` URL that `chrome.downloads` saves. A service worker cannot do this alone: it has no DOM for SVG images and cannot create blob URLs.

**storage**
`chrome.storage.local` keeps the user's settings (default format, JPG quality, background colour, SVG scale, file name pattern, "ask where to save"). `chrome.storage.session` keeps a pending save while the permission window is open. Nothing is synced or sent anywhere.

**Optional host permissions (`http://*/*`, `https://*/*`) — not granted at install**
Many images are served from a different server (a CDN) that does not allow the page to read them, and the extension cannot obtain the bytes through activeTab in that case. Only then a small extension window explains the situation and offers "Allow for this site" — `chrome.permissions.request` for that single host (e.g. `https://cdn.example.com/*`) — or "Allow for all sites". After the grant the extension fetches just that image URL and converts it locally. Granted hosts are listed on the options page and can be revoked there (`chrome.permissions.remove`). We deliberately avoided `<all_urls>` at install: the cost is one extra click the first time an image comes from a new CDN.

## Remote code

No, I am not using remote code. All JavaScript is packaged with the extension; there are no remote scripts, no `eval`/`new Function`, and the default extension CSP is used.

## Data usage

What user data do you plan to collect from users now or in the future? — **None of the listed types.**
(The image the user right-clicks, its address, alt text and the page title are processed locally only to convert the image and build the file name. Nothing is transmitted to the developer or third parties; the only network request is downloading the image itself from its own address, as the browser does.)

Certifications (all three checked):
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL

`BASE` + `privacy/save-image-as.html` → `https://ddvdvt.github.io/privacy/save-image-as.html`

## Notes for the reviewer (test instructions)

No account or setup is needed.

1. Open any page with images, e.g. a Wikipedia article (images are WebP/JPEG/SVG) or https://www.gstatic.com/webp/gallery/1.webp.
2. Right-click an image → "Save as PNG / JPG / WebP" → "Save as PNG". A .png file with a readable name appears in Downloads.
3. Right-click a photo with transparency (or an SVG logo on Wikipedia) → "Save as JPG": transparent areas become white. SVGs are saved at 2× their size.
4. Right-click an image → "Copy as PNG", then paste into any document or image editor (https pages).
5. Right-click an animated GIF → "Save as PNG": a notice in the bottom-right corner says only the first frame was saved and offers "Save original" (the .gif).
6. If an image is hosted on a server that does not allow the page to read it, a small window asks for access to that one host ("Allow for this site" / "Allow for all sites" / "Cancel"). After "Allow" the file is saved immediately. The granted host is listed on the options page (click the toolbar icon) under "Site access" with a "Remove" button.
7. The options page also has the default format (shown first in the menu), JPG quality, background colour, SVG scale, "Ask where to save each file" and a file name pattern with a live example.

AVIF is offered as a save format only when the browser's canvas can encode it (current Chrome cannot, so the item is hidden).

After installation the extension opens one static welcome page (`BASE/welcome/save-image-as.html`); the uninstall URL is a static page (`BASE/bye/save-image-as.html`). No data or identifiers are added to these URLs.
