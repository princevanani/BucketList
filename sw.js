// Service worker: keeps the big, rarely-changing downloads in the browser so repeat visits are instant.
// It caches only the map library, map tiles and the world outline. The site's own code is never cached here,
// so a new deployment shows up on the next normal reload.
const CACHE = 'bucketlist-static-v1';
const TILES = 'bucketlist-tiles-v1';
const TILE_LIMIT = 2500;
const LIB_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com'];
const TILE_HOSTS = ['tiles.maps.eox.at', 'server.arcgisonline.com', 'tiles.openfreemap.org', 's3.amazonaws.com'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function cacheFirst(req, name, limit) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) {
    cache.put(req, res.clone());
    if (limit) {
      const keys = await cache.keys();
      if (keys.length > limit) for (const k of keys.slice(0, keys.length - limit + 200)) await cache.delete(k);
    }
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith('/data/world.json')) e.respondWith(cacheFirst(req, CACHE));
    return;
  }
  if (url.hostname === 'tiles.openfreemap.org' && /^\/planet\/?$/.test(url.pathname)) return; // the tile index changes with each data release
  if (LIB_HOSTS.includes(url.hostname) && /maplibre-gl/.test(url.pathname)) e.respondWith(cacheFirst(req, CACHE));
  else if (TILE_HOSTS.includes(url.hostname) && (url.hostname !== 's3.amazonaws.com' || url.pathname.includes('elevation-tiles-prod'))) e.respondWith(cacheFirst(req, TILES, TILE_LIMIT));
});
