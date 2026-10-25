// 地図（Leaflet を必要になったときだけ読み込む）

// 地理院タイル（淡色地図）。リアルタイムに読み込むだけなら申請不要で、出典の表示が必要。
// オフライン用の先読み・保存はしない（sw.js はほかのサイトへのリクエストを扱わない）
export const TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION_URL = 'https://maps.gsi.go.jp/development/ichiran.html';
export const TILE_MAX_ZOOM = 18;
export const TILE_MIN_ZOOM = 5;

// 東北6県がおさまる範囲（南西・北東）
export const TOHOKU_BOUNDS = [
  [36.8, 139.1],
  [41.6, 142.1],
];

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`${src} を読み込めませんでした`));
    document.head.append(s);
  });
}

function loadCss(href) {
  if (document.querySelector(`link[data-href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.dataset.href = href;
  document.head.append(l);
}

/** Leaflet と markercluster を読み込み、window.L を返す */
export function loadLeaflet() {
  loading ??= (async () => {
    loadCss('vendor/leaflet/leaflet.css');
    loadCss('vendor/leaflet.markercluster/MarkerCluster.css');
    loadCss('vendor/leaflet.markercluster/MarkerCluster.Default.css');
    await loadScript('vendor/leaflet/leaflet.js');
    await loadScript('vendor/leaflet.markercluster/leaflet.markercluster.js');
    return window.L;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}
