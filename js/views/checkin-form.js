// 記録の登録・編集（#/checkin/new, #/checkin/:id/edit）
import { h, field, attachSuggest, segmented, chipGroup, starInput, showErrors, showToast, confirmDialog, formatAbv } from '../ui.js';
import { createBeer, createCheckin, styleLabel, SERVING_LABELS, PLACE_TYPE_LABELS, MAX_PHOTOS } from '../models.js';
import { validateBeer, validateCheckin, parseCustomWords } from '../validate.js';
import { normalize } from '../search.js';
import { processImage } from '../image.js';
import { beerFields } from './beer-fields.js';
import { TASTE_AXES, TASTE_MAX, TASTE_TAGS, groupFlavorTags, hasScores } from '../tasting.js';
import { errorText } from '../errors.js';
import { joinEvents, eventsOnDate } from '../events.js';

export const DRAFT_KEY = 'checkinDraft';

/**
 * 大まかな選択肢のチップ＋「＋その他」で自由入力（味・香りで共用）。
 * groups: [{ label?, options: [{value,label}] }]。選んだ値と入力した語はそれぞれ onChange で返す。
 */
function tagPicker({ label, groups, values, custom, placeholder, onChange, onCustomChange }) {
  let selected = [...values];
  const input = h('input', { type: 'text', value: custom.join('、'), placeholder, enterkeyhint: 'done', 'aria-label': `${label}（その他）` });
  const otherBox = h('div', { class: 'tag-other', hidden: !custom.length }, input, h('p', { class: 'field-hint', text: '「、」で区切ると複数入れられます' }));
  const otherChip = h('button', {
    type: 'button',
    class: 'chip chip-other',
    text: '＋その他',
    'aria-pressed': String(custom.length > 0),
    'aria-expanded': String(custom.length > 0),
    onclick: () => {
      const open = otherBox.hidden;
      otherBox.hidden = !open;
      otherChip.setAttribute('aria-pressed', String(open));
      otherChip.setAttribute('aria-expanded', String(open));
      // 閉じたら入力した語は保存しない（文字は残すので、開き直せば戻る）
      onCustomChange(open ? parseCustomWords(input.value) : []);
      if (open) input.focus();
    },
  });
  input.addEventListener('input', () => onCustomChange(parseCustomWords(input.value)));
  // Enter で送信（保存）されないようにする
  input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), input.blur()));
  const rows = groups.map((g, i) => {
    const chips = chipGroup({
      label: g.label ? `${label}：${g.label}` : label,
      options: g.options,
      values: selected.filter((v) => g.options.some((o) => o.value === v)),
      onChange: (vals) => {
        const mine = new Set(g.options.map((o) => o.value));
        selected = [...selected.filter((v) => !mine.has(v)), ...vals];
        onChange(selected);
      },
    });
    if (i === groups.length - 1) chips.append(otherChip);
    return g.label ? h('div', { class: 'tag-group' }, h('span', { class: 'tag-group-label', text: g.label }), chips) : chips;
  });
  return h('div', { class: 'tag-picker' }, ...rows, otherBox);
}

/** 下書きから記録の初期値を作る（純粋関数。写真は下書きに含めない） */
export function checkinFromDraft(d) {
  return createCheckin({
    ...(d.date ? { date: d.date } : {}),
    place: { type: d.placeType || 'drank', name: d.placeName || '', ...(d.eventId ? { eventId: d.eventId } : {}) },
    serving: d.serving ?? null,
    volumeMl: d.volume ?? null,
    price: d.price ?? null,
    rating: d.rating ?? null,
    memo: d.memo || '',
    tasting: d.tasting,
    photoIds: [],
  });
}

export async function render({ app, outlet, params, query }) {
  const editing = Boolean(params.id);
  const [beers, breweries, places, knowledge, eventData, planList] = await Promise.all([
    app.db.listBeers(),
    app.db.listDistinctValues('brewery'),
    app.db.listDistinctValues('place'),
    app.loadKnowledge(),
    app.loadEvents().catch(() => null),
    app.db.listEventPlans().catch(() => []),
  ]);
  const events = joinEvents(eventData);
  const plans = new Map(planList.map((p) => [p.id, p]));
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
  // 新規の記録だけ、入力途中の内容を下書きとして残す
  const draft = editing ? null : await app.db.getMeta(DRAFT_KEY).catch(() => null);
  const restoring = Boolean(draft && query.restore === '1');
  if (restoring) checkin = checkinFromDraft(draft);
  // イベントの詳細・「続けて記録」から開いたときは、イベントと日付を入れておく
  const fromEvent = !editing && !restoring ? events.find((e) => e.id === query.eventId) : null;
  if (fromEvent) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(query.date || '') ? query.date : checkin.date;
    checkin = createCheckin({ date: day, place: { type: 'drank', name: fromEvent.name, eventId: fromEvent.id } });
  }
  let selected = beers.find((b) => b.id === (editing ? checkin.beerId : restoring ? draft.beerId : query.beerId)) || null;

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
  if (restoring) name.value = draft.name || '';
  const newBeer = beerFields({ beer: restoring ? draft.beer || {} : {}, styles: app.styles, breweries, idPrefix: 'f' });
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

  // 味・香り（記録セクション）と5段階の点数（テイスティング）が共有する入力中の値
  const t0 = checkin.tasting || {};
  const tasting = {
    ...t0,
    flavorTags: [...(t0.flavorTags || [])],
    flavorCustom: [...(t0.flavorCustom || [])],
    tasteTags: [...(t0.tasteTags || [])],
    tasteCustom: [...(t0.tasteCustom || [])],
  };

  // ---- 記録 ----
  const recSection = h('section', { class: 'form-section' }, h('h3', { class: 'section-title', text: '記録' }));
  const date = h('input', { id: 'f-date', type: 'date', value: checkin.date });
  let placeType = checkin.place?.type || 'drank';
  let eventId = checkin.place?.eventId || null;
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

  // ---- その日に開催しているイベント（選ぶと記録に紐付く） ----
  const eventField = h('div', { class: 'field event-field', dataset: { field: 'event' } });
  const renderEventField = () => {
    const list = eventsOnDate(events, date.value, plans);
    const options = list.map((e) => ({ value: e.id, label: e.name }));
    // 日付を変えた・配信から消えたなどで候補に無い紐付けも、外せるように表示する
    if (eventId && !options.some((o) => o.value === eventId)) options.unshift({ value: eventId, label: events.find((e) => e.id === eventId)?.name || checkin.place?.name || 'イベント' });
    eventField.hidden = !options.length;
    eventField.replaceChildren(
      h('span', { class: 'field-label', text: 'イベントで飲んだ？' }),
      segmented({
        name: 'イベント',
        options,
        value: eventId,
        allowEmpty: true,
        onChange: (v) => {
          const prevName = events.find((e) => e.id === eventId)?.name;
          const next = events.find((e) => e.id === v);
          eventId = v;
          // お店の欄が空か、前に選んだイベント名のままなら置き換える
          if (!placeName.value.trim() || placeName.value === prevName) placeName.value = next?.name || '';
        },
      }),
      h('p', { class: 'field-hint', text: '選ぶと、イベントの画面にこの記録が並びます。' }),
      h('p', { class: 'field-error', role: 'alert' }), // showErrors が .field ごとに参照する
    );
  };
  date.addEventListener('change', renderEventField);
  renderEventField();

  recSection.append(
    field('日付', date, { name: 'date' }),
    eventField,
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
    field(
      '味（複数選択可）',
      tagPicker({
        label: '味',
        groups: [{ options: TASTE_TAGS.map((t) => ({ value: t.id, label: t.label })) }],
        values: tasting.tasteTags,
        custom: tasting.tasteCustom,
        placeholder: '例：塩気、渋い',
        onChange: (v) => (tasting.tasteTags = v),
        onCustomChange: (v) => (tasting.tasteCustom = v),
      }),
      { name: 'taste' },
    ),
    field(
      '香り（複数選択可）',
      tagPicker({
        label: '香り',
        groups: groupFlavorTags(knowledge.flavorTags).map((g) => ({ label: g.label, options: g.tags.map((t) => ({ value: t.id, label: t.label })) })),
        values: tasting.flavorTags,
        custom: tasting.flavorCustom,
        placeholder: '例：ライチ、ハチミツ',
        onChange: (v) => (tasting.flavorTags = v),
        onCustomChange: (v) => (tasting.flavorCustom = v),
      }),
      { name: 'flavor' },
    ),
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

  // ---- テイスティングの点数（折りたたみ。入力済みなら開いておく） ----
  const tasteSection = h(
    'details',
    { class: 'form-section tasting-section', open: hasScores(checkin.tasting) },
    h('summary', { class: 'section-title' }, 'テイスティングの点数', h('span', { class: 'muted small', text: '（任意）' })),
    h('p', { class: 'field-hint', text: '1＝弱い 〜 5＝強い。銘柄の画面のレーダーチャートになります。もう一度タップすると未入力に戻せます。' }),
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
    // 点数の範囲エラー（validateCheckin の errors.tasting）の表示先
    h('div', { class: 'field', dataset: { field: 'tasting' } }, h('p', { class: 'field-error', role: 'alert' })),
  );

  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-block', text: editing ? '保存する' : '記録する' });
  const footer = h(
    'div',
    { class: 'form-footer' },
    editing ? null : h('p', { class: 'field-hint center', text: '名前だけでも保存できます（未入力の項目は「未入力あり」になります）' }),
    saveBtn,
  );

  // 前回の入力途中の内容があれば、復元するか選べるようにする
  const draftNotice =
    draft && !restoring && !editing
      ? h(
          'div',
          { class: 'notice', role: 'status' },
          h('span', { text: `入力途中の記録があります${draft.name ? `（${draft.name}）` : ''}。写真は復元されません。` }),
          h('button', { type: 'button', class: 'link', text: '復元する', onclick: () => app.navigate('#/checkin/new?restore=1', { replace: true }) }),
          h('button', {
            type: 'button',
            class: 'link',
            text: '破棄',
            onclick: async () => {
              await app.db.setMeta(DRAFT_KEY, null).catch(() => {});
              draftNotice.remove();
            },
          }),
        )
      : null;

  form.append(beerSection, recSection, tasteSection, footer);
  outlet.replaceChildren(...[draftNotice, form].filter(Boolean));
  renderPhotos();

  // ---- 下書きの自動保存と、離れるときの確認 ----
  let dirty = restoring;
  let saved = false;
  let draftTimer = null;
  const readDraft = () => ({
    savedAt: new Date().toISOString(),
    beerId: selected?.id || null,
    name: name.value,
    beer: newBeer.read(),
    date: date.value,
    placeType,
    placeName: placeName.value,
    eventId,
    serving,
    volume: volume.value,
    price: price.value,
    rating,
    memo: memo.value,
    tasting,
  });
  const writeDraft = () => {
    clearTimeout(draftTimer);
    if (editing || saved || !dirty) return;
    app.db.setMeta(DRAFT_KEY, readDraft()).catch((e) => console.warn('下書きを保存できませんでした', e));
  };
  const markDirty = () => {
    dirty = true;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(writeDraft, 600);
  };
  for (const type of ['input', 'change', 'click']) form.addEventListener(type, markDirty);
  const onHide = () => document.visibilityState === 'hidden' && writeDraft();
  document.addEventListener('visibilitychange', onHide);
  app.leaveGuard = async () => {
    if (!dirty || saved) return true;
    writeDraft();
    return confirmDialog(
      editing
        ? {
            title: '変更を破棄しますか？',
            message: '保存していない変更は失われます。',
            buttons: [
              { label: '入力を続ける', value: false },
              { label: '破棄して移動', value: true, variant: 'danger' },
            ],
          }
        : {
            title: '記録はまだ保存されていません',
            message: '入力途中の内容は下書きとして残り、次に「記録」を開いたときに復元できます（写真を除く）。',
            buttons: [
              { label: '入力を続ける', value: false, variant: 'primary' },
              { label: '移動する', value: true },
            ],
          },
    );
  };

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
      place: { type: placeType, name: placeName.value, eventId },
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
      saved = true;
      app.leaveGuard = null;
      if (!editing) await app.db.setMeta(DRAFT_KEY, null).catch(() => {});
      const event = events.find((e) => e.id === record.place?.eventId);
      if (event && !editing) {
        await app.db.markEventWent(event).catch((e) => console.warn('参加状況を更新できませんでした', e));
        // イベントでは何杯も続けて飲むので、同じイベント・日付ですぐ次を記録できるようにする
        const next = `#/checkin/new?eventId=${encodeURIComponent(event.id)}&date=${record.date}`;
        showToast('記録しました', { actionLabel: '同じイベントで続けて記録', onAction: () => app.navigate(next), duration: 8000 });
      } else {
        showToast(editing ? '保存しました' : '記録しました');
      }
      // 編集は元の画面へ戻る。新規は銘柄詳細へ置き換えて遷移（戻る操作でフォームに戻らないように）
      if (editing) app.goBack(`#/beer/${encodeURIComponent(beerId)}`);
      else app.navigate(`#/beer/${encodeURIComponent(beerId)}`, { replace: true });
    } catch (e) {
      console.error(e);
      showToast(errorText(e, '保存'), { duration: 8000 });
      saving = false;
      saveBtn.disabled = false;
    }
  }

  return () => {
    writeDraft();
    document.removeEventListener('visibilitychange', onHide);
    app.leaveGuard = null;
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear();
  };
}
