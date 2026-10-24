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
