import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { generateDummyData } from '../scripts/dummy-data.js';
import { buildBeerSummaries, searchBeers, suggest } from '../js/search.js';

test('500銘柄・2000記録：集計と入力ごとの絞り込みが十分に速い', () => {
  const { beers, checkins } = generateDummyData({ beers: 500, checkins: 2000 });
  assert.equal(beers.length, 500);
  assert.equal(checkins.length, 2000);

  let t = performance.now();
  const summaries = buildBeerSummaries(beers, checkins);
  const buildMs = performance.now() - t;

  // 1文字ずつ入力した場合を想定し、各入力で絞り込み＋並べ替えを実行
  const typed = ['ほ', 'ほっ', 'ほっぴ', 'ほっぴー', 'h', 'ha', 'haz', 'hazy'];
  const times = [];
  for (const keyword of typed) {
    t = performance.now();
    searchBeers(summaries, { keyword, styleIds: ['ipa', 'hazy-ipa', 'pale-ale'], abvMin: 4, ratingMin: 3, sort: 'rating' });
    times.push(performance.now() - t);
    t = performance.now();
    suggest(beers, keyword, (b) => b.nameKey, 8);
    times.push(performance.now() - t);
  }
  const worst = Math.max(...times);
  console.log(`集計 ${buildMs.toFixed(1)}ms / 入力1回あたり最大 ${worst.toFixed(2)}ms`);
  // 1フレーム（16ms）以内に収まること
  assert.ok(buildMs < 200, `集計が遅い: ${buildMs}ms`);
  assert.ok(worst < 16, `絞り込みが遅い: ${worst}ms`);
});
