// 設定・バックアップ（#/settings）
import { h, formatBytes, confirmDialog, showToast } from '../ui.js';
import { createBackupBlob, backupFileName, parseBackup, BackupError, shouldRemindBackup } from '../backup.js';

export async function render({ app, outlet }) {
  const [counts, lastBackupAt, estimate, persisted, cacheName] = await Promise.all([
    app.db.counts(),
    app.db.getMeta('lastBackupAt'),
    navigator.storage?.estimate ? navigator.storage.estimate().catch(() => null) : null,
    navigator.storage?.persisted ? navigator.storage.persisted().catch(() => null) : null,
    currentCacheName(),
  ]);

  const row = (label, value) => h('div', { class: 'kv' }, h('span', { class: 'muted', text: label }), h('span', { text: value }));

  const usage = h(
    'section',
    { class: 'panel' },
    h('h3', { class: 'section-title', text: 'データ' }),
    row('銘柄', `${counts.beers}件`),
    row('記録', `${counts.checkins}件`),
    row('写真', `${counts.photos}枚`),
    row('使用容量', estimate ? `${formatBytes(estimate.usage)}${estimate.quota ? ` / 上限の目安 ${formatBytes(estimate.quota)}` : ''}` : '取得できません'),
    row('データの永続化', persisted === null ? 'この環境では未対応' : persisted ? '有効' : '未許可（ブラウザが容量不足時に削除する可能性があります）'),
  );

  const remind = shouldRemindBackup(lastBackupAt, null);
  const exportBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', text: 'バックアップを作成', onclick: () => doExport() });
  const backup = h(
    'section',
    { class: 'panel' },
    h('h3', { class: 'section-title', text: 'バックアップ' }),
    row('最終バックアップ', lastBackupAt ? new Date(lastBackupAt).toLocaleString('ja-JP') : 'まだありません'),
    remind ? h('p', { class: 'field-hint warn', text: '最後のバックアップから30日以上経っています。' }) : null,
    h('p', { class: 'field-hint', text: '写真を含む全データを1つのファイル（JSON）に書き出します。iPhoneでは共有メニューから「ファイルに保存」を選んでください。' }),
    exportBtn,
  );

  let mode = 'merge';
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', id: 'import-file', onchange: () => doImport() });
  const modeRadios = h(
    'div',
    { class: 'radio-list', role: 'radiogroup' },
    [
      ['merge', '既存のデータに追加', '同じIDのデータは追加しません（重複しません）'],
      ['replace', '置き換え', '現在のデータをすべて削除してから読み込みます'],
    ].map(([value, label, note]) =>
      h(
        'label',
        { class: 'radio' },
        h('input', { type: 'radio', name: 'import-mode', value, checked: value === mode, onchange: () => (mode = value) }),
        h('span', {}, h('strong', { text: label }), h('span', { class: 'small muted block', text: note })),
      ),
    ),
  );
  const restore = h(
    'section',
    { class: 'panel' },
    h('h3', { class: 'section-title', text: '復元' }),
    modeRadios,
    fileInput,
    h('label', { class: 'btn btn-block', for: 'import-file', text: 'バックアップファイルを選ぶ' }),
  );

  const about = h(
    'section',
    { class: 'panel' },
    h('h3', { class: 'section-title', text: 'このアプリについて' }),
    row('バージョン', cacheName || '—'),
    h('p', { class: 'field-hint', text: 'データはこの端末のブラウザ内にのみ保存され、外部へ送信されません。' }),
  );

  outlet.replaceChildren(usage, backup, restore, about);

  async function doExport() {
    exportBtn.disabled = true;
    exportBtn.textContent = '作成中…';
    try {
      const data = await app.db.dumpAll();
      const blob = await createBackupBlob(data);
      const name = backupFileName();
      const file = new File([blob], name, { type: 'application/json' });
      let done = false;
      // iOS のホーム画面アプリではダウンロードリンクが使いにくいため、共有シートを優先する
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name });
          done = true;
        } catch (e) {
          if (e.name === 'AbortError') {
            showToast('バックアップを中止しました');
            return;
          }
          console.warn(e);
        }
      }
      if (!done) {
        const url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: name });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      await app.db.setMeta('lastBackupAt', new Date().toISOString());
      showToast(`バックアップを作成しました（${formatBytes(blob.size)}）`);
      app.refresh();
    } catch (e) {
      console.error(e);
      showToast(`バックアップを作成できませんでした：${e.message}`, { duration: 6000 });
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = 'バックアップを作成';
    }
  }

  async function doImport() {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    let data;
    try {
      data = parseBackup(await file.text());
    } catch (e) {
      const msg = e instanceof BackupError ? e.message : `読み込めませんでした：${e.message}`;
      await confirmDialog({ title: '読み込めませんでした', message: msg, buttons: [{ label: 'OK', value: true, variant: 'primary' }] });
      return;
    }
    const summary = `銘柄${data.beers.length}件・記録${data.checkins.length}件・写真${data.photos.length}枚${data.exportedAt ? `（${new Date(data.exportedAt).toLocaleString('ja-JP')} 作成）` : ''}`;
    const ok = await confirmDialog(
      mode === 'replace'
        ? {
            title: '現在のデータを置き換えますか？',
            message: `現在の銘柄${counts.beers}件・記録${counts.checkins}件・写真${counts.photos}枚はすべて削除され、${summary}に置き換わります。元に戻せません。`,
            buttons: [
              { label: 'キャンセル', value: false },
              { label: '置き換える', value: true, variant: 'danger' },
            ],
          }
        : {
            title: 'データを追加しますか？',
            message: `${summary}を既存のデータに追加します。同じIDのデータは追加しません。`,
            buttons: [
              { label: 'キャンセル', value: false },
              { label: '追加する', value: true, variant: 'primary' },
            ],
          },
    );
    if (!ok) return;
    try {
      const r = await app.db.importData(data, mode);
      await app.migrateStyles(); // 古いバックアップの暫定スタイルを現在の一覧に合わせる
      const skipped = r.skipped.beers + r.skipped.checkins + r.skipped.photos;
      showToast(`読み込みました：銘柄${r.added.beers}件・記録${r.added.checkins}件・写真${r.added.photos}枚${skipped ? `（重複${skipped}件はスキップ）` : ''}`, { duration: 6000 });
      app.refresh();
    } catch (e) {
      console.error(e);
      showToast(`読み込めませんでした：${e.message}`, { duration: 6000 });
    }
  }
}

async function currentCacheName() {
  try {
    const keys = await caches.keys();
    return keys.find((k) => k.startsWith('craft-beer-log-')) || null;
  } catch {
    return null;
  }
}
