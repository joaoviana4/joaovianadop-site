// Guarda a app (não os dados) para abrir depressa. Os dados vêm sempre do Supabase.
const CACHE = 'bygrain-v2';
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

// Avisos (push): uma tarefa nova para mim
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'byGrain', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'byGrain', { body: d.body || '', tag: d.tag, renotify: !!d.tag, icon: '/bygrain/icons/icon-192.png', badge: '/bygrain/icons/icon-192.png', data: { url: d.url || '/bygrain/tasks/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/bygrain/tasks/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => new URL(x.url).pathname.startsWith(url));
    if (c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
