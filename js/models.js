// データの生成と定数（DOM に依存しない）
import { normalize } from './search.js';
import { isIncomplete } from './validate.js';

export const SERVING_LABELS = { draft: '樽生', can: '缶', bottle: '瓶', other: 'その他' };
export const PLACE_TYPE_LABELS = { drank: '飲んだ', bought: '買った' };
export const STATUS_LABELS = { tried: '飲んだ', want: '飲みたい' };
export const MAX_PHOTOS = 4;

function newId() {
  return crypto.randomUUID();
}

/** ローカル時刻での YYYY-MM-DD */
export function todayString(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 銘柄（全項目を初期値付きで持つ） */
export function createBeer(fields = {}, now = new Date()) {
  const ts = now.toISOString();
  return withBeerKeys({
    id: newId(),
    name: '',
    brewery: '',
    styleId: null,
    styleOther: '',
    abv: null,
    status: 'tried',
    memo: '',
    createdAt: ts,
    updatedAt: ts,
    ...fields,
  });
}

/** 飲んだ記録（後のフェーズの項目も含む） */
export function createCheckin(fields = {}, now = new Date()) {
  const ts = now.toISOString();
  return {
    id: newId(),
    beerId: null,
    date: todayString(now),
    serving: null,
    volumeMl: null,
    price: null,
    rating: null,
    memo: '',
    photoIds: [],
    incomplete: false,
    createdAt: ts,
    updatedAt: ts,
    ...fields,
    place: { type: 'drank', name: '', ...(fields.place || {}) },
    tasting: {
      bitter: null,
      sweet: null,
      sour: null,
      body: null,
      aroma: null,
      flavorTags: [],
      ...(fields.tasting || {}),
    },
  };
}

/** 検索用キーを付け直す */
export function withBeerKeys(beer) {
  return { ...beer, nameKey: normalize(beer.name), breweryKey: normalize(beer.brewery) };
}

/** 記録の incomplete を銘柄の状態から決める */
export function applyIncomplete(checkin, beer) {
  return { ...checkin, incomplete: isIncomplete(beer) };
}

/** 記録の並び順（日付の新しい順 → 登録の新しい順） */
export function compareCheckinsDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.createdAt !== b.createdAt) return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
  return 0;
}

/** スタイルの表示名 */
export function styleLabel(beer, styles) {
  if (!beer || !beer.styleId) return '';
  if (beer.styleId === 'other') return beer.styleOther || 'その他';
  const s = styles.find((x) => x.id === beer.styleId);
  return s ? s.name : beer.styleId;
}
