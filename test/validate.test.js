import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAbv, validateBeer, validateCheckin, isIncomplete, isValidDateString, parseRating } from '../js/validate.js';

test('parseAbv: 範囲内は小数第1位に丸める', () => {
  assert.deepEqual(parseAbv('0'), { value: 0, error: null });
  assert.deepEqual(parseAbv('20'), { value: 20, error: null });
  assert.deepEqual(parseAbv('5.56'), { value: 5.6, error: null });
  assert.deepEqual(parseAbv('5.04'), { value: 5, error: null });
  assert.deepEqual(parseAbv(6.5), { value: 6.5, error: null });
  assert.deepEqual(parseAbv('５．５'), { value: 5.5, error: null }, '全角数字も受け付ける');
});

test('parseAbv: 空は null（任意項目）', () => {
  assert.deepEqual(parseAbv(''), { value: null, error: null });
  assert.deepEqual(parseAbv('  '), { value: null, error: null });
  assert.deepEqual(parseAbv(null), { value: null, error: null });
});

test('parseAbv: 範囲外・数値以外はエラー', () => {
  assert.match(parseAbv('20.1').error, /0〜20/);
  assert.match(parseAbv('-1').error, /0〜20/);
  assert.match(parseAbv('abc').error, /数値/);
  assert.match(parseAbv('5%').error, /数値/);
  assert.match(parseAbv('1e1').error, /数値/);
  assert.match(parseAbv(NaN).error, /数値/);
});

test('validateBeer: 名前は必須', () => {
  const r = validateBeer({ name: '  ' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.name);
  assert.equal(validateBeer({ name: 'ペールエール' }).ok, true);
});

test('validateBeer: 度数の範囲外は保存できない', () => {
  const r = validateBeer({ name: 'X', abv: '25' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.abv);
});

test('validateBeer: 値の整形（前後空白、その他以外ではstyleOtherを空に）', () => {
  const r = validateBeer({ name: ' A ', brewery: ' B ', styleId: 'ipa', styleOther: 'x', abv: '6' });
  assert.deepEqual(r.value, { name: 'A', brewery: 'B', styleId: 'ipa', styleOther: '', abv: 6, status: 'tried', memo: '' });
  assert.equal(validateBeer({ name: 'A', styleId: 'other', styleOther: ' 古代ビール ' }).value.styleOther, '古代ビール');
  assert.equal(validateBeer({ name: 'A', status: 'bad' }).ok, false);
});

test('validateCheckin: 日付は必須で実在する日付', () => {
  assert.ok(validateCheckin({ date: '' }).errors.date);
  assert.ok(validateCheckin({ date: '2026-02-30' }).errors.date);
  assert.ok(validateCheckin({ date: '2026/10/24' }).errors.date);
  assert.equal(validateCheckin({ date: '2026-10-24' }).ok, true);
});

test('validateCheckin: 容量・価格・評価・写真枚数', () => {
  const r = validateCheckin({ date: '2026-10-24', volumeMl: '350', price: '1,200', rating: 6, photoIds: [1, 2, 3, 4, 5] });
  assert.equal(r.ok, false);
  assert.ok(!r.errors.volumeMl);
  assert.ok(r.errors.price);
  assert.ok(r.errors.rating);
  assert.ok(r.errors.photos);
  const ok = validateCheckin({ date: '2026-10-24', volumeMl: '350', price: '1200', rating: 4, serving: 'can', place: { type: 'bought', name: ' 酒屋 ' } });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.volumeMl, 350);
  assert.equal(ok.value.price, 1200);
  assert.equal(ok.value.place.name, '酒屋');
  assert.ok(validateCheckin({ date: '2026-10-24', serving: 'glass' }).errors.serving);
  assert.ok(validateCheckin({ date: '2026-10-24', place: { type: 'x' } }).errors.placeType);
});

test('parseRating・isValidDateString', () => {
  assert.equal(parseRating('').value, null);
  assert.equal(parseRating(3).value, 3);
  assert.ok(parseRating(0).error);
  assert.ok(parseRating(2.5).error);
  assert.ok(isValidDateString('2024-02-29'));
  assert.ok(!isValidDateString('2023-02-29'));
});

test('isIncomplete: ブリュワー・スタイル・度数のいずれかが空', () => {
  const full = { brewery: 'B', styleId: 'ipa', abv: 6 };
  assert.equal(isIncomplete(full), false);
  assert.equal(isIncomplete({ ...full, brewery: '' }), true);
  assert.equal(isIncomplete({ ...full, styleId: null }), true);
  assert.equal(isIncomplete({ ...full, abv: null }), true);
  assert.equal(isIncomplete({ ...full, styleId: 'other', styleOther: '' }), true);
  assert.equal(isIncomplete({ ...full, styleId: 'other', styleOther: 'グルート' }), false);
  assert.equal(isIncomplete({ ...full, abv: 0 }), false, '0%（ノンアル）は入力済み');
});
