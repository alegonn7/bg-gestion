// Versión web: guarda la aplicación en el navegador para que abra aunque no haya internet.
// Solo toca archivos propios del sitio; Supabase y el resto de internet pasan de largo.
const CACHE = 'bg-gestion-app'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  // La página: siempre la última si hay internet, la guardada si no
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('./', copy))
          return response
        })
        .catch(() => caches.match('./'))
    )
    return
  }

  // Código, estilos e imágenes: llevan un nombre distinto en cada versión, así que se reusan
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    )
  )
})
