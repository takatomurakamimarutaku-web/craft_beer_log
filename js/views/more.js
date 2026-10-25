// その他（#/more）
import { h } from '../ui.js';

export function render({ outlet }) {
  const item = (href, title, sub) =>
    h('li', {}, h('a', { class: 'menu-item', href }, h('span', { text: title }), sub ? h('span', { class: 'muted small', text: sub }) : null));
  outlet.replaceChildren(
    h(
      'ul',
      { class: 'menu' },
      item('#/wishlist', '飲みたいリスト'),
      item('#/events', 'イベント', '全国のビアフェス・ビールイベント'),
      item('#/stats', '統計', 'スタイル・度数・ブリュワー・月別など'),
      item('#/settings', '設定・バックアップ'),
      item('feedback/', '感想を送る', '選ぶだけのかんたんアンケート'),
    ),
  );
}
