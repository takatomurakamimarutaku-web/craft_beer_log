// その他（#/more）
import { h } from '../ui.js';

export function render({ outlet }) {
  const item = (href, title, sub) =>
    h('li', {}, h('a', { class: 'menu-item', href }, h('span', { text: title }), sub ? h('span', { class: 'muted small', text: sub }) : null));
  outlet.replaceChildren(
    h(
      'ul',
      { class: 'menu' },
      item('#/wishlist', '飲みたいリスト', 'Phase 3で実装予定'),
      item('#/stats', '統計', 'Phase 6で実装予定'),
      item('#/settings', '設定・バックアップ'),
    ),
  );
}
