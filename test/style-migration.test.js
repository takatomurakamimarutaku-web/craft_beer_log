// スタイル一覧の移行（Phase 4-1）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from '../js/db.js';
import { createBeer, createCheckin, styleLabel } from '../js/models.js';
import { migrateBeerStyle, LEGACY_STYLE_NAMES, STYLES_VERSION } from '../js/knowledge.js';

const styles = JSON.parse(readFileSync(new URL('../data/styles.json', import.meta.url), 'utf8'));
const validIds = new Set(styles.map((s) => s.id));

test('migrateBeerStyle：一覧にある ID・空・other は変更しない', () => {
  assert.equal(migrateBeerStyle(createBeer({ styleId: 'ipa' }), validIds), null);
  assert.equal(migrateBeerStyle(createBeer({ styleId: null }), validIds), null);
  assert.equal(migrateBeerStyle(createBeer({ styleId: 'other', styleOther: 'ラオホ' }), validIds), null);
});

test('migrateBeerStyle：一覧に無い ID は「その他」に移し、元の名前を残す', () => {
  const ids = new Set(['ipa']);
  const r = migrateBeerStyle(createBeer({ styleId: 'saison' }), ids);
  assert.equal(r.styleId, 'other');
  assert.equal(r.styleOther, LEGACY_STYLE_NAMES.saison);
  // 名前表に無い ID はその ID を残す
  assert.equal(migrateBeerStyle(createBeer({ styleId: 'mystery' }), ids).styleOther, 'mystery');
});

test('DB 移行：暫定スタイルの記録は新しい一覧でもそのまま表示され、未知の ID は「その他」になる', async () => {
  const repo = await openDB({ indexedDB: new IDBFactory() });
  const legacy = Object.keys(LEGACY_STYLE_NAMES).map((styleId, i) => createBeer({ name: `銘柄${i}`, brewery: 'B', abv: 5, styleId }));
  for (const b of legacy) await repo.createBeerWithCheckin(b, createCheckin({ rating: 4 }), []);
  const unknown = createBeer({ name: '旧スタイル', brewery: 'B', abv: 5, styleId: 'retired-style' });
  const { checkin } = await repo.createBeerWithCheckin(unknown, createCheckin({}), []);

  const changed = await repo.migrateStyles(validIds, STYLES_VERSION, migrateBeerStyle);
  assert.equal(changed, 1, '未知の ID の1件だけ変更');
  assert.equal(await repo.getMeta('stylesVersion'), STYLES_VERSION);

  for (const b of legacy) {
    const stored = await repo.getBeer(b.id);
    assert.equal(stored.styleId, b.styleId, '暫定 ID は引き継がれる');
    assert.equal(styleLabel(stored, styles), LEGACY_STYLE_NAMES[b.styleId], '表示名も同じ');
  }
  const moved = await repo.getBeer(unknown.id);
  assert.equal(moved.styleId, 'other');
  assert.equal(moved.styleOther, 'retired-style');
  assert.equal((await repo.getCheckin(checkin.id)).incomplete, false, '未入力扱いにならない');

  // 2回目は何も変わらない
  assert.equal(await repo.migrateStyles(validIds, STYLES_VERSION, migrateBeerStyle), 0);
  repo.close();
});
