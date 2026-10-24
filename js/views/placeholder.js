// 未実装の画面
import { h, emptyState } from '../ui.js';

export function render({ outlet, route }) {
  outlet.replaceChildren(emptyState(`この画面は${route.phase || '今後のフェーズ'}で実装予定です。`, h('a', { class: 'btn', href: '#/beers', text: '記録一覧へ' })));
}
