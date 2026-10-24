// 飲みたいリスト（#/wishlist）
import { h, formatAbv, emptyState, confirmDialog, showToast } from '../ui.js';
import { styleLabel } from '../models.js';

export async function render({ app, outlet }) {
  const beers = (await app.db.listBeersByStatus('want')).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const add = h('a', { class: 'btn btn-primary btn-block', href: '#/wishlist/new', text: '＋ 飲みたい銘柄を追加' });
  if (!beers.length) {
    outlet.replaceChildren(emptyState('飲みたい銘柄を登録しておくと、お店で見つけたときにすぐ確認できます。', add));
    return;
  }
  const list = h(
    'ul',
    { class: 'card-list' },
    beers.map((b) => {
      const meta = [b.brewery, styleLabel(b, app.styles), formatAbv(b.abv)].filter(Boolean).join(' · ');
      return h(
        'li',
        { class: 'panel want-item' },
        h(
          'a',
          { class: 'want-body', href: `#/beer/${encodeURIComponent(b.id)}` },
          h('div', { class: 'card-title', text: b.name }),
          meta ? h('div', { class: 'card-meta', text: meta }) : null,
          b.memo ? h('p', { class: 'memo small', text: b.memo }) : null,
        ),
        h(
          'div',
          { class: 'want-actions' },
          h('a', { class: 'btn btn-primary btn-small', href: `#/checkin/new?beerId=${encodeURIComponent(b.id)}`, text: '飲んだ' }),
          h('a', { class: 'btn btn-small', href: `#/beer/${encodeURIComponent(b.id)}/edit`, text: '編集' }),
          h('button', { type: 'button', class: 'btn btn-small btn-danger-text', text: '削除', onclick: () => remove(b) }),
        ),
      );
    }),
  );
  outlet.replaceChildren(h('p', { class: 'list-meta', text: `${beers.length}件` }), list, add);

  async function remove(b) {
    const ok = await confirmDialog({
      title: `「${b.name}」を削除しますか？`,
      message: '飲みたいリストから削除します。',
      buttons: [
        { label: 'キャンセル', value: false },
        { label: '削除する', value: true, variant: 'danger' },
      ],
    });
    if (!ok) return;
    const snapshot = await app.db.deleteBeer(b.id);
    app.refresh();
    showToast(`「${b.name}」を削除しました`, {
      actionLabel: '元に戻す',
      duration: 5000,
      onAction: async () => {
        await app.db.restoreSnapshot(snapshot);
        app.refresh();
      },
    });
  }
}
