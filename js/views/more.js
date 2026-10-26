// その他（#/more）
import { h, svg } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ic = (body) => `<svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// メニューのアイコン（自作の固定SVG）と背景色
const ICONS = {
  wishlist: [ic('<path d="M7 4h10v16l-5-3.5L7 20z"/>'), '#d9622b'],
  events: [ic('<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>'), '#c2410c'],
  breweries: [ic('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>'), '#2e7d55'],
  stats: [ic('<path d="M5 20V11M12 20V5M19 20v-6"/>'), '#4f6bd8'],
  settings: [ic('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.4l2 1.2M17.8 15.4l2 1.2M4.2 16.6l2-1.2M17.8 8.6l2-1.2"/>'), '#6f6056'],
  feedback: [ic('<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>'), '#8a5cc2'],
};

export function render({ outlet }) {
  const item = (href, icon, title, sub) => {
    const [markup, color] = ICONS[icon];
    return h(
      'li',
      {},
      h(
        'a',
        { class: 'menu-row', href },
        h('span', { class: 'menu-icon', style: `--icon-bg:${color}` }, svg(markup)),
        h('span', { class: 'menu-text' }, h('span', { class: 'menu-label', text: title }), sub ? h('span', { class: 'menu-sub', text: sub }) : null),
      ),
    );
  };
  const group = (title, ...items) => [h('h2', { class: 'menu-group-title', text: title }), h('ul', { class: 'menu-group' }, ...items)];
  outlet.replaceChildren(
    ...group(
      'たのしむ',
      item('#/wishlist', 'wishlist', '飲みたいリスト', '気になる銘柄をメモ'),
      item('#/events', 'events', 'イベント', '全国のビアフェス・ビールイベント'),
      item('#/breweries', 'breweries', 'ブリュワー', 'ブリュワーの一覧と地図（試作）'),
      item('#/stats', 'stats', '統計', 'スタイル・度数・ブリュワー・月別など'),
    ),
    ...group(
      'アプリ',
      item('#/settings', 'settings', '設定・バックアップ', 'データの保存と復元'),
      item('feedback/', 'feedback', '感想を送る', '選ぶだけのかんたんアンケート'),
    ),
  );
}
