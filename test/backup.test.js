import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from '../js/db.js';
import { createBeer, createCheckin } from '../js/models.js';
import { createBackupBlob, parseBackup, BackupError, blobToBase64, base64ToBlob, shouldRemindBackup, BACKUP_FORMAT, BACKUP_VERSION } from '../js/backup.js';

const bytes = (n, seed) => new Uint8Array(n).map((_, i) => (i * 31 + seed) % 256);
const photo = (id, seed) => ({ id, blob: new Blob([bytes(5000, seed)], { type: 'image/jpeg' }), thumb: new Blob([bytes(700, seed + 1)], { type: 'image/jpeg' }) });

async function sampleRepo() {
  const repo = await openDB({ indexedDB: new IDBFactory() });
  const { beer } = await repo.createBeerWithCheckin(
    createBeer({ name: 'ゆかいIPA', brewery: 'B', styleId: 'ipa', abv: 6.5, memo: '改行\nあり' }),
    createCheckin({ date: '2026-10-01', rating: 5, photoIds: ['p1', 'p2'], place: { type: 'drank', name: '店' }, tasting: { bitter: 4, flavorTags: ['citrus'] } }),
    [photo('p1', 1), photo('p2', 2)],
  );
  await repo.saveCheckin(createCheckin({ beerId: beer.id, date: '2026-10-02', photoIds: ['p3'] }), [photo('p3', 3)]);
  await repo.saveBeer(createBeer({ name: '飲みたい', status: 'want' }));
  await repo.saveBreweryNote('baeren', { breweryId: 'baeren', visited: ['2026-10-03'], wantToVisit: false, memo: '駅から歩ける', updatedAt: '2026-10-03T00:00:00.000Z' });
  return repo;
}

async function normalized(repo) {
  const d = await repo.dumpAll();
  const sort = (a) => [...a].sort((x, y) => (x.id < y.id ? -1 : 1));
  return {
    beers: sort(d.beers),
    checkins: sort(d.checkins),
    breweryNotes: d.breweryNotes,
    photos: await Promise.all(
      sort(d.photos).map(async (p) => ({ id: p.id, blob: await blobToBase64(p.blob), blobType: p.blob.type, thumb: await blobToBase64(p.thumb) })),
    ),
  };
}

test('base64 の往復で内容が一致する', async () => {
  const b = new Blob([bytes(100000, 7)], { type: 'image/jpeg' });
  const back = base64ToBlob(await blobToBase64(b), 'image/jpeg');
  assert.deepEqual(new Uint8Array(await back.arrayBuffer()), new Uint8Array(await b.arrayBuffer()));
  assert.equal(back.type, 'image/jpeg');
});

test('エクスポート → 別のDBへ置き換えでインポート：写真を含めて一致する', async () => {
  const src = await sampleRepo();
  const blob = await createBackupBlob(await src.dumpAll(), new Date('2026-10-24T00:00:00Z'));
  const data = parseBackup(await blob.text());
  assert.equal(data.exportedAt, '2026-10-24T00:00:00.000Z');

  const dst = await openDB({ indexedDB: new IDBFactory() });
  await dst.createBeerWithCheckin(createBeer({ name: '消える' }), createCheckin());
  const r = await dst.importData(data, 'replace');
  assert.deepEqual(r.added, { beers: 2, checkins: 2, photos: 3, breweryNotes: 1 });
  assert.deepEqual(await normalized(dst), await normalized(src));
  src.close();
  dst.close();
});

test('追加インポート：同じIDは重複させず、新しいものだけ追加する', async () => {
  const src = await sampleRepo();
  const data = parseBackup(await (await createBackupBlob(await src.dumpAll())).text());
  // 同じデータを追加しても増えない
  const r1 = await src.importData(data, 'merge');
  assert.deepEqual(r1.added, { beers: 0, checkins: 0, photos: 0, breweryNotes: 0 });
  assert.deepEqual(r1.skipped, { beers: 2, checkins: 2, photos: 3, breweryNotes: 1 });
  assert.deepEqual(await src.counts(), { beers: 2, checkins: 2, photos: 3, breweryNotes: 1 });

  // 別のDBに追加すると、既存のデータは残る
  const dst = await openDB({ indexedDB: new IDBFactory() });
  await dst.createBeerWithCheckin(createBeer({ name: '既存' }), createCheckin());
  const r2 = await dst.importData(data, 'merge');
  assert.deepEqual(r2.added, { beers: 2, checkins: 2, photos: 3, breweryNotes: 1 });
  assert.deepEqual(await dst.counts(), { beers: 3, checkins: 3, photos: 3, breweryNotes: 1 });
  src.close();
  dst.close();
});

test('不正なファイルは読み込まない', () => {
  const ok = { format: BACKUP_FORMAT, version: BACKUP_VERSION, beers: [], checkins: [], photos: [] };
  const bad = (obj) => assert.throws(() => parseBackup(typeof obj === 'string' ? obj : JSON.stringify(obj)), BackupError);
  bad('not json');
  bad('[]');
  bad({ ...ok, format: 'other-app' });
  bad({ ...ok, version: '1' });
  bad({ ...ok, version: 0 });
  bad({ ...ok, beers: undefined });
  bad({ ...ok, beers: [{ id: 'b1' }] }); // 名前なし
  bad({ ...ok, beers: [{ id: 'b1', name: 'A', abv: 'strong' }] });
  bad({ ...ok, beers: [{ id: 'b1', name: 'A' }, { id: 'b1', name: 'B' }] }); // ID重複
  bad({ ...ok, checkins: [{ id: 'c1', beerId: 'none', date: '2026-01-01' }] }); // 銘柄なし
  bad({ ...ok, beers: [{ id: 'b1', name: 'A' }], checkins: [{ id: 'c1', beerId: 'b1', date: '2026-13-01' }] });
  bad({ ...ok, beers: [{ id: 'b1', name: 'A' }], checkins: [{ id: 'c1', beerId: 'b1', date: '2026-01-01', rating: 9 }] });
  bad({ ...ok, beers: [{ id: 'b1', name: 'A' }], checkins: [{ id: 'c1', beerId: 'b1', date: '2026-01-01', photoIds: ['missing'] }] });
  bad({ ...ok, photos: [{ id: 'p1', data: '***' }] });
  assert.doesNotThrow(() => parseBackup(JSON.stringify(ok)));
});

test('新しいバージョンのファイルは、アプリの更新を促して読み込まない', () => {
  assert.throws(
    () => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, beers: [], checkins: [], photos: [] })),
    /アプリを更新/,
  );
});

test('旧いファイル（後のフェーズの項目が無い記録）は初期値で補って読み込む', () => {
  const old = {
    format: BACKUP_FORMAT,
    version: 1,
    beers: [{ id: 'b1', name: 'A', brewery: 'B' }],
    checkins: [{ id: 'c1', beerId: 'b1', date: '2025-05-05', rating: 3 }],
    photos: [],
  };
  const d = parseBackup(JSON.stringify(old));
  assert.equal(d.beers[0].status, 'tried');
  assert.equal(d.beers[0].nameKey, 'a');
  assert.equal(d.beers[0].styleId, null);
  assert.deepEqual(d.checkins[0].tasting.flavorTags, []);
  assert.deepEqual(d.checkins[0].photoIds, []);
  assert.equal(d.checkins[0].place.type, 'drank');
  assert.equal(d.checkins[0].rating, 3);
});

test('shouldRemindBackup：30日以上で案内する', () => {
  const now = new Date('2026-10-24T00:00:00Z');
  assert.equal(shouldRemindBackup(null, null, now), false, 'データが無ければ案内しない');
  assert.equal(shouldRemindBackup('2026-09-25T00:00:00Z', null, now), false);
  assert.equal(shouldRemindBackup('2026-09-24T00:00:00Z', null, now), true);
  assert.equal(shouldRemindBackup(null, '2026-09-01T00:00:00Z', now), true, '未バックアップで最初の記録から30日以上');
  assert.equal(shouldRemindBackup(null, '2026-10-20T00:00:00Z', now), false);
});

test('ブリュワーのメモ：無い古いファイルは空として読み、不正な内容は読み込まない', () => {
  const base = { format: BACKUP_FORMAT, version: BACKUP_VERSION, beers: [], checkins: [], photos: [] };
  assert.deepEqual(parseBackup(JSON.stringify(base)).breweryNotes, []);
  const note = { breweryId: 'baeren', visited: ['2026-10-03'], wantToVisit: true, memo: 'x', updatedAt: '2026-10-03T00:00:00.000Z' };
  assert.deepEqual(parseBackup(JSON.stringify({ ...base, breweryNotes: [note] })).breweryNotes, [note]);
  const bad = (breweryNotes) => assert.throws(() => parseBackup(JSON.stringify({ ...base, breweryNotes })), BackupError);
  bad({});
  bad([{ visited: [] }]);
  bad([{ breweryId: 'a', visited: ['2026/10/03'] }]);
  bad([{ breweryId: 'a' }, { breweryId: 'a' }]);
});
