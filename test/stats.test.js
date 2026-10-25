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
