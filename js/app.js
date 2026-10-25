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
import * as knowledgeView from './views/knowledge.js';
import * as statsView from './views/stats.js';
import * as eventsView from './views/events.js';
import * as breweriesView from './views/breweries.js';
import * as breweryDetailView from './views/brewery-detail.js';
import * as breweryMapView from './views/brewery-map.js';
import { buildBreweryIndex } from './breweries.js';
import { migrateBeerStyle, STYLES_VERSION } from './knowledge.js';
import { friendlyError } from './errors.js';
import { APP_VERSION } from './version.js';
import { showWelcome, ONBOARDED_KEY } from './views/welcome.js';

// back: 戻るボタンを表示し、アプリ内の履歴が無いときに戻る先
const routes = [
  { path: '/beers', view: beersView, title: '記録一覧', tab: 'beers' },
  { path: '/beer/:id', view: beerDetailView, title: '銘柄', tab: 'beers', back: '#/beers' },
  { path: '/beer/:id/edit', view: beerEditView, title: '銘柄を編集', tab: 'beers', back: '#/beers' },
  { path: '/checkin/new', view: checkinFormView, title: '記録する', tab: 'checkin', back: '#/beers' },
  { path: '/checkin/:id/edit', view: checkinFormView, title: '記録を編集', tab: 'beers', back: '#/beers' },
  { path: '/search', view: searchView, title: '検索', tab: 'search' },
  { path: '/knowledge', view: knowledgeView, title: '知識', tab: 'knowledge' },
  { path: '/knowledge/basic/:id', view: knowledgeView, kind: 'basic', title: '入門', tab: 'knowledge', back: '#/knowledge' },
  { path: '/knowledge/style/:id', view: knowledgeView, kind: 'style', title: 'スタイル', tab: 'knowledge', back: '#/knowledge' },
  { path: '/knowledge/term/:id', view: knowledgeView, kind: 'term', title: '用語', tab: 'knowledge', back: '#/knowledge' },
  { path: '/knowledge/hop/:id', view: knowledgeView, kind: 'hop', title: 'ホップ', tab: 'knowledge', back: '#/knowledge' },
  { path: '/more', view: moreView, title: 'その他', tab: 'more' },
  { path: '/wishlist', view: wishlistView, title: '飲みたいリスト', tab: 'more', back: '#/more' },
  { path: '/wishlist/new', view: beerEditView, title: '飲みたい銘柄を追加', tab: 'more', back: '#/wishlist' },
  { path: '/events', view: eventsView, title: 'イベント', tab: 'more', back: '#/more' },
  { path: '/event/:id', view: eventsView, title: 'イベント', tab: 'more', back: '#/events' },
  { path: '/stats', view: statsView, title: '統計', tab: 'more', back: '#/more' },
  { path: '/settings', view: settingsView, title: '設定', tab: 'more', back: '#/more' },
  { path: '/breweries', view: breweriesView, title: 'ブリュワー', tab: 'more', back: '#/more' },
  { path: '/breweries/map', view: breweryMapView, title: 'ブリュワーの地図', tab: 'more', back: '#/breweries' },
  { path: '/brewery/:id', view: breweryDetailView, title: 'ブリュワー', tab: 'more', back: '#/breweries' },
];

const outlet = document.getElementById('view');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');
const headerEl = document.querySelector('.app-header');

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
    outlet.replaceChildren(errorView(friendlyError(e, 'データを開くことが')));
    return;
  }
  const styles = await loadJson('data/styles.json', []);
  let current = null;
  let knowledge = null;
  let events = null;
  let breweries = null;
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
    /** 知識データ（入門・用語・ホップ・香りタグ・画像）を初回だけ読み込む */
    loadKnowledge: () =>
      (knowledge ??= Promise.all([
        loadJson('data/basics.json', []),
        loadJson('data/terms.json', []),
        loadJson('data/hops.json', []),
        loadJson('data/flavor-tags.json', []),
        loadJson('data/images.json', {}),
      ]).then(([basics, terms, hops, flavorTags, images]) => ({ basics, terms, hops, flavorTags, images }))),
    /** イベント情報。読めなかったときは null を返し、次に開いたとき読み直す */
    loadEvents: () =>
      (events ??= loadJson('data/events.json', null).then((d) => {
        if (!d || !Array.isArray(d.events)) events = null;
        return d && Array.isArray(d.events) ? d : null;
      })),
    /** ブリュワー情報（data/breweries.json）を初回だけ読み込み、名前照合の索引を作る */
    loadBreweries: () =>
      (breweries ??= loadJson('data/breweries.json', { meta: {}, breweries: [] }).then((d) => {
        const list = Array.isArray(d?.breweries) ? d.breweries : [];
        return { meta: d?.meta || {}, list, index: buildBreweryIndex(list) };
      })),
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
      app.leaveGuard = null; // スワイプで戻った場合など、確認を経ずに移動したとき
      app.setTitle(route.title);
      backBtn.hidden = !route.back;
      headerEl.classList.toggle('is-root', !route.back);
      for (const a of document.querySelectorAll('.tabbar a')) {
        a.toggleAttribute('aria-current', a.dataset.tab === route.tab);
        if (a.dataset.tab === route.tab) a.setAttribute('aria-current', 'page');
      }
      outlet.replaceChildren(h('p', { class: 'loading', text: '読み込み中…' }));
      window.scrollTo(0, 0);
      outlet.classList.remove('view-enter');
      try {
        const result = await route.view.render({ app, outlet, params, query, route, isStale });
        if (!isStale()) {
          void outlet.offsetWidth; // アニメーションを最初からやり直す
          outlet.classList.add('view-enter');
        }
        return result;
      } catch (e) {
        console.error(e);
        if (!isStale()) outlet.replaceChildren(errorView(friendlyError(e, '画面を表示')));
        return null;
      }
    },
  });

  // スクロールしたらヘッダーに区切り線を出す
  const onScroll = () => headerEl.classList.toggle('is-scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });

  backBtn.addEventListener('click', () => leaveIfAllowed(() => router.goBack(current?.back)));
  // 入力途中の画面から、タブ・リンクで離れるときに確認する
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target.closest?.('a[href^="#"]');
      if (!a || !app.leaveGuard || a.getAttribute('href') === location.hash) return;
      e.preventDefault();
      leaveIfAllowed(() => router.navigate(a.getAttribute('href')));
    },
    true,
  );
  async function leaveIfAllowed(go) {
    if (app.leaveGuard && !(await app.leaveGuard())) return;
    app.leaveGuard = null;
    go();
  }

  if (!(await db.getMeta(ONBOARDED_KEY).catch(() => null))) await showWelcome(db);
  router.start();
  requestPersistence();
  notifyUpdated(db);
}

/** エラー画面（何が起きたか・次にすること・再読み込み） */
function errorView({ message, hint, detail }) {
  return h(
    'div',
    { class: 'empty error-view', role: 'alert' },
    h('p', { class: 'error-title', text: message }),
    h('p', { class: 'small', text: hint }),
    h('button', { type: 'button', class: 'btn', text: '再読み込み', onclick: () => location.reload() }),
    detail ? h('p', { class: 'small muted error-detail', text: `詳細：${detail}` }) : null,
  );
}

/** 更新後の初回起動で、新しいバージョンになったことを知らせる */
async function notifyUpdated(db) {
  try {
    const seen = await db.getMeta('seenVersion');
    if (seen === APP_VERSION) return;
    await db.setMeta('seenVersion', APP_VERSION);
    if (!seen) return; // 初回インストール時は知らせない
    showToast(`バージョン${APP_VERSION}に更新しました`, { actionLabel: '内容を見る', onAction: () => (location.hash = '#/settings'), duration: 8000 });
  } catch (e) {
    console.warn('seenVersion', e);
  }
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
