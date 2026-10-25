// 検索・絞り込み（#/search）
import { h, chipGroup, segmented, createThumbLoader, thumbView, formatDate, formatAbv, emptyState } from '../ui.js';
import { buildBeerSummaries, searchBeers, defaultCriteria, countActiveFilters } from '../search.js';
import { styleLabel, SERVING_LABELS, PLACE_TYPE_LABELS } from '../models.js';
import { parseAbv } from '../validate.js';

const PAGE = 50;
const STORAGE_KEY = 'searchCriteria';
let saved = null; // 画面を移動しても条件を保持する

function loadCriteria() {
  if (saved) return saved;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return (saved = { ...defaultCriteria(), ...JSON.parse(raw) });
  } catch {
    /* 読めなければ初期値 */
  }
  return (saved = defaultCriteria());
}

function storeCriteria(c) {
  saved = c;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* 保存できなくても画面内では保持される */
  }
}

/** 統計画面などから条件を指定して開くとき用（Phase 6） */
export function setCriteria(partial) {
  storeCriteria({ ...defaultCriteria(), ...partial });
}

export async function render({ app, outlet }) {
  const [beers, checkins, knowledge] = await Promise.all([app.db.listBeers(), app.db.listCheckins(), app.loadKnowledge()]);
  const summaries = buildBeerSummaries(beers, checkins);
  const loader = createThumbLoader((id) => app.db.getThumb(id));
  let criteria = { ...loadCriteria() };
  let results = [];
  let shown = 0;

  if (!beers.length) {
    outlet.replaceChildren(emptyState('検索できる銘柄がまだありません。', h('a', { class: 'btn btn-primary', href: '#/checkin/new', text: '＋ 記録する' })));
    return () => loader.destroy();
  }

  const keyword = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: '名前・ブリュワーで検索',
    value: criteria.keyword,
    'aria-label': 'キーワード',
    enterkeyhint: 'search',
    oninput: () => update({ keyword: keyword.value }),
  });
  const toggle = h('button', { type: 'button', class: 'btn btn-small', 'aria-expanded': 'false', onclick: () => setPanel(panel.hidden) });
  const count = h('p', { class: 'list-meta', 'aria-live': 'polite' });
  const monthChip = h('div', { class: 'chips month-chip' });
  const panel = h('div', { class: 'panel filter-panel', hidden: true });
  const list = h('ul', { class: 'card-list' });
  const more = h('button', { type: 'button', class: 'btn btn-block', text: 'さらに表示', onclick: () => appendPage() });

  outlet.replaceChildren(h('div', { class: 'search-bar' }, keyword, toggle), panel, monthChip, count, list, more);
  buildPanel();
  renderResults();

  function setPanel(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  function update(partial, { rebuild = false } = {}) {
    criteria = { ...criteria, ...partial };
    storeCriteria(criteria);
    if (rebuild) buildPanel();
    renderResults();
  }

  function renderResults() {
    results = searchBeers(summaries, criteria);
    const n = countActiveFilters(criteria);
    toggle.textContent = n ? `絞り込み（${n}）` : '絞り込み・並べ替え';
    count.textContent = `${results.length}件 / ${summaries.length}銘柄`;
    // 月・イベントの条件は統計画面からだけ指定するため、ここで外せるようにする
    monthChip.replaceChildren(
      criteria.month
        ? h('button', {
            type: 'button',
            class: 'chip',
            'aria-pressed': 'true',
            'aria-label': `${criteria.month.replace('-', '年')}月の条件を外す`,
            text: `${Number(criteria.month.slice(0, 4))}年${Number(criteria.month.slice(5))}月に飲んだ ×`,
            onclick: () => update({ month: null }),
          })
        : '',
      criteria.eventId
        ? h('button', {
            type: 'button',
            class: 'chip',
            'aria-pressed': 'true',
            'aria-label': `${criteria.eventLabel || 'イベント'}の条件を外す`,
            text: `${criteria.eventLabel || 'イベント'}で飲んだ ×`,
            onclick: () => update({ eventId: null, eventLabel: '' }),
          })
        : '',
    );
    list.replaceChildren();
    shown = 0;
    appendPage();
    if (!results.length) list.append(h('li', { class: 'muted center', text: '条件に一致する銘柄はありません' }));
  }

  function appendPage() {
    const slice = results.slice(shown, shown + PAGE);
    for (const s of slice) list.append(resultCard(s));
    shown += slice.length;
    more.hidden = shown >= results.length;
  }

  function resultCard(s) {
    const b = s.beer;
    const meta = [b.brewery, styleLabel(b, app.styles), formatAbv(b.abv)].filter(Boolean).join(' · ');
    return h(
      'li',
      {},
      h(
        'a',
        { class: 'card', href: `#/beer/${encodeURIComponent(b.id)}` },
        thumbView(s.photoId, loader),
        h(
          'div',
          { class: 'card-body' },
          h('div', { class: 'card-title', text: b.name }),
          meta ? h('div', { class: 'card-meta', text: meta }) : null,
          h(
            'div',
            { class: 'card-foot' },
            s.lastDate ? h('span', { text: `最終 ${formatDate(s.lastDate)}` }) : null,
            s.count ? h('span', { text: `${s.count}回` }) : null,
            s.avgRating !== null ? h('span', { class: 'stars', text: `★${s.avgRating.toFixed(1)}` }) : null,
            b.status === 'want' ? h('span', { class: 'badge', text: '飲みたい' }) : null,
            s.incomplete ? h('span', { class: 'badge badge-warn', text: '未入力あり' }) : null,
          ),
        ),
      ),
    );
  }

  function buildPanel() {
    const abvMin = h('input', { type: 'text', inputmode: 'decimal', placeholder: '下限', value: criteria.abvMin ?? '', 'aria-label': '度数の下限' });
    const abvMax = h('input', { type: 'text', inputmode: 'decimal', placeholder: '上限', value: criteria.abvMax ?? '', 'aria-label': '度数の上限' });
    const abvNote = h('p', { class: 'field-error' });
    const onAbv = () => {
      const lo = parseAbv(abvMin.value);
      const hi = parseAbv(abvMax.value);
      abvNote.textContent = lo.error || hi.error || '';
      update({ abvMin: lo.error ? null : lo.value, abvMax: hi.error ? null : hi.value });
    };
    abvMin.addEventListener('input', onAbv);
    abvMax.addEventListener('input', onAbv);

    const sortSelect = h(
      'select',
      { 'aria-label': '並べ替え', onchange: () => update({ sort: sortSelect.value }) },
      [
        ['lastDate', '最終飲用日'],
        ['abv', '度数'],
        ['rating', '評価'],
        ['name', '名前'],
        ['count', '飲んだ回数'],
      ].map(([v, l]) => h('option', { value: v, text: l, selected: criteria.sort === v })),
    );
    const orderBtn = h('button', {
      type: 'button',
      class: 'btn btn-small',
      text: criteria.order === 'asc' ? '昇順 ↑' : '降順 ↓',
      onclick: () => {
        const order = criteria.order === 'asc' ? 'desc' : 'asc';
        orderBtn.textContent = order === 'asc' ? '昇順 ↑' : '降順 ↓';
        update({ order });
      },
    });
    const incomplete = h('input', { type: 'checkbox', id: 's-incomplete', checked: criteria.incompleteOnly, onchange: () => update({ incompleteOnly: incomplete.checked }) });

    const styleOptions = app.styles.map((s) => ({ value: s.id, label: s.name })).concat([{ value: 'other', label: 'その他' }]);

    panel.replaceChildren(
      group('並べ替え', h('div', { class: 'row' }, sortSelect, orderBtn)),
      group(
        '状態',
        segmented({
          name: '状態',
          options: [
            { value: 'all', label: 'すべて' },
            { value: 'tried', label: '飲んだ' },
            { value: 'want', label: '飲みたい' },
          ],
          value: criteria.status,
          onChange: (v) => update({ status: v }),
        }),
      ),
      group('スタイル（複数選択可）', chipGroup({ label: 'スタイル', options: styleOptions, values: criteria.styleIds, onChange: (v) => update({ styleIds: v }) })),
      group('度数（%）', h('div', { class: 'row' }, abvMin, h('span', { text: '〜' }), abvMax), abvNote),
      group(
        '飲んだ／買った',
        chipGroup({
          label: '飲んだ／買った',
          options: Object.entries(PLACE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
          values: criteria.placeTypes,
          onChange: (v) => update({ placeTypes: v }),
        }),
      ),
      group(
        '提供形態',
        chipGroup({
          label: '提供形態',
          options: Object.entries(SERVING_LABELS).map(([value, label]) => ({ value, label })),
          values: criteria.servings,
          onChange: (v) => update({ servings: v }),
        }),
      ),
      group(
        '香りタグ（記録に付けたタグをすべて含む）',
        chipGroup({
          label: '香りタグ',
          options: knowledge.flavorTags.map((t) => ({ value: t.id, label: t.label })),
          values: criteria.flavorTags,
          onChange: (v) => update({ flavorTags: v }),
        }),
      ),
      group(
        '評価（平均）',
        segmented({
          name: '評価',
          options: [2, 3, 4, 5].map((n) => ({ value: n, label: n === 5 ? '★5' : `★${n}以上` })),
          value: criteria.ratingMin,
          allowEmpty: true,
          onChange: (v) => update({ ratingMin: v }),
        }),
      ),
      h('label', { class: 'check', for: 's-incomplete' }, incomplete, h('span', { text: '「未入力あり」のみ' })),
      h(
        'div',
        { class: 'row' },
        h('button', {
          type: 'button',
          class: 'btn btn-small',
          text: '条件をリセット',
          onclick: () => {
            keyword.value = '';
            criteria = defaultCriteria();
            update({}, { rebuild: true });
          },
        }),
        h('button', { type: 'button', class: 'btn btn-small btn-primary', text: '閉じる', onclick: () => setPanel(false) }),
      ),
    );
  }

  return () => loader.destroy();
}

function group(label, ...children) {
  return h('div', { class: 'filter-group' }, h('div', { class: 'field-label', text: label }), ...children);
}
