/*
 * Service worker of School ERP (production only, registered by components/ServiceWorker.tsx).
 *  - Build assets (/_next/static, fonts, icons): cache first — their names change with every build.
 *  - Pages: network first; the copy of the last visit is served when the network is down, and
 *    /offline.html when the page was never opened on this device.
 *  - API calls and anything that is not a GET are never touched: data always comes from the server
 *    (the roll call has its own offline queue in the page).
 */
const VERSION = 'v1';
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png', '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC)).put(request, response.clone());
  return response;
}

async function networkFirst(request, isNavigation) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isNavigation) return (await caches.match(OFFLINE_URL)) || Response.error();
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/_next/image')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Pages and the data Next.js fetches for client-side navigation between pages.
  if (request.mode === 'navigate' || request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) {
    event.respondWith(networkFirst(request, request.mode === 'navigate'));
  }
});
