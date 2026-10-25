// IndexedDB 操作
import { withBeerKeys, applyIncomplete, compareCheckinsDesc } from './models.js';
import { normalize } from './search.js';

export const DB_NAME = 'craft-beer-log';
export const DB_VERSION = 3;
export const DATA_STORES = ['beers', 'checkins', 'photos', 'breweryNotes', 'eventPlans'];
// ストアごとのキー（breweryNotes はブリュワーIDがキー）
const KEY_OF = { breweryNotes: (r) => r.breweryId };
const keyOf = (name, record) => (KEY_OF[name] ? KEY_OF[name](record) : record.id);

/**
 * スキーマの移行。バージョンを上げるときは `if (oldVersion < N)` のブロックを追加する。
 * @param {IDBDatabase} db
 * @param {number} oldVersion
 * @param {IDBTransaction} tx versionchange トランザクション（既存ストアの移行用）
 */
// eslint-disable-next-line no-unused-vars
export function migrate(db, oldVersion, tx) {
  if (oldVersion < 1) {
    const beers = db.createObjectStore('beers', { keyPath: 'id' });
    beers.createIndex('nameKey', 'nameKey');
    beers.createIndex('breweryKey', 'breweryKey');
    beers.createIndex('styleId', 'styleId');
    beers.createIndex('status', 'status');
    const checkins = db.createObjectStore('checkins', { keyPath: 'id' });
    checkins.createIndex('beerId', 'beerId');
    checkins.createIndex('date', 'date');
    db.createObjectStore('photos', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  }
  if (oldVersion < 2) {
    // ブリュワーの「行った・行きたい・メモ」
    db.createObjectStore('breweryNotes', { keyPath: 'breweryId' });
  }
  if (oldVersion < 3) {
    // イベントの参加状況（id はイベントの id）。既存のストアには触れない
    db.createObjectStore('eventPlans', { keyPath: 'id' });
  }
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('トランザクションが中断されました'));
  });
}

/** DB を開く。テストでは fake-indexeddb の IDBFactory を渡す */
export function openDB({ indexedDB = globalThis.indexedDB, name = DB_NAME } = {}) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) {
      reject(new Error('この環境ではIndexedDBが使えません'));
      return;
    }
    const open = indexedDB.open(name, DB_VERSION);
    open.onupgradeneeded = (e) => migrate(open.result, e.oldVersion, open.transaction);
    open.onsuccess = () => {
      const db = open.result;
      // 別タブで新しいバージョンが開かれたら閉じる（アップグレードを妨げない）
      db.onversionchange = () => db.close();
      resolve(new Repository(db));
    };
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('ほかのタブでアプリが開かれているため、データベースを更新できません'));
  });
}

/** 配信側からイベントが消えても表示できるよう、名前と日程の写しを持つ */
export function planSnapshot(event) {
  return { id: event.id, name: event.name, startDate: event.startDate, endDate: event.endDate };
}

function now() {
  return new Date().toISOString();
}

export class Repository {
  constructor(db) {
    this.db = db;
  }

  close() {
    this.db.close();
  }

  /** トランザクションを実行し、完了後に fn の戻り値を返す */
  async run(stores, mode, fn) {
    const tx = this.db.transaction(stores, mode);
    const done = txDone(tx);
    let result;
    try {
      result = await fn(tx);
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* 既に終了 */
      }
      await done.catch(() => {});
      throw e;
    }
    await done;
    return result;
  }

  // ---- 銘柄 ----

  getBeer(id) {
    return this.run(['beers'], 'readonly', (tx) => req(tx.objectStore('beers').get(id)));
  }

  listBeers() {
    return this.run(['beers'], 'readonly', (tx) => req(tx.objectStore('beers').getAll()));
  }

  listBeersByStatus(status) {
    return this.run(['beers'], 'readonly', (tx) => req(tx.objectStore('beers').index('status').getAll(status)));
  }

  /** 銘柄の保存。正規化キーを生成し、紐づく記録の incomplete を再計算する */
  saveBeer(beer) {
    const record = withBeerKeys({ ...beer, updatedAt: now() });
    return this.run(['beers', 'checkins'], 'readwrite', async (tx) => {
      tx.objectStore('beers').put(record);
      const store = tx.objectStore('checkins');
      const list = await req(store.index('beerId').getAll(record.id));
      for (const c of list) {
        const next = applyIncomplete(c, record);
        if (next.incomplete !== c.incomplete) store.put(next);
      }
      return record;
    });
  }

  /** 新しい銘柄と記録を同時に登録する */
  createBeerWithCheckin(beer, checkin, photos = []) {
    const b = withBeerKeys({ ...beer, status: 'tried' });
    const c = applyIncomplete({ ...checkin, beerId: b.id }, b);
    return this.run(['beers', 'checkins', 'photos'], 'readwrite', (tx) => {
      tx.objectStore('beers').put(b);
      for (const p of photos) tx.objectStore('photos').put(p);
      tx.objectStore('checkins').put(c);
      return { beer: b, checkin: c };
    });
  }

  // ---- 記録 ----

  getCheckin(id) {
    return this.run(['checkins'], 'readonly', (tx) => req(tx.objectStore('checkins').get(id)));
  }

  async listCheckins() {
    const list = await this.run(['checkins'], 'readonly', (tx) => req(tx.objectStore('checkins').getAll()));
    return list.sort(compareCheckinsDesc);
  }

  async listCheckinsByBeer(beerId) {
    const list = await this.run(['checkins'], 'readonly', (tx) =>
      req(tx.objectStore('checkins').index('beerId').getAll(beerId)),
    );
    return list.sort(compareCheckinsDesc);
  }

  /**
   * 記録の登録・更新。newPhotos を保存し、外された写真は削除する。
   * 飲みたいリストの銘柄に記録した場合は status を "tried" にする。
   */
  saveCheckin(checkin, newPhotos = []) {
    return this.run(['beers', 'checkins', 'photos'], 'readwrite', async (tx) => {
      const beers = tx.objectStore('beers');
      const checkins = tx.objectStore('checkins');
      const photos = tx.objectStore('photos');
      const beer = await req(beers.get(checkin.beerId));
      if (!beer) throw new Error('銘柄が見つかりません');
      const old = await req(checkins.get(checkin.id));
      if (old) {
        for (const pid of old.photoIds || []) {
          if (!checkin.photoIds.includes(pid)) photos.delete(pid);
        }
      }
      for (const p of newPhotos) photos.put(p);
      const record = applyIncomplete({ ...checkin, updatedAt: now() }, beer);
      checkins.put(record);
      if (beer.status === 'want') beers.put({ ...beer, status: 'tried', updatedAt: now() });
      return record;
    });
  }

  /** 記録の削除（写真も削除）。「元に戻す」用のスナップショットを返す */
  deleteCheckin(id) {
    return this.run(['checkins', 'photos'], 'readwrite', async (tx) => {
      const checkins = tx.objectStore('checkins');
      const photos = tx.objectStore('photos');
      const c = await req(checkins.get(id));
      if (!c) return { beers: [], checkins: [], photos: [] };
      const ps = [];
      for (const pid of c.photoIds || []) {
        const p = await req(photos.get(pid));
        if (p) ps.push(p);
        photos.delete(pid);
      }
      checkins.delete(id);
      return { beers: [], checkins: [c], photos: ps };
    });
  }

  /** 銘柄の削除（紐づく記録・写真も削除）。スナップショットを返す */
  deleteBeer(id) {
    return this.run(['beers', 'checkins', 'photos'], 'readwrite', async (tx) => {
      const beers = tx.objectStore('beers');
      const checkins = tx.objectStore('checkins');
      const photos = tx.objectStore('photos');
      const beer = await req(beers.get(id));
      if (!beer) return { beers: [], checkins: [], photos: [] };
      const cs = await req(checkins.index('beerId').getAll(id));
      const ps = [];
      for (const c of cs) {
        for (const pid of c.photoIds || []) {
          const p = await req(photos.get(pid));
          if (p) ps.push(p);
          photos.delete(pid);
        }
        checkins.delete(c.id);
      }
      beers.delete(id);
      return { beers: [beer], checkins: cs, photos: ps };
    });
  }

  /** 削除の取り消し */
  restoreSnapshot(snapshot) {
    return this.run(['beers', 'checkins', 'photos'], 'readwrite', (tx) => {
      for (const b of snapshot.beers || []) tx.objectStore('beers').put(b);
      for (const p of snapshot.photos || []) tx.objectStore('photos').put(p);
      for (const c of snapshot.checkins || []) tx.objectStore('checkins').put(c);
    });
  }

  /** 削除前の確認用：記録件数と写真枚数 */
  async countRelated(beerId) {
    const cs = await this.listCheckinsByBeer(beerId);
    return { checkins: cs.length, photos: cs.reduce((n, c) => n + (c.photoIds || []).length, 0) };
  }

  // ---- 写真 ----

  getPhoto(id) {
    return this.run(['photos'], 'readonly', (tx) => req(tx.objectStore('photos').get(id)));
  }

  async getThumb(id) {
    const p = await this.getPhoto(id);
    return p ? p.thumb : null;
  }

  // ---- 入力候補 ----

  /**
   * 過去の入力値の候補（使用回数の多い順）。
   * 表記揺れは正規化キーでまとめ、最も新しく使われた表記を代表とする。
   * @param {'brewery'|'place'} kind
   */
  async listDistinctValues(kind) {
    let rows;
    if (kind === 'brewery') {
      rows = (await this.listBeers()).map((b) => ({ value: b.brewery, at: b.updatedAt }));
    } else {
      rows = (await this.listCheckins()).map((c) => ({ value: c.place?.name, at: c.createdAt }));
    }
    const map = new Map();
    for (const r of rows) {
      const value = (r.value || '').trim();
      if (!value) continue;
      const key = normalize(value);
      const e = map.get(key);
      if (!e) map.set(key, { value, key, count: 1, at: r.at || '' });
      else {
        e.count += 1;
        if ((r.at || '') > e.at) {
          e.at = r.at || '';
          e.value = value;
        }
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || (a.at < b.at ? 1 : -1));
  }

  // ---- メタ情報 ----

  async getMeta(key) {
    const r = await this.run(['meta'], 'readonly', (tx) => req(tx.objectStore('meta').get(key)));
    return r ? r.value : null;
  }

  setMeta(key, value) {
    return this.run(['meta'], 'readwrite', (tx) => {
      tx.objectStore('meta').put({ key, value });
    });
  }

  // ---- Phase 4: スタイル一覧の移行 ----

  /**
   * スタイル一覧に無い styleId を持つ銘柄を「その他」に移す（起動時・インポート後に実行）。
   * 銘柄ストアのスキーマは変えないため DB のバージョンは上げず、実施した版を meta に残す。
   * @returns 変更した銘柄の数
   */
  migrateStyles(validIds, version, migrateOne) {
    return this.run(['beers', 'meta'], 'readwrite', async (tx) => {
      const store = tx.objectStore('beers');
      const beers = await req(store.getAll());
      let changed = 0;
      for (const beer of beers) {
        const next = migrateOne(beer, validIds);
        if (next) {
          store.put(next);
          changed++;
        }
      }
      tx.objectStore('meta').put({ key: 'stylesVersion', value: version });
      return changed;
    });
  }

  // ---- ブリュワーの行ったメモ ----

  getBreweryNote(breweryId) {
    return this.run(['breweryNotes'], 'readonly', (tx) => req(tx.objectStore('breweryNotes').get(breweryId)));
  }

  listBreweryNotes() {
    return this.run(['breweryNotes'], 'readonly', (tx) => req(tx.objectStore('breweryNotes').getAll()));
  }

  /** note が null なら削除する（makeBreweryNote が空のメモを null にする） */
  saveBreweryNote(breweryId, note) {
    return this.run(['breweryNotes'], 'readwrite', (tx) => {
      const store = tx.objectStore('breweryNotes');
      if (note) store.put({ ...note, breweryId });
      else store.delete(breweryId);
      return note;
    });
  }

  // ---- イベントの参加状況 ----

  listEventPlans() {
    return this.run(['eventPlans'], 'readonly', (tx) => req(tx.objectStore('eventPlans').getAll()));
  }

  getEventPlan(id) {
    return this.run(['eventPlans'], 'readonly', (tx) => req(tx.objectStore('eventPlans').get(id)));
  }

  /** 参加状況の保存。status も memo も空なら削除する */
  saveEventPlan(plan) {
    return this.run(['eventPlans'], 'readwrite', (tx) => {
      const store = tx.objectStore('eventPlans');
      if (!plan.status && !(plan.memo || '').trim()) {
        store.delete(plan.id);
        return null;
      }
      const record = { ...plan, updatedAt: now() };
      store.put(record);
      return record;
    });
  }

  /** そのイベントでの最初の記録のとき、参加状況を「行った」にする */
  markEventWent(event) {
    return this.run(['eventPlans'], 'readwrite', async (tx) => {
      const store = tx.objectStore('eventPlans');
      const old = await req(store.get(event.id));
      if (old?.status === 'went') return old;
      const record = { ...planSnapshot(event), memo: '', ...old, status: 'went', updatedAt: now() };
      store.put(record);
      return record;
    });
  }

  // ---- Phase 2: バックアップ ----

  async counts() {
    return this.run(DATA_STORES, 'readonly', async (tx) => ({
      beers: await req(tx.objectStore('beers').count()),
      checkins: await req(tx.objectStore('checkins').count()),
      photos: await req(tx.objectStore('photos').count()),
      breweryNotes: await req(tx.objectStore('breweryNotes').count()),
      eventPlans: await req(tx.objectStore('eventPlans').count()),
    }));
  }

  /** 全データの取得 */
  dumpAll() {
    return this.run(DATA_STORES, 'readonly', async (tx) => ({
      beers: await req(tx.objectStore('beers').getAll()),
      checkins: await req(tx.objectStore('checkins').getAll()),
      photos: await req(tx.objectStore('photos').getAll()),
      breweryNotes: await req(tx.objectStore('breweryNotes').getAll()),
      eventPlans: await req(tx.objectStore('eventPlans').getAll()),
    }));
  }

  /**
   * データの取り込み。
   * mode="replace"：既存のデータを消してから登録する
   * mode="merge"：同じIDのデータは既存を残し、無いものだけ追加する
   * @returns {{added:{beers,checkins,photos,breweryNotes}, skipped:{beers,checkins,photos,breweryNotes}}}
   */
  importData(data, mode) {
    if (mode !== 'replace' && mode !== 'merge') throw new Error('取り込み方法が不正です');
    return this.run(DATA_STORES, 'readwrite', async (tx) => {
      const added = Object.fromEntries(DATA_STORES.map((n) => [n, 0]));
      const skipped = Object.fromEntries(DATA_STORES.map((n) => [n, 0]));
      for (const name of DATA_STORES) {
        const store = tx.objectStore(name);
        if (mode === 'replace') await req(store.clear());
        const existing = mode === 'merge' ? new Set(await req(store.getAllKeys())) : new Set();
        for (const record of data[name] || []) {
          const key = keyOf(name, record);
          if (existing.has(key)) {
            skipped[name] += 1;
            continue;
          }
          store.put(name === 'beers' ? withBeerKeys(record) : record);
          existing.add(key);
          added[name] += 1;
        }
      }
      return { added, skipped };
    });
  }
}
