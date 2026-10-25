// ブリュワーの一覧（#/breweries）
import { h, svg } from '../ui.js';
import { PREFS, REGIONS, KIND_LABELS, PIN_LABELS, FEATURE_LABELS, AVAILABILITY, SORTS, activeBreweries, filterBreweries, countByPref, countByRegion, regionOf, groupBeersByBrewery, pinState } from '../breweries.js';

export async function render({ app, outlet, query }) {
  const [data, beers, notes] = await Promise.all([app.loadBreweries(), app.db.listBeers(), app.db.listBreweryNotes()]);
  const all = activeBreweries(data.list);
  const tried = groupBeersByBrewery(beers.filter((b) => b.status === 'tried'), data.index);
  const triedIds = new Set(tried.keys());
  const noteMap = new Map(notes.map((n) => [n.breweryId, n]));
  const state = { region: REGIONS.some((r) => r.id === query.region) ? query.region : '', pref: PREFS[query.pref] ? query.pref : '', q: query.q || '', feature: FEATURE_LABELS[query.feature] ? query.feature : '', sort: SORTS[query.sort] ? query.sort : 'pref' };

  if (!all.length) {
    outlet.replaceChildren(h('p', { class: 'empty', text: 'ブリュワー情報を読み込めませんでした。通信できる場所でアプリを開き直してください。' }));
    return;
  }

  const mapLink = h('a', { class: 'btn btn-primary', href: '#/breweries/map' }, '地図で見る');
  const search = h('input', {
    type: 'search',
    placeholder: '名前・市町村で探す',
    'aria-label': 'ブリュワーを探す',
    value: state.q,
    oninput: () => {
      state.q = search.value;
      update();
    },
  });
  // 地方 → 県の2段階。データのある地方が1つだけのときは地方の行を出さない
  const regions = countByRegion(all);
  if (state.pref && !state.region) state.region = regionOf(state.pref)?.id || '';
  if (regions.length === 1) state.region = regions[0][0].id;
  const regionChips = h('div', { class: 'chips brewery-prefs', role: 'group', 'aria-label': '地方で絞り込む', hidden: regions.length < 2 });
  const prefChips = h('div', { class: 'chips brewery-prefs', role: 'group', 'aria-label': '県で絞り込む' });
  const chip = (pressed, label, onclick) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(pressed), text: label, onclick });
  function renderChips() {
    regionChips.replaceChildren(
      chip(!state.region, `全国 ${all.length}`, () => pickRegion('')),
      ...regions.map(([r, n]) => chip(state.region === r.id, `${r.name} ${n}`, () => pickRegion(r.id))),
    );
    const inRegion = all.filter((b) => !state.region || regionOf(b.prefCode)?.id === state.region);
    prefChips.replaceChildren(
      chip(!state.pref, `すべて ${inRegion.length}`, () => pickPref('')),
      ...countByPref(inRegion).map(([code, n]) => chip(state.pref === code, `${shortPref(code)} ${n}`, () => pickPref(code))),
    );
  }
  function pickRegion(id) {
    state.region = id;
    state.pref = '';
    update();
  }
  function pickPref(code) {
    state.pref = code;
    update();
  }

  const select = (label, value, options, onchange) =>
    h(
      'label',
      { class: 'brewery-select' },
      h('span', { class: 'field-label', text: label }),
      h('select', { onchange: (e) => onchange(e.target.value) }, options.map(([v, t]) => h('option', { value: v, text: t, selected: v === value }))),
    );
  const tools = h(
    'div',
    { class: 'field-row brewery-tools' },
    select('特徴', state.feature, [['', 'すべて'], ...Object.entries(FEATURE_LABELS)], (v) => {
      state.feature = v;
      update();
    }),
    select('並べ替え', state.sort, Object.entries(SORTS), (v) => {
      state.sort = v;
      update();
    }),
  );
  const meta = h('p', { class: 'list-meta', role: 'status' });
  const list = h('ul', { class: 'card-list' });

  outlet.replaceChildren(
    h(
      'section',
      { class: 'panel' },
      h('p', { class: 'small', text: `${data.meta.region || ''}のブリュワー（大手の工場を含む）。少しずつ地域を増やしていきます。` }),
      h('div', { class: 'actions' }, mapLink),
      search,
    ),
    regionChips,
    prefChips,
    tools,
    meta,
    list,
    creditNote(data.meta),
  );
  update();

  function update() {
    const rows = filterBreweries(all, state);
    renderChips();
    const q = state.pref ? `?pref=${state.pref}` : state.region && regions.length > 1 ? `?region=${state.region}` : '';
    mapLink.setAttribute('href', `#/breweries/map${q}`);
    meta.textContent = rows.length ? `${rows.length}件` : '';
    list.replaceChildren(...(rows.length ? rows.map(item) : [h('li', { class: 'empty', text: '条件に合うブリュワーはありません。' })]));
  }

  function item(b) {
    const st = pinState(b.id, triedIds, noteMap);
    const n = tried.get(b.id)?.length || 0;
    const note = noteMap.get(b.id);
    return h(
      'li',
      {},
      h(
        'a',
        { class: 'card', href: `#/brewery/${encodeURIComponent(b.id)}` },
        h('div', { class: 'thumb' }, pinIcon(st)),
        h(
          'div',
          { class: 'card-body' },
          h('div', { class: 'card-title', text: b.name }),
          h('div', { class: 'card-meta', text: `${PREFS[b.prefCode]}${b.city}・${KIND_LABELS[b.kind] || ''}${b.founded ? `・${b.founded}年創業` : ''}` }),
          b.flagships?.length ? h('div', { class: 'card-meta', text: `代表：${b.flagships.map((f) => f.name).join('、')}` }) : null,
          h(
            'div',
            { class: 'card-foot' },
            n ? h('span', { class: 'badge badge-tried', text: `飲んだ ${n}銘柄` }) : null,
            note?.visited?.length ? h('span', { class: 'badge badge-visited', text: `行った ${note.visited.length}回` }) : null,
            note?.wantToVisit ? h('span', { class: 'badge badge-warn', text: '行きたい' }) : null,
            AVAILABILITY[b.availability] ? h('span', { text: AVAILABILITY[b.availability].label }) : null,
            !b.geo ? h('span', { text: '地図なし' }) : null,
          ),
        ),
      ),
    );
  }
}

function shortPref(code) {
  return (PREFS[code] || '').replace(/[県府都]$/, '');
}

/** 一覧のアイコン（地図のピンと同じ色） */
export function pinIcon(state) {
  const el = svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7z" fill="currentColor"/>
    <circle cx="12" cy="9.5" r="2.6" fill="var(--surface)"/></svg>`);
  el.setAttribute('class', `pin-icon pin-color-${state}`);
  el.removeAttribute('aria-hidden');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', PIN_LABELS[state]);
  return el;
}

/** 出典の表示（国税局一覧の加工である旨） */
export function creditNote(meta) {
  return h(
    'p',
    { class: 'small muted brewery-credit' },
    meta.attribution ? `${meta.attribution}。` : '',
    '紹介文はアプリ作成者が公式サイトや報道をもとに書いたものです。営業時間・営業状況は変わることがあるため、お出かけ前に公式の情報を確認してください。',
  );
}
