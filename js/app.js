// 起動処理
import { openDB } from './db.js';
import { createRouter } from './router.js';
import { h, showToast } from './ui.js';
import * as beersView from './views/beers.js';
import * as beerDetailView from './views/beer-detail.js';
import * as beerEditView from './views/beer-edit.js';
import * as checkinFormView from './views/checkin-form.js';
import * as searchView from './views/search.js';
import * as wishlistView from './views/wishlist.js';
import * as settingsView from './views/settings.js';
import * as moreView from './views/more.js';
import * as placeholderView from './views/placeholder.js';
import * as knowledgeView from './views/knowledge.js';
import { migrateBeerStyle, STYLES_VERSION } from './knowledge.js';

// back: 戻るボタンを表示し、アプリ内の履歴が無いときに戻る先
const routes = [
  { path: '/beers', view: beersView, title: '記録一覧', tab: 'beers' },
  { path: '/beer/:id', view: beerDetailView, title: '銘柄', tab: 'beers', back: '#/beers' },
  { path: '/beer/:id/edit', view: beerEditView, title: '銘柄を編集', tab: 'beers', back: '#/beers' },
  { path: '/checkin/new', view: checkinFormView, title: '記録する', tab: 'checkin', back: '#/beers' },
  { path: '/checkin/:id/edit', view: checkinFormView, title: '記録を編集', tab: 'beers', back: '#/beers' },
  { path: '/search', view: searchView, title: '検索', tab: 'search' },
  { path: '/knowledge', view: knowledgeView, title: '知識', tab: 'knowledge' },
  { path: '/knowledge/style/:id', view: knowledgeView, kind: 'style', title: 'スタイル', tab: 'knowledge', back: '#/knowledge' },
  { path: '/knowledge/term/:id', view: knowledgeView, kind: 'term', title: '用語', tab: 'knowledge', back: '#/knowledge' },
  { path: '/knowledge/hop/:id', view: knowledgeView, kind: 'hop', title: 'ホップ', tab: 'knowledge', back: '#/knowledge' },
  { path: '/more', view: moreView, title: 'その他', tab: 'more' },
  { path: '/wishlist', view: wishlistView, title: '飲みたいリスト', tab: 'more', back: '#/more' },
  { path: '/wishlist/new', view: beerEditView, title: '飲みたい銘柄を追加', tab: 'more', back: '#/wishlist' },
  { path: '/stats', view: placeholderView, title: '統計', tab: 'more', back: '#/more', phase: 'Phase 6' },
  { path: '/settings', view: settingsView, title: '設定', tab: 'more', back: '#/more' },
];

const outlet = document.getElementById('view');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');

async function loadJson(path, fallback) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (e) {
    console.error(path, e);
    return fallback;
  }
}

async function start() {
  let db;
  try {
    db = await openDB();
  } catch (e) {
    outlet.replaceChildren(
      h('div', { class: 'empty' }, h('p', { text: 'データベースを開けませんでした。' }), h('p', { class: 'small muted', text: e.message })),
    );
    return;
  }
  const styles = await loadJson('data/styles.json', []);
  let current = null;
  let knowledge = null;
  const validStyleIds = new Set(styles.map((s) => s.id));
  const migrateStyles = async () => {
    try {
      return await db.migrateStyles(validStyleIds, STYLES_VERSION, migrateBeerStyle);
    } catch (e) {
      console.error('スタイルの移行に失敗', e);
      return 0;
    }
  };
  // スタイル一覧が読めなかったとき（styles が空）は、全銘柄を「その他」にしないよう移行しない
  if (styles.length) await migrateStyles();

  const app = {
    db,
    styles,
    navigate: (hash, opts) => router.navigate(hash, opts),
    goBack: (fallback) => router.goBack(fallback),
    refresh: () => router.refresh(),
    migrateStyles: () => (styles.length ? migrateStyles() : 0),
    /** 知識データ（用語・ホップ・香りタグ）を初回だけ読み込む */
    loadKnowledge: () =>
      (knowledge ??= Promise.all([loadJson('data/terms.json', []), loadJson('data/hops.json', []), loadJson('data/flavor-tags.json', [])]).then(
        ([terms, hops, flavorTags]) => ({ terms, hops, flavorTags }),
      )),
    setTitle: (t) => {
      titleEl.textContent = t;
      document.title = `${t} | ホップ手帖`;
    },
  };

  const router = createRouter({
    routes,
    defaultHash: '#/beers',
    onRoute: async ({ route, params, query }, isStale) => {
      current = route;
      app.setTitle(route.title);
      backBtn.hidden = !route.back;
      for (const a of document.querySelectorAll('.tabbar a')) {
        a.toggleAttribute('aria-current', a.dataset.tab === route.tab);
        if (a.dataset.tab === route.tab) a.setAttribute('aria-current', 'page');
      }
      outlet.replaceChildren(h('p', { class: 'loading', text: '読み込み中…' }));
      window.scrollTo(0, 0);
      try {
        return await route.view.render({ app, outlet, params, query, route, isStale });
      } catch (e) {
        console.error(e);
        if (!isStale()) outlet.replaceChildren(h('div', { class: 'empty' }, h('p', { text: '画面を表示できませんでした。' }), h('p', { class: 'small muted', text: e.message })));
        return null;
      }
    },
  });

  backBtn.addEventListener('click', () => router.goBack(current?.back));
  router.start();
  requestPersistence();
}

/** 対応環境ではストレージの永続化を要求する（非対応・拒否でも止めない） */
async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch (e) {
    console.warn('persist', e);
  }
}

// ---- Service Worker と更新の通知 ----

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const banner = document.getElementById('update-banner');
  let updateRequested = false;
  let reloading = false;

  const showUpdate = (worker) => {
    banner.hidden = false;
    banner.querySelector('button').onclick = () => {
      banner.querySelector('button').disabled = true;
      updateRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    };
  };

  // 初回インストール時の clients.claim() でも発火するため、［更新］を押した場合だけ再読み込みする
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          // 既存の SW がある＝更新。初回インストール時は表示しない
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
        });
      });
      // iOS ではアプリを開き直しても更新確認が遅れることがあるため、表示のたびに確認する
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch((e) => {
      console.warn('SW登録に失敗', e);
      if (location.protocol === 'https:') showToast('オフライン機能を有効にできませんでした');
    });
}

registerServiceWorker();
start();
