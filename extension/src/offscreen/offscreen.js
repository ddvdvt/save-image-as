// Offscreen document (Chrome, reason BLOBS): runs the canvas converter (convert.js) for the service
// worker, which has no DOM. Firefox does not need it: its background is an event page with DOM.
import { convertSafe, revokeUrl } from './convert.js';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;
  if (msg.type === 'convert') {
    convertSafe(msg.request).then(sendResponse);
    return true;
  }
  if (msg.type === 'revoke') {
    sendResponse({ ok: true, live: revokeUrl(msg.url) });
    return false;
  }
  return false;
});
