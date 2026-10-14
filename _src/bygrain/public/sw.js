// Guarda a app (não os dados) para abrir depressa. Os dados vêm sempre do Supabase.
const CACHE = 'bygrain-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(url.pathname, c)); return r; }).catch(() => caches.match(url.pathname)));
    return;
  }
  if (!url.pathname.startsWith('/bygrain/assets/')) return;
  e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })));
});
