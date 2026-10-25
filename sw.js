// Service Worker
// ファイルを変更したら CACHE_VERSION を上げる（README「キャッシュ更新手順」参照）
const CACHE_VERSION = 'v17';
const CACHE_NAME = `craft-beer-log-${CACHE_VERSION}`;

// 事前にキャッシュするファイル（相対パス）。ファイルを追加・削除したらここも更新する
const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/backup.js',
  'js/charts.js',
  'js/db.js',
  'js/errors.js',
  'js/illust.js',
  'js/image.js',
  'js/install.js',
  'js/knowledge.js',
  'js/models.js',
  'js/router.js',
  'js/search.js',
  'js/share.js',
  'js/stats.js',
  'js/tasting.js',
  'js/ui.js',
  'js/validate.js',
  'js/version.js',
  'js/views/beer-detail.js',
  'js/views/beer-edit.js',
  'js/views/beer-fields.js',
  'js/views/beers.js',
  'js/views/checkin-form.js',
  'js/views/knowledge.js',
  'js/views/more.js',
  'js/views/search.js',
  'js/views/settings.js',
  'js/views/stats.js',
  'js/views/welcome.js',
  'js/views/wishlist.js',
  'data/basics.json',
  'data/changelog.json',
  'data/flavor-tags.json',
  'data/hops.json',
  'data/images.json',
  'data/styles.json',
  'data/terms.json',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon-maskable.svg',
  'icons/icon.svg',
  'images/styles/barleywine.webp',
  'images/styles/berliner-weisse.webp',
  'images/styles/brown-ale.webp',
  'images/styles/fruit-beer.webp',
  'images/styles/hazy-ipa.webp',
  'images/styles/imperial-stout.webp',
  'images/styles/pale-ale.webp',
  'images/styles/porter.webp',
  'images/styles/sour.webp',
  'images/styles/stout.webp',
  'images/styles/weizen.webp',
];

self.addEventListener('install', (event) => {
  // 更新時はすぐに切り替えず、画面の［更新］ボタンを待つ
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('craft-beer-log-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 感想フォーム（feedback/）はアプリ外のページなので、そのままネットワークから読む
  if (new URL('feedback/', self.registration.scope).pathname === url.pathname.replace(/[^/]*$/, '')) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      if (req.mode === 'navigate') {
        const cached = await cache.match('index.html');
        if (cached) return cached;
      }
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (e) {
        if (req.mode === 'navigate') {
          const fallback = await cache.match('index.html');
          if (fallback) return fallback;
        }
        throw e;
      }
    })(),
  );
});
