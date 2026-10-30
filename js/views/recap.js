// 振り返り（#/recap?p=2026 / ?p=2026-10）：1年・1か月の記録をカードで振り返る
import { h, glassIcon, emptyState, starsView } from '../ui.js';
import { buildRecap, recapPeriods } from '../stats.js';
import { beerColor } from '../knowledge.js';

export async function render({ app, outlet, query, isStale }) {
  const [beers, checkins, knowledge] = await Promise.all([app.db.listBeers(), app.db.listCheckins(), app.loadKnowledge()]);
  if (isStale()) return;
  const periods = recapPeriods(checkins);
  if (!periods.length) {
    outlet.replaceChildren(emptyState('記録すると、1年・1か月ごとの振り返りが見られます。', h('a', { class: 'btn btn-primary', href: '#/checkin/new', text: '＋ 記録する' }), { title: 'まだ記録がありません' }));
    return;
  }
  const p = /^\d{4}(-\d{2})?$/.test(query.p || '') ? query.p : periods[0].year;
  const year = periods.find((y) => y.year === p.slice(0, 4)) || periods[0];
  const r = buildRecap(beers, checkins, app.styles, p);
  const tagLabel = new Map(knowledge.flavorTags.map((t) => [t.id, t.label]));
  const label = periodLabel(p);
  app.setTitle(`${label}の振り返り`);

  const chip = (value, text) => h('a', { class: 'seg', href: `#/recap?p=${value}`, 'aria-current': value === p ? 'page' : null, text });
  const picker = h(
    'nav',
    { class: 'recap-picker', 'aria-label': '期間' },
    h('div', { class: 'segmented' }, ...periods.map((y) => chip(y.year, `${y.year}年`))),
    h('div', { class: 'segmented recap-months' }, chip(year.year, '1年'), ...[...year.months].reverse().map((m) => chip(m, `${Number(m.slice(5))}月`))),
  );

  if (!r.count) {
    outlet.replaceChildren(picker, emptyState(`${label}の記録はありません。`, null));
    return;
  }

  const hero = h(
    'section',
    { class: 'recap-hero' },
    h('span', { class: 'recap-hero-label', text: `${label}のビール` }),
    h('span', { class: 'recap-hero-count' }, h('b', { text: String(r.count) }), h('small', { text: '杯' })),
    h('span', { class: 'recap-hero-sub', text: `${r.beerCount}銘柄${r.newBeers ? `（はじめて ${r.newBeers}銘柄）` : ''}${r.avg !== null ? ` · 平均 ★${r.avg.toFixed(1)}` : ''}` }),
  );

  const beerCard = (title, p2, foot) =>
    p2
      ? card(
          title,
          h(
            'a',
            { class: 'recap-beer', href: `#/beer/${encodeURIComponent(p2.beer.id)}` },
            glassIcon('glass-icon', beerColor(p2.beer, app.styles)),
            h('span', {}, h('strong', { text: p2.beer.name }), h('span', { class: 'recap-small', text: p2.beer.brewery || '' }), foot(p2)),
          ),
        )
      : null;

  const cards = [
    beerCard('いちばん飲んだ銘柄', r.topBeer, (x) => h('span', { class: 'recap-em', text: `${x.count}杯` })),
    beerCard('いちばん高い評価', r.bestBeer, (x) => starsView(x.best)),
    r.topStyle ? card('よく飲んだスタイル', h('p', { class: 'recap-big', text: r.topStyle.label }), h('p', { class: 'recap-small', text: `${r.topStyle.count}杯` })) : null,
    r.topBrewery ? card('よく飲んだブリュワー', h('p', { class: 'recap-big', text: r.topBrewery.label }), h('p', { class: 'recap-small', text: `${r.topBrewery.count}杯` })) : null,
    r.newStyles.length
      ? card(`はじめてのスタイル（${r.newStyles.length}）`, h('div', { class: 'chips' }, ...r.newStyles.map((s) => h('span', { class: 'chip chip-static', text: s }))))
      : null,
    r.busiest
      ? card(p.length === 4 ? 'いちばん飲んだ月' : 'いちばん飲んだ日', h('p', { class: 'recap-big', text: busiestLabel(r.busiest.key) }), h('p', { class: 'recap-small', text: `${r.busiest.count}杯` }))
      : null,
    r.flavorTop.length
      ? card('よく感じた香り', h('div', { class: 'chips' }, ...r.flavorTop.map((f) => h('span', { class: 'chip chip-static', text: `${tagLabel.get(f.key) || f.key}（${f.count}）` }))))
      : null,
  ].filter(Boolean);

  outlet.replaceChildren(picker, hero, h('div', { class: 'recap-cards' }, ...cards), h('p', { class: 'list-meta center', text: 'もっと詳しい集計は「統計」で見られます。' }));
}

function card(title, ...body) {
  return h('section', { class: 'recap-card' }, h('h3', { class: 'recap-card-title', text: title }), ...body);
}

function periodLabel(p) {
  return p.length === 4 ? `${p}年` : `${p.slice(0, 4)}年${Number(p.slice(5))}月`;
}

function busiestLabel(key) {
  if (key.length === 7) return `${Number(key.slice(5))}月`;
  const d = new Date(`${key}T00:00:00`);
  return `${Number(key.slice(5, 7))}月${Number(key.slice(8))}日（${'日月火水木金土'[d.getDay()]}）`;
}
