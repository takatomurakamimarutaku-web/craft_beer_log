import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDB, DB_VERSION, DB_NAME } from '../js/db.js';
import { createBeer, createCheckin } from '../js/models.js';

const photo = (id) => ({ id, blob: new Blob([`img-${id}`], { type: 'image/jpeg' }), thumb: new Blob([`th-${id}`], { type: 'image/jpeg' }) });

async function fresh() {
  return openDB({ indexedDB: new IDBFactory() });
}

test('スキーマ v1：ストアとインデックスが作成される', async () => {
  const repo = await fresh();
  const db = repo.db;
  assert.equal(db.name, DB_NAME);
  assert.equal(db.version, DB_VERSION);
  assert.deepEqual([...db.objectStoreNames].sort(), ['beers', 'checkins', 'meta', 'photos']);
  const tx = db.transaction(['beers', 'checkins'], 'readonly');
  assert.deepEqual([...tx.objectStore('beers').indexNames].sort(), ['breweryKey', 'nameKey', 'status', 'styleId']);
  assert.deepEqual([...tx.objectStore('checkins').indexNames].sort(), ['beerId', 'date']);
  repo.close();
});

test('銘柄＋記録の登録：正規化キーと incomplete を設定する', async () => {
  const repo = await fresh();
  const beer = createBeer({ name: 'ゆかいなIPA', brewery: 'ｙｏｈｏ' });
  const { beer: b, checkin: c } = await repo.createBeerWithCheckin(beer, createCheckin({ rating: 4, photoIds: ['p1'] }), [photo('p1')]);
  assert.equal(b.nameKey, 'ユカイナipa');
  assert.equal(b.breweryKey, 'yoho');
  assert.equal(c.beerId, b.id);
  assert.equal(c.incomplete, true, 'スタイル・度数が空なので未入力あり');
  const stored = await repo.getCheckin(c.id);
  assert.equal(stored.rating, 4);
  assert.equal(await (await repo.getThumb('p1')).text(), 'th-p1');
  assert.equal((await repo.listCheckinsByBeer(b.id)).length, 1);
  repo.close();
});

test('銘柄の更新：未入力を埋めると紐づく記録の incomplete が解除される', async () => {
  const repo = await fresh();
  const { beer, checkin } = await repo.createBeerWithCheckin(createBeer({ name: 'A' }), createCheckin());
  assert.equal((await repo.getCheckin(checkin.id)).incomplete, true);
  const saved = await repo.saveBeer({ ...beer, name: 'Ａ Beer', brewery: 'B', styleId: 'ipa', abv: 6.5 });
  assert.equal(saved.nameKey, 'a beer');
  assert.equal((await repo.getBeer(beer.id)).abv, 6.5);
  assert.equal((await repo.getCheckin(checkin.id)).incomplete, false);
  await repo.saveBeer({ ...saved, abv: null });
  assert.equal((await repo.getCheckin(checkin.id)).incomplete, true);
  repo.close();
});

test('既存の銘柄に記録を追加・更新：外した写真は削除される', async () => {
  const repo = await fresh();
  const { beer } = await repo.createBeerWithCheckin(createBeer({ name: 'A', brewery: 'B', styleId: 'ipa', abv: 5 }), createCheckin());
  const c = createCheckin({ beerId: beer.id, photoIds: ['p1', 'p2'] });
  await repo.saveCheckin(c, [photo('p1'), photo('p2')]);
  assert.equal((await repo.getCheckin(c.id)).incomplete, false);
  await repo.saveCheckin({ ...c, photoIds: ['p2', 'p3'], memo: '更新' }, [photo('p3')]);
  assert.equal(await repo.getPhoto('p1'), undefined);
  assert.ok(await repo.getPhoto('p2'));
  assert.ok(await repo.getPhoto('p3'));
  assert.equal((await repo.getCheckin(c.id)).memo, '更新');
  assert.equal((await repo.listCheckinsByBeer(beer.id)).length, 2);
  repo.close();
});

test('存在しない銘柄への記録はエラーになり、写真も保存されない', async () => {
  const repo = await fresh();
  await assert.rejects(repo.saveCheckin(createCheckin({ beerId: 'none', photoIds: ['p1'] }), [photo('p1')]), /銘柄が見つかりません/);
  assert.equal(await repo.getPhoto('p1'), undefined);
  repo.close();
});

test('記録の削除：写真も削除され、スナップショットから元に戻せる', async () => {
  const repo = await fresh();
  const { beer, checkin } = await repo.createBeerWithCheckin(createBeer({ name: 'A' }), createCheckin({ photoIds: ['p1'] }), [photo('p1')]);
  const snap = await repo.deleteCheckin(checkin.id);
  assert.equal(await repo.getCheckin(checkin.id), undefined);
  assert.equal(await repo.getPhoto('p1'), undefined);
  assert.ok(await repo.getBeer(beer.id), '銘柄は残る');
  await repo.restoreSnapshot(snap);
  assert.ok(await repo.getCheckin(checkin.id));
  assert.equal(await (await repo.getPhoto('p1')).blob.text(), 'img-p1');
  repo.close();
});

test('銘柄の削除：紐づく記録と写真も削除され、元に戻せる', async () => {
  const repo = await fresh();
  const { beer, checkin } = await repo.createBeerWithCheckin(createBeer({ name: 'A' }), createCheckin({ photoIds: ['p1'] }), [photo('p1')]);
  const c2 = createCheckin({ beerId: beer.id, photoIds: ['p2', 'p3'] });
  await repo.saveCheckin(c2, [photo('p2'), photo('p3')]);
  const other = await repo.createBeerWithCheckin(createBeer({ name: 'B' }), createCheckin({ photoIds: ['q1'] }), [photo('q1')]);

  assert.deepEqual(await repo.countRelated(beer.id), { checkins: 2, photos: 3 });
  const snap = await repo.deleteBeer(beer.id);
  assert.equal(snap.beers.length, 1);
  assert.equal(snap.checkins.length, 2);
  assert.equal(snap.photos.length, 3);
  assert.equal(await repo.getBeer(beer.id), undefined);
  assert.equal(await repo.getCheckin(checkin.id), undefined);
  for (const id of ['p1', 'p2', 'p3']) assert.equal(await repo.getPhoto(id), undefined);
  assert.ok(await repo.getPhoto('q1'), '別の銘柄の写真は残る');
  assert.ok(await repo.getCheckin(other.checkin.id));

  await repo.restoreSnapshot(snap);
  assert.ok(await repo.getBeer(beer.id));
  assert.equal((await repo.listCheckinsByBeer(beer.id)).length, 2);
  assert.ok(await repo.getPhoto('p3'));
  repo.close();
});

test('記録一覧は日付の新しい順、同じ日付は登録の新しい順', async () => {
  const repo = await fresh();
  const { beer } = await repo.createBeerWithCheckin(createBeer({ name: 'A' }), createCheckin({ date: '2026-01-01', createdAt: '2026-01-01T00:00:00Z' }));
  await repo.saveCheckin(createCheckin({ beerId: beer.id, date: '2026-03-01', createdAt: '2026-03-01T00:00:00Z', memo: 'x' }));
  await repo.saveCheckin(createCheckin({ beerId: beer.id, date: '2026-03-01', createdAt: '2026-03-02T00:00:00Z', memo: 'y' }));
  const list = await repo.listCheckins();
  assert.deepEqual(list.map((c) => c.memo || c.date), ['y', 'x', '2026-01-01']);
  repo.close();
});

test('入力候補：表記揺れをまとめ、使用回数の多い順', async () => {
  const repo = await fresh();
  await repo.createBeerWithCheckin(createBeer({ name: 'A', brewery: 'ヤッホー' }), createCheckin({ place: { type: 'drank', name: 'びあばー' } }));
  await repo.createBeerWithCheckin(createBeer({ name: 'B', brewery: 'やっほー' }), createCheckin({ place: { type: 'drank', name: 'ビアバー' } }));
  await repo.createBeerWithCheckin(createBeer({ name: 'C', brewery: 'コエド' }), createCheckin({ place: { type: 'bought', name: '' } }));
  const breweries = await repo.listDistinctValues('brewery');
  assert.equal(breweries.length, 2);
  assert.equal(breweries[0].key, 'ヤッホー');
  assert.equal(breweries[0].count, 2);
  const places = await repo.listDistinctValues('place');
  assert.equal(places.length, 1);
  assert.equal(places[0].count, 2);
  repo.close();
});

test('飲みたいリストの銘柄に記録すると status が tried になる', async () => {
  const repo = await fresh();
  const want = await repo.saveBeer(createBeer({ name: '飲みたい', status: 'want' }));
  assert.equal((await repo.listBeersByStatus('want')).length, 1);
  await repo.saveCheckin(createCheckin({ beerId: want.id }));
  assert.equal((await repo.getBeer(want.id)).status, 'tried');
  assert.equal((await repo.listBeersByStatus('want')).length, 0);
  repo.close();
});

test('メタ情報の保存', async () => {
  const repo = await fresh();
  assert.equal(await repo.getMeta('lastBackupAt'), null);
  await repo.setMeta('lastBackupAt', '2026-10-24T00:00:00.000Z');
  assert.equal(await repo.getMeta('lastBackupAt'), '2026-10-24T00:00:00.000Z');
  repo.close();
});
