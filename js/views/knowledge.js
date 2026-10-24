// 知識（#/knowledge 一覧、#/knowledge/style/:id など詳細）
import { h, svg, emptyState, chipGroup, formatDate, stars } from '../ui.js';
import { searchKnowledge, styleTexts, termTexts, hopTexts, filterByTags, HOP_USE_LABELS, srmToHex, styleDisplaySrm, formatRange, GLASS_LABELS } from '../knowledge.js';
import { buildBeerSummaries, sortSummaries } from '../search.js';
import { matchByFlavorTags } from '../tasting.js';
import { glassSvg, rangeBarSvg, ibuScaleSvg, srmScaleSvg, hopConeSvg } from '../illust.js';

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
    if (raw) return (state = { tab: 'styles', q: '', tags: [], ...JSON.parse(raw) });
  } catch {
    /* 読めなければ初期値 */
  }
  return (state = { tab: 'styles', q: '', tags: [] });
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
  const data = await ctx.app.loadKnowledge();
  if (ctx.isStale()) return;
  if (route.kind === 'term') return renderTerm(ctx, data);
  if (route.kind === 'hop') return renderHop(ctx, data);
  return renderList(ctx, data);
}

function renderList({ app, outlet, query }, data) {
  let s = { ...loadState() };
  if (query.tab && TABS.some((t) => t.value === query.tab)) s.tab = query.tab;
  // #/knowledge?tab=hops&tag=citrus のように香りタグを指定して開ける
  if (query.tag) s.tags = query.tag.split(',').filter((t) => data.flavorTags.some((x) => x.id === t));
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
    if (s.tab === 'terms') return body.replaceChildren(...termList(data.terms, s.q));
    body.replaceChildren(...hopList(data, s, (tags) => {
      s = { ...s, tags };
      saveState(s);
      renderBody();
    }));
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

function termList(terms, q) {
  const items = searchKnowledge(terms, q, termTexts);
  if (!items.length) return [h('p', { class: 'list-meta', text: '該当する用語がありません。' })];
  return [
    h('p', { class: 'list-meta', text: `${items.length}件` }),
    h(
      'ul',
      { class: 'card-list' },
      items.map((t) =>
        h(
          'li',
          {},
          h(
            'a',
            { class: 'card card-text', href: `#/knowledge/term/${encodeURIComponent(t.id)}` },
            h(
              'div',
              { class: 'card-body' },
              h('div', { class: 'card-title' }, t.name, h('span', { class: 'muted small term-full', text: t.fullName })),
              h('div', { class: 'term-summary', text: t.summary }),
            ),
          ),
        ),
      ),
    ),
  ];
}

function hopList({ hops, flavorTags }, s, onTags) {
  // ホップに使われているタグだけを選択肢にする
  const used = new Set(hops.flatMap((x) => x.flavorTags));
  const filter = h(
    'div',
    { class: 'tag-filter' },
    h('p', { class: 'small muted', text: '香りで絞り込む（選んだタグをすべて持つホップ）' }),
    chipGroup({
      label: '香りタグ',
      options: flavorTags.filter((t) => used.has(t.id)).map((t) => ({ value: t.id, label: t.label })),
      values: s.tags,
      onChange: onTags,
    }),
  );
  const items = filterByTags(searchKnowledge(hops, s.q, hopTexts), s.tags);
  const labelOf = tagLabeler(flavorTags);
  return [
    filter,
    h('p', { class: 'list-meta', text: `${items.length}件` }),
    items.length
      ? h(
          'ul',
          { class: 'card-list' },
          items.map((x) =>
            h(
              'li',
              {},
              h(
                'a',
                { class: 'card', href: `#/knowledge/hop/${encodeURIComponent(x.id)}` },
                h('div', { class: 'thumb knowledge-thumb' }, svg(hopConeSvg({ title: x.name }))),
                h(
                  'div',
                  { class: 'card-body' },
                  h('div', { class: 'card-title', text: x.name }),
                  h('div', { class: 'card-meta', text: `${x.nameEn}・${x.origin}${x.use ? `・${HOP_USE_LABELS[x.use]}` : ''}` }),
                  h('div', { class: 'card-foot', text: x.flavorTags.map(labelOf).join('・') }),
                ),
              ),
            ),
          ),
        )
      : h('p', { class: 'list-meta', text: '条件に合うホップがありません。' }),
  ];
}

function tagLabeler(flavorTags) {
  const map = new Map(flavorTags.map((t) => [t.id, t.label]));
  return (id) => map.get(id) || id;
}

function styleGlass(st) {
  return svg(glassSvg(st.glass, srmToHex(styleDisplaySrm(st)), { title: `${st.name}のイメージ` }));
}

// ---- スタイル詳細 ----

async function renderStyle({ app, outlet, params, isStale }) {
  const st = app.styles.find((x) => x.id === params.id);
  const [beers, checkins] = st ? await Promise.all([app.db.listBeersByStatus('tried'), app.db.listCheckins()]) : [[], []];
  if (isStale()) return;
  if (!st) {
    outlet.replaceChildren(emptyState('スタイルが見つかりません。', h('a', { class: 'btn', href: '#/knowledge', text: '知識へ' })));
    return;
  }
  app.setTitle(st.name);
  const color = srmToHex(styleDisplaySrm(st));
  fill(outlet,
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
    myStyleRecords(st, beers, checkins),
    sourcesSection(st.sources),
  );
}

// ---- 用語詳細 ----

const IBU_EXAMPLES = ['berliner-weisse', 'weizen', 'helles', 'pilsner', 'pale-ale', 'stout', 'ipa', 'double-ipa'];
const SRM_EXAMPLES = ['pilsner', 'weizen', 'pale-ale', 'amber-ale', 'brown-ale', 'porter', 'stout'];

function pickStyles(styles, ids) {
  return ids.map((id) => styles.find((s) => s.id === id)).filter(Boolean);
}

function renderTerm({ app, outlet, params }, { terms }) {
  const t = terms.find((x) => x.id === params.id);
  if (!t) {
    outlet.replaceChildren(emptyState('用語が見つかりません。', h('a', { class: 'btn', href: '#/knowledge', text: '知識へ' })));
    return;
  }
  app.setTitle(t.name);
  let scale = null;
  if (t.scale === 'ibu') {
    scale = section('スタイルごとの目安', svg(ibuScaleSvg(pickStyles(app.styles, IBU_EXAMPLES))), scaleNote());
  } else if (t.scale === 'srm') {
    scale = section('色の見本とスタイルごとの目安', svg(srmScaleSvg(pickStyles(app.styles, SRM_EXAMPLES), srmToHex)), scaleNote('色は画面表示用の近似です。'));
  }
  const related = pickStyles(app.styles, t.relatedStyles);
  fill(outlet,
    h('div', { class: 'term-hero' }, h('h2', { class: 'knowledge-name', text: t.name }), h('p', { class: 'muted', text: t.fullName })),
    h('p', { class: 'knowledge-lead', text: t.summary }),
    section('くわしく', ...t.body.map((p) => h('p', { class: 'para', text: p }))),
    scale,
    related.length
      ? section('関連するスタイル', h('div', { class: 'chips' }, related.map((s) => h('a', { class: 'chip', href: `#/knowledge/style/${encodeURIComponent(s.id)}`, text: s.name }))))
      : null,
    sourcesSection(t.sources),
  );
}

// ---- ホップ詳細 ----

async function renderHop({ app, outlet, params, isStale }, { hops, flavorTags }) {
  const x = hops.find((y) => y.id === params.id);
  const [beers, checkins] = x ? await Promise.all([app.db.listBeers(), app.db.listCheckins()]) : [[], []];
  if (isStale()) return;
  if (!x) {
    outlet.replaceChildren(emptyState('ホップが見つかりません。', h('a', { class: 'btn', href: '#/knowledge?tab=hops', text: 'ホップ一覧へ' })));
    return;
  }
  app.setTitle(x.name);
  const labelOf = tagLabeler(flavorTags);
  const linked = new Map(pickStyles(app.styles, x.styleIds).map((s) => [s.id, s]));
  fill(
    outlet,
    h(
      'div',
      { class: 'knowledge-hero' },
      h('div', { class: 'knowledge-art' }, svg(hopConeSvg({ title: `${x.name}のイメージ` }))),
      h(
        'div',
        {},
        h('span', { class: 'tag', text: x.origin }),
        h('h2', { class: 'knowledge-name', text: x.name }),
        h('p', { class: 'muted small', text: x.nameEn }),
        x.aliases.length ? h('p', { class: 'muted small', text: `別名：${x.aliases.join('、')}` }) : null,
      ),
    ),
    h('p', { class: 'knowledge-lead', text: x.aroma }),
    section(
      '特徴（代表的な目安）',
      h(
        'dl',
        { class: 'range-list' },
        h('div', { class: 'range-row' }, h('dt', { text: '用途' }), h('dd', { text: x.use ? HOP_USE_LABELS[x.use] : '出典に明記なし' })),
        rangeRow('α酸', formatRange(x.alpha, '%'), x.alpha, 20),
        h('div', { class: 'range-row' }, h('dt', { text: '由来' }), h('dd', { class: 'small', text: x.originNote })),
      ),
      h('p', { class: 'small muted', text: 'α酸は苦味のもとになる成分で、多いほど苦味づけの効率が高くなります。値は収穫年によって変わります。' }),
    ),
    section(
      '香りタグ',
      h(
        'div',
        { class: 'chips hop-tags' },
        x.flavorTags.map((t) => h('a', { class: 'chip', href: `#/knowledge?tab=hops&tag=${encodeURIComponent(t)}`, text: labelOf(t) })),
      ),
      h('p', { class: 'small muted', text: 'タグをタップすると、同じ香りのホップを探せます。' }),
    ),
    section(
      'よく使われるスタイル',
      x.styles.length
        ? h(
            'ul',
            { class: 'plain-list' },
            x.styles.map((name) => h('li', { text: name })),
          )
        : h('p', { class: 'muted', text: '確認した出典には記載がありませんでした。' }),
      linked.size
        ? h('div', { class: 'chips' }, [...linked.values()].map((s) => h('a', { class: 'chip', href: `#/knowledge/style/${encodeURIComponent(s.id)}`, text: `${s.name}の解説` })))
        : null,
    ),
    myHopRecords(x, beers, checkins, labelOf),
    x.note ? section('出典による違い・補足', h('p', { class: 'small', text: x.note })) : null,
    sourcesSection(x.sources),
  );
}

// ---- 自分の記録との連携（Phase 5） ----

const MY_LIMIT = 20;

/** このスタイルの自分の記録（銘柄ごと、最近飲んだ順） */
function myStyleRecords(st, beers, checkins) {
  const mine = beers.filter((b) => b.styleId === st.id);
  const summaries = sortSummaries(buildBeerSummaries(mine, checkins), 'lastDate', 'desc');
  const body = summaries.length
    ? h(
        'ul',
        { class: 'card-list my-records' },
        summaries.slice(0, MY_LIMIT).map((s) =>
          h(
            'li',
            {},
            h(
              'a',
              { class: 'card card-text', href: `#/beer/${encodeURIComponent(s.beer.id)}` },
              h(
                'div',
                { class: 'card-body' },
                h('div', { class: 'card-title', text: s.beer.name }),
                h('div', { class: 'card-meta', text: [s.beer.brewery, s.lastDate ? `最終 ${formatDate(s.lastDate)}` : '', `${s.count}回`].filter(Boolean).join(' · ') }),
                s.avgRating !== null ? h('div', { class: 'card-foot', text: `${stars(s.avgRating)} ${s.avgRating.toFixed(1)}` }) : null,
              ),
            ),
          ),
        ),
      )
    : h('p', { class: 'muted', text: 'このスタイルの記録はまだありません。' });
  return section(`このスタイルの自分の記録${summaries.length ? `（${summaries.length}銘柄）` : ''}`, body, more(summaries.length));
}

/** このホップと同じ香りタグを付けた自分の記録 */
function myHopRecords(x, beers, checkins, labelOf) {
  const byId = new Map(beers.map((b) => [b.id, b]));
  const hits = matchByFlavorTags(checkins, x.flavorTags).filter((m) => byId.has(m.checkin.beerId));
  const body = hits.length
    ? h(
        'ul',
        { class: 'card-list my-records' },
        hits.slice(0, MY_LIMIT).map(({ checkin, matched }) => {
          const b = byId.get(checkin.beerId);
          return h(
            'li',
            {},
            h(
              'a',
              { class: 'card card-text', href: `#/beer/${encodeURIComponent(b.id)}` },
              h(
                'div',
                { class: 'card-body' },
                h('div', { class: 'card-title', text: b.name }),
                h('div', { class: 'card-meta', text: [formatDate(checkin.date), b.brewery].filter(Boolean).join(' · ') }),
                h('div', { class: 'card-foot', text: `共通の香り：${matched.map(labelOf).join('・')}` }),
              ),
            ),
          );
        }),
      )
    : h('p', { class: 'muted', text: '同じ香りタグを付けた記録はまだありません。記録のテイスティングで香りタグを選ぶと、ここに表示されます。' });
  return section('同じ香りタグの自分の記録', body, more(hits.length));
}

function more(n) {
  return n > MY_LIMIT ? h('p', { class: 'small muted', text: `ほか${n - MY_LIMIT}件` }) : null;
}

function scaleNote(extra = '') {
  return h('p', { class: 'small muted', text: `バーは「スタイル」に掲載している代表的な目安の範囲です。${extra}` });
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

/** null の項目（該当データが無いセクション）を除いて表示する */
function fill(outlet, ...children) {
  outlet.replaceChildren(...children.filter(Boolean));
}
