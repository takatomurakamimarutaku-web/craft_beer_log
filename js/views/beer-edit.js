// 銘柄の編集（#/beer/:id/edit）と飲みたい銘柄の追加（#/wishlist/new）
import { h, field, attachSuggest, showErrors, showToast, confirmDialog } from '../ui.js';
import { createBeer } from '../models.js';
import { validateBeer } from '../validate.js';
import { normalize } from '../search.js';
import { beerFields } from './beer-fields.js';
import { errorText } from '../errors.js';

export async function render({ app, outlet, params }) {
  const editing = Boolean(params.id);
  const [beers, breweries] = await Promise.all([app.db.listBeers(), app.db.listDistinctValues('brewery')]);
  const beer = editing ? beers.find((b) => b.id === params.id) : createBeer({ status: 'want' });
  if (!beer) {
    outlet.replaceChildren(h('p', { class: 'empty', text: 'この銘柄は見つかりませんでした。' }));
    return;
  }

  const form = h('form', { class: 'form', novalidate: true, onsubmit: (e) => (e.preventDefault(), save()) });
  const name = h('input', { id: 'e-name', type: 'text', value: beer.name, placeholder: '銘柄名' });
  const fields = beerFields({ beer, styles: app.styles, breweries, withMemo: true, idPrefix: 'e' });
  const nameField = field('銘柄名（必須）', name, { name: 'name' });
  form.append(
    h('section', { class: 'form-section' }, editing ? null : h('p', { class: 'field-hint', text: '飲みたいリストに追加します。分かる項目だけ入力してください。' }), nameField, fields.el),
    h('div', { class: 'form-footer' }, h('button', { type: 'submit', class: 'btn btn-primary btn-block', text: editing ? '保存する' : '飲みたいリストに追加' })),
  );
  outlet.replaceChildren(form);

  if (!editing) {
    // 既に登録済みの銘柄を候補に出す
    attachSuggest(name, {
      items: () =>
        beers.map((b) => ({ label: b.name, sub: [b.brewery, b.status === 'want' ? '飲みたい' : '飲んだ'].filter(Boolean).join(' · '), key: b.nameKey, value: b.id })),
      onSelect: (it) => app.navigate(`#/beer/${encodeURIComponent(it.value)}`),
    });
  }

  let saving = false;
  async function save() {
    if (saving) return;
    const r = validateBeer({ name: name.value, ...fields.read(), status: beer.status });
    if (!showErrors(form, r.errors)) return;
    const key = normalize(r.value.name);
    const dup = beers.find((b) => b.id !== beer.id && b.nameKey === key);
    if (dup) {
      const ok = await confirmDialog({
        title: `「${dup.name}」は登録済みです`,
        message: '同じ名前の銘柄を別に登録しますか？',
        buttons: [
          { label: 'キャンセル', value: false },
          { label: '登録する', value: true, variant: 'primary' },
        ],
      });
      if (!ok) return;
    }
    saving = true;
    try {
      const saved = await app.db.saveBeer({ ...beer, ...r.value });
      showToast(editing ? '保存しました' : '飲みたいリストに追加しました');
      // 編集前の画面（銘柄詳細・飲みたいリスト）へ戻る。同じ画面が履歴に重ならないようにするため
      app.goBack(editing ? `#/beer/${encodeURIComponent(saved.id)}` : '#/wishlist');
    } catch (e) {
      console.error(e);
      showToast(errorText(e, '保存'), { duration: 8000 });
      saving = false;
    }
  }
}
