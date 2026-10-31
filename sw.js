// Service Worker
// ファイルを変更したら CACHE_VERSION を上げる（README「キャッシュ更新手順」参照）
const CACHE_VERSION = 'v37';
const CACHE_NAME = `craft-beer-log-${CACHE_VERSION}`;
const EVENTS_URL = 'data/events.json';

// 事前にキャッシュするファイル（相対パス）。ファイルを追加・削除したらここも更新する
const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/backup.js',
  'js/breweries.js',
  'js/charts.js',
  'js/collection.js',
  'js/db.js',
  'js/errors.js',
  'js/events.js',
  'js/illust.js',
  'js/image.js',
  'js/install.js',
  'js/knowledge.js',
  'js/map.js',
  'js/models.js',
  'js/router.js',
  'js/search.js',
  'js/share.js',
  'js/share-card.js',
  'js/stats.js',
  'js/tasting.js',
  'js/ui.js',
  'js/validate.js',
  'js/version.js',
  'js/views/beer-detail.js',
  'js/views/beer-edit.js',
  'js/views/beer-fields.js',
  'js/views/beers.js',
  'js/views/breweries.js',
  'js/views/brewery-detail.js',
  'js/views/brewery-map.js',
  'js/views/checkin-form.js',
  'js/views/collection.js',
  'js/views/recap.js',
  'js/views/events.js',
  'js/views/knowledge.js',
  'js/views/more.js',
  'js/views/search.js',
  'js/views/settings.js',
  'js/views/stats.js',
  'js/views/welcome.js',
  'js/views/wishlist.js',
  'data/basics.json',
  'data/breweries.json',
  'data/changelog.json',
  'data/events.json',
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
  'images/basics/brewing.webp',
  'images/basics/craft-beer.webp',
  'images/basics/fermentation.webp',
  'images/basics/hops.webp',
  'images/basics/ingredients.webp',
  'images/breweries/315beer.webp',
  'images/breweries/808-brewery.webp',
  'images/breweries/akatsuki-brewery.webp',
  'images/breweries/aqula-akita.webp',
  'images/breweries/baeren-kitayama.webp',
  'images/breweries/baeren-shizukuishi.webp',
  'images/breweries/batsuji-brewing.webp',
  'images/breweries/be-easy-brewing.webp',
  'images/breweries/black-tide-brewing.webp',
  'images/breweries/choshi-beer.webp',
  'images/breweries/forest-brewing.webp',
  'images/breweries/garuya-beer.webp',
  'images/breweries/good-hops.webp',
  'images/breweries/hachinohe-bakushu.webp',
  'images/breweries/handa-ginzan-brewery.webp',
  'images/breweries/harvest-moon.webp',
  'images/breweries/hop-garden-brewery.webp',
  'images/breweries/hopdog-brewing.webp',
  'images/breweries/iwate-kura-beer.webp',
  'images/breweries/kankiku-brewery.webp',
  'images/breweries/keika-brewing.webp',
  'images/breweries/kirin-sendai.webp',
  'images/breweries/kohan-no-mori-beer.webp',
  'images/breweries/kokucho-beer.webp',
  'images/breweries/komainu-brewery.webp',
  'images/breweries/kyonan-bakushu.webp',
  'images/breweries/locobeer.webp',
  'images/breweries/matsudo-beer.webp',
  'images/breweries/michinoku-fukushimaji-beer.webp',
  'images/breweries/nanbu-craft.webp',
  'images/breweries/nikko-brewing.webp',
  'images/breweries/oct-one-brewing.webp',
  'images/breweries/pirono-beer.webp',
  'images/breweries/rec-cider-beer-works.webp',
  'images/breweries/rikuzentakata-microbrewery.webp',
  'images/breweries/ryusendo-beer.webp',
  'images/breweries/saien-microbrewery.webp',
  'images/breweries/sakata-traditional-beer.webp',
  'images/breweries/sanriku-brewing.webp',
  'images/breweries/sunao-brewery.webp',
  'images/breweries/tendo-brewery.webp',
  'images/breweries/tono-brewing.webp',
  'images/breweries/tsugaru-brewing.webp',
  'images/breweries/ugo-bakushu.webp',
  'images/breweries/yellow-beer-works.webp',
  'images/breweries/yonezawa-jacks-brewery.webp',
  'images/breweries/zao-brewery.webp',
  'images/breweries/zumona.webp',
  'images/brewery-photos/forest-brewing.webp',
  'images/brewery-photos/hopdog-brewing.webp',
  'images/brewery-photos/iwate-kura-beer.webp',
  'images/brewery-photos/kankiku-brewery.webp',
  'images/brewery-photos/kirin-sendai.webp',
  'images/brewery-photos/michinoku-fukushimaji-beer.webp',
  'images/brewery-photos/nanbu-craft.webp',
  'images/brewery-photos/nikko-brewing.webp',
  'images/brewery-photos/oct-one-brewing.webp',
  'images/brewery-photos/oirase-brewery.webp',
  'images/brewery-photos/sanriku-brewing.webp',
  'images/brewery-photos/tono-brewing.webp',
  'images/brewery-photos/ugo-bakushu.webp',
  'images/brewery-photos/zao-brewery.webp',
  'images/events/american-craft-beer-experience.webp',
  'images/events/beerfes-osaka.webp',
  'images/events/beerfes-tokyo.webp',
  'images/events/beerfes-yokohama.webp',
  'images/events/belgian-beer-weekend-hibiya.webp',
  'images/events/belgian-beer-weekend-kyoto.webp',
  'images/events/belgian-beer-weekend-nagoya.webp',
  'images/events/belgian-beer-weekend-osaka.webp',
  'images/events/belgian-beer-weekend-shinjuku.webp',
  'images/events/belgian-beer-weekend-yokohama.webp',
  'images/events/chiba-beer-fest.webp',
  'images/events/craft-beer-house-takasaki.webp',
  'images/events/ebina-booze-fest.webp',
  'images/events/hama-terrace-craft-beer-fes.webp',
  'images/events/japan-hop-fest-svb.webp',
  'images/events/kagawa-oktoberfest.webp',
  'images/events/keyaki-beer-festival.webp',
  'images/events/koganei-beer-festival.webp',
  'images/events/kumazawa-kura-fest.webp',
  'images/events/kumazawa-oktoberfest.webp',
  'images/events/matsudo-craft-beer-fes.webp',
  'images/events/minamiota-beer-fest.webp',
  'images/events/nagoya-oktoberfest.webp',
  'images/events/niigata-oktoberfest.webp',
  'images/events/odawara-hakone-craft-beer-fes.webp',
  'images/events/oirase-beer-oktoberfest.webp',
  'images/events/oirase-saturday-night.webp',
  'images/events/oktoberfest-kamiyacho.webp',
  'images/events/oktoberfest-skytree.webp',
  'images/events/okutama-beer-fest.webp',
  'images/events/omotesando-craft-beer-festa.webp',
  'images/events/orion-beerfest.webp',
  'images/events/tachikawa-oktoberfest.webp',
  'images/events/tama-craft-beer-fes.webp',
  'images/events/the-beer-ten-nagaoka.webp',
  'images/events/tsukuba-craft-beer-fest.webp',
  'images/events/tsuyama-jibeer-festa.webp',
  'images/events/women-brewers-okayama.webp',
  'images/events/yokohama-oktoberfest.webp',
  'images/events/yukko-baeren-totonoi-fest.webp',
  'images/events/zao-brewery-autumn-beer-festival.webp',
  'images/hops/amarillo.webp',
  'images/hops/cascade.webp',
  'images/hops/centennial.webp',
  'images/hops/chinook.webp',
  'images/hops/citra.webp',
  'images/hops/columbus.webp',
  'images/hops/east-kent-goldings.webp',
  'images/hops/el-dorado.webp',
  'images/hops/fuggle.webp',
  'images/hops/galaxy.webp',
  'images/hops/hallertauer-mittelfrueh.webp',
  'images/hops/magnum.webp',
  'images/hops/mosaic.webp',
  'images/hops/motueka.webp',
  'images/hops/nelson-sauvin.webp',
  'images/hops/saaz.webp',
  'images/hops/simcoe.webp',
  'images/hops/sorachi-ace.webp',
  'images/hops/tettnanger.webp',
  'images/styles/amber-ale.webp',
  'images/styles/barleywine.webp',
  'images/styles/belgian-strong.webp',
  'images/styles/belgian-white.webp',
  'images/styles/berliner-weisse.webp',
  'images/styles/bock.webp',
  'images/styles/brown-ale.webp',
  'images/styles/double-ipa.webp',
  'images/styles/fruit-beer.webp',
  'images/styles/gose.webp',
  'images/styles/hazy-ipa.webp',
  'images/styles/helles.webp',
  'images/styles/imperial-stout.webp',
  'images/styles/ipa.webp',
  'images/styles/kolsch.webp',
  'images/styles/pale-ale.webp',
  'images/styles/pilsner.webp',
  'images/styles/porter.webp',
  'images/styles/saison.webp',
  'images/styles/session-ipa.webp',
  'images/styles/sour.webp',
  'images/styles/stout.webp',
  'images/styles/tripel.webp',
  'images/styles/weizen.webp',
  'images/styles/west-coast-ipa.webp',
  'vendor/leaflet.markercluster/LICENSE.txt',
  'vendor/leaflet.markercluster/MarkerCluster.Default.css',
  'vendor/leaflet.markercluster/MarkerCluster.css',
  'vendor/leaflet.markercluster/leaflet.markercluster.js',
  'vendor/leaflet/LICENSE.txt',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
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
  // イベント情報はアプリ本体と別に更新するので、ネット優先で取り、失敗したら前回の内容を返す
  if (url.pathname === new URL(EVENTS_URL, self.registration.scope).pathname) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const res = await fetch(req, { cache: 'no-cache' });
          if (res.ok) await cache.put(EVENTS_URL, res.clone());
          return res;
        } catch (e) {
          const hit = await cache.match(EVENTS_URL);
          if (hit) return hit;
          throw e;
        }
      })(),
    );
    return;
  }
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
