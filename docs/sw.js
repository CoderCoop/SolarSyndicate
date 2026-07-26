/**
 * Kill switch for the service worker the game registered when it lived at the
 * site root.
 *
 * That worker's scope was the whole site, so it still intercepts navigation to
 * the homepage and serves its cached copy of the game — a visitor who played
 * before the move sees a cockpit instead of the project page, and no amount of
 * redeploying fixes it, because the server is never asked.
 *
 * Browsers re-fetch a registered worker's script when navigating within its
 * scope, so serving this file at that URL is what reaches those clients. It
 * clears the caches, unregisters itself, and reloads any open page — after
 * which the homepage is served normally and this file is never fetched again.
 *
 * The game's own worker is unaffected: it lives at /play/sw.js with /play/
 * scope. This one must never be removed, because a browser that has not
 * checked in since the move still holds the old registration.
 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        await caches.delete(key)
      }
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        client.navigate(client.url)
      }
    })(),
  )
})
