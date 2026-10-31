import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, includesKey, suggest } from '../js/search.js';

test('normalize: 全角・大文字・小文字は同じキーになる', () => {
  assert.equal(normalize('ｉｐａ'), 'ipa');
  assert.equal(normalize('IPA'), 'ipa');
  assert.equal(normalize('ipa'), 'ipa');
  assert.equal(normalize('ＩＰＡ'), 'ipa');
});

test('normalize: ひらがなはカタカナに統一する', () => {
  assert.equal(normalize('ゆかい'), 'ユカイ');
  assert.equal(normalize('よなよなエール'), 'ヨナヨナエール');
  assert.equal(normalize('ゝゞ'), 'ヽヾ');
});

test('normalize: 半角カタカナは全角カタカナになる（NFKC）', () => {
  assert.equal(normalize('ﾕｶｲ'), 'ユカイ');
  assert.equal(normalize('ﾋﾞｰﾙ'), 'ビール');
});

test('normalize: 前後の空白除去と連続空白の圧縮（全角空白を含む）', () => {
  assert.equal(normalize('  Hazy   IPA  '), 'hazy ipa');
  assert.equal(normalize('Hazy　　IPA'), 'hazy ipa');
  assert.equal(normalize('\tA\nB '), 'a b');
});

test('normalize: null・undefined・数値', () => {
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
  assert.equal(normalize(''), '');
  assert.equal(normalize(5.5), '5.5');
});

test('includesKey: 部分一致。「ゆかい」で「ユカイ」がヒットする', () => {
  const key = normalize('水曜日のネコ ユカイ');
  assert.ok(includesKey(key, 'ゆかい'));
  assert.ok(includesKey(key, 'ﾈｺ'));
  assert.ok(!includesKey(key, 'IPA'));
  assert.ok(includesKey(key, ''), '空のクエリは常に一致');
});

test('suggest: 前方一致を優先し、件数を制限する', () => {
  const items = ['Session IPA', 'IPA', 'Hazy IPA', 'Stout', 'ipa special'].map((name) => ({ name, key: normalize(name) }));
  const r = suggest(items, 'ｉｐａ', (x) => x.key, 3).map((x) => x.name);
  assert.deepEqual(r, ['IPA', 'ipa special', 'Session IPA']);
  assert.deepEqual(suggest(items, '  ', (x) => x.key), []);
});

test('similarBeers：同じスタイル・近い度数・共通の香りで並べ、飲んでいない銘柄と自分は除く', async () => {
  const { similarBeers, buildBeerSummaries } = await import('../js/search.js');
  const styles = [{ id: 'ipa', category: 'IPA' }, { id: 'dipa', category: 'IPA' }, { id: 'stout', category: 'ダーク' }];
  const beers = [
    { id: 'a', styleId: 'ipa', abv: 6.5 },
    { id: 'b', styleId: 'ipa', abv: 9 },
    { id: 'c', styleId: 'dipa', abv: 7 },
    { id: 'd', styleId: 'stout', abv: 6 },
    { id: 'e', styleId: 'ipa', abv: 6.5 }, // 飲んでいない
  ];
  const checkins = [
    { beerId: 'a', date: '2026-10-01', tasting: { flavorTags: ['citrus'] } },
    { beerId: 'b', date: '2026-10-02', rating: 4 },
    { beerId: 'c', date: '2026-10-03', tasting: { flavorTags: ['citrus'] } },
    { beerId: 'd', date: '2026-10-04' },
  ];
  const res = similarBeers(beers[0], buildBeerSummaries(beers, checkins), styles);
  // b: スタイル3、c: 系統1+度数1+香り1=3（同点は評価の高い b が先）、d: 度数1のみで除外
  assert.deepEqual(res.map((r) => r.summary.beer.id), ['b', 'c']);
  assert.deepEqual(res[1].reasons, ['同じ系統', '近い度数', '似た香り']);
});
