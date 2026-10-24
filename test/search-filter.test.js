import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBeerSummaries, searchBeers, matchesCriteria, defaultCriteria, countActiveFilters, sortSummaries } from '../js/search.js';
import { createBeer, createCheckin } from '../js/models.js';

const beers = [
  createBeer({ id: 'a', name: 'ゆかいなIPA', brewery: 'ヤッホー', styleId: 'ipa', abv: 6.5 }),
  createBeer({ id: 'b', name: 'Black Stout', brewery: 'コエド', styleId: 'stout', abv: 8 }),
  createBeer({ id: 'c', name: 'Hazy Juice', brewery: 'うちゅう', styleId: 'hazy-ipa', abv: 5 }),
  createBeer({ id: 'd', name: '名無し', brewery: '', styleId: null, abv: null }),
  createBeer({ id: 'e', name: 'いつか飲む', brewery: 'ヤッホー', styleId: 'ipa', abv: 7, status: 'want' }),
];
const ck = (beerId, date, f = {}) => createCheckin({ beerId, date, createdAt: `${date}T00:00:00Z`, ...f });
const checkins = [
  ck('a', '2026-01-10', { rating: 4, serving: 'can', place: { type: 'bought' } }),
  ck('a', '2026-03-01', { rating: 5, serving: 'draft', place: { type: 'drank' } }),
  ck('b', '2026-02-01', { rating: 3, serving: 'bottle', place: { type: 'bought' } }),
  ck('c', '2026-04-01', { rating: 4, serving: 'draft', place: { type: 'drank' }, photoIds: ['p'] }),
  ck('d', '2025-12-01', { rating: null, incomplete: true }),
];
const summaries = buildBeerSummaries(beers, checkins);
const ids = (criteria) => searchBeers(summaries, criteria).map((s) => s.beer.id);

test('buildBeerSummaries：回数・最終日・平均・最新の評価・写真', () => {
  const a = summaries.find((s) => s.beer.id === 'a');
  assert.equal(a.count, 2);
  assert.equal(a.lastDate, '2026-03-01');
  assert.equal(a.avgRating, 4.5);
  assert.equal(a.latestRating, 5);
  assert.deepEqual([...a.servings].sort(), ['can', 'draft']);
  assert.equal(summaries.find((s) => s.beer.id === 'c').photoId, 'p');
  const e = summaries.find((s) => s.beer.id === 'e');
  assert.equal(e.count, 0);
  assert.equal(e.lastDate, null);
});

test('キーワード：名前・ブリュワーに正規化して部分一致', () => {
  assert.deepEqual(ids({ keyword: 'ﾕｶｲ', sort: 'name', order: 'asc' }), ['a']);
  assert.deepEqual(ids({ keyword: 'やっほー', sort: 'name', order: 'asc' }).sort(), ['a', 'e']);
  assert.deepEqual(ids({ keyword: 'ＳＴＯＵＴ' }), ['b']);
  assert.equal(ids({ keyword: '' }).length, 5);
  assert.deepEqual(ids({ keyword: '存在しない' }), []);
});

test('スタイル（複数選択）', () => {
  assert.deepEqual(ids({ styleIds: ['ipa', 'hazy-ipa'] }).sort(), ['a', 'c', 'e']);
  assert.deepEqual(ids({ styleIds: ['stout'] }), ['b']);
});

test('度数の範囲（未入力は範囲指定時に除外）', () => {
  assert.deepEqual(ids({ abvMin: 6, abvMax: 7 }).sort(), ['a', 'e']);
  assert.deepEqual(ids({ abvMin: 8 }), ['b']);
  assert.deepEqual(ids({ abvMax: 5 }), ['c']);
  assert.equal(ids({ abvMin: 0 }).includes('d'), false);
});

test('飲んだ／買った・提供形態', () => {
  assert.deepEqual(ids({ placeTypes: ['bought'] }).sort(), ['a', 'b']);
  assert.deepEqual(ids({ servings: ['draft'] }).sort(), ['a', 'c']);
  assert.deepEqual(ids({ servings: ['can', 'bottle'] }).sort(), ['a', 'b']);
});

test('評価（平均）・未入力あり・状態', () => {
  assert.deepEqual(ids({ ratingMin: 4 }).sort(), ['a', 'c']);
  assert.deepEqual(ids({ ratingMin: 5 }), []);
  assert.deepEqual(ids({ incompleteOnly: true }), ['d']);
  assert.deepEqual(ids({ status: 'want' }), ['e']);
  assert.equal(ids({ status: 'tried' }).length, 4);
});

test('条件の組み合わせ（AND）', () => {
  assert.deepEqual(ids({ keyword: 'ヤッホー', status: 'tried' }), ['a']);
  assert.deepEqual(ids({ styleIds: ['ipa', 'hazy-ipa'], servings: ['draft'], ratingMin: 4 }).sort(), ['a', 'c']);
  assert.deepEqual(ids({ styleIds: ['ipa', 'hazy-ipa'], placeTypes: ['bought'], abvMin: 6 }), ['a']);
  assert.deepEqual(ids({ keyword: 'hazy', placeTypes: ['bought'] }), []);
});

test('並べ替え：最終飲用日・度数・評価・名前・回数（値なしは末尾）', () => {
  assert.deepEqual(ids({ sort: 'lastDate', order: 'desc' }), ['c', 'a', 'b', 'd', 'e']);
  assert.deepEqual(ids({ sort: 'lastDate', order: 'asc' }), ['d', 'b', 'a', 'c', 'e']);
  assert.deepEqual(ids({ sort: 'abv', order: 'desc' }), ['b', 'e', 'a', 'c', 'd']);
  assert.deepEqual(ids({ sort: 'abv', order: 'asc' }), ['c', 'a', 'e', 'b', 'd']);
  assert.deepEqual(ids({ sort: 'rating', order: 'desc' }).slice(0, 3), ['a', 'c', 'b']);
  assert.deepEqual(ids({ sort: 'count', order: 'desc' })[0], 'a');
  const byName = ids({ sort: 'name', order: 'asc' });
  assert.equal(byName.length, 5);
  assert.deepEqual(ids({ sort: 'name', order: 'desc' }), [...byName].reverse());
});

test('countActiveFilters と初期値', () => {
  assert.equal(countActiveFilters(defaultCriteria()), 0);
  assert.equal(countActiveFilters({ keyword: 'x', sort: 'abv' }), 0, 'キーワードと並べ替えは数えない');
  assert.equal(countActiveFilters({ styleIds: ['ipa'], abvMin: 5, ratingMin: 3, status: 'want' }), 4);
  assert.equal(matchesCriteria(summaries[0], defaultCriteria()), true);
  assert.equal(sortSummaries([], 'unknown').length, 0);
});

test('香りタグ：銘柄の記録に付いたタグをすべて含むものだけ（Phase 5）', () => {
  const bs = [createBeer({ id: 'x', name: 'X' }), createBeer({ id: 'y', name: 'Y' }), createBeer({ id: 'z', name: 'Z' })];
  const cs = [
    ck('x', '2026-01-01', { tasting: { flavorTags: ['citrus'] } }),
    ck('x', '2026-02-01', { tasting: { flavorTags: ['tropical'] } }),
    ck('y', '2026-01-01', { tasting: { flavorTags: ['citrus', 'pine'] } }),
    ck('z', '2026-01-01', {}),
  ];
  const ss = buildBeerSummaries(bs, cs);
  const f = (flavorTags) => searchBeers(ss, { flavorTags, sort: 'name', order: 'asc' }).map((s) => s.beer.id);
  assert.deepEqual(f([]), ['x', 'y', 'z'], '未指定なら全件');
  assert.deepEqual(f(['citrus']), ['x', 'y']);
  assert.deepEqual(f(['citrus', 'tropical']), ['x'], '別々の記録のタグも銘柄単位で合わせて判定');
  assert.deepEqual(f(['citrus', 'pine']), ['y']);
  assert.deepEqual(f(['coffee']), []);
  assert.equal(countActiveFilters({ flavorTags: ['citrus'] }), 1);
  // 古い集計（flavorTags なし）でも落ちない
  assert.equal(matchesCriteria({ ...ss[2], flavorTags: undefined }, { ...defaultCriteria(), flavorTags: ['citrus'] }), false);
});
