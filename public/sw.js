/* SaloonX service worker — conservative offline shell.
   Note: JS/CSS are NOT cache-first — in dev they are unhashed and caching
   them would serve stale code after edits. Cache-first is limited to
   immutable brand assets (icons, images, fonts). */
const CACHE_VERSION = "saloonx-v2"
const PRECACHE = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return

  // Cache-first only for immutable brand assets (icons, images, fonts).
  const isIcon = url.pathname.startsWith("/icons/")
  const isAsset = /\.(png|woff2)$/.test(url.pathname)
  if (isIcon || isAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
            }
            return response
          })
      )
    )
    return
  }

  // Network-first for pages and code, falling back to cache when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.destination === "document") {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  )
})
