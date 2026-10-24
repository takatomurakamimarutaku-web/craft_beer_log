// 銘柄の詳細（#/beer/:id）
import { h, createThumbLoader, formatDate, formatAbv, formatYen, stars, confirmDialog, showToast, showPhoto, glassIcon } from '../ui.js';
import { styleLabel, SERVING_LABELS, PLACE_TYPE_LABELS, STATUS_LABELS } from '../models.js';
import { summarizeRatings } from '../stats.js';

export async function render({ app, outlet, params }) {
  const beer = await app.db.getBeer(params.id);
  outlet.replaceChildren();
  if (!beer) {
    outlet.append(h('p', { class: 'empty', text: 'この銘柄は見つかりませんでした（削除された可能性があります）。' }));
    return;
  }
  app.setTitle(beer.name);
  const checkins = await app.db.listCheckinsByBeer(beer.id);
  const summary = summarizeRatings(checkins);
  const loader = createThumbLoader((id) => app.db.getThumb(id));
  const style = styleLabel(beer, app.styles);

  const info = h(
    'section',
    { class: 'panel beer-head' },
    h('div', { class: 'beer-head-icon' }, glassIcon()),
    h(
      'div',
      {},
      h('h2', { class: 'beer-name', text: beer.name }),
      h('p', { class: 'muted', text: beer.brewery || 'ブリュワー未入力' }),
      h(
        'div',
        { class: 'tags' },
        style ? h('span', { class: 'tag', text: style }) : null,
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
    h('div', {}, h('div', { class: 'muted small', text: '最新' }), h('div', { class: 'big', text: summary.latest !== null ? stars(summary.latest) : '—' })),
    h('div', {}, h('div', { class: 'muted small', text: '飲んだ回数' }), h('div', { class: 'big', text: `${checkins.length}` })),
  );

  const actions = h(
    'div',
    { class: 'actions' },
    h('a', { class: 'btn btn-primary', href: `#/checkin/new?beerId=${encodeURIComponent(beer.id)}`, text: '＋ この銘柄を記録' }),
    h('a', { class: 'btn', href: `#/beer/${encodeURIComponent(beer.id)}/edit`, text: '編集' }),
    h('button', { type: 'button', class: 'btn btn-danger-text', text: '削除', onclick: () => removeBeer() }),
  );

  const history = h('section', {}, h('h3', { class: 'section-title', text: '飲んだ記録' }));
  if (!checkins.length) history.append(h('p', { class: 'muted', text: 'まだ記録がありません。' }));
  const list = h('ul', { class: 'history' });
  for (const c of checkins) list.append(historyItem(c));
  history.append(list);

  outlet.append(info, rating, actions, history);

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
        typeof c.rating === 'number' ? h('span', { class: 'stars', text: stars(c.rating) }) : h('span', { class: 'muted', text: '未評価' }),
        c.incomplete ? h('span', { class: 'badge badge-warn', text: '未入力あり' }) : null,
      ),
      place ? h('p', { class: 'small', text: place }) : null,
      detail ? h('p', { class: 'small muted', text: detail }) : null,
      c.memo ? h('p', { class: 'memo', text: c.memo }) : null,
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
      duration: 5000,
      onAction: async () => {
        await app.db.restoreSnapshot(snapshot);
        app.refresh();
        showToast('元に戻しました');
      },
    });
  }

  return () => loader.destroy();
}
