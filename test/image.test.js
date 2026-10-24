import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcResizedSize, PHOTO_MAX, THUMB_MAX } from '../js/image.js';

test('calcResizedSize: 横長・縦長・正方形', () => {
  assert.deepEqual(calcResizedSize(4032, 3024, PHOTO_MAX), { width: 1280, height: 960 });
  assert.deepEqual(calcResizedSize(3024, 4032, PHOTO_MAX), { width: 960, height: 1280 });
  assert.deepEqual(calcResizedSize(2000, 2000, THUMB_MAX), { width: 300, height: 300 });
});

test('calcResizedSize: 上限以下は拡大しない', () => {
  assert.deepEqual(calcResizedSize(800, 600, PHOTO_MAX), { width: 800, height: 600 });
  assert.deepEqual(calcResizedSize(1280, 720, PHOTO_MAX), { width: 1280, height: 720 });
});

test('calcResizedSize: 端数は四捨五入し、最小1px', () => {
  assert.deepEqual(calcResizedSize(1000, 333, 300), { width: 300, height: 100 });
  assert.deepEqual(calcResizedSize(10000, 1, 300), { width: 300, height: 1 });
});

test('calcResizedSize: 不正な値はエラー', () => {
  assert.throws(() => calcResizedSize(0, 100, 300), RangeError);
  assert.throws(() => calcResizedSize(100, NaN, 300), RangeError);
  assert.throws(() => calcResizedSize(100, 100, 0), RangeError);
});
