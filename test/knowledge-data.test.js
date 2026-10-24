// 知識データ（data/*.json）の形の検査
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLASS_TYPES } from '../js/illust.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const flavorTagIds = new Set(load('flavor-tags').map((t) => t.id));

function isRange(v, min, max) {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && n >= min && n <= max) && v[0] <= v[1];
}

/** 全種類に共通：必須文字列・ID の一意性・出典 */
function checkCommon(items, requiredStrings) {
  assert.ok(Array.isArray(items) && items.length > 0);
  const ids = new Set();
  for (const item of items) {
    const where = `id=${item.id}`;
    assert.match(item.id, /^[a-z0-9-]+$/, `${where}: ID はスラッグ`);
    assert.ok(!ids.has(item.id), `${where}: ID が重複`);
    ids.add(item.id);
    for (const key of requiredStrings) {
      assert.equal(typeof item[key], 'string', `${where}: ${key} が無い`);
      assert.ok(item[key].trim().length > 0, `${where}: ${key} が空`);
    }
    assert.ok(Array.isArray(item.sources) && item.sources.length >= 1, `${where}: 出典が1件以上必要`);
    for (const s of item.sources) {
      assert.ok(s.title && s.title.trim(), `${where}: 出典の title`);
      assert.match(s.url, /^https:\/\/[^\s/]+\.[^\s]+$/, `${where}: 出典の URL は https`);
      assert.match(s.accessedAt, /^\d{4}-\d{2}-\d{2}$/, `${where}: 出典の accessedAt`);
    }
  }
  return ids;
}

test('flavor-tags.json：ID が一意で表示名がある', () => {
  const tags = load('flavor-tags');
  assert.equal(new Set(tags.map((t) => t.id)).size, tags.length);
  for (const t of tags) assert.ok(t.label);
});

test('styles.json：必須項目・範囲・グラス・出典', () => {
  const styles = load('styles');
  checkCommon(styles, ['name', 'nameEn', 'category', 'summary', 'flavor']);
  assert.ok(styles.length >= 20, 'スタイルは20件以上');
  for (const s of styles) {
    const where = `id=${s.id}`;
    assert.notEqual(s.id, 'other', `${where}: other は予約済み`);
    assert.ok(s.abv === null || isRange(s.abv, 0, 20), `${where}: abv`);
    assert.ok(s.ibu === null || isRange(s.ibu, 0, 150), `${where}: ibu`);
    assert.ok(s.srm === null || isRange(s.srm, 0, 60), `${where}: srm`);
    assert.ok(s.displaySrm === null || (typeof s.displaySrm === 'number' && s.displaySrm > 0), `${where}: displaySrm`);
    assert.ok(s.glass === null || GLASS_TYPES.includes(s.glass), `${where}: glass`);
    assert.ok(Array.isArray(s.aliases) && Array.isArray(s.pairing), `${where}: aliases / pairing は配列`);
    assert.ok(s.history === null || typeof s.history === 'string', `${where}: history`);
  }
});

test('styles.json：Phase 1〜3 の暫定スタイル ID をすべて引き継いでいる', async () => {
  const { LEGACY_STYLE_NAMES } = await import('../js/knowledge.js');
  const ids = new Set(load('styles').map((s) => s.id));
  for (const id of Object.keys(LEGACY_STYLE_NAMES)) assert.ok(ids.has(id), id);
});

export { load, checkCommon, flavorTagIds, isRange };
