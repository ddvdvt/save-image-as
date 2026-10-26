# Chrome Web Store listing — English

**Language:** English (en). The default listing language is Russian (`listing.ru.md`); the UI texts come from `extension/_locales` (Kazakh is included too).

## Title (from the manifest, 33 characters)

Save Picture As… — PNG, JPG, WebP

Fallback if the title is questioned: "Picture to PNG/JPG — right-click converter".

## Short description (from the manifest, 117 of 132 characters)

Right-click any image: save it as PNG, JPG or WebP, or copy it as PNG. Converted locally in your browser, no servers.

## Category

Productivity → Tools

## Detailed description

Downloaded an image and got a .webp or .avif file that your viewer or an upload form won't accept? This extension adds "Save as PNG / JPG / WebP" to the context menu of every image, and the file is saved in the format you picked.

Features

• Three formats in the context menu, your default one first.
• Copy to the clipboard as PNG, ready to paste into a document, chat or editor.
• Save the original file without conversion.
• No needless quality loss: a file already in the chosen format is saved as is.
• JPG: adjustable quality; transparent areas are filled with white or a colour you choose.
• Sensible file names with the right extension: taken from the address, or from the alt text when the address is just "image.php" or a hash. Custom name pattern with site, date, size and sub-folders.
• Optional "ask where to save each file".
• SVG images are rasterised at 2× (or 1×), sharp on high-resolution screens.
• Animated GIF and WebP: the first frame is saved, with a "Save original" button right there if you want the animation.
• Works with data: and blob: addresses (galleries, editors, generators).
• When a file fails to load or is too large, you get a clear message instead of silence.
• Light and dark theme; Russian, English and Kazakh.

Minimal permissions

The extension asks for no site access at install. The picture is read right from the page you clicked on. If it is hosted on another server that does not allow reading it, the extension asks once for access to that one server. Granted permissions are listed in the settings and can be revoked with one click.

Privacy

Conversion happens on your computer; nothing is uploaded anywhere. No analytics, ads or sign-up. Open source (MIT).

Limitations

CSS backgrounds and canvas elements are not part of this menu (a browser limitation). Copying to the clipboard works on https pages. AVIF will appear in the menu once the browser can encode it.

Free, forever.

## Screenshots

The screenshots are in Russian (the default listing language); captions:
1. Right-click an image: save as PNG, JPG or WebP instead of .webp.
2. Animated GIF: the first frame is saved, or the original with one click.
3. No access to all sites: permission is requested for one server, only when needed.
4. Settings: default format, JPG quality, file name pattern.
