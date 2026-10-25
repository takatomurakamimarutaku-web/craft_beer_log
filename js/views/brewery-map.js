// ブリュワーの地図（#/breweries/map）
import { h, showToast } from '../ui.js';
import { PREFS, PIN_LABELS, activeBreweries, groupBeersByBrewery, pinState } from '../breweries.js';
import { loadLeaflet, TILE_URL, TILE_ATTRIBUTION_URL, TILE_MAX_ZOOM, TILE_MIN_ZOOM, TOHOKU_BOUNDS } from '../map.js';

export async function render({ app, outlet, query, isStale }) {
  const [data, beers, notes] = await Promise.all([app.loadBreweries(), app.db.listBeers(), app.db.listBreweryNotes()]);
  let L;
  try {
    L = await loadLeaflet();
  } catch (e) {
    console.error(e);
    if (isStale()) return null;
    outlet.replaceChildren(
      h('p', { class: 'empty', text: '地図を表示できませんでした。アプリを再読み込みしてください。' }),
      h('p', { class: 'center' }, h('a', { href: '#/breweries', text: '一覧で見る' })),
    );
    return null;
  }
  if (isStale()) return null;

  const all = activeBreweries(data.list);
  const triedIds = new Set(groupBeersByBrewery(beers.filter((b) => b.status === 'tried'), data.index).keys());
  const noteMap = new Map(notes.map((n) => [n.breweryId, n]));
  const pref = PREFS[query.pref] ? query.pref : '';
  const shown = all.filter((b) => b.geo && (!pref || b.prefCode === pref));
  const hidden = all.filter((b) => !b.geo && (!pref || b.prefCode === pref)).length;

  const mapEl = h('div', { class: 'brewery-map', role: 'region', 'aria-label': 'ブリュワーの地図' });
  const offline = h('p', { class: 'field-hint warn', role: 'status', hidden: true, text: '地図の画像を読み込めません（オフラインの可能性があります）。ピンは表示しています。' });
  const legend = h(
    'div',
    { class: 'map-legend small' },
    ['tried', 'visited', 'want', 'none'].map((st) => h('span', {}, h('span', { class: `legend-dot pin-${st}` }), PIN_LABELS[st])),
    h('span', {}, h('span', { class: 'legend-dot pin-none pin-area' }), '位置はおおよそ'),
  );
  const locateBtn = h('button', { type: 'button', class: 'btn btn-small', text: '現在地', onclick: () => locate() });
  outlet.replaceChildren(
    h('div', { class: 'row map-tools' }, h('a', { class: 'btn btn-small', href: `#/breweries${pref ? `?pref=${pref}` : ''}`, text: '一覧で見る' }), locateBtn, h('span', { class: 'muted small', text: `${pref ? PREFS[pref] : data.meta.region || ''} ${shown.length}件` })),
    mapEl,
    offline,
    legend,
    hidden ? h('p', { class: 'field-hint', text: `番地が確認できていない${hidden}件は地図に出していません（一覧で見られます）。` }) : null,
  );

  const map = L.map(mapEl, { minZoom: TILE_MIN_ZOOM, maxZoom: TILE_MAX_ZOOM, zoomSnap: 0.5 });
  map.attributionControl.setPrefix('Leaflet');
  let tileErrors = 0;
  L.tileLayer(TILE_URL, {
    maxZoom: TILE_MAX_ZOOM,
    minZoom: TILE_MIN_ZOOM,
    attribution: `<a href="${TILE_ATTRIBUTION_URL}" target="_blank" rel="noopener noreferrer">地理院タイル</a>`,
  })
    .on('tileerror', () => {
      if (++tileErrors >= 3) offline.hidden = false;
    })
    .on('tileload', () => {
      tileErrors = 0;
      offline.hidden = true;
    })
    .addTo(map);

  const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40, spiderfyOnMaxZoom: true });
  const markers = new Map();
  for (const b of shown) {
    const st = pinState(b.id, triedIds, noteMap);
    const area = b.geo.precision === 'area';
    const marker = L.marker([b.geo.lat, b.geo.lng], {
      icon: L.divIcon({ className: `map-pin pin-${st}${area ? ' pin-area' : ''}`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] }),
      title: b.name,
      alt: `${b.name}（${PIN_LABELS[st]}）`,
      keyboard: true,
    });
    marker.bindPopup(() => popup(b, st, area));
    cluster.addLayer(marker);
    markers.set(b.id, marker);
  }
  map.addLayer(cluster);

  const target = query.id && markers.get(query.id);
  if (target) {
    map.setView(target.getLatLng(), 15);
    cluster.zoomToShowLayer(target, () => target.openPopup());
  } else if (pref && shown.length) {
    map.fitBounds(L.latLngBounds(shown.map((b) => [b.geo.lat, b.geo.lng])), { padding: [24, 24], maxZoom: 13 });
  } else {
    map.fitBounds(TOHOKU_BOUNDS);
  }

  let here = null;
  function locate() {
    if (!navigator.geolocation) {
      showToast('この端末では現在地を使えません');
      return;
    }
    locateBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locateBtn.disabled = false;
        const ll = [pos.coords.latitude, pos.coords.longitude];
        here?.remove();
        here = L.circleMarker(ll, { radius: 8, className: 'map-here' }).addTo(map);
        map.setView(ll, 12);
      },
      (err) => {
        locateBtn.disabled = false;
        showToast(err.code === err.PERMISSION_DENIED ? '位置情報の利用が許可されていません（端末の設定で変更できます）' : '現在地を取得できませんでした');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  return () => map.remove();
}

function popup(b, st, area) {
  return h(
    'div',
    { class: 'map-popup' },
    h('strong', { text: b.name }),
    h('div', { class: 'small muted', text: `${PREFS[b.prefCode]}${b.city}・${PIN_LABELS[st]}` }),
    area ? h('div', { class: 'small muted', text: '位置はおおよそです' }) : null,
    h('a', { href: `#/brewery/${encodeURIComponent(b.id)}`, text: '詳しく見る ›' }),
  );
}
