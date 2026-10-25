// イベント（#/events 一覧、#/event/:id 詳細）
import { h, emptyState, segmented, formatDate } from '../ui.js';
import {
  joinEvents,
  filterEvents,
  groupUpcoming,
  eventPhase,
  isStale,
  formatEventDates,
  otherEditions,
  localDateString,
  REGIONS,
  EVENT_KINDS,
  EVENT_STATUSES,
} from '../events.js';

const STORAGE_KEY = 'eventsState';
const DISCLAIMER = '開催情報は変わることがあります。お出かけ前に公式サイトで確認してください。';
let state = null; // 画面を移動しても絞り込みを保持する

function loadState() {
  if (state) return state;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return (state = { q: '', region: null, past: false, ...JSON.parse(raw) });
  } catch {
    /* 読めなければ初期値 */
  }
  return (state = { q: '', region: null, past: false });
}

function saveState(s) {
  state = s;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* 画面内では保持される */
  }
}

export async function render(ctx) {
  const data = await ctx.app.loadEvents();
  if (ctx.isStale()) return;
  if (!data) {
    ctx.outlet.replaceChildren(
      emptyState(
        'イベント情報を読み込めませんでした。電波のよい場所で開き直してください。',
        h('button', { type: 'button', class: 'btn', text: '再読み込み', onclick: () => ctx.app.refresh() }),
      ),
    );
    return;
  }
  const events = joinEvents(data);
  const today = localDateString();
  if (ctx.params.id) return renderDetail(ctx, events, today);
  return renderList(ctx, events, data.updatedAt, today);
}

// ---- 一覧 ----

function renderList({ outlet, query }, events, updatedAt, today) {
  let s = { ...loadState() };
  if (query.past !== undefined) s.past = query.past === '1';
  saveState(s);

  const update = (patch) => {
    s = { ...s, ...patch };
    saveState(s);
    renderBody();
  };
  const input = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'イベント名・会場・地名',
    value: s.q,
    'aria-label': 'キーワード',
    enterkeyhint: 'search',
    oninput: () => update({ q: input.value }),
  });
  const when = segmented({
    name: '時期',
    options: [
      { value: false, label: 'これから' },
      { value: true, label: '終了した' },
    ],
    value: s.past,
    onChange: (past) => update({ past }),
  });
  const regions = segmented({
    name: '地方',
    options: REGIONS.map((r) => ({ value: r.id, label: r.label })),
    value: s.region,
    allowEmpty: true,
    onChange: (region) => update({ region }),
  });
  const body = h('div', { class: 'events-body', 'aria-live': 'polite' });
  outlet.replaceChildren(
    h('div', { class: 'search-bar' }, input),
    h('div', { class: 'filter-group' }, when),
    h('div', { class: 'filter-group events-regions' }, regions),
    body,
    h('p', { class: 'small muted events-foot', text: `イベント情報：${formatDate(updatedAt)} 更新。${DISCLAIMER}` }),
  );
  renderBody();

  function renderBody() {
    const list = filterEvents(events, s, today);
    if (!list.length) {
      const msg = s.q || s.region ? '条件に合うイベントはありません。' : s.past ? '終了したイベントはまだありません。' : '予定されているイベントはまだありません。';
      return body.replaceChildren(emptyState(msg));
    }
    if (s.past) {
      return body.replaceChildren(h('p', { class: 'list-meta', text: `${list.length}件` }), cardList(list, today));
    }
    body.replaceChildren(
      h('p', { class: 'list-meta', text: `${list.length}件` }),
      ...groupUpcoming(list, today).flatMap((g) => [h('h2', { class: 'section-title', text: g.label }), cardList(g.events, today)]),
    );
  }
}

function cardList(list, today) {
  return h(
    'ul',
    { class: 'card-list' },
    list.map((e) =>
      h(
        'li',
        {},
        h(
          'a',
          { class: 'card card-text event-card', href: `#/event/${encodeURIComponent(e.id)}` },
          h(
            'div',
            { class: 'card-body' },
            h('div', { class: `card-title${e.status === 'cancelled' ? ' event-cancelled' : ''}`, text: e.name }),
            h('div', { class: 'card-meta', text: formatEventDates(e.startDate, e.endDate) }),
            h('div', { class: 'card-meta', text: [e.prefectureLabel, e.city, e.venue].filter(Boolean).join(' ') }),
            badges(e, today, 'card-foot'),
          ),
        ),
      ),
    ),
  );
}

/** 状態のバッジ（開催中・中止・延期・予告・情報が古い可能性） */
function badges(e, today, className) {
  const items = [];
  if (e.status !== 'scheduled') items.push(h('span', { class: 'badge badge-warn', text: EVENT_STATUSES[e.status] }));
  else if (eventPhase(e, today) === 'ongoing') items.push(h('span', { class: 'badge badge-live', text: '開催中' }));
  if (isStale(e, today)) items.push(h('span', { class: 'badge badge-warn', text: '情報が古い可能性' }));
  // 年だけの回（"2026"）は日程と重なるので出さない
  if (e.edition && !/^\d{4}$/.test(e.edition)) items.push(h('span', { text: e.edition }));
  return items.length ? h('div', { class: className }, items) : null;
}

// ---- 詳細 ----

function renderDetail({ app, outlet, params }, events, today) {
  const e = events.find((x) => x.id === params.id);
  if (!e) {
    outlet.replaceChildren(emptyState('イベントが見つかりません。', h('a', { class: 'btn', href: '#/events', text: 'イベント一覧へ' })));
    return;
  }
  app.setTitle(e.name);
  const row = (label, value) => (value ? h('div', { class: 'kv' }, h('span', { class: 'muted', text: label }), h('span', { text: value })) : null);
  const ext = (href, text, cls) => h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer', text });
  const others = otherEditions(events, e);

  outlet.replaceChildren(
    h(
      'section',
      { class: 'panel event-head' },
      h('h2', { class: `event-name${e.status === 'cancelled' ? ' event-cancelled' : ''}`, text: e.name }),
      badges(e, today, 'card-foot'),
      h('p', { class: 'event-dates', text: formatEventDates(e.startDate, e.endDate) }),
      e.note ? h('p', { class: 'small', text: e.note }) : null,
      ext(e.officialUrl, '公式サイトを開く', 'btn btn-primary btn-block'),
      e.ticketUrl ? ext(e.ticketUrl, 'チケット販売ページ', 'btn btn-block') : null,
    ),
    h(
      'section',
      { class: 'panel event-info' },
      h('h3', { class: 'section-title', text: '開催情報' }),
      row('時間', e.hours),
      row('会場', e.venue),
      row('場所', [e.prefectureLabel, e.city].filter(Boolean).join(' ')),
      row('料金', e.priceNote),
      row('種類', EVENT_KINDS[e.kind]),
      row('例年', e.usualPeriod),
      row('最終確認', formatDate(e.lastVerified)),
    ),
    others.length
      ? h(
          'section',
          { class: 'panel' },
          h('h3', { class: 'section-title', text: 'ほかの回' }),
          h(
            'ul',
            { class: 'card-list' },
            others.map((o) =>
              h(
                'li',
                {},
                h('a', { class: 'menu-item', href: `#/event/${encodeURIComponent(o.id)}` }, h('span', { text: o.edition || o.name }), h('span', { class: 'muted small', text: formatEventDates(o.startDate, o.endDate) })),
              ),
            ),
          ),
        )
      : null,
    h(
      'section',
      { class: 'panel' },
      h('h3', { class: 'section-title', text: '確認した情報源' }),
      h(
        'ol',
        { class: 'sources' },
        e.sources.map((s) =>
          h('li', {}, ext(s.url, s.title), h('span', { class: 'muted small', text: `（参照日 ${formatDate(s.accessedAt)}）` })),
        ),
      ),
      h('p', { class: 'small muted', text: `日程・会場などの事実を上記で確認して記載しています。リンク先は外部サイトです。${DISCLAIMER}` }),
    ),
  );
}
