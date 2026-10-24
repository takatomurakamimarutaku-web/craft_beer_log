// 記録の登録・編集（#/checkin/new, #/checkin/:id/edit）
import { h, field, attachSuggest, segmented, chipGroup, starInput, showErrors, showToast, confirmDialog, formatAbv } from '../ui.js';
import { createBeer, createCheckin, styleLabel, SERVING_LABELS, PLACE_TYPE_LABELS, MAX_PHOTOS } from '../models.js';
import { validateBeer, validateCheckin } from '../validate.js';
import { normalize } from '../search.js';
import { processImage } from '../image.js';
import { beerFields } from './beer-fields.js';
import { TASTE_AXES, TASTE_MAX, hasTasting } from '../tasting.js';

export async function render({ app, outlet, params, query }) {
  const editing = Boolean(params.id);
  const [beers, breweries, places, knowledge] = await Promise.all([
    app.db.listBeers(),
    app.db.listDistinctValues('brewery'),
    app.db.listDistinctValues('place'),
    app.loadKnowledge(),
  ]);
  let checkin;
  if (editing) {
    checkin = await app.db.getCheckin(params.id);
    if (!checkin) {
      outlet.replaceChildren(h('p', { class: 'empty', text: 'この記録は見つかりませんでした。' }));
      return;
    }
    app.setTitle('記録を編集');
  } else {
    checkin = createCheckin();
  }
  let selected = beers.find((b) => b.id === (editing ? checkin.beerId : query.beerId)) || null;

  // ---- 写真の状態 ----
  const urls = new Set();
  const photos = []; // { id, isNew, blob?, thumb?, url }
  for (const pid of checkin.photoIds || []) {
    const thumb = await app.db.getThumb(pid);
    const url = thumb ? URL.createObjectURL(thumb) : '';
    if (url) urls.add(url);
    photos.push({ id: pid, isNew: false, url });
  }

  const form = h('form', { class: 'form', novalidate: true, onsubmit: (e) => (e.preventDefault(), save()) });

  // ---- 銘柄 ----
  const beerSection = h('section', { class: 'form-section' }, h('h3', { class: 'section-title', text: '銘柄' }));
  const name = h('input', { id: 'f-name', type: 'text', placeholder: '銘柄名を入力', enterkeyhint: 'next' });
  const nameField = field('銘柄名（必須）', name, { name: 'name' });
  const matchNotice = h('div', { class: 'notice', hidden: true });
  const selectedView = h('div', { class: 'selected-beer', hidden: true });
  const newBeer = beerFields({ styles: app.styles, breweries, idPrefix: 'f' });
  const newBeerBox = h('div', { class: 'new-beer' }, h('p', { class: 'field-hint', text: '新しい銘柄として登録します' }), newBeer.el);

  if (editing) {
    beerSection.append(h('p', { class: 'selected-beer-name', text: selected ? selected.name : '' }), h('p', { class: 'field-hint', text: '銘柄の情報は銘柄の画面から編集できます' }));
  } else {
    beerSection.append(nameField, matchNotice, selectedView, newBeerBox);
    attachSuggest(name, {
      limit: 8,
      items: () =>
        beers.map((b) => ({
          label: b.name,
          sub: [b.brewery, b.status === 'want' ? '飲みたい' : ''].filter(Boolean).join(' · '),
          key: b.nameKey,
          value: b.id,
        })),
      onSelect: (it) => selectBeer(beers.find((b) => b.id === it.value)),
    });
    name.addEventListener('input', updateMatchNotice);
  }

  function exactMatch() {
    const key = normalize(name.value);
    return key ? beers.find((b) => b.nameKey === key) : null;
  }

  function updateMatchNotice() {
    const m = selected ? null : exactMatch();
    matchNotice.hidden = !m;
    if (m) {
      matchNotice.replaceChildren(
        h('span', { text: `「${m.name}」は登録済みです。` }),
        h('button', { type: 'button', class: 'link', text: 'この銘柄に追加', onclick: () => selectBeer(m) }),
      );
    }
  }

  function selectBeer(b) {
    selected = b || null;
    if (selected) name.value = selected.name;
    nameField.hidden = Boolean(selected);
    newBeerBox.hidden = Boolean(selected);
    selectedView.hidden = !selected;
    if (selected) {
      const meta = [selected.brewery, styleLabel(selected, app.styles), formatAbv(selected.abv)].filter(Boolean).join(' · ');
      selectedView.replaceChildren(
        h(
          'div',
          {},
          h('div', { class: 'muted small', text: selected.status === 'want' ? '飲みたいリストの銘柄に記録' : '登録済みの銘柄に記録' }),
          h('strong', { text: selected.name }),
          meta ? h('div', { class: 'small muted', text: meta }) : null,
        ),
        h('button', {
          type: 'button',
          class: 'link',
          text: '変更',
          onclick: () => {
            selectBeer(null);
            name.focus();
          },
        }),
      );
    }
    updateMatchNotice();
  }
  if (!editing) selectBeer(selected);

  // ---- 記録 ----
  const recSection = h('section', { class: 'form-section' }, h('h3', { class: 'section-title', text: '記録' }));
  const date = h('input', { id: 'f-date', type: 'date', value: checkin.date });
  let placeType = checkin.place?.type || 'drank';
  const placeName = h('input', { id: 'f-place', type: 'text', value: checkin.place?.name || '', placeholder: 'お店の名前' });
  let serving = checkin.serving;
  const volume = h('input', { id: 'f-volume', type: 'text', inputmode: 'numeric', value: checkin.volumeMl ?? '', placeholder: '例：350' });
  const price = h('input', { id: 'f-price', type: 'text', inputmode: 'numeric', value: checkin.price ?? '', placeholder: '例：1200' });
  let rating = checkin.rating;
  const memo = h('textarea', { id: 'f-memo', rows: 3, value: checkin.memo || '' });

  attachSuggest(placeName, {
    items: () => places.map((p) => ({ label: p.value, key: p.key, value: p.value, sub: `${p.count}件` })),
  });

  const photoInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', id: 'f-photo' });
  const photoGrid = h('div', { class: 'photo-grid' });
  const photoStatus = h('p', { class: 'field-hint' });
  photoInput.addEventListener('change', addPhotos);

  recSection.append(
    field('日付', date, { name: 'date' }),
    field(
      '飲んだ／買った',
      segmented({
        name: '飲んだ／買った',
        options: Object.entries(PLACE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
        value: placeType,
        onChange: (v) => (placeType = v),
      }),
      { name: 'placeType' },
    ),
    field('お店', placeName, { name: 'placeName' }),
    field(
      '提供形態',
      segmented({
        name: '提供形態',
        options: Object.entries(SERVING_LABELS).map(([value, label]) => ({ value, label })),
        value: serving,
        allowEmpty: true,
        onChange: (v) => (serving = v),
      }),
      { name: 'serving' },
    ),
    h(
      'div',
      { class: 'field-row' },
      field('容量', h('div', { class: 'input-suffix' }, volume, h('span', { text: 'ml' })), { name: 'volumeMl' }),
      field('価格', h('div', { class: 'input-suffix' }, price, h('span', { text: '円' })), { name: 'price' }),
    ),
    field('評価', starInput(rating, (v) => (rating = v)), { name: 'rating' }),
    field('メモ', memo, { name: 'memo' }),
    h(
      'div',
      { class: 'field', dataset: { field: 'photos' } },
      h('span', { class: 'field-label', text: `写真（${MAX_PHOTOS}枚まで）` }),
      photoGrid,
      photoInput,
      photoStatus,
      h('p', { class: 'field-error', role: 'alert' }),
    ),
  );
  // 容量・価格のラベルを入力欄に結び付ける
  recSection.querySelector('[data-field="volumeMl"] label').setAttribute('for', volume.id);
  recSection.querySelector('[data-field="price"] label').setAttribute('for', price.id);

  // ---- テイスティング（折りたたみ。入力済みなら開いておく） ----
  const tasting = { ...checkin.tasting, flavorTags: [...(checkin.tasting?.flavorTags || [])] };
  const tasteSection = h(
    'details',
    { class: 'form-section tasting-section', open: hasTasting(checkin.tasting) },
    h('summary', { class: 'section-title' }, 'テイスティング', h('span', { class: 'muted small', text: '（任意）' })),
    h('p', { class: 'field-hint', text: '1＝弱い 〜 5＝強い。もう一度タップすると未入力に戻せます。' }),
    ...TASTE_AXES.map(({ key, label }) =>
      field(
        label,
        segmented({
          name: label,
          options: Array.from({ length: TASTE_MAX }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
          value: tasting[key],
          allowEmpty: true,
          onChange: (v) => (tasting[key] = v),
        }),
        { name: `taste-${key}` },
      ),
    ),
    field(
      '香りタグ（複数選択可）',
      chipGroup({
        label: '香りタグ',
        options: knowledge.flavorTags.map((t) => ({ value: t.id, label: t.label })),
        values: tasting.flavorTags,
        onChange: (v) => (tasting.flavorTags = v),
      }),
      { name: 'tasting' },
    ),
  );

  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-block', text: editing ? '保存する' : '記録する' });
  const footer = h(
    'div',
    { class: 'form-footer' },
    editing ? null : h('p', { class: 'field-hint center', text: '名前だけでも保存できます（未入力の項目は「未入力あり」になります）' }),
    saveBtn,
  );

  form.append(beerSection, recSection, tasteSection, footer);
  outlet.replaceChildren(form);
  renderPhotos();

  function renderPhotos() {
    photoGrid.replaceChildren(
      ...photos.map((p, i) =>
        h(
          'div',
          { class: 'photo-cell' },
          p.url ? h('img', { src: p.url, alt: `写真${i + 1}` }) : h('div', { class: 'photo-missing', text: '?' }),
          h('button', {
            type: 'button',
            class: 'photo-remove',
            'aria-label': `写真${i + 1}を外す`,
            text: '×',
            onclick: () => {
              const [removed] = photos.splice(i, 1);
              if (removed.url && urls.delete(removed.url)) URL.revokeObjectURL(removed.url);
              renderPhotos();
            },
          }),
        ),
      ),
      photos.length < MAX_PHOTOS ? h('label', { class: 'photo-add', for: 'f-photo' }, h('span', { text: '＋' }), h('span', { class: 'small', text: '写真' })) : null,
    );
  }

  async function addPhotos() {
    const files = [...photoInput.files];
    photoInput.value = '';
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) showToast(`写真は${MAX_PHOTOS}枚までです。先頭の${room}枚を追加します`);
    const targets = files.slice(0, Math.max(0, room));
    for (let i = 0; i < targets.length; i++) {
      photoStatus.textContent = `写真を縮小しています…（${i + 1}/${targets.length}）`;
      try {
        const { blob, thumb } = await processImage(targets[i]);
        const url = URL.createObjectURL(thumb);
        urls.add(url);
        photos.push({ id: crypto.randomUUID(), isNew: true, blob, thumb, url });
        renderPhotos();
      } catch (e) {
        console.error(e);
        showToast('写真を読み込めませんでした');
      }
    }
    photoStatus.textContent = '';
  }

  let saving = false;
  async function save() {
    if (saving) return;
    const errors = {};
    let beerValue = null;
    if (!editing && !selected) {
      const r = validateBeer({ name: name.value, ...newBeer.read() });
      Object.assign(errors, r.errors);
      beerValue = r.value;
    }
    const c = validateCheckin({
      date: date.value,
      place: { type: placeType, name: placeName.value },
      serving,
      volumeMl: volume.value,
      price: price.value,
      rating,
      memo: memo.value,
      photoIds: photos.map((p) => p.id),
      tasting,
    });
    Object.assign(errors, c.errors);
    if (!showErrors(form, errors)) return;

    // 同名の銘柄がある場合は重複登録を確認する
    if (!editing && !selected) {
      const m = exactMatch();
      if (m) {
        const choice = await confirmDialog({
          title: `「${m.name}」は登録済みです`,
          message: '既存の銘柄に記録を追加しますか？',
          buttons: [
            { label: 'キャンセル', value: null },
            { label: '別の銘柄として登録', value: 'new' },
            { label: '既存の銘柄に追加', value: 'existing', variant: 'primary' },
          ],
        });
        if (!choice) return;
        if (choice === 'existing') selected = m;
      }
    }

    saving = true;
    saveBtn.disabled = true;
    try {
      const newPhotos = photos.filter((p) => p.isNew).map((p) => ({ id: p.id, blob: p.blob, thumb: p.thumb }));
      const record = { ...checkin, ...c.value };
      let beerId;
      if (editing || selected) {
        record.beerId = editing ? checkin.beerId : selected.id;
        await app.db.saveCheckin(record, newPhotos);
        beerId = record.beerId;
      } else {
        const res = await app.db.createBeerWithCheckin(createBeer(beerValue), record, newPhotos);
        beerId = res.beer.id;
      }
      showToast(editing ? '保存しました' : '記録しました');
      // 編集は元の画面へ戻る。新規は銘柄詳細へ置き換えて遷移（戻る操作でフォームに戻らないように）
      if (editing) app.goBack(`#/beer/${encodeURIComponent(beerId)}`);
      else app.navigate(`#/beer/${encodeURIComponent(beerId)}`, { replace: true });
    } catch (e) {
      console.error(e);
      showToast(`保存できませんでした：${e.message}`, { duration: 6000 });
      saving = false;
      saveBtn.disabled = false;
    }
  }

  return () => {
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear();
  };
}
