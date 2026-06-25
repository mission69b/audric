// Minimal service worker — Phase 0 (installable mobile web / PWA).
//
// Its only job is to satisfy the PWA installability criterion (Android + desktop
// Chrome require a registered service worker with a fetch handler). It does NOT
// cache or proxy any app content: the fetch handler deliberately does not call
// event.respondWith, so the browser handles every request natively. That keeps
// the streaming chat responses untouched and means ZERO stale-content risk.
//
// iOS "Add to Home Screen" works regardless of this file. If real offline support
// is ever wanted, add an explicit cache strategy here (carefully — never cache
// /api/chat streams).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // No-op passthrough: presence of this listener is what makes the app
  // installable. We intentionally do not respond, so requests go to the network
  // exactly as if no service worker existed.
  if (!event) {
    return;
  }
});
