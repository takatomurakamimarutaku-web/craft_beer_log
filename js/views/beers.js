// 記録一覧（#/beers）
import { h, createThumbLoader, thumbView, formatDate, formatAbv, stars, emptyState } from '../ui.js';
import { styleLabel } from '../models.js';
import { shouldRemindBackup } from '../backup.js';

const PAGE = 50;

export async function render({ app, outlet }) {
  const [checkins, beers, lastBackupAt] = await Promise.all([
    app.db.listCheckins(),
    app.db.listBeers(),
    app.db.getMeta('lastBackupAt'),
  ]);
  const beerMap = new Map(beers.map((b) => [b.id, b]));
  const loader = createThumbLoader((id) => app.db.getThumb(id));

  outlet.replaceChildren();

  if (!checkins.length) {
    outlet.append(
      emptyState(
        'まだ記録がありません。最初の1杯を記録しましょう。',
        h('a', { class: 'btn btn-primary', href: '#/checkin/new', text: '＋ 最初の1杯を記録する' }),
      ),
    );
    return () => loader.destroy();
  }

  // バックアップの案内（控えめに表示）
  const oldest = checkins.reduce((min, c) => (!min || c.createdAt < min ? c.createdAt : min), null);
  if (!sessionStorageGet('backupReminderClosed') && shouldRemindBackup(lastBackupAt, oldest)) {
    const note = h(
      'div',
      { class: 'notice' },
      h('span', { text: lastBackupAt ? '最後のバックアップから30日以上経っています。' : 'まだバックアップしていません。' }),
      h('a', { href: '#/settings', text: 'バックアップ' }),
      h('button', {
        type: 'button',
        class: 'notice-close',
        'aria-label': '閉じる',
        text: '×',
        onclick: () => {
          sessionStorageSet('backupReminderClosed', '1');
          note.remove();
        },
      }),
    );
    outlet.append(note);
  }

  outlet.append(h('p', { class: 'list-meta', text: `${checkins.length}件の記録` }));
  const list = h('ul', { class: 'card-list' });
  outlet.append(list);

  let shown = 0;
  const more = h('button', { type: 'button', class: 'btn btn-block', text: 'さらに表示', onclick: () => appendPage() });
  function appendPage() {
    const slice = checkins.slice(shown, shown + PAGE);
    for (const c of slice) {
      const beer = beerMap.get(c.beerId);
      if (!beer) continue;
      list.append(checkinCard(c, beer, app, loader));
    }
    shown += slice.length;
    more.hidden = shown >= checkins.length;
  }
  appendPage();
  outlet.append(more);

  return () => loader.destroy();
}

function checkinCard(c, beer, app, loader) {
  const meta = [beer.brewery, styleLabel(beer, app.styles), formatAbv(beer.abv)].filter(Boolean).join(' · ');
  return h(
    'li',
    {},
    h(
      'a',
      { class: 'card', href: `#/beer/${encodeURIComponent(beer.id)}` },
      thumbView(c.photoIds?.[0], loader),
      h(
        'div',
        { class: 'card-body' },
        h('div', { class: 'card-title', text: beer.name }),
        meta ? h('div', { class: 'card-meta', text: meta }) : null,
        h(
          'div',
          { class: 'card-foot' },
          h('span', { text: formatDate(c.date) }),
          typeof c.rating === 'number' ? h('span', { class: 'stars', text: stars(c.rating) }) : null,
          c.incomplete ? h('span', { class: 'badge badge-warn', text: '未入力あり' }) : null,
        ),
      ),
    ),
  );
}

function sessionStorageGet(k) {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function sessionStorageSet(k, v) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* 保存できなくても動作に影響しない */
  }
}
