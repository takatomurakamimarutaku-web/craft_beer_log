// Phase 6：統計の集計・グラフ・共有文
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBeer, createCheckin, SERVING_LABELS } from '../js/models.js';
import { countByStyle, abvHistogram, topBreweries, monthlyCounts, servingStats, favoriteFlavorTags, hopsForFavoriteTags } from '../js/stats.js';
import { hBarChart, vBarChart } from '../js/charts.js';
import { buildShareText } from '../js/share.js';
import { buildBeerSummaries, searchBeers } from '../js/search.js';

const styles = [
  { id: 'ipa', name: 'IPA' },
  { id: 'stout', name: 'スタウト' },
];
const beers = [
  createBeer({ id: 'a', name: 'A', brewery: 'ヤッホー', styleId: 'ipa', abv: 6.5 }),
  createBeer({ id: 'b', name: 'B', brewery: 'ﾔｯﾎｰ', styleId: 'stout', abv: 4 }),
  createBeer({ id: 'c', name: 'C', brewery: 'コエド', styleId: null, abv: null }),
  createBeer({ id: 'd', name: 'D', brewery: '', styleId: 'other', styleOther: 'ラオホ', abv: 10 }),
];
const ck = (beerId, date, f = {}) => createCheckin({ beerId, date, ...f });
const checkins = [
  ck('a', '2026-10-01', { rating: 5, serving: 'draft', price: 1000, tasting: { flavorTags: ['citrus', 'pine'] } }),
  ck('a', '2026-09-15', { rating: 4, serving: 'draft', price: 1200, tasting: { flavorTags: ['citrus'] } }),
  ck('b', '2026-09-01', { rating: 3, serving: 'can', tasting: { flavorTags: ['coffee'] } }),
  ck('c', '2025-11-20', { serving: null }),
  ck('d', '2026-10-20', { rating: 4, serving: 'bottle', price: 700 }),
  ck('zzz', '2026-10-20', { rating: 5 }), // 銘柄が消えた記録
];

const empty = { beers: [], checkins: [] };
const one = { beers: [beers[0]], checkins: [checkins[0]] };

test('countByStyle：杯数の多い順（同数ならその他・未入力は後ろ）、未入力・その他をまとめる、銘柄の無い記録は除外', () => {
  const r = countByStyle(beers, checkins, styles);
  assert.deepEqual(r.map((x) => [x.key, x.label, x.count]), [
    ['ipa', 'IPA', 2],
    ['stout', 'スタウト', 1],
    ['other', 'その他', 1],
    [null, '未入力', 1],
  ]);
  assert.deepEqual(countByStyle(empty.beers, empty.checkins, styles), []);
  assert.deepEqual(countByStyle(one.beers, one.checkins, styles).map((x) => x.count), [1]);
});

test('abvHistogram：区切りの境界（以上・未満）と未入力', () => {
  const { bins, unknown } = abvHistogram(beers, checkins);
  const get = (label) => bins.find((b) => b.label === label).count;
  assert.equal(get('4%台'), 1, '4.0 は 4%台');
  assert.equal(get('6%台'), 2);
  assert.equal(get('10%〜'), 1, '10.0 は上限なしの区分');
  assert.equal(get('〜4%'), 0);
  assert.equal(unknown, 1);
  const e = abvHistogram([], []);
  assert.ok(e.bins.every((b) => b.count === 0) && e.unknown === 0);
});

test('topBreweries：表記ゆれをまとめ、空のブリュワーは除く', () => {
  const withKeys = beers; // createBeer が breweryKey を付ける
  const r = topBreweries(withKeys, checkins, 10);
  assert.equal(r[0].count, 3, 'ヤッホー と ﾔｯﾎｰ は同じ');
  assert.equal(r[0].label, 'ヤッホー', '表示名は多い表記');
  assert.deepEqual(r.map((x) => x.label), ['ヤッホー', 'コエド']);
  assert.equal(topBreweries(beers, checkins, 1).length, 1);
  assert.deepEqual(topBreweries([], []), []);
});

test('monthlyCounts：当月を含む直近12か月、記録の無い月は0、範囲外は数えない', () => {
  const r = monthlyCounts(checkins, { months: 12, now: new Date(2026, 9, 24) });
  assert.equal(r.length, 12);
  assert.equal(r[0].key, '2025-11');
  assert.equal(r[11].key, '2026-10');
  assert.equal(r[11].label, '10月');
  assert.equal(r[11].count, 3, '銘柄が消えた記録も日付があれば数える');
  assert.equal(r[10].count, 2);
  assert.equal(r[0].count, 1);
  assert.equal(r.reduce((s, x) => s + x.count, 0), 6);
  const jan = monthlyCounts([], { months: 3, now: new Date(2026, 0, 5) });
  assert.deepEqual(jan.map((x) => x.key), ['2025-11', '2025-12', '2026-01'], '年をまたぐ');
  assert.ok(jan.every((x) => x.count === 0));
});

test('servingStats：杯数と、価格を入力した杯だけの平均価格', () => {
  const r = servingStats(checkins, SERVING_LABELS);
  const draft = r.find((x) => x.key === 'draft');
  assert.deepEqual([draft.label, draft.count, draft.priced, draft.avgPrice], ['樽生', 2, 2, 1100]);
  const can = r.find((x) => x.key === 'can');
  assert.equal(can.avgPrice, null, '価格なしは null');
  assert.equal(r.find((x) => x.key === null).label, '未入力');
  assert.deepEqual(servingStats([]), []);
});

test('favoriteFlavorTags / hopsForFavoriteTags：評価4以上だけ、合うホップは重みの合計順', () => {
  const fav = favoriteFlavorTags(checkins, { minRating: 4, labels: { citrus: '柑橘' } });
  assert.deepEqual(fav.map((x) => [x.key, x.count]), [['citrus', 2], ['pine', 1]]);
  assert.equal(fav[0].label, '柑橘');
  const hops = [
    { id: 'h1', name: 'ア', flavorTags: ['citrus'] },
    { id: 'h2', name: 'イ', flavorTags: ['citrus', 'pine'] },
    { id: 'h3', name: 'ウ', flavorTags: ['coffee'] },
  ];
  const r = hopsForFavoriteTags(hops, fav, 5);
  assert.deepEqual(r.map((x) => [x.hop.id, x.score]), [['h2', 3], ['h1', 2]]);
  assert.deepEqual(hopsForFavoriteTags(hops, [], 5), []);
  assert.deepEqual(favoriteFlavorTags([]), []);
});

test('グラフ：0件・1件・0の棒でも壊れない', () => {
  for (const rows of [[], [{ label: 'IPA', count: 1 }], [{ label: 'A', count: 0 }, { label: 'B', count: 0 }]]) {
    const hb = hBarChart(rows);
    const vb = vBarChart(rows);
    assert.match(hb, /^<svg[\s\S]*<\/svg>$/);
    assert.match(vb, /^<svg[\s\S]*<\/svg>$/);
    assert.doesNotMatch(hb + vb, /NaN|Infinity|undefined/);
  }
  const hb = hBarChart([{ label: 'とても長いスタイルの名前です', count: 3, sub: '平均¥1,000' }, { label: '未入力', count: 1, tappable: false }]);
  assert.equal((hb.match(/chart-tap/g) || []).length, 1, 'タップ不可の行は操作対象にしない');
  assert.match(hb, />とても長いスタイ…</);
  assert.match(hb, /3　平均¥1,000/);
  assert.match(vBarChart([{ label: '<b>', count: 2 }]), /&lt;b&gt;/);
  assert.doesNotMatch(vBarChart([{ label: 'A', count: 0 }]), /chart-tap/, '0の棒はタップ不可');
});

test('月の条件：その月に記録がある銘柄だけ', () => {
  const ss = buildBeerSummaries(beers, checkins);
  assert.deepEqual(searchBeers(ss, { month: '2026-09', sort: 'name', order: 'asc' }).map((s) => s.beer.id), ['a', 'b']);
  assert.deepEqual(searchBeers(ss, { month: '2020-01' }), []);
});

test('buildShareText：銘柄と最新の記録、未入力の項目は出さない', () => {
  const t = buildShareText(beers[0], checkins[0], styles, { tagLabels: { citrus: '柑橘', pine: '松' } });
  assert.equal(t, '🍺 A（ヤッホー）\nIPA / 6.5%\n★★★★★ 樽生\n香り：柑橘・松\n#ホップ手帖');
  const t2 = buildShareText(beers[2], null, styles);
  assert.equal(t2, '🍺 C（コエド）\n#ホップ手帖');
  const t3 = buildShareText(beers[3], createCheckin({ memo: '  燻製の香り ', place: { name: '駅前' } }), styles);
  assert.match(t3, /ラオホ \/ 10\.0%/);
  assert.match(t3, /@駅前/);
  assert.match(t3, /燻製の香り\n#ホップ手帖$/);
});
