// Turbo Racer Service Worker v15 — 网络优先，缓存兜底
const CACHE = 'turbo-racer-v15';

// 预缓存：2D 主站 + 3D 版（three.js 已本地化，离线也能跑 3D）
const PRECACHE = [
  './', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './index-3d.html', './3d/index.html', './3d/manifest.json', './3d/index-3d.v2.html',
  './3d/js/config.js', './3d/js/profile.js', './3d/js/scene.js', './3d/js/track.js', './3d/js/car.js',
  './3d/js/fx.js', './3d/js/input.js', './3d/js/hud.js', './3d/js/audio.js', './3d/js/main.js',
  './3d/vendor/three.module.js',
  './3d/vendor/addons/utils/BufferGeometryUtils.js',
  './3d/vendor/addons/environments/RoomEnvironment.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();                     // 立即激活，不等接管
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {}))))   // 单个失败不影响整体
  );
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
      .catch(() => caches.match(e.request).then(hit => {
        if (hit) return hit;
        // 断网兜底：3D 页面回 3D，不要一律吐 2D 首页
        const is3d = /\/3d\/|index-3d/.test(e.request.url);
        return caches.match(is3d ? './3d/index.html' : './index.html');
      }))
  );
});
