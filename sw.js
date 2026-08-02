// Service Worker：缓存优先，离线可用
const CACHE = 'study-planner-v21';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './vendor/vue.global.prod.js',
  './vendor/fonts/space-grotesk-latin.woff2',
  './js/app.js',
  './js/storage.js',
  './js/util.js',
  './js/llm.js',
  './js/voice.js',
  './js/views/today.js',
  './js/views/plan.js',
  './js/views/stats.js',
  './js/views/news.js',
  './js/news-feed.js',
  './js/data/news.js',
  './js/data/articles.js',
  './js/views/ai.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 只处理同源 GET 请求；API 请求（跨域）直接走网络
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      const fetched = fetch(e.request).then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
