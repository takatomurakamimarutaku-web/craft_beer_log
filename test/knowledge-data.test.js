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
    assert.ok(s.servingTempF === null || (Array.isArray(s.servingTempF) && s.servingTempF.length === 2 && s.servingTempF[0] >= 32 && s.servingTempF[0] <= s.servingTempF[1] && s.servingTempF[1] <= 70), `${where}: servingTempF`);
    assert.ok(s.history === null || typeof s.history === 'string', `${where}: history`);
  }
});

test('styles.json：Phase 1〜3 の暫定スタイル ID をすべて引き継いでいる', async () => {
  const { LEGACY_STYLE_NAMES } = await import('../js/knowledge.js');
  const ids = new Set(load('styles').map((s) => s.id));
  for (const id of Object.keys(LEGACY_STYLE_NAMES)) assert.ok(ids.has(id), id);
});

test('terms.json：必須用語・本文・関連スタイル・出典', () => {
  const terms = load('terms');
  const ids = checkCommon(terms, ['name', 'fullName', 'summary']);
  const styleIds = new Set(load('styles').map((s) => s.id));
  for (const id of ['abv', 'ibu', 'srm-ebc', 'og-fg', 'ddh', 'neipa', 'ba', 'nitro', 'dry-hopping', 'keg-cask', 'hazy', 'fresh-hop']) {
    assert.ok(ids.has(id), `用語 ${id} が無い`);
  }
  for (const t of terms) {
    assert.ok(Array.isArray(t.body) && t.body.length > 0 && t.body.every((p) => typeof p === 'string' && p.trim()), `${t.id}: body`);
    assert.ok(t.scale === null || ['ibu', 'srm'].includes(t.scale), `${t.id}: scale`);
    for (const sid of t.relatedStyles) assert.ok(styleIds.has(sid), `${t.id}: 関連スタイル ${sid} が存在しない`);
  }
  assert.equal(terms.find((t) => t.id === 'ibu').scale, 'ibu');
  assert.equal(terms.find((t) => t.id === 'srm-ebc').scale, 'srm');
});

test('hops.json：必須項目・香りタグが語彙に存在・関連スタイル・出典', () => {
  const hops = load('hops');
  checkCommon(hops, ['name', 'nameEn', 'origin', 'originNote', 'aroma']);
  assert.ok(hops.length >= 18, 'ホップは約20件');
  const styleIds = new Set(load('styles').map((s) => s.id));
  for (const x of hops) {
    const where = `id=${x.id}`;
    assert.ok(x.use === null || ['aroma', 'bittering', 'dual'].includes(x.use), `${where}: use`);
    assert.ok(isRange(x.alpha, 0, 25), `${where}: alpha`);
    assert.ok(Array.isArray(x.flavorTags) && x.flavorTags.length > 0, `${where}: flavorTags が空`);
    for (const t of x.flavorTags) assert.ok(flavorTagIds.has(t), `${where}: 香りタグ ${t} が flavor-tags.json に無い`);
    assert.equal(new Set(x.flavorTags).size, x.flavorTags.length, `${where}: 香りタグが重複`);
    assert.ok(Array.isArray(x.styles) && Array.isArray(x.aliases), `${where}: styles / aliases は配列`);
    for (const sid of x.styleIds) assert.ok(styleIds.has(sid), `${where}: スタイル ${sid} が存在しない`);
  }
});

export { load, checkCommon, flavorTagIds, isRange };

test('basics.json：入門記事の本文・工程・比較表・リンク先・出典', () => {
  const basics = load('basics');
  const ids = checkCommon(basics, ['name', 'summary']);
  for (const id of ['craft-beer', 'brewing', 'fermentation', 'hops', 'ingredients']) assert.ok(ids.has(id), `入門 ${id} が無い`);
  const refs = {
    relatedStyles: new Set(load('styles').map((s) => s.id)),
    relatedTerms: new Set(load('terms').map((t) => t.id)),
    relatedHops: new Set(load('hops').map((x) => x.id)),
    relatedBasics: ids,
  };
  for (const a of basics) {
    const where = `id=${a.id}`;
    assert.ok(Array.isArray(a.sections) && a.sections.length > 0, `${where}: sections`);
    for (const s of a.sections) {
      assert.ok(s.heading && s.heading.trim(), `${where}: 見出し`);
      assert.ok(Array.isArray(s.body) && s.body.length > 0 && s.body.every((p) => typeof p === 'string' && p.trim()), `${where}: ${s.heading} の本文`);
    }
    assert.ok(a.steps === null || (Array.isArray(a.steps) && a.steps.every((s) => s.name && s.text)), `${where}: steps`);
    if (a.compare !== null) {
      const { columns, rows } = a.compare;
      assert.ok(Array.isArray(columns) && columns.length >= 2, `${where}: compare.columns`);
      for (const r of rows) assert.equal(r.length, columns.length, `${where}: compare の列数`);
    }
    for (const [key, valid] of Object.entries(refs)) {
      assert.ok(Array.isArray(a[key]), `${where}: ${key} は配列`);
      for (const id of a[key]) assert.ok(valid.has(id), `${where}: ${key} の ${id} が存在しない`);
    }
    assert.ok(!a.relatedBasics.includes(a.id), `${where}: 自分自身へのリンク`);
  }
  assert.ok(basics.find((a) => a.id === 'brewing').steps.length >= 5, '造り方は工程つき');
  assert.ok(basics.find((a) => a.id === 'fermentation').compare, '発酵は比較表つき');
});

test('images.json：対象のID・ファイルの存在・ライセンス表記', async () => {
  const { existsSync } = await import('node:fs');
  const { IMAGE_KINDS, IMAGE_LICENSES } = await import('../js/knowledge.js');
  const images = load('images');
  const ids = { styles: new Set(load('styles').map((s) => s.id)), hops: new Set(load('hops').map((x) => x.id)) };
  assert.deepEqual(Object.keys(images).sort(), [...IMAGE_KINDS].sort());
  for (const kind of IMAGE_KINDS) {
    for (const [id, e] of Object.entries(images[kind])) {
      const where = `${kind}/${id}`;
      assert.ok(ids[kind].has(id), `${where}: 対象が存在しない`);
      assert.match(e.file, new RegExp(`^images/${kind}/[a-z0-9-]+\\.(webp|jpg|png)$`), `${where}: file`);
      assert.ok(existsSync(new URL(`../${e.file}`, import.meta.url)), `${where}: 画像ファイルが無い`);
      assert.ok(IMAGE_LICENSES.includes(e.license), `${where}: license`);
      if (e.license === 'ai') {
        // 法務検討の前提：生成サービス名・生成日・プロンプトを記録する
        assert.ok(e.service && e.prompt, `${where}: AI画像は service と prompt が必要`);
        assert.match(e.generatedAt, /^\d{4}-\d{2}-\d{2}$/, `${where}: generatedAt`);
      }
      if (['cc-by', 'cc-by-sa', 'permission'].includes(e.license)) assert.ok(e.author && e.sourceUrl, `${where}: 作者と出典が必要`);
      if (e.sourceUrl) assert.match(e.sourceUrl, /^https:\/\//, `${where}: sourceUrl は https`);
    }
  }
});
