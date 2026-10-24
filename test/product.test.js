// 製品化（P0）：エラー表示・ホーム画面追加の判定・バックアップの案内・下書き
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { friendlyError, errorText } from '../js/errors.js';
import { installState } from '../js/install.js';
import { backupReminder, backupReminderText, BACKUP_REMIND_COUNT } from '../js/backup.js';
import { APP_VERSION } from '../js/version.js';

test('friendlyError：容量不足・DB・許可・通信・その他を日本語にする', () => {
  const quota = friendlyError(Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' }), '保存');
  assert.match(quota.message, /空き容量.*保存できませんでした/);
  assert.match(quota.hint, /バックアップ/);
  assert.match(quota.detail, /QuotaExceededError/);
  assert.match(friendlyError(Object.assign(new Error('x'), { name: 'InvalidStateError' })).message, /データの読み書き/);
  assert.match(friendlyError(Object.assign(new Error('x'), { name: 'NotAllowedError' })).hint, /プライベート/);
  assert.match(friendlyError(new TypeError('Load failed')).message, /通信/);
  const other = friendlyError(new Error('boom'), '表示');
  assert.match(other.message, /表示できませんでした/);
  assert.doesNotMatch(other.message, /boom/, '技術的な文言は本文に出さない');
  assert.match(friendlyError('文字列').detail, /文字列/);
  assert.match(errorText(new Error('x'), '保存'), /^予期しない問題.*お試しください/);
});

test('installState：ホーム画面のアプリ・iPhone/iPad の Safari・その他', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  assert.equal(installState({ standalone: true, userAgent: iphone }), 'installed');
  assert.equal(installState({ displayModeStandalone: true }), 'installed');
  assert.equal(installState({ standalone: false, userAgent: iphone }), 'ios-browser');
  assert.equal(installState({ userAgent: ipad, maxTouchPoints: 5 }), 'ios-browser');
  assert.equal(installState({ userAgent: ipad, maxTouchPoints: 0 }), 'browser');
  assert.equal(installState({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' }), 'browser');
  assert.equal(installState(), 'browser');
});

test('backupReminder：未バックアップ・日数・件数', () => {
  const now = new Date('2026-10-24T00:00:00Z');
  const at = (d) => ({ createdAt: new Date(now.getTime() - d * 86400000).toISOString() });
  const many = (n, d = 1) => Array.from({ length: n }, () => at(d));
  assert.equal(backupReminder({ lastBackupAt: null, checkins: [], now }), null);
  assert.equal(backupReminder({ lastBackupAt: null, checkins: [at(3)], now }), null, '始めたばかりは出さない');
  assert.deepEqual(backupReminder({ lastBackupAt: null, checkins: [at(31)], now }), { reason: 'never', count: 1 });
  assert.equal(backupReminder({ lastBackupAt: null, checkins: many(BACKUP_REMIND_COUNT), now }).reason, 'never');
  const last = new Date(now.getTime() - 2 * 86400000).toISOString();
  assert.equal(backupReminder({ lastBackupAt: last, checkins: [...many(5, 10), ...many(19, 1)], now }), null, 'バックアップ後19件');
  assert.deepEqual(backupReminder({ lastBackupAt: last, checkins: many(20, 1), now }), { reason: 'count', count: 20 });
  const old = new Date(now.getTime() - 40 * 86400000).toISOString();
  assert.equal(backupReminder({ lastBackupAt: old, checkins: [at(50)], now }).reason, 'days');
  assert.match(backupReminderText({ reason: 'never', count: 3 }), /まだバックアップ.*3件/);
  assert.match(backupReminderText({ reason: 'count', count: 25 }), /25件/);
  assert.equal(backupReminderText(null), '');
});

test('checkinFromDraft：下書きから記録の初期値を作る（写真は含めない）', async () => {
  const { checkinFromDraft } = await import('../js/views/checkin-form.js');
  const c = checkinFromDraft({ date: '2026-10-01', placeType: 'bought', placeName: '酒屋', serving: 'can', volume: '350', price: '', rating: 4, memo: 'うまい', tasting: { bitter: 3, flavorTags: ['citrus'] } });
  assert.equal(c.date, '2026-10-01');
  assert.deepEqual(c.place, { type: 'bought', name: '酒屋' });
  assert.equal(c.serving, 'can');
  assert.equal(c.volumeMl, '350');
  assert.equal(c.rating, 4);
  assert.equal(c.tasting.bitter, 3);
  assert.deepEqual(c.tasting.flavorTags, ['citrus']);
  assert.deepEqual(c.photoIds, []);
  assert.match(checkinFromDraft({}).date, /^\d{4}-\d{2}-\d{2}$/, '日付が無ければ今日');
});

test('バージョン：package.json・更新内容の先頭と一致する', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const log = JSON.parse(readFileSync(new URL('../data/changelog.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, APP_VERSION);
  assert.equal(log[0].version, APP_VERSION);
  for (const v of log) {
    assert.match(v.version, /^\d+\.\d+\.\d+$/);
    assert.match(v.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(v.items.length > 0 && v.items.every((t) => typeof t === 'string' && t.trim()));
  }
});
