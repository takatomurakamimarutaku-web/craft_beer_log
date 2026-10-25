// バックアップ・復元（写真を base64 で JSON に含める方式）
import { createBeer, createCheckin } from './models.js';
import { isValidDateString } from './validate.js';

export const BACKUP_FORMAT = 'craft-beer-log-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_REMIND_DAYS = 30;

export class BackupError extends Error {}

// ---- base64 ----

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBlob(b64, type) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

// ---- 書き出し ----

/**
 * バックアップを Blob にする。
 * 巨大な1本の文字列を作らないよう、写真ごとに文字列を分けて Blob に連結する。
 */
export async function createBackupBlob({ beers, checkins, photos, eventPlans = [] }, exportedAt = new Date()) {
  const head = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    counts: { beers: beers.length, checkins: checkins.length, photos: photos.length },
  };
  const parts = [];
  parts.push(JSON.stringify(head).slice(0, -1)); // 末尾の } を外して続ける
  parts.push(',"beers":', JSON.stringify(beers));
  parts.push(',"checkins":', JSON.stringify(checkins));
  parts.push(',"eventPlans":', JSON.stringify(eventPlans));
  parts.push(',"photos":[');
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const entry = {
      id: p.id,
      type: p.blob?.type || 'image/jpeg',
      data: p.blob ? await blobToBase64(p.blob) : null,
      thumbType: p.thumb?.type || 'image/jpeg',
      thumb: p.thumb ? await blobToBase64(p.thumb) : null,
    };
    parts.push((i ? ',' : '') + JSON.stringify(entry));
  }
  parts.push(']}');
  return new Blob(parts, { type: 'application/json' });
}

export function backupFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `craft-beer-log-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

// ---- 読み込み ----

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isStr(v) {
  return typeof v === 'string';
}
function isNumOrNull(v) {
  return v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v));
}

/**
 * 旧バージョンのバックアップを現在の形式へ変換する。
 * バックアップ形式を変えたときは BACKUP_VERSION を上げ、ここに変換を追加する。
 */
const UPGRADES = {
  // 例: 1: (obj) => ({ ...obj, version: 2, ... }),
};

/**
 * テキストを検証してデータに変換する。不正な場合は BackupError を投げる（部分的な取り込みはしない）。
 * @returns {{ beers, checkins, photos, exportedAt }}
 */
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new BackupError('JSONとして読み込めません。バックアップファイルを選んでください');
  }
  if (!isObj(obj) || obj.format !== BACKUP_FORMAT) {
    throw new BackupError('このアプリのバックアップファイルではありません');
  }
  if (!Number.isInteger(obj.version) || obj.version < 1) {
    throw new BackupError('バックアップのバージョンが不正です');
  }
  if (obj.version > BACKUP_VERSION) {
    throw new BackupError('新しいバージョンのアプリで作成されたファイルです。アプリを更新してから読み込んでください');
  }
  while (obj.version < BACKUP_VERSION) {
    const up = UPGRADES[obj.version];
    if (!up) throw new BackupError(`バージョン${obj.version}のバックアップには対応していません`);
    obj = up(obj);
  }
  for (const key of ['beers', 'checkins', 'photos']) {
    if (!Array.isArray(obj[key])) throw new BackupError(`${key} がありません`);
  }

  const errors = [];
  const ids = new Set();
  const beerIds = new Set();
  const beers = obj.beers.map((b, i) => {
    if (!isObj(b) || !isStr(b.id) || !b.id) return errors.push(`銘柄${i + 1}件目：IDがありません`), null;
    if (!isStr(b.name) || !b.name.trim()) errors.push(`銘柄${i + 1}件目：名前がありません`);
    if (b.status !== undefined && b.status !== 'tried' && b.status !== 'want') errors.push(`銘柄${i + 1}件目：状態が不正です`);
    if (!isNumOrNull(b.abv)) errors.push(`銘柄${i + 1}件目：度数が不正です`);
    if (ids.has(b.id)) errors.push(`銘柄${i + 1}件目：IDが重複しています`);
    ids.add(b.id);
    beerIds.add(b.id);
    // 旧いファイルで欠けている項目は初期値で補う
    return createBeer({ ...b });
  });

  const photoIds = new Set();
  const photos = obj.photos.map((p, i) => {
    if (!isObj(p) || !isStr(p.id) || !p.id) return errors.push(`写真${i + 1}件目：IDがありません`), null;
    if (!isStr(p.data) || !p.data || !BASE64_RE.test(p.data)) errors.push(`写真${i + 1}件目：画像データが不正です`);
    if (p.thumb !== null && p.thumb !== undefined && (!isStr(p.thumb) || !BASE64_RE.test(p.thumb))) {
      errors.push(`写真${i + 1}件目：サムネイルが不正です`);
    }
    if (photoIds.has(p.id)) errors.push(`写真${i + 1}件目：IDが重複しています`);
    photoIds.add(p.id);
    return p;
  });

  const checkinIds = new Set();
  const checkins = obj.checkins.map((c, i) => {
    if (!isObj(c) || !isStr(c.id) || !c.id) return errors.push(`記録${i + 1}件目：IDがありません`), null;
    if (!beerIds.has(c.beerId)) errors.push(`記録${i + 1}件目：対応する銘柄がありません`);
    if (!isValidDateString(c.date)) errors.push(`記録${i + 1}件目：日付が不正です`);
    if (c.rating !== null && c.rating !== undefined && !(Number.isInteger(c.rating) && c.rating >= 1 && c.rating <= 5)) {
      errors.push(`記録${i + 1}件目：評価が不正です`);
    }
    const pids = c.photoIds === undefined ? [] : c.photoIds;
    if (!Array.isArray(pids) || pids.some((id) => !photoIds.has(id))) errors.push(`記録${i + 1}件目：写真が見つかりません`);
    if (checkinIds.has(c.id)) errors.push(`記録${i + 1}件目：IDが重複しています`);
    checkinIds.add(c.id);
    return createCheckin({ ...c, photoIds: Array.isArray(pids) ? pids : [] });
  });

  // イベントの参加状況（v1.3.0 で追加。古いファイルには無い）
  const planIds = new Set();
  const eventPlans = (obj.eventPlans === undefined ? [] : Array.isArray(obj.eventPlans) ? obj.eventPlans : (errors.push('イベントの参加状況が不正です'), [])).map((p, i) => {
    if (!isObj(p) || !isStr(p.id) || !p.id) return errors.push(`イベント${i + 1}件目：IDがありません`), null;
    if (p.status !== null && p.status !== undefined && !['want', 'going', 'went'].includes(p.status)) errors.push(`イベント${i + 1}件目：状態が不正です`);
    if (planIds.has(p.id)) errors.push(`イベント${i + 1}件目：IDが重複しています`);
    planIds.add(p.id);
    return p;
  });

  if (errors.length) {
    const more = errors.length > 5 ? `　ほか${errors.length - 5}件` : '';
    throw new BackupError(`ファイルの内容に問題があるため読み込みませんでした：${errors.slice(0, 5).join('／')}${more}`);
  }

  return {
    exportedAt: obj.exportedAt || null,
    beers,
    checkins,
    eventPlans,
    photos: photos.map((p) => ({
      id: p.id,
      blob: base64ToBlob(p.data, p.type || 'image/jpeg'),
      thumb: p.thumb ? base64ToBlob(p.thumb, p.thumbType || 'image/jpeg') : base64ToBlob(p.data, p.type || 'image/jpeg'),
    })),
  };
}

/**
 * バックアップを促すか。
 * 最終バックアップから30日以上、またはバックアップしたことがなく最初の記録から30日以上経過
 */
export function shouldRemindBackup(lastBackupAt, oldestRecordAt, now = new Date()) {
  const limit = BACKUP_REMIND_DAYS * 24 * 60 * 60 * 1000;
  const base = lastBackupAt || oldestRecordAt;
  if (!base) return false;
  const t = new Date(base).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t >= limit;
}

export const BACKUP_REMIND_COUNT = 20;

/**
 * バックアップの案内を出すか、その理由（純粋関数）。
 * - never：一度もバックアップしておらず、最初の記録から30日以上、または記録が20件以上
 * - days：最終バックアップから30日以上
 * - count：最終バックアップ後の記録が20件以上
 * @param {{ lastBackupAt: string|null, checkins: Array<{createdAt: string}>, now?: Date }} p
 * @returns {null | { reason: 'never'|'days'|'count', count: number }}
 */
export function backupReminder({ lastBackupAt, checkins, now = new Date() }) {
  if (!checkins.length) return null;
  const since = lastBackupAt ? checkins.filter((c) => c.createdAt > lastBackupAt).length : checkins.length;
  if (!lastBackupAt) {
    const oldest = checkins.reduce((min, c) => (!min || c.createdAt < min ? c.createdAt : min), null);
    if (shouldRemindBackup(null, oldest, now) || since >= BACKUP_REMIND_COUNT) return { reason: 'never', count: since };
    return null;
  }
  if (shouldRemindBackup(lastBackupAt, null, now)) return { reason: 'days', count: since };
  if (since >= BACKUP_REMIND_COUNT) return { reason: 'count', count: since };
  return null;
}

/** 案内の文面 */
export function backupReminderText(r) {
  if (!r) return '';
  if (r.reason === 'never') return `まだバックアップしていません（記録${r.count}件）。端末の故障や機種変更に備えて、バックアップを作成してください。`;
  if (r.reason === 'days') return '最後のバックアップから30日以上経っています。';
  return `最後のバックアップのあとに${r.count}件の記録があります。`;
}
