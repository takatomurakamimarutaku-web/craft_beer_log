// 銘柄の詳細（#/beer/:id）
import { h, svg, createThumbLoader, formatDate, formatAbv, formatYen, starsView, confirmDialog, showToast, showPhoto, glassIcon } from '../ui.js';
import { styleLabel, SERVING_LABELS, PLACE_TYPE_LABELS, STATUS_LABELS } from '../models.js';
import { summarizeRatings } from '../stats.js';
import { averageTasting, hasScores, tastingRadarSvg, tasteLabels, flavorLabels } from '../tasting.js';
import { buildShareText, shareContent } from '../share.js';
import { renderShareCard } from '../share-card.js';
import { resolveBreweryId } from '../breweries.js';
import { buildBeerSummaries, similarBeers } from '../search.js';
import { beerColor } from '../knowledge.js';

export async function render({ app, outlet, params }) {
  const beer = await app.db.getBeer(params.id);
  outlet.replaceChildren();
  if (!beer) {
    outlet.append(h('p', { class: 'empty', text: 'この銘柄は見つかりませんでした（削除された可能性があります）。' }));
    return;
  }
  app.setTitle(beer.name);
  const [checkins, knowledge, breweries, allBeers, allCheckins] = await Promise.all([
    app.db.listCheckinsByBeer(beer.id),
    app.loadKnowledge(),
    app.loadBreweries(),
    app.db.listBeers(),
    app.db.listCheckins(),
  ]);
  // ブリュワー欄の名前がブリュワー情報と一意に一致したら、詳細へのリンクにする
  const breweryId = resolveBreweryId(beer, breweries.index);
  const tagLabel = new Map(knowledge.flavorTags.map((t) => [t.id, t.label]));
  // スタイルが知識ページにあれば、タップで解説を開く
  const knownStyle = app.styles.find((x) => x.id === beer.styleId);
  const summary = summarizeRatings(checkins);
  const loader = createThumbLoader((id) => app.db.getThumb(id));
  const style = styleLabel(beer, app.styles);
  const color = beerColor(beer, app.styles);

  // 上部はスタイルの色をうっすら敷いた見出しにする
  const info = h(
    'section',
    { class: 'panel beer-head', style: color ? `--beer:${color}` : null },
    h('div', { class: 'beer-head-icon' }, glassIcon('glass-icon', color)),
    h(
      'div',
      {},
      h('h2', { class: 'beer-name', text: beer.name }),
      breweryId
        ? h('p', {}, h('a', { href: `#/brewery/${encodeURIComponent(breweryId)}`, text: `${beer.brewery} ›`, 'aria-label': `${beer.brewery}のブリュワー情報を見る` }))
        : h('p', { class: 'muted', text: beer.brewery || 'ブリュワー未入力' }),
      h(
        'div',
        { class: 'tags' },
        knownStyle
          ? h('a', { class: 'tag tag-link', href: `#/knowledge/style/${encodeURIComponent(knownStyle.id)}`, text: `${style} ›`, 'aria-label': `${style}の解説を見る` })
          : style
            ? h('span', { class: 'tag', text: style })
            : null,
        beer.abv !== null ? h('span', { class: 'tag', text: formatAbv(beer.abv) }) : null,
        beer.status === 'want' ? h('span', { class: 'tag tag-want', text: STATUS_LABELS.want }) : null,
      ),
      beer.memo ? h('p', { class: 'memo', text: beer.memo }) : null,
    ),
  );

  const rating = h(
    'section',
    { class: 'panel rating-summary' },
    h('div', {}, h('div', { class: 'muted small', text: '平均' }), h('div', { class: 'big', text: summary.avg !== null ? summary.avg.toFixed(1) : '—' })),
    h('div', {}, h('div', { class: 'muted small', text: '最新' }), summary.latest !== null ? h('div', { class: 'big' }, starsView(summary.latest)) : h('div', { class: 'big', text: '—' })),
    h('div', {}, h('div', { class: 'muted small', text: '飲んだ回数' }), h('div', { class: 'big', text: `${checkins.length}` })),
  );

  const actions = h(
    'div',
    { class: 'actions' },
    h('a', { class: 'btn btn-primary', href: `#/checkin/new?beerId=${encodeURIComponent(beer.id)}`, text: '＋ この銘柄を記録' }),
    h('a', { class: 'btn', href: `#/beer/${encodeURIComponent(beer.id)}/edit`, text: '編集' }),
    h('button', { type: 'button', class: 'btn', text: '共有', onclick: () => share() }),
    h('button', { type: 'button', class: 'btn btn-danger-text', text: '削除', onclick: () => removeBeer() }),
  );

  // テイスティングの平均（入力のある記録だけ）
  const tasted = checkins.filter((c) => hasScores(c.tasting));
  const allTags = countTags(checkins);
  const tasteSummary =
    tasted.length || allTags.length
      ? h(
          'section',
          { class: 'panel taste-summary' },
          h('h3', { class: 'section-title', text: tasted.length > 1 ? `テイスティング（${tasted.length}件の平均）` : 'テイスティング' }),
          tasted.length ? h('div', { class: 'radar-wrap' }, svg(tastingRadarSvg(averageTasting(tasted)))) : null,
          allTags.length
            ? h(
                'div',
                { class: 'chips' },
                allTags.map(([id, n]) => h('span', { class: 'chip chip-static', text: n > 1 ? `${tagLabel.get(id) || id} ×${n}` : tagLabel.get(id) || id })),
              )
            : null,
        )
      : null;

  const history = h('section', {}, h('h3', { class: 'section-title', text: '飲んだ記録' }));
  if (!checkins.length) history.append(h('p', { class: 'muted', text: 'まだ記録がありません。' }));
  const list = h('ul', { class: 'history' });
  for (const c of checkins) list.append(historyItem(c));
  history.append(list);

  // iOS は共有をタップ直後に呼ぶ必要があるため、写真は先に読み込んでおく
  const sharePhotoId = checkins.find((c) => c.photoIds?.length)?.photoIds[0];
  const sharePhoto = sharePhotoId ? app.db.getPhoto(sharePhotoId).then((p) => p?.blob || null, () => null) : Promise.resolve(null);

  // 似ている銘柄（記録済みの中から）
  const similar = similarBeers(beer, buildBeerSummaries(allBeers, allCheckins), app.styles);
  const similarSec = similar.length
    ? h(
        'section',
        { class: 'similar-sec' },
        h('h3', { class: 'section-title', text: '似ている銘柄' }),
        h(
          'ul',
          { class: 'similar-row' },
          ...similar.map(({ summary: s, reasons }) =>
            h(
              'li',
              {},
              h(
                'a',
                { class: 'similar-card', href: `#/beer/${encodeURIComponent(s.beer.id)}` },
                glassIcon('glass-icon', beerColor(s.beer, app.styles)),
                h('strong', { class: 'similar-name', text: s.beer.name }),
                h('span', { class: 'similar-sub', text: s.beer.brewery || '' }),
                h('span', { class: 'similar-why', text: reasons.join('・') }),
                s.avgRating !== null ? starsView(s.avgRating) : null,
              ),
            ),
          ),
        ),
      )
    : null;

  outlet.append(...[info, rating, tasteSummary, actions, history, similarSec].filter(Boolean));

  function historyItem(c) {
    const detail = [
      c.serving ? SERVING_LABELS[c.serving] : '',
      c.volumeMl !== null ? `${c.volumeMl}ml` : '',
      c.price !== null ? formatYen(c.price) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const place = [PLACE_TYPE_LABELS[c.place?.type] || '', c.place?.name || ''].filter(Boolean).join('：');
    return h(
      'li',
      { class: 'panel history-item' },
      h(
        'div',
        { class: 'history-head' },
        h('strong', { text: formatDate(c.date) }),
        typeof c.rating === 'number' ? starsView(c.rating) : h('span', { class: 'muted', text: '未評価' }),
        c.incomplete ? h('span', { class: 'badge badge-warn', text: '未入力あり' }) : null,
      ),
      place ? h('p', { class: 'small', text: place }) : null,
      detail ? h('p', { class: 'small muted', text: detail }) : null,
      c.memo ? h('p', { class: 'memo', text: c.memo }) : null,
      tastingLine(c.tasting),
      c.photoIds?.length
        ? h(
            'div',
            { class: 'photo-row' },
            c.photoIds.map((pid) => {
              const img = h('img', { alt: '写真', decoding: 'async' });
              loader.observe(img, pid);
              return h('button', { type: 'button', class: 'photo-thumb', onclick: () => showPhoto((id) => app.db.getPhoto(id), pid) }, img);
            }),
          )
        : null,
      h(
        'div',
        { class: 'history-actions' },
        h('a', { class: 'link', href: `#/checkin/${encodeURIComponent(c.id)}/edit`, text: '編集' }),
        h('button', { type: 'button', class: 'link danger', text: '削除', onclick: () => removeCheckin(c) }),
      ),
    );
  }

  function tastingLine(t) {
    const taste = tasteLabels(t);
    const flavor = flavorLabels(t, tagLabel);
    if (!hasScores(t) && !taste.length && !flavor.length) return null;
    return h(
      'div',
      { class: 'taste-line' },
      hasScores(t) ? h('div', { class: 'radar-mini' }, svg(tastingRadarSvg(t, { size: 64, compact: true }))) : null,
      taste.length || flavor.length
        ? h(
            'div',
            {},
            taste.length ? h('p', { class: 'small muted', text: `味：${taste.join('、')}` }) : null,
            flavor.length ? h('p', { class: 'small muted', text: `香り：${flavor.join('、')}` }) : null,
          )
        : null,
    );
  }

  async function share() {
    // 最新の記録と、写真のある最新の記録の1枚目から画像カードを作り、文章と一緒に共有する
    const latest = checkins[0] || null;
    const text = buildShareText(beer, latest, app.styles, { tagLabels: Object.fromEntries(tagLabel) });
    const photo = await sharePhoto;
    let card = null;
    try {
      card = await renderShareCard({
        name: beer.name,
        brewery: beer.brewery,
        meta: [style, formatAbv(beer.abv)].filter(Boolean).join(' / '),
        rating: latest?.rating ?? null,
        date: latest ? formatDate(latest.date) : '',
        place: latest?.place?.name || '',
        taste: tasteLabels(latest?.tasting),
        flavor: flavorLabels(latest?.tasting, tagLabel),
        memo: latest?.memo?.trim() || '',
        color,
        photo,
      });
    } catch (e) {
      console.warn('共有用の画像を作れませんでした', e);
    }
    const result = await shareContent({ title: beer.name, text, photo: card || photo, fileName: card ? 'hoptecho.png' : 'beer.jpg' });
    if (result === 'shared' || result === 'cancelled') return;
    if (card) showCardPreview(card, text, result === 'copied');
    else if (result === 'copied') showToast('共有用の文章をコピーしました');
    else showManualCopy(text);
  }

  /** 画像を添付して共有できない端末（パソコンなど）向け：画像を表示して、長押し・右クリックで保存してもらう */
  function showCardPreview(card, text, copied) {
    const url = URL.createObjectURL(card);
    const area = h('textarea', { class: 'share-text', rows: 4, readonly: true, value: text });
    const body = h('div', { class: 'card-preview' }, h('img', { src: url, alt: `${beer.name}の共有用の画像` }), area);
    confirmDialog({
      title: '共有用の画像',
      message: copied ? '文章はコピーしました。画像は長押し（パソコンは右クリック）で保存できます。' : '画像は長押し（パソコンは右クリック）で保存できます。',
      body,
      buttons: [{ label: '閉じる', value: true, variant: 'primary' }],
    }).finally(() => URL.revokeObjectURL(url));
  }

  function showManualCopy(text) {
    const area = h('textarea', { class: 'share-text', rows: 6, readonly: true, value: text });
    confirmDialog({ title: '共有用の文章', message: 'コピーして使ってください。', body: area, buttons: [{ label: '閉じる', value: true, variant: 'primary' }] });
    setTimeout(() => area.select(), 50);
  }

  async function removeBeer() {
    const n = await app.db.countRelated(beer.id);
    const ok = await confirmDialog({
      title: `「${beer.name}」を削除しますか？`,
      message: `この銘柄に紐づく記録${n.checkins}件と写真${n.photos}枚も削除されます。`,
      buttons: [
        { label: 'キャンセル', value: false },
        { label: '削除する', value: true, variant: 'danger' },
      ],
    });
    if (!ok) return;
    const snapshot = await app.db.deleteBeer(beer.id);
    app.navigate('#/beers', { replace: true });
    undoToast(`「${beer.name}」を削除しました`, snapshot);
  }

  async function removeCheckin(c) {
    const ok = await confirmDialog({
      title: `${formatDate(c.date)} の記録を削除しますか？`,
      message: c.photoIds?.length ? `写真${c.photoIds.length}枚も削除されます。` : '',
      buttons: [
        { label: 'キャンセル', value: false },
        { label: '削除する', value: true, variant: 'danger' },
      ],
    });
    if (!ok) return;
    const snapshot = await app.db.deleteCheckin(c.id);
    app.refresh();
    undoToast('記録を削除しました', snapshot);
  }

  function undoToast(message, snapshot) {
    showToast(message, {
      actionLabel: '元に戻す',
      duration: 10000,
      onAction: async () => {
        await app.db.restoreSnapshot(snapshot);
        app.refresh();
        showToast('元に戻しました');
      },
    });
  }

  return () => loader.destroy();
}

/** 記録に付いた香りタグの出現回数（多い順） */
function countTags(checkins) {
  const m = new Map();
  for (const c of checkins) for (const t of c.tasting?.flavorTags || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
