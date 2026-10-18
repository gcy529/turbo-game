// Turbo Racer Service Worker v2 — 网络优先，缓存兜底
const CACHE = 'turbo-racer-v2';

self.addEventListener('install', e => {
  self.skipWaiting();                     // 立即激活，不等接管
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'])).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))   // 清掉所有旧版本缓存
    ).then(() => self.clients.claim())     // 立即接管所有页面
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // 网络优先：有网就用最新的；断网才回退缓存
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});
