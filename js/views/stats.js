// 統計（#/stats）
import { h, svg, emptyState, formatYen } from '../ui.js';
import { SERVING_LABELS } from '../models.js';
import { tastePicks, summarizeRatings, countByStyle, abvHistogram, topBreweries, monthlyCounts, servingStats, favoriteFlavorTags, hopsForFavoriteTags, eventStats } from '../stats.js';
import { joinEvents } from '../events.js';
import { hBarChart, vBarChart } from '../charts.js';
import { setCriteria } from './search.js';
import { glassSvg } from '../illust.js';
import { srmToHex, styleDisplaySrm } from '../knowledge.js';

const STYLE_LIMIT = 12;

export async function render({ app, outlet, isStale }) {
  const [beers, checkins, knowledge, eventData, plans] = await Promise.all([
    app.db.listBeers(),
    app.db.listCheckins(),
    app.loadKnowledge(),
    app.loadEvents().catch(() => null),
    app.db.listEventPlans().catch(() => []),
  ]);
  if (isStale()) return;
  const tried = new Set(checkins.map((c) => c.beerId));

  if (!checkins.length) {
    outlet.replaceChildren(emptyState('記録がまだありません。飲んだビールを記録すると、ここに統計が表示されます。', h('a', { class: 'btn btn-primary', href: '#/checkin/new', text: '＋ 記録する' })));
    return;
  }

  // 統計から検索結果へ（条件を指定して開く）
  const openSearch = (partial) => {
    setCriteria(partial);
    app.navigate('#/search');
  };

  const ratings = summarizeRatings(checkins);
  const tiles = h(
    'section',
    { class: 'panel stat-tiles' },
    tile('飲んだ杯数', `${checkins.length}`, '杯'),
    tile('銘柄', `${tried.size}`, '種'),
    tile('平均評価', ratings.avg !== null ? ratings.avg.toFixed(1) : '—', ratings.avg !== null ? '' : ''),
  );

  // 1. スタイル別
  const styles = countByStyle(beers, checkins, app.styles);
  const styleRows = styles.slice(0, STYLE_LIMIT).map((r) => ({ ...r, tappable: r.key !== null }));
  const styleSec = chartSection({
    title: 'スタイル別の杯数',
    rows: styleRows,
    chart: hBarChart(styleRows, { unit: '杯', title: 'スタイル別の杯数' }),
    onTap: (r) => openSearch({ styleIds: [r.key] }),
    note: styles.length > STYLE_LIMIT ? `上位${STYLE_LIMIT}件（全${styles.length}件）。` : '',
    table: [['スタイル', '杯数'], ...styles.map((r) => [r.label, `${r.count}`])],
  });

  // 2. 度数の分布
  const abv = abvHistogram(beers, checkins);
  const abvSec = chartSection({
    title: '度数の分布',
    rows: abv.bins,
    chart: vBarChart(abv.bins, { unit: '杯', title: '度数の分布' }),
    onTap: (r) => openSearch({ abvMin: r.min, abvMax: r.max === null ? null : Math.round((r.max - 0.1) * 10) / 10 }),
    note: abv.unknown ? `度数が未入力の${abv.unknown}杯は含みません。` : '',
    table: [['度数', '杯数'], ...abv.bins.map((r) => [r.label, `${r.count}`])],
  });

  // 3. ブリュワー TOP10
  const brewers = topBreweries(beers, checkins, 10);
  const brewSec = brewers.length
    ? chartSection({
        title: 'よく飲むブリュワー TOP10',
        rows: brewers,
        chart: hBarChart(brewers, { unit: '杯', title: 'ブリュワー別の杯数' }),
        onTap: (r) => openSearch({ keyword: r.label }),
        table: [['ブリュワー', '杯数'], ...brewers.map((r) => [r.label, `${r.count}`])],
      })
    : emptySection('よく飲むブリュワー TOP10', 'ブリュワーが入力された記録がありません。');

  // 4. 月別
  const months = monthlyCounts(checkins, { months: 12 });
  const monthSec = chartSection({
    title: '月別の杯数（直近12か月）',
    rows: months,
    chart: vBarChart(months, { unit: '杯', title: '月別の杯数' }),
    onTap: (r) => openSearch({ month: r.key, sort: 'lastDate', order: 'desc' }),
    note: `${months[0].year}年${months[0].label}〜${months[months.length - 1].year}年${months[months.length - 1].label}`,
    table: [['月', '杯数'], ...months.map((r) => [`${r.year}年${r.label}`, `${r.count}`])],
  });

  // 5. 提供形態別
  const servings = servingStats(checkins, SERVING_LABELS).map((r) => ({
    ...r,
    sub: r.avgPrice !== null ? `平均${formatYen(r.avgPrice)}` : '',
    tappable: r.key !== null,
  }));
  const servingSec = chartSection({
    title: '提供形態別の杯数と1杯の平均価格',
    rows: servings,
    chart: hBarChart(servings, { unit: '杯', title: '提供形態別の杯数' }),
    onTap: (r) => openSearch({ servings: [r.key] }),
    note: '平均価格は、価格を入力した杯だけで計算しています。',
    table: [['提供形態', '杯数', '平均価格（入力数）'], ...servings.map((r) => [r.label, `${r.count}`, r.avgPrice !== null ? `${formatYen(r.avgPrice)}（${r.priced}杯）` : '—'])],
  });

  // 6. 好きな香りタグと合うホップ
  const labels = Object.fromEntries(knowledge.flavorTags.map((t) => [t.id, t.label]));
  const favorites = favoriteFlavorTags(checkins, { minRating: 4, labels });
  let favSec;
  if (favorites.length) {
    const favRows = favorites.slice(0, 8);
    const hops = hopsForFavoriteTags(knowledge.hops, favorites, 5);
    favSec = chartSection({
      title: '好きな香り（評価4以上の杯の香りタグ）',
      rows: favRows,
      chart: hBarChart(favRows, { unit: '回', title: '評価4以上の杯の香りタグ' }),
      onTap: (r) => openSearch({ flavorTags: [r.key] }),
      table: [['香りタグ', '回数'], ...favorites.map((r) => [r.label, `${r.count}`])],
      extra: hops.length
        ? h(
            'div',
            { class: 'fav-hops' },
            h('h4', { class: 'field-label', text: 'この香りに合うホップ' }),
            h(
              'ul',
              { class: 'plain-list hop-suggest' },
              hops.map(({ hop, matched }) =>
                h(
                  'li',
                  {},
                  h('a', { href: `#/knowledge/hop/${encodeURIComponent(hop.id)}`, text: hop.name }),
                  h('span', { class: 'muted small', text: `　${matched.map((t) => labels[t] || t).join('・')}` }),
                ),
              ),
            ),
          )
        : null,
    });
  } else {
    favSec = emptySection('好きな香り', '評価4以上の記録に香りタグを付けると、好みの香りと合うホップが表示されます（記録画面の「テイスティング」）。');
  }

  // 7. イベント別（イベントで記録したことがある場合だけ）
  const eventNames = new Map([...plans.map((p) => [p.id, p.name]), ...joinEvents(eventData).map((e) => [e.id, e.edition && !/^\d{4}$/.test(e.edition) ? `${e.name}（${e.edition}）` : e.name])]);
  const byEvent = eventStats(checkins, eventNames);
  const eventRows = byEvent.slice(0, 10).map((r) => ({ ...r, sub: r.avgRating !== null ? `平均★${r.avgRating.toFixed(1)}` : '' }));
  const eventSec = byEvent.length
    ? chartSection({
        title: 'イベント別の杯数',
        rows: eventRows,
        chart: hBarChart(eventRows, { unit: '杯', title: 'イベント別の杯数' }),
        onTap: (r) => openSearch({ eventId: r.key, eventLabel: r.label }),
        note: `${byEvent.length}か所のイベントで${byEvent.reduce((n, r) => n + r.count, 0)}杯。${byEvent.length > 10 ? '上位10件。' : ''}`,
        table: [['イベント', '杯数', '平均評価'], ...byEvent.map((r) => [r.label, `${r.count}`, r.avgRating !== null ? r.avgRating.toFixed(1) : '—'])],
      })
    : null;

  // あなたの好み：評価の高いスタイルと、まだ飲んでいないおすすめのスタイル
  const taste = tastePicks(beers, checkins, app.styles);
  const tasteSec = taste.liked.length
    ? h(
        'section',
        { class: 'panel taste-picks' },
        h('h3', { class: 'section-title', text: 'あなたの好み' }),
        h(
          'p',
          { class: 'taste-liked' },
          ...taste.liked.map((l) => h('a', { class: 'chip tag-link', href: `#/knowledge/style/${encodeURIComponent(l.style.id)}`, text: `${l.style.name} ★${l.avg.toFixed(1)}` })),
        ),
        taste.picks.length ? h('h4', { class: 'field-label', text: 'まだ飲んでいないおすすめのスタイル' }) : null,
        taste.picks.length
          ? h(
              'ul',
              { class: 'pick-list' },
              ...taste.picks.map((p) =>
                h(
                  'li',
                  {},
                  h(
                    'a',
                    { class: 'pick', href: `#/knowledge/style/${encodeURIComponent(p.style.id)}` },
                    h('span', { class: 'pick-art' }, svg(glassSvg(p.style.glass, srmToHex(styleDisplaySrm(p.style))))),
                    h('span', { class: 'pick-name', text: p.style.name }),
                    h('span', { class: 'pick-why', text: `「${p.because.name}」が好きなら` }),
                  ),
                ),
              ),
            )
          : null,
      )
    : emptySection('あなたの好み', '記録に評価（★）を付けると、好きなスタイルと、まだ飲んでいないおすすめのスタイルが表示されます。');

  // 振り返り（年・月のまとめ）への入口
  const latestYear = checkins.map((c) => c.date || '').sort().pop().slice(0, 4);
  const recapLink = h(
    'a',
    { class: 'recap-link', href: `#/recap?p=${latestYear}` },
    h('span', { class: 'recap-link-title', text: `${latestYear}年の振り返り` }),
    h('span', { class: 'recap-link-sub', text: 'いちばん飲んだ銘柄・はじめてのスタイルなど' }),
  );

  outlet.replaceChildren(
    recapLink,
    tiles,
    tasteSec,
    h('p', { class: 'small muted stat-hint', text: 'グラフの棒をタップすると、その条件で検索できます。' }),
    styleSec,
    abvSec,
    brewSec,
    monthSec,
    servingSec,
    favSec,
    ...(eventSec ? [eventSec] : []),
  );
}

function tile(label, value, unit) {
  return h('div', { class: 'stat-tile' }, h('div', { class: 'muted small', text: label }), h('div', { class: 'big' }, value, unit ? h('span', { class: 'small', text: unit }) : null));
}

function emptySection(title, message) {
  return h('section', { class: 'panel' }, h('h3', { class: 'section-title', text: title }), h('p', { class: 'muted small', text: message }));
}

/** グラフ＋タップ操作＋表で見る */
function chartSection({ title, rows, chart, onTap, note = '', table, extra = null }) {
  const node = svg(chart);
  const activate = (target) => {
    const g = target.closest?.('.chart-tap');
    if (!g) return;
    const r = rows[Number(g.dataset.i)];
    if (r) onTap(r);
  };
  node.addEventListener('click', (e) => activate(e.target));
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(e.target);
    }
  });
  return h(
    'section',
    { class: 'panel chart-panel' },
    h('h3', { class: 'section-title', text: title }),
    node,
    note ? h('p', { class: 'small muted', text: note }) : null,
    extra,
    h(
      'details',
      { class: 'chart-table' },
      h('summary', { class: 'small', text: '数値を表で見る' }),
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, table[0].map((c) => h('th', { text: c })))),
        h('tbody', {}, table.slice(1).map((row) => h('tr', {}, row.map((c) => h('td', { text: c }))))),
      ),
    ),
  );
}
