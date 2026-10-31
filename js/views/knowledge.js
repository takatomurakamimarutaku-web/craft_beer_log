// 知識（#/knowledge 一覧、#/knowledge/style/:id など詳細）
import { h, svg, emptyState, chipGroup, formatDate, stars } from '../ui.js';
import { searchKnowledge, basicTexts, styleTexts, termTexts, hopTexts, filterByTags, HOP_USE_LABELS, srmToHex, styleDisplaySrm, formatRange, GLASS_LABELS, imageEntry, imageCaption, servingTemp } from '../knowledge.js';
import { buildBeerSummaries, sortSummaries } from '../search.js';
import { matchByFlavorTags } from '../tasting.js';
import { glassSvg, rangeBarSvg, ibuScaleSvg, srmScaleSvg, hopArtSvg } from '../illust.js';

const TABS = [
  { value: 'basics', label: 'はじめに' },
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
    if (raw) return (state = { tab: 'basics', q: '', tags: [], ...JSON.parse(raw) });
  } catch {
    /* 読めなければ初期値 */
  }
  return (state = { tab: 'basics', q: '', tags: [] });
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
  const data = await ctx.app.loadKnowledge();
  if (ctx.isStale()) return;
  if (route.kind === 'style') return renderStyle(ctx, data);
  if (route.kind === 'basic') return renderBasic(ctx, data);
  if (route.kind === 'term') return renderTerm(ctx, data);
  if (route.kind === 'hop') return renderHop(ctx, data);
  if (route.kind === 'flight') return renderFlight(ctx, data);
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
    if (s.tab === 'basics') return body.replaceChildren(...basicList(data.basics, s.q, data.images));
    if (s.tab === 'styles') return body.replaceChildren(...(s.q ? [] : flightRow(data.flights, app.styles)), ...styleList(app.styles, s.q, data.images));
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

function basicList(basics, q, images) {
  const items = searchKnowledge(basics, q, basicTexts);
  if (!items.length) return [h('p', { class: 'list-meta', text: '該当する記事がありません。' })];
  return [
    q ? h('p', { class: 'list-meta', text: `${items.length}件` }) : h('p', { class: 'list-meta', text: 'クラフトビールをはじめて楽しむ人向けの入門です。上から順に読むのがおすすめです。' }),
    h(
      'ol',
      { class: 'card-list basics-list' },
      items.map((a) =>
        h(
          'li',
          {},
          h(
            'a',
            { class: imageEntry(images, 'basics', a.id) ? 'card' : 'card card-text', href: `#/knowledge/basic/${encodeURIComponent(a.id)}` },
            imageEntry(images, 'basics', a.id) ? h('div', { class: 'thumb knowledge-thumb' }, artwork(imageEntry(images, 'basics', a.id), () => h('span'), '')) : null,
            h(
              'div',
              { class: 'card-body' },
              h('div', { class: 'card-title' }, h('span', { class: 'basic-no', 'aria-hidden': 'true', text: String(basics.indexOf(a) + 1) }), a.name),
              h('div', { class: 'term-summary', text: a.summary }),
            ),
          ),
        ),
      ),
    ),
  ];
}

function styleList(styles, q, images) {
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
              h('div', { class: 'thumb knowledge-thumb' }, artwork(imageEntry(images, 'styles', st.id), () => styleGlass(st), '')),
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

function hopList({ hops, flavorTags, images }, s, onTags) {
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
                h('div', { class: 'thumb knowledge-thumb' }, artwork(imageEntry(images, 'hops', x.id), () => svg(hopArtSvg({ flavorTags: x.flavorTags, title: x.name })), '')),
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

/** 画像があれば写真、無ければイラスト（fallback）を返す */
function artwork(entry, fallback, alt) {
  if (!entry) return fallback();
  const img = h('img', { src: entry.file, alt, loading: 'lazy', decoding: 'async', class: 'knowledge-photo' });
  // 画像が読めない（オフラインで未取得など）ときはイラストに戻す
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

/** 詳細画面の画像の表記（AI生成の注記・クレジット） */
function imageNote(entry) {
  const text = imageCaption(entry);
  if (!text) return null;
  return h('p', { class: 'small muted image-note' }, text, entry.sourceUrl ? [' ', h('a', { href: entry.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: '出典' })] : null);
}

function styleGlass(st) {
  return svg(glassSvg(st.glass, srmToHex(styleDisplaySrm(st)), { title: `${st.name}のイメージ` }));
}

// ---- スタイル詳細 ----

async function renderStyle({ app, outlet, params, isStale }, { images }) {
  const st = app.styles.find((x) => x.id === params.id);
  const [beers, checkins] = st ? await Promise.all([app.db.listBeersByStatus('tried'), app.db.listCheckins()]) : [[], []];
  if (isStale()) return;
  if (!st) {
    outlet.replaceChildren(emptyState('スタイルが見つかりません。', h('a', { class: 'btn', href: '#/knowledge', text: '知識へ' })));
    return;
  }
  app.setTitle(st.name);
  const color = srmToHex(styleDisplaySrm(st));
  const photo = imageEntry(images, 'styles', st.id);
  fill(outlet,
    h(
      'div',
      { class: 'knowledge-hero' },
      h('div', { class: `knowledge-art${photo ? ' has-photo' : ''}` }, artwork(photo, () => styleGlass(st), `${st.name}のイメージ`)),
      h(
        'div',
        {},
        h('span', { class: 'tag', text: st.category }),
        h('h2', { class: 'knowledge-name', text: st.name }),
        h('p', { class: 'muted small', text: st.nameEn }),
        st.aliases.length ? h('p', { class: 'muted small', text: `別名：${st.aliases.join('、')}` }) : null,
      ),
    ),
    imageNote(photo),
    h('p', { class: 'knowledge-lead', text: st.summary }),
    serveCard(st, color),
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
    myStyleRecords(st, beers, checkins),
    sourcesSection(st.sources),
  );
}

/** おいしい飲みかた：適温・グラス・合う料理をひと目で */
function serveCard(st, color) {
  const temp = servingTemp(st);
  const tile = (label, icon, value, sub) =>
    h('div', { class: 'serve-tile' }, h('span', { class: 'serve-icon', 'aria-hidden': 'true' }, icon), h('span', { class: 'serve-label', text: label }), h('strong', { class: 'serve-value', text: value }), sub ? h('span', { class: 'serve-sub', text: sub }) : null);
  return h(
    'section',
    { class: 'panel serve-card' },
    h('h3', { class: 'section-title', text: 'おいしい飲みかた' }),
    h(
      'div',
      { class: 'serve-grid' },
      tile('適温', svg(THERMO_SVG), temp ? `${temp.min}〜${temp.max}℃` : '銘柄による', temp ? temp.hint : '造りで変わります'),
      tile('グラス', svg(glassSvg(st.glass, color)), st.glass ? GLASS_LABELS[st.glass] || st.glass : '好みのグラスで', null),
    ),
    st.pairing.length
      ? h('div', { class: 'serve-pairing' }, h('span', { class: 'serve-label', text: '合う料理' }), h('div', { class: 'chips' }, ...st.pairing.map((p) => h('span', { class: 'chip chip-static', text: p }))))
      : null,
    temp ? h('p', { class: 'small muted', text: '適温は CraftBeer.com の目安（華氏）を摂氏に換算しています。' }) : null,
  );
}

const THERMO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/><circle cx="12" cy="17" r="1.6" fill="currentColor"/></svg>';

// ---- 飲み比べセット ----

/** スタイル一覧の上に出す、飲み比べセットの横並び */
function flightRow(flights, styles) {
  if (!flights?.length) return [];
  const byId = new Map(styles.map((s) => [s.id, s]));
  return [
    h('h2', { class: 'section-title', text: '飲み比べセット' }),
    h(
      'ul',
      { class: 'flight-row' },
      ...flights.map((f) =>
        h(
          'li',
          {},
          h(
            'a',
            { class: 'flight-card', href: `#/knowledge/flight/${encodeURIComponent(f.id)}` },
            h(
              'span',
              { class: 'flight-glasses', 'aria-hidden': 'true' },
              ...f.items.map((i) => byId.get(i.styleId)).filter(Boolean).map((st) => svg(glassSvg(st.glass, srmToHex(styleDisplaySrm(st))))),
            ),
            h('strong', { class: 'flight-title', text: f.title }),
            h('span', { class: 'flight-count', text: `${f.items.length}種類` }),
          ),
        ),
      ),
    ),
  ];
}

async function renderFlight({ app, outlet, params, isStale }, { flights, images }) {
  const f = flights.find((x) => x.id === params.id);
  const [beers, checkins] = f ? await Promise.all([app.db.listBeers(), app.db.listCheckins()]) : [[], []];
  if (isStale()) return;
  if (!f) {
    outlet.replaceChildren(emptyState('飲み比べセットが見つかりません。', h('a', { class: 'btn', href: '#/knowledge?tab=styles', text: 'スタイルへ' })));
    return;
  }
  app.setTitle(f.title);
  const styleOf = new Map(beers.map((b) => [b.id, b.styleId]));
  const tried = new Set(checkins.map((c) => styleOf.get(c.beerId)).filter(Boolean));
  const byId = new Map(app.styles.map((s) => [s.id, s]));
  const rows = f.items.map((i) => ({ ...i, st: byId.get(i.styleId) })).filter((i) => i.st);
  const done = rows.filter((r) => tried.has(r.st.id)).length;
  fill(
    outlet,
    h(
      'div',
      { class: 'term-hero' },
      h('span', { class: 'tag', text: `飲み比べ ${rows.length}種類` }),
      h('h2', { class: 'knowledge-name', text: f.title }),
    ),
    h('p', { class: 'knowledge-lead', text: f.lead }),
    h('p', { class: 'list-meta', text: done ? `このうち ${done} / ${rows.length} 種類を記録済みです。` : 'まだどれも記録していません。' }),
    h(
      'ol',
      { class: 'flight-steps' },
      ...rows.map((r, i) =>
        h(
          'li',
          {},
          h(
            'a',
            { class: 'flight-step', href: `#/knowledge/style/${encodeURIComponent(r.st.id)}` },
            h('span', { class: 'flight-no', 'aria-hidden': 'true', text: String(i + 1) }),
            h('span', { class: 'flight-art' }, artwork(imageEntry(images, 'styles', r.st.id), () => styleGlass(r.st), '')),
            h(
              'span',
              { class: 'flight-body' },
              h('strong', { text: r.st.name }),
              h('span', { class: 'flight-point', text: r.point }),
              h('span', { class: 'flight-meta', text: `度数 ${formatRange(r.st.abv, '%')}・苦味 IBU ${formatRange(r.st.ibu)}` }),
            ),
            tried.has(r.st.id) ? h('span', { class: 'flight-done', text: '記録済み' }) : null,
          ),
        ),
      ),
    ),
    section(
      '飲み比べのコツ',
      h(
        'ul',
        { class: 'plain-list' },
        h('li', { text: '小さいグラス（テイスターサイズ）で頼むと、少ない量でいくつも比べられます。' }),
        h('li', { text: '上から順に、軽いもの・淡いものから飲むと、あとのビールの味が分かりやすくなります。' }),
        h('li', { text: '合間に水を飲むと、口の中がリセットされて違いが分かりやすく、飲みすぎも防げます。' }),
      ),
    ),
  );
}

// ---- 入門（はじめに）詳細 ----

function renderBasic({ app, outlet, params }, { basics, terms, hops, images }) {
  const i = basics.findIndex((x) => x.id === params.id);
  const a = basics[i];
  if (!a) {
    outlet.replaceChildren(emptyState('記事が見つかりません。', h('a', { class: 'btn', href: '#/knowledge?tab=basics', text: '入門の一覧へ' })));
    return;
  }
  app.setTitle(a.name);
  const sections = a.sections.map((sec) => section(sec.heading, ...sec.body.map((p) => h('p', { class: 'para', text: p }))));
  // 工程・比較表は本文の途中（既定は最初の節の後）に差し込む
  const insert = (index, el) => el && sections.splice(Math.min(index + 1, sections.length), 0, el);
  insert(a.compare?.insertAfter ?? 0, a.compare ? section('違いを比べる', compareTable(a.compare), a.compare.note ? h('p', { class: 'small muted', text: a.compare.note }) : null) : null);
  insert(0, a.steps ? section('工程の流れ', stepList(a.steps)) : null);
  const next = basics[i + 1];
  const photo = imageEntry(images, 'basics', a.id);
  fill(
    outlet,
    photo ? h('div', { class: 'basic-hero' }, artwork(photo, () => h('span'), a.name)) : null,
    photo ? imageNote(photo) : null,
    h('div', { class: 'term-hero' }, h('span', { class: 'tag', text: `入門 ${i + 1} / ${basics.length}` }), h('h2', { class: 'knowledge-name', text: a.name })),
    h('p', { class: 'knowledge-lead', text: a.summary }),
    ...sections,
    relatedSection(a, { styles: app.styles, terms, hops, basics }),
    next ? h('a', { class: 'btn btn-block basic-next', href: `#/knowledge/basic/${encodeURIComponent(next.id)}`, text: `次に読む：${next.name}` }) : null,
    sourcesSection(a.sources),
  );
}

function stepList(steps) {
  return h(
    'ol',
    { class: 'steps' },
    steps.map((st) => h('li', { class: 'step' }, h('strong', { class: 'step-name', text: st.name }), h('p', { class: 'small', text: st.text }))),
  );
}

function compareTable({ columns, rows }) {
  return h(
    'div',
    { class: 'table-scroll' },
    h(
      'table',
      { class: 'compare-table' },
      h('thead', {}, h('tr', {}, columns.map((c, k) => h('th', { scope: 'col', text: c, 'aria-label': k === 0 && !c ? '項目' : null })))),
      h('tbody', {}, rows.map(([head, ...cells]) => h('tr', {}, h('th', { scope: 'row', text: head }), cells.map((c) => h('td', { text: c }))))),
    ),
  );
}

/** 関連するスタイル・用語・ホップ・入門記事へのリンク（存在するものだけ） */
function relatedSection(a, { styles, terms, hops, basics }) {
  const links = [
    ...pickById(basics, a.relatedBasics).map((x) => ['basic', x]),
    ...pickById(styles, a.relatedStyles).map((x) => ['style', x]),
    ...pickById(terms, a.relatedTerms).map((x) => ['term', x]),
    ...pickById(hops, a.relatedHops).map((x) => ['hop', x]),
  ];
  if (!links.length) return null;
  return section(
    'あわせて読む',
    h('div', { class: 'chips' }, links.map(([kind, x]) => h('a', { class: 'chip', href: `#/knowledge/${kind}/${encodeURIComponent(x.id)}`, text: x.name }))),
  );
}

function pickById(list, ids = []) {
  return ids.map((id) => list.find((x) => x.id === id)).filter(Boolean);
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

async function renderHop({ app, outlet, params, isStale }, { hops, flavorTags, images }) {
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
  const photo = imageEntry(images, 'hops', x.id);
  fill(
    outlet,
    h(
      'div',
      { class: 'knowledge-hero' },
      h('div', { class: `knowledge-art${photo ? ' has-photo' : ''}` }, artwork(photo, () => svg(hopArtSvg({ flavorTags: x.flavorTags, title: `${x.name}のイメージ` })), `${x.name}のイメージ`)),
      h(
        'div',
        {},
        h('span', { class: 'tag', text: x.origin }),
        h('h2', { class: 'knowledge-name', text: x.name }),
        h('p', { class: 'muted small', text: x.nameEn }),
        x.aliases.length ? h('p', { class: 'muted small', text: `別名：${x.aliases.join('、')}` }) : null,
      ),
    ),
    imageNote(photo),
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
