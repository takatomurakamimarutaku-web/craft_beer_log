// 知識（#/knowledge 一覧、#/knowledge/style/:id など詳細）
import { h, svg, emptyState } from '../ui.js';
import { searchKnowledge, styleTexts, srmToHex, styleDisplaySrm, formatRange, GLASS_LABELS } from '../knowledge.js';
import { glassSvg, rangeBarSvg } from '../illust.js';

const TABS = [
  { value: 'styles', label: 'スタイル' },
  { value: 'terms', label: '用語' },
  { value: 'hops', label: 'ホップ' },
];
const STORAGE_KEY = 'knowledgeState';
let state = null; // 画面を移動してもタブと検索語を保持する

function loadState() {
  if (state) return state;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return (state = { tab: 'styles', q: '', ...JSON.parse(raw) });
  } catch {
    /* 読めなければ初期値 */
  }
  return (state = { tab: 'styles', q: '' });
}

function saveState(s) {
  state = s;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* 画面内では保持される */
  }
}

// ---- 一覧 ----

export async function render(ctx) {
  const { route } = ctx;
  if (route.kind === 'style') return renderStyle(ctx);
  return renderList(ctx);
}

function renderList({ app, outlet, query }) {
  let s = { ...loadState() };
  if (query.tab && TABS.some((t) => t.value === query.tab)) s.tab = query.tab;
  saveState(s);

  const input = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'キーワードで探す',
    value: s.q,
    'aria-label': 'キーワード',
    enterkeyhint: 'search',
    oninput: () => {
      s = { ...s, q: input.value };
      saveState(s);
      renderBody();
    },
  });
  const tabs = segmented(s.tab, (tab) => {
    s = { ...s, tab };
    saveState(s);
    renderBody();
  });
  const body = h('div', { class: 'knowledge-body', 'aria-live': 'polite' });
  outlet.replaceChildren(h('div', { class: 'search-bar knowledge-bar' }, input), tabs, body);
  renderBody();

  function renderBody() {
    if (s.tab === 'styles') return body.replaceChildren(...styleList(app.styles, s.q));
    body.replaceChildren(emptyState(s.tab === 'terms' ? '用語は Phase 4-2 で追加予定です。' : 'ホップは Phase 4-3 で追加予定です。'));
  }
}

function segmented(value, onChange) {
  const wrap = h('div', { class: 'segmented knowledge-tabs', role: 'tablist', 'aria-label': '種類' });
  const buttons = TABS.map((t) =>
    h('button', {
      type: 'button',
      class: 'seg',
      role: 'tab',
      text: t.label,
      'aria-selected': String(t.value === value),
      onclick: () => {
        buttons.forEach((b, i) => b.setAttribute('aria-selected', String(TABS[i].value === t.value)));
        onChange(t.value);
      },
    }),
  );
  wrap.append(...buttons);
  return wrap;
}

function styleList(styles, q) {
  const items = searchKnowledge(styles, q, styleTexts);
  if (!items.length) return [h('p', { class: 'list-meta', text: '該当するスタイルがありません。' })];
  const groups = new Map();
  for (const st of items) {
    if (!groups.has(st.category)) groups.set(st.category, []);
    groups.get(st.category).push(st);
  }
  const out = [h('p', { class: 'list-meta', text: `${items.length}件` })];
  for (const [category, list] of groups) {
    out.push(
      h('h2', { class: 'section-title', text: category }),
      h(
        'ul',
        { class: 'card-list' },
        list.map((st) =>
          h(
            'li',
            {},
            h(
              'a',
              { class: 'card', href: `#/knowledge/style/${encodeURIComponent(st.id)}` },
              h('div', { class: 'thumb knowledge-thumb' }, styleGlass(st)),
              h(
                'div',
                { class: 'card-body' },
                h('div', { class: 'card-title', text: st.name }),
                h('div', { class: 'card-meta', text: st.nameEn }),
                h('div', { class: 'card-foot', text: `度数 ${formatRange(st.abv, '%')}・苦味 IBU ${formatRange(st.ibu)}` }),
              ),
            ),
          ),
        ),
      ),
    );
  }
  return out;
}

function styleGlass(st) {
  return svg(glassSvg(st.glass, srmToHex(styleDisplaySrm(st)), { title: `${st.name}のイメージ` }));
}

// ---- スタイル詳細 ----

function renderStyle({ app, outlet, params }) {
  const st = app.styles.find((x) => x.id === params.id);
  if (!st) {
    outlet.replaceChildren(emptyState('スタイルが見つかりません。', h('a', { class: 'btn', href: '#/knowledge', text: '知識へ' })));
    return;
  }
  app.setTitle(st.name);
  const color = srmToHex(styleDisplaySrm(st));
  outlet.replaceChildren(
    h(
      'div',
      { class: 'knowledge-hero' },
      h('div', { class: 'knowledge-art' }, styleGlass(st)),
      h(
        'div',
        {},
        h('span', { class: 'tag', text: st.category }),
        h('h2', { class: 'knowledge-name', text: st.name }),
        h('p', { class: 'muted small', text: st.nameEn }),
        st.aliases.length ? h('p', { class: 'muted small', text: `別名：${st.aliases.join('、')}` }) : null,
      ),
    ),
    h('p', { class: 'knowledge-lead', text: st.summary }),
    section(
      '数値（代表的な目安）',
      h(
        'dl',
        { class: 'range-list' },
        rangeRow('度数 ABV', formatRange(st.abv, '%'), st.abv, 14),
        rangeRow('苦味 IBU', formatRange(st.ibu), st.ibu, 100),
        rangeRow('色 SRM', formatRange(st.srm), st.srm, 40, h('span', { class: 'swatch', style: `background:${color}`, title: '表示色の目安' })),
      ),
      st.rangeNote ? h('p', { class: 'small muted range-note', text: `出典による違い：${st.rangeNote}` }) : null,
      h('p', { class: 'small muted', text: '数値は出典に示された範囲をまとめた目安です。実際の銘柄はこの範囲に収まらないこともあります。' }),
    ),
    section('味わい', h('p', { text: st.flavor })),
    st.history ? section('歴史・由来', h('p', { text: st.history })) : null,
    st.glass ? section('よく使われるグラス', h('p', { text: GLASS_LABELS[st.glass] || st.glass })) : null,
    st.pairing.length ? section('合う料理の例', h('ul', { class: 'plain-list' }, st.pairing.map((p) => h('li', { text: p })))) : null,
    sourcesSection(st.sources),
  );
}

function rangeRow(label, text, range, max, extra = null) {
  return h(
    'div',
    { class: 'range-row' },
    h('dt', { text: label }),
    h('dd', {}, h('span', { class: 'range-text' }, text, extra), svg(rangeBarSvg(range, max))),
  );
}

function section(title, ...children) {
  return h('section', { class: 'panel' }, h('h3', { class: 'section-title', text: title }), ...children);
}

export function sourcesSection(sources) {
  return section(
    '参考',
    h(
      'ol',
      { class: 'sources' },
      sources.map((s) =>
        h(
          'li',
          {},
          h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.title }),
          h('span', { class: 'muted small', text: `（参照日 ${s.accessedAt.replaceAll('-', '/')}）` }),
        ),
      ),
    ),
    h('p', { class: 'small muted', text: '説明文は上記を参考に独自にまとめたものです。リンク先は外部サイトです。' }),
  );
}
