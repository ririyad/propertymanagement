/// <reference lib="webworker" />
// Custom service worker (AGENT.md section 4, 11). Phase 4 adds the sync, push and
// notificationclick handlers.
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Every app URL opens the cached shell, so deep links also work offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// The first install controls the open page at once, so the app works offline right away.
// Updates wait until the user taps "Reload to update", which sends SKIP_WAITING.
clientsClaim()

self.addEventListener('message', (event) => {
  if ((event.data as { type?: unknown } | null)?.type === 'SKIP_WAITING') void self.skipWaiting()
})
