/* SaloonX service worker — offline shell + stale-while-revalidate code cache.
   - Brand assets (icons, images, fonts): cache-first (immutable).
   - Next.js code chunks (/_next/static/**): STALE-WHILE-REVALIDATE — always
     try the network so deployed updates apply immediately, but keep a copy
     so an installed PWA can cold-start offline (a plain network-first would
     also work, but SWR lets a slow 2G connection render instantly from cache
     while refreshing in the background). Dev safety: dev chunks change on
     every edit and SWR revalidates them, so hot reload is never poisoned.
   - Documents (the app shell): network-first with cache fallback.
   - /api/** is NEVER cached — billing data must always be live. */
const CACHE_VERSION = "saloonx-v3"
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

self.addEventListener("message", (event) => {
  // The page asks the waiting worker to take over (update prompt "Reload").
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting()
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

  // Stale-while-revalidate for hashed build output (JS/CSS chunks).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request)
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone())
            return response
          })
          .catch(() => null)
        // Serve from cache instantly if we have it; otherwise wait for network.
        if (cached) {
          return cached
        }
        const fresh = await network
        return fresh || Response.error()
      })
    )
    return
  }

  // Network-first for documents, falling back to cache when offline.
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
