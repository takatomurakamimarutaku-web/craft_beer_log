// イベント（#/events 一覧、#/event/:id 詳細）
import { h, emptyState, segmented, formatDate, starsView, showToast } from '../ui.js';
import { imageEntry } from '../knowledge.js';
import {
  joinEvents,
  filterEvents,
  groupUpcoming,
  eventPhase,
  isStale,
  formatEventDates,
  otherEditions,
  localDateString,
  defaultCheckinDate,
  buildIcs,
  REGIONS,
  EVENT_KINDS,
  EVENT_SCOPES,
  eventScope,
  collapseSeries,
  EVENT_STATUSES,
  PLAN_STATUSES,
} from '../events.js';
import { planSnapshot } from '../db.js';
import { compareCheckinsDesc } from '../models.js';

const STORAGE_KEY = 'eventsState';
const DISCLAIMER = '開催情報は変わることがあります。お出かけ前に公式サイトで確認してください。';
const INITIAL = { q: '', region: null, past: false, mine: false, scope: 'fes' };
let state = null; // 画面を移動しても絞り込みを保持する

function loadState() {
  if (state) return state;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return (state = { ...INITIAL, ...JSON.parse(raw) });
  } catch {
    /* 読めなければ初期値 */
  }
  return (state = { ...INITIAL });
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
  const [data, planList, images] = await Promise.all([
    ctx.app.loadEvents(),
    ctx.app.db.listEventPlans().catch(() => []),
    ctx.app.loadKnowledge().then((k) => k.images, () => ({})),
  ]);
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
  // 画像はシリーズの告知画像、無ければ関係する醸造所のロゴ
  const events = joinEvents(data).map((e) => ({ ...e, image: imageEntry(images, 'events', e.seriesId) || imageEntry(images, 'breweries', e.breweryIds[0]) }));
  const plans = new Map(planList.map((p) => [p.id, p]));
  const today = localDateString();
  if (ctx.params.id) return renderDetail(ctx, events, plans, today);
  return renderList(ctx, events, plans, data.updatedAt, today);
}

// ---- 一覧 ----

function renderList({ outlet, query }, events, plans, updatedAt, today) {
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
  const scope = segmented({
    name: '種類',
    options: Object.entries(EVENT_SCOPES).map(([value, label]) => ({ value, label })),
    value: s.scope,
    onChange: (v) => update({ scope: v }),
  });
  const mine = h('button', {
    type: 'button',
    class: 'chip',
    text: '自分の予定だけ',
    'aria-pressed': String(s.mine),
    onclick: () => {
      update({ mine: !s.mine });
      mine.setAttribute('aria-pressed', String(s.mine));
    },
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
    h('div', { class: 'filter-group events-scope' }, scope),
    h('div', { class: 'filter-group events-when' }, when, mine),
    h('div', { class: 'filter-group events-regions' }, regions),
    body,
    h('p', { class: 'small muted events-foot', text: `イベント情報：${formatDate(updatedAt)} 更新。${DISCLAIMER}` }),
  );
  renderBody();

  function renderBody() {
    let list = filterEvents(events, s, today);
    if (s.mine) list = list.filter((e) => plans.get(e.id)?.status);
    // お店・醸造所のこれからは、毎月の開催などを次の1回にまとめる
    if (s.scope === 'shop' && !s.past && !s.mine) list = collapseSeries(list);
    if (!list.length) {
      const msg = s.mine
        ? 'イベントの詳細で「行きたい」「行く」「行った」を選ぶと、ここに出ます。'
        : s.q || s.region
          ? '条件に合うイベントはありません。'
          : s.scope === 'shop'
            ? 'お店・醸造所のイベントは、ブリュワー情報に載っている醸造所が公式サイトで告知したものを月1回まとめて載せます。'
            : s.past
              ? '終了したイベントはまだありません。'
              : '予定されているイベントはまだありません。';
      return body.replaceChildren(emptyState(msg));
    }
    if (s.past) {
      return body.replaceChildren(h('p', { class: 'list-meta', text: `${list.length}件` }), cardList(list, plans, today));
    }
    body.replaceChildren(
      h('p', { class: 'list-meta', text: `${list.length}件` }),
      ...groupUpcoming(list, today).flatMap((g) => [h('h2', { class: 'section-title', text: g.label }), cardList(g.events, plans, today)]),
    );
  }
}

function cardList(list, plans, today) {
  return h(
    'ul',
    { class: 'card-list' },
    list.map((e) =>
      h(
        'li',
        {},
        h(
          'a',
          { class: `card event-card${e.image ? '' : ' card-text'}`, href: `#/event/${encodeURIComponent(e.id)}` },
          e.image ? h('div', { class: 'thumb' }, photo(e.image, 'event-thumb')) : null,
          h(
            'div',
            { class: 'card-body' },
            h('div', { class: `card-title${e.status === 'cancelled' ? ' event-cancelled' : ''}`, text: e.name }),
            h('div', { class: 'card-meta', text: formatEventDates(e.startDate, e.endDate) }),
            h('div', { class: 'card-meta', text: [e.prefectureLabel, e.city, e.venue].filter(Boolean).join(' ') }),
            badges(e, plans.get(e.id), today, 'card-foot'),
          ),
        ),
      ),
    ),
  );
}

/** 告知画像。読めないとき（オフラインで未取得など）は消す */
function photo(entry, cls) {
  const img = h('img', { src: entry.file, alt: '', loading: 'lazy', decoding: 'async', class: cls });
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

/** 状態のバッジ（参加状況・開催中・中止・延期・予告・情報が古い可能性） */
function badges(e, plan, today, className) {
  const items = [];
  if (plan?.status) items.push(h('span', { class: 'badge badge-plan', text: PLAN_STATUSES[plan.status] }));
  if (e.status !== 'scheduled') items.push(h('span', { class: 'badge badge-warn', text: EVENT_STATUSES[e.status] }));
  else if (eventPhase(e, today) === 'ongoing') items.push(h('span', { class: 'badge badge-live', text: '開催中' }));
  if (isStale(e, today)) items.push(h('span', { class: 'badge badge-warn', text: '情報が古い可能性' }));
  if (eventScope(e) === 'shop') items.push(h('span', { text: EVENT_KINDS[e.kind] }));
  // 年だけの回（"2026"）は日程と重なるので出さない
  if (e.edition && !/^\d{4}$/.test(e.edition)) items.push(h('span', { text: e.edition }));
  if (e.moreCount) items.push(h('span', { text: `ほか${e.moreCount}回` }));
  return items.length ? h('div', { class: className }, items) : null;
}

// ---- 詳細 ----

async function renderDetail({ app, outlet, params, isStale: stale }, events, plans, today) {
  const e = events.find((x) => x.id === params.id);
  if (!e) {
    outlet.replaceChildren(emptyState('イベントが見つかりません。', h('a', { class: 'btn', href: '#/events', text: 'イベント一覧へ' })));
    return;
  }
  const [checkins, beers, breweries] = await Promise.all([
    app.db.listCheckins(),
    app.db.listBeers(),
    e.breweryIds.length ? app.loadBreweries().catch(() => null) : null,
  ]);
  if (stale()) return;
  const relatedBreweries = e.breweryIds.map((id) => breweries?.index.byId.get(id)).filter(Boolean);
  const mine = checkins.filter((c) => c.place?.eventId === e.id).sort(compareCheckinsDesc);
  const beerById = new Map(beers.map((b) => [b.id, b]));

  app.setTitle(e.name);
  let plan = plans.get(e.id) || { ...planSnapshot(e), status: null, memo: '' };
  const savePlan = async (patch) => {
    plan = { ...plan, ...planSnapshot(e), ...patch };
    try {
      await app.db.saveEventPlan(plan);
    } catch (err) {
      console.error(err);
      showToast('保存できませんでした');
    }
  };

  const row = (label, value) => (value ? h('div', { class: 'kv' }, h('span', { class: 'muted', text: label }), h('span', { text: value })) : null);
  const ext = (href, text, cls) => h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer', text });
  const others = otherEditions(events, e);
  const memo = h('textarea', {
    id: 'event-memo',
    rows: 2,
    value: plan.memo || '',
    placeholder: '待ち合わせ・飲みたいブルワリーなど',
    onchange: () => savePlan({ memo: memo.value }),
  });

  // replaceChildren は null を文字列にするので、出さない部分は除いて渡す
  const sections = [
    h(
      'section',
      { class: 'panel event-head' },
      e.image ? h('div', { class: 'event-hero' }, photo(e.image, 'event-hero-img')) : null,
      e.image ? h('p', { class: 'small muted image-note', text: '画像：公式サイトより（権利未確認・テスト用）' }) : null,
      h('h2', { class: `event-name${e.status === 'cancelled' ? ' event-cancelled' : ''}`, text: e.name }),
      badges(e, null, today, 'card-foot'),
      h('p', { class: 'event-dates', text: formatEventDates(e.startDate, e.endDate) }),
      e.note ? h('p', { class: 'small', text: e.note }) : null,
      ext(e.officialUrl, '公式サイトを開く', 'btn btn-primary btn-block'),
      e.ticketUrl ? ext(e.ticketUrl, 'チケット販売ページ', 'btn btn-block') : null,
    ),
    h(
      'section',
      { class: 'panel' },
      h('h3', { class: 'section-title', text: '自分の予定' }),
      segmented({
        name: '参加状況',
        options: Object.entries(PLAN_STATUSES).map(([value, label]) => ({ value, label })),
        value: plan.status,
        allowEmpty: true,
        onChange: (status) => savePlan({ status }),
      }),
      h('label', { class: 'field-label event-memo-label', for: 'event-memo', text: 'メモ' }),
      memo,
      eventPhase(e, today) !== 'past'
        ? h('button', { type: 'button', class: 'btn btn-block', text: 'カレンダーに追加', onclick: () => downloadIcs(e) })
        : null,
    ),
    h(
      'section',
      { class: 'panel' },
      h('h3', { class: 'section-title', text: mine.length ? `このイベントで飲んだ記録（${mine.length}杯）` : 'このイベントで飲んだ記録' }),
      mine.length
        ? h(
            'ul',
            { class: 'history' },
            mine.map((c) => {
              const beer = beerById.get(c.beerId);
              return h(
                'li',
                {},
                h(
                  'a',
                  { class: 'menu-item', href: `#/beer/${encodeURIComponent(c.beerId)}` },
                  h('span', { text: beer?.name || '（削除された銘柄）' }),
                  h('span', { class: 'muted small' }, typeof c.rating === 'number' ? starsView(c.rating) : null, ` ${formatDate(c.date)}`),
                ),
              );
            }),
          )
        : h('p', { class: 'small muted', text: '記録の登録画面で、このイベントを選ぶとここに並びます。' }),
      e.status !== 'cancelled'
        ? h('a', {
            class: 'btn btn-block',
            href: `#/checkin/new?eventId=${encodeURIComponent(e.id)}&date=${defaultCheckinDate(e, today)}`,
            text: '＋ このイベントで飲んだビールを記録',
          })
        : null,
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
    relatedBreweries.length
      ? h(
          'section',
          { class: 'panel' },
          h('h3', { class: 'section-title', text: '関係するブリュワー' }),
          h(
            'ul',
            { class: 'card-list' },
            relatedBreweries.map((b) => h('li', {}, h('a', { class: 'menu-item', href: `#/brewery/${encodeURIComponent(b.id)}` }, h('span', { text: b.name }), h('span', { class: 'muted small', text: b.city || '' })))),
          ),
        )
      : null,
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
  ];
  outlet.replaceChildren(...sections.filter(Boolean));
}

/** .ics を書き出す。iPhone では開くとカレンダーへの追加画面になる */
function downloadIcs(event) {
  const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `${event.id}.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
