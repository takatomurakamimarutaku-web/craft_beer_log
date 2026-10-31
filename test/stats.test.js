import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRatings } from '../js/stats.js';

test('summarizeRatings: 0件', () => {
  assert.deepEqual(summarizeRatings([]), { count: 0, avg: null, latest: null });
});

test('summarizeRatings: 未評価を除外して平均と最新値', () => {
  const r = summarizeRatings([
    { date: '2026-01-01', createdAt: '1', rating: 3 },
    { date: '2026-03-01', createdAt: '2', rating: null },
    { date: '2026-02-01', createdAt: '3', rating: 4 },
    { date: '2026-02-01', createdAt: '4', rating: 5 },
  ]);
  assert.equal(r.count, 3);
  assert.equal(r.avg, 4);
  assert.equal(r.latest, 5, '同じ日付なら後に登録した記録が最新');
});

test('summarizeRatings: 平均は小数第1位', () => {
  assert.equal(summarizeRatings([{ date: 'a', rating: 4 }, { date: 'b', rating: 4 }, { date: 'c', rating: 5 }]).avg, 4.3);
});

test('monthSummary: 今月の杯数・銘柄数・平均・いちばん多いスタイル', async () => {
  const { monthSummary } = await import('../js/stats.js');
  const styles = [
    { id: 'ipa', name: 'IPA' },
    { id: 'stout', name: 'スタウト' },
  ];
  const beers = [
    { id: 'a', styleId: 'ipa' },
    { id: 'b', styleId: 'stout' },
    { id: 'c', styleId: null },
  ];
  const checkins = [
    { beerId: 'a', date: '2026-10-01', createdAt: '1', rating: 4 },
    { beerId: 'a', date: '2026-10-20', createdAt: '2', rating: 2 },
    { beerId: 'b', date: '2026-10-21', createdAt: '3', rating: null },
    { beerId: 'c', date: '2026-10-22', createdAt: '4', rating: 3 },
    { beerId: 'c', date: '2026-10-23', createdAt: '5', rating: null },
    { beerId: 'c', date: '2026-10-24', createdAt: '6', rating: null },
    { beerId: 'b', date: '2026-09-30', createdAt: '7', rating: 5 },
    { beerId: 'zzz', date: '2026-10-25', createdAt: '8', rating: 5 },
  ];
  const r = monthSummary(beers, checkins, styles, { now: new Date(2026, 9, 25) });
  assert.equal(r.month, '2026-10');
  assert.equal(r.count, 6, '先月と、銘柄が見つからない記録は数えない');
  assert.equal(r.beerCount, 3);
  assert.equal(r.avg, 3);
  assert.equal(r.topStyle, 'IPA', 'スタイル未入力は「いちばん多い」に選ばない');
});

test('monthSummary: 今月の記録が無い', async () => {
  const { monthSummary } = await import('../js/stats.js');
  const r = monthSummary([{ id: 'a', styleId: 'ipa' }], [{ beerId: 'a', date: '2026-01-01' }], [], { now: new Date(2026, 9, 1) });
  assert.deepEqual(r, { month: '2026-10', count: 0, beerCount: 0, avg: null, topStyle: null });
});

test('buildRecap: 年の振り返り（はじめての銘柄・スタイル、よく飲んだ・最高評価、多かった月）', async () => {
  const { buildRecap, recapPeriods } = await import('../js/stats.js');
  const styles = [
    { id: 'ipa', name: 'IPA' },
    { id: 'stout', name: 'スタウト' },
  ];
  const beers = [
    { id: 'a', name: 'A', styleId: 'ipa', brewery: 'X', breweryKey: 'x' },
    { id: 'b', name: 'B', styleId: 'stout', brewery: 'Y', breweryKey: 'y' },
  ];
  const checkins = [
    { beerId: 'a', date: '2025-12-01', rating: 3 },
    { beerId: 'a', date: '2026-03-01', rating: 4, tasting: { flavorTags: ['citrus', 'pine'] } },
    { beerId: 'a', date: '2026-03-05', rating: 3, tasting: { flavorTags: ['citrus'] } },
    { beerId: 'b', date: '2026-07-01', rating: 5 },
  ];
  const r = buildRecap(beers, checkins, styles, '2026');
  assert.equal(r.count, 3);
  assert.equal(r.beerCount, 2);
  assert.equal(r.newBeers, 1, 'A は前年に飲んでいる');
  assert.deepEqual(r.newStyles, ['スタウト']);
  assert.equal(r.topBeer.beer.id, 'a');
  assert.equal(r.topBeer.count, 2);
  assert.equal(r.bestBeer.beer.id, 'b');
  assert.equal(r.topStyle.label, 'IPA');
  assert.equal(r.topBrewery.label, 'X');
  assert.deepEqual(r.busiest, { key: '2026-03', count: 2 });
  assert.deepEqual(r.flavorTop, [{ key: 'citrus', count: 2 }, { key: 'pine', count: 1 }]);
  assert.deepEqual(recapPeriods(checkins), [
    { year: '2026', months: ['2026-07', '2026-03'] },
    { year: '2025', months: ['2025-12'] },
  ]);
  const m = buildRecap(beers, checkins, styles, '2026-03');
  assert.deepEqual(m.busiest, { key: '2026-03-01', count: 1 }, '月は日ごと。同数なら早い日');
  assert.equal(buildRecap(beers, checkins, styles, '2026-07').topBeer, null, '1杯だけなら「よく飲んだ」は出さない');
});

test('tastePicks: 評価の高いスタイルと、同じ系統・近い苦味のまだ飲んでいないスタイル', async () => {
  const { tastePicks } = await import('../js/stats.js');
  const styles = [
    { id: 'ipa', name: 'IPA', category: 'P', ibu: [40, 70], srm: [6, 14] },
    { id: 'dipa', name: 'ダブルIPA', category: 'P', ibu: [60, 100], srm: [6, 14] },
    { id: 'pils', name: 'ピルスナー', category: 'L', ibu: [25, 45], srm: [2, 5] },
    { id: 'stout', name: 'スタウト', category: 'D', ibu: [25, 45], srm: [30, 40] },
  ];
  const beers = [
    { id: 'a', styleId: 'ipa' },
    { id: 'b', styleId: 'pils' },
  ];
  const checkins = [
    { beerId: 'a', rating: 5 },
    { beerId: 'a', rating: 4 },
    { beerId: 'b', rating: 2 },
  ];
  const r = tastePicks(beers, checkins, styles);
  assert.deepEqual(r.liked.map((l) => [l.style.id, l.avg, l.count]), [['ipa', 4.5, 2]], '平均3.5未満は好みに入れない');
  assert.equal(r.picks[0].style.id, 'dipa');
  assert.equal(r.picks[0].because.id, 'ipa');
  assert.ok(!r.picks.some((p) => p.style.id === 'pils'), '飲んだスタイルはおすすめしない');
  assert.deepEqual(tastePicks(beers, [{ beerId: 'b', rating: 2 }], styles).picks, [], '好きなスタイルが無ければおすすめも無し');
});
