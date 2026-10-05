const CACHE_VERSION = 'study-buddy-shell-v1';
const SHELL_CACHE = CACHE_VERSION;
const SHELL = ['./', './index.html', './favicon.svg', './logo.svg', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
  // Do not skipWaiting automatically. The React UI offers an explicit update action.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('study-buddy-shell-') && key !== SHELL_CACHE)
        .map((key) => caches.delete(key)),
    );
  })());
});

function isApiRequest(request) {
  const url = new URL(request.url);
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept mutations, API calls, cross-origin resources, or downloads.
  if (request.method !== 'GET' || url.origin !== self.location.origin || isApiRequest(request)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Only cache static application assets. User/account/API data is excluded.
  const isStaticAsset = ['script', 'style', 'font', 'image'].includes(request.destination);
  if (!isStaticAsset) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
