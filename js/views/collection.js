// コレクション（#/collection）：スタイル図鑑と達成バッジ
import { h, svg, showToast } from '../ui.js';
import { glassSvg } from '../illust.js';
import { srmToHex, styleDisplaySrm } from '../knowledge.js';
import { resolveBreweryId } from '../breweries.js';
import { styleCollection, collectionFacts, computeBadges, newlyEarned, checkinHighlights } from '../collection.js';

export const BADGES_SEEN_KEY = 'badgesSeen';

/** 記録・ブリュワー情報を読み込んで、図鑑とバッジを計算する */
async function load(app) {
  const [beers, checkins, notes, breweries] = await Promise.all([
    app.db.listBeers(),
    app.db.listCheckins(),
    app.db.listBreweryNotes(),
    app.loadBreweries(),
  ]);
  const facts = collectionFacts({
    beers,
    checkins,
    styles: app.styles,
    breweryIdOf: (beer) => resolveBreweryId(beer, breweries.index),
    prefOf: (id) => breweries.index.byId.get(id)?.prefCode || null,
    notes,
  });
  return { beers, checkins, dex: styleCollection(beers, checkins, app.styles), badges: computeBadges(facts) };
}

export async function render({ app, outlet, isStale }) {
  const { dex, badges } = await load(app);
  if (isStale()) return;
  // この画面を開いたら、獲得済みのバッジは「見た」ことにする
  await app.db.setMeta(BADGES_SEEN_KEY, badges.filter((b) => b.achieved).map((b) => b.id)).catch(() => {});

  const tried = dex.filter((d) => d.count > 0).length;
  const earned = badges.filter((b) => b.achieved).length;

  const head = h(
    'section',
    { class: 'collection-head' },
    meter('スタイル図鑑', tried, dex.length),
    meter('バッジ', earned, badges.length),
  );

  const dexGrid = h(
    'ul',
    { class: 'dex-grid' },
    ...dex.map(({ style, count }) =>
      h(
        'li',
        {},
        h(
          'a',
          {
            class: `dex-item${count ? '' : ' is-locked'}`,
            href: `#/knowledge/style/${encodeURIComponent(style.id)}`,
            'aria-label': count ? `${style.name}：${count}杯` : `${style.name}：まだ飲んでいません`,
          },
          h('span', { class: 'dex-art' }, svg(glassSvg(style.glass, count ? srmToHex(styleDisplaySrm(style)) : '#c9bfb4'))),
          h('span', { class: 'dex-name', text: style.name }),
          h('span', { class: 'dex-count', text: count ? `${count}杯` : '未' }),
        ),
      ),
    ),
  );

  const badgeList = h(
    'ul',
    { class: 'badge-grid' },
    ...[...badges]
      // 獲得済み → あと少しのもの順
      .sort((a, b) => Number(b.achieved) - Number(a.achieved) || b.now / b.goal - a.now / a.goal)
      .map((b) =>
        h(
          'li',
          { class: `badge-card${b.achieved ? '' : ' is-locked'}` },
          medal(b),
          h(
            'div',
            { class: 'badge-body' },
            h('div', { class: 'badge-title', text: b.title }),
            h('div', { class: 'badge-desc', text: b.desc }),
            b.achieved
              ? h('div', { class: 'badge-done', text: '獲得済み' })
              : h(
                  'div',
                  { class: 'badge-progress' },
                  h('span', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(b.goal), 'aria-valuenow': String(b.now), 'aria-label': `${b.title}の進み具合` }, h('i', { style: `width:${Math.round((b.now / b.goal) * 100)}%` })),
                  h('span', { class: 'badge-count', text: `${b.now} / ${b.goal}` }),
                ),
          ),
        ),
      ),
  );

  outlet.replaceChildren(
    head,
    h('h2', { class: 'section-title', text: 'スタイル図鑑' }),
    h('p', { class: 'list-meta', text: '飲んだスタイルに色が付きます。タップすると解説を開きます。' }),
    dexGrid,
    h('h2', { class: 'section-title', text: 'バッジ' }),
    badgeList,
  );
}

function meter(label, now, total) {
  return h(
    'div',
    { class: 'collection-meter' },
    h('span', { class: 'meter-label', text: label }),
    h('span', { class: 'meter-value' }, h('b', { text: String(now) }), h('small', { text: ` / ${total}` })),
    h('span', { class: 'progress', 'aria-hidden': 'true' }, h('i', { style: `width:${total ? Math.round((now / total) * 100) : 0}%` })),
  );
}

/** メダルのイラスト（銅・銀・金）。中央に短い文字 */
function medal(b) {
  return h('span', { class: `medal medal-${b.tier}`, 'aria-hidden': 'true' }, h('span', { class: 'medal-glyph', text: b.glyph }));
}

/**
 * 新しく記録した直後に呼ぶ。何杯目か・はじめての銘柄やスタイル・新しいバッジを1つのお知らせにまとめて出す。
 * バッジの「見た」記録も更新する（はじめて判定するときに、既に記録が多い人には一度に出さない）。
 */
export async function celebrateCheckin(app, beerId) {
  try {
    const [{ beers, checkins, badges }, seen] = await Promise.all([load(app), app.db.getMeta(BADGES_SEEN_KEY)]);
    const achieved = badges.filter((b) => b.achieved).map((b) => b.id);
    // はじめて判定するとき（見たバッジの記録が無い）で既に記録が多い人には、まとめて出さない
    const fresh = !Array.isArray(seen) && achieved.length > 1 ? [] : newlyEarned(badges, seen);
    await app.db.setMeta(BADGES_SEEN_KEY, achieved);
    const hl = checkinHighlights(beers, checkins, app.styles, beerId);
    const lines = [];
    if (hl.newStyle) lines.push(`はじめてのスタイル「${hl.newStyle.name}」（図鑑 ${hl.dexTried} / ${hl.dexTotal}）`);
    else if (hl.firstBeer) lines.push('はじめての銘柄です');
    else lines.push(`この銘柄は${hl.beerCount}回目`);
    if (fresh.length) lines.push(`バッジを獲得：${fresh.slice(0, 2).map((b) => `「${b.title}」`).join('')}${fresh.length > 2 ? `ほか${fresh.length - 2}個` : ''}`);
    const toCollection = hl.newStyle || fresh.length;
    showToast(`${hl.cupNo}杯目を記録しました`, {
      lines,
      icon: fresh.length ? '🏅' : hl.newStyle ? '✨' : '🍺',
      actionLabel: toCollection ? (fresh.length ? 'バッジを見る' : '図鑑を見る') : undefined,
      onAction: toCollection ? () => app.navigate('#/collection') : undefined,
      duration: toCollection ? 6000 : 4000,
    });
  } catch (e) {
    console.warn('記録のお知らせを作れませんでした', e);
    showToast('記録しました');
  }
}
