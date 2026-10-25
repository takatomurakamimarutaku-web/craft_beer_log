// 記録一覧（#/beers）
import { h, createThumbLoader, thumbView, formatDate, formatAbv, starsView, emptyState } from '../ui.js';
import { styleLabel } from '../models.js';
import { beerColor } from '../knowledge.js';
import { monthSummary } from '../stats.js';
import { backupReminder, backupReminderText } from '../backup.js';
import { currentInstallState } from '../install.js';
import { showInstallGuide } from './welcome.js';

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
  const install = installNotice();
  if (install) outlet.append(install);

  if (!checkins.length) {
    outlet.append(
      emptyState(
        '飲んだビールを記録すると、ここに並びます。名前だけでも記録できます。',
        h('a', { class: 'btn btn-primary', href: '#/checkin/new', text: '＋ 最初の1杯を記録する' }),
        { title: '最初の1杯を記録しましょう' },
      ),
    );
    return () => loader.destroy();
  }

  // バックアップの案内（控えめに表示）
  const remind = backupReminder({ lastBackupAt, checkins });
  if (!sessionStorageGet('backupReminderClosed') && remind) {
    const note = h(
      'div',
      { class: 'notice' },
      h('span', { text: backupReminderText(remind) }),
      h('a', { href: '#/settings', text: 'バックアップする' }),
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

  outlet.append(summaryCard(monthSummary(beers, checkins, app.styles), checkins.length));
  const list = h('ul', { class: 'card-list' });
  outlet.append(list);

  let shown = 0;
  let lastMonth = '';
  const more = h('button', { type: 'button', class: 'btn btn-block', text: 'さらに表示', onclick: () => appendPage() });
  function appendPage() {
    const slice = checkins.slice(shown, shown + PAGE);
    for (const c of slice) {
      const beer = beerMap.get(c.beerId);
      if (!beer) continue;
      // 月が変わるところに見出しを入れる
      const month = typeof c.date === 'string' ? c.date.slice(0, 7) : '';
      if (month && month !== lastMonth) {
        list.append(h('li', { class: 'list-month', 'aria-hidden': 'true', text: `${Number(month.slice(0, 4))}年${Number(month.slice(5))}月` }));
        lastMonth = month;
      }
      list.append(checkinCard(c, beer, app, loader));
    }
    shown += slice.length;
    more.hidden = shown >= checkins.length;
  }
  appendPage();
  outlet.append(more);

  return () => loader.destroy();
}

/** 記録一覧の上の「今月のまとめ」。タップで統計へ */
function summaryCard(s, total) {
  const monthLabel = `${Number(s.month.slice(5))}月`;
  const factList = s.count
    ? [`${s.beerCount}銘柄`, s.avg !== null ? `平均 ★${s.avg.toFixed(1)}` : null, s.topStyle ? `よく飲む：${s.topStyle}` : null].filter(Boolean)
    : ['まだ記録がありません'];
  const facts = factList.join('、');
  return h(
    'a',
    { class: 'summary-card', href: '#/stats', 'aria-label': `${monthLabel}は${s.count}杯。${facts}。これまでの記録は${total}件。統計を見る` },
    h('span', { class: 'summary-month', text: `${monthLabel}のビール` }),
    h('span', { class: 'summary-count' }, h('b', { text: String(s.count) }), h('small', { text: '杯' })),
    h('span', { class: 'summary-facts' }, ...factList.map((t) => h('span', { text: t }))),
    h('span', { class: 'summary-total', text: `これまで ${total}件の記録 · 統計を見る ›` }),
  );
}

function checkinCard(c, beer, app, loader) {
  const meta = [beer.brewery, styleLabel(beer, app.styles), formatAbv(beer.abv)].filter(Boolean).join(' · ');
  return h(
    'li',
    {},
    h(
      'a',
      { class: 'card', href: `#/beer/${encodeURIComponent(beer.id)}` },
      thumbView(c.photoIds?.[0], loader, 'thumb', beerColor(beer, app.styles)),
      h(
        'div',
        { class: 'card-body' },
        h('div', { class: 'card-title', text: beer.name }),
        meta ? h('div', { class: 'card-meta', text: meta }) : null,
        h(
          'div',
          { class: 'card-foot' },
          h('span', { text: formatDate(c.date) }),
          typeof c.rating === 'number' ? starsView(c.rating) : null,
          c.incomplete ? h('span', { class: 'badge badge-warn', text: '未入力あり' }) : null,
        ),
      ),
    ),
  );
}

/** Safari で開いているときの、ホーム画面への追加の案内（閉じても次回の起動でまた出す） */
function installNotice() {
  if (currentInstallState() !== 'ios-browser' || sessionStorageGet('installNoticeClosed')) return null;
  const note = h(
    'div',
    { class: 'notice notice-install', role: 'note' },
    h('span', { text: 'ホーム画面に追加して使ってください。Safari とホーム画面のアプリでは記録が別々に保存されます。' }),
    h('button', { type: 'button', class: 'link', text: '追加の手順', onclick: () => showInstallGuide() }),
    h('button', {
      type: 'button',
      class: 'notice-close',
      'aria-label': '案内を閉じる',
      text: '×',
      onclick: () => {
        sessionStorageSet('installNoticeClosed', '1');
        note.remove();
      },
    }),
  );
  return note;
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
