// 銘柄の入力欄（記録の登録画面・銘柄の編集画面・飲みたいリストで共通）
import { h, field, attachSuggest } from '../ui.js';

/**
 * ブリュワー・スタイル・度数（・メモ）の入力欄を作る。
 * @returns {{ el, read: () => object }}
 */
export function beerFields({ beer = {}, styles, breweries, withMemo = false, idPrefix = 'b' }) {
  const brewery = h('input', { id: `${idPrefix}-brewery`, type: 'text', value: beer.brewery || '', enterkeyhint: 'next' });
  const style = h(
    'select',
    { id: `${idPrefix}-style` },
    h('option', { value: '', text: '選択してください' }),
    styles.map((s) => h('option', { value: s.id, text: s.name, selected: beer.styleId === s.id })),
    h('option', { value: 'other', text: 'その他（自由入力）', selected: beer.styleId === 'other' }),
  );
  const styleOther = h('input', { id: `${idPrefix}-style-other`, type: 'text', value: beer.styleOther || '', placeholder: 'スタイル名' });
  const styleOtherField = field('スタイル（その他）', styleOther, { name: 'styleOther' });
  const abv = h('input', {
    id: `${idPrefix}-abv`,
    type: 'text',
    inputmode: 'decimal',
    value: typeof beer.abv === 'number' ? String(beer.abv) : typeof beer.abv === 'string' ? beer.abv : '',
    placeholder: '例：5.5',
  });
  const memo = withMemo ? h('textarea', { id: `${idPrefix}-memo`, rows: 3, value: beer.memo || '' }) : null;

  const syncOther = () => {
    styleOtherField.hidden = style.value !== 'other';
  };
  style.addEventListener('change', syncOther);
  syncOther();

  const el = h(
    'div',
    { class: 'beer-fields' },
    field('ブリュワー', brewery, { name: 'brewery' }),
    field('スタイル', style, { name: 'styleId' }),
    styleOtherField,
    field('度数（%）', h('div', { class: 'input-suffix' }, abv, h('span', { text: '%' })), { name: 'abv', hint: '0〜20（小数第1位まで）' }),
    memo ? field('メモ', memo, { name: 'memo' }) : null,
  );
  // 度数ラベルのタップで入力欄にフォーカスさせる
  el.querySelector('[data-field="abv"] label').setAttribute('for', abv.id);

  attachSuggest(brewery, {
    items: () => breweries.map((b) => ({ label: b.value, key: b.key, value: b.value, sub: `${b.count}件` })),
  });

  return {
    el,
    read: () => ({
      brewery: brewery.value,
      styleId: style.value || null,
      styleOther: styleOther.value,
      abv: abv.value,
      ...(memo ? { memo: memo.value } : {}),
    }),
  };
}
