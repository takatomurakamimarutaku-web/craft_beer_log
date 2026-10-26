// ブリュワーの詳細（#/brewery/:id）
import { h, formatDate, showToast } from '../ui.js';
import { todayString, createBeer } from '../models.js';
import { normalize } from '../search.js';
import { errorText } from '../errors.js';
import { PREFS, KIND_LABELS, FEATURE_LABELS, AVAILABILITY, VERIFICATION_LABELS, LINK_LABELS, addressText, isSafeUrl, groupBeersByBrewery, makeBreweryNote } from '../breweries.js';
import { creditNote } from './breweries.js';
import { joinEvents, eventsForBrewery, collapseSeries, formatEventDates, localDateString, EVENT_KINDS } from '../events.js';

export async function render({ app, outlet, params }) {
  const [data, beers, saved, eventData] = await Promise.all([
    app.loadBreweries(),
    app.db.listBeers(),
    app.db.getBreweryNote(params.id),
    app.loadEvents().catch(() => null),
  ]);
  const b = data.index.byId.get(params.id);
  if (!b) {
    outlet.replaceChildren(h('p', { class: 'empty', text: 'このブリュワーは見つかりませんでした。' }));
    return;
  }
  app.setTitle(b.name);
  const myBeers = (groupBeersByBrewery(beers, data.index).get(b.id) || []).sort((x, y) => x.name.localeCompare(y.name, 'ja'));
  let note = saved || { visited: [], wantToVisit: false, memo: '' };

  const head = h(
    'section',
    { class: 'panel' },
    h('h2', { class: 'beer-name', text: b.name }),
    b.nameKana ? h('p', { class: 'muted small', text: b.nameKana }) : null,
    h(
      'div',
      { class: 'tags' },
      h('span', { class: 'tag', text: KIND_LABELS[b.kind] || b.kind }),
      b.founded ? h('span', { class: 'tag', text: `${b.founded}年創業` }) : null,
      b.taproom ? h('span', { class: 'tag', text: '飲める場所あり' }) : null,
      b.tour ? h('span', { class: 'tag', text: '見学あり' }) : null,
      b.status === 'closed' ? h('span', { class: 'tag tag-want', text: 'ビールの製造は終了' }) : null,
    ),
    b.summary ? h('p', { class: 'memo', text: b.summary }) : null,
    b.features?.length ? h('div', { class: 'tags brewery-features' }, b.features.filter((f) => FEATURE_LABELS[f]).map((f) => h('span', { class: 'tag tag-feature', text: FEATURE_LABELS[f] }))) : null,
  );

  // ---- 代表銘柄・買いやすさ・受賞歴 ----
  const flagList = h('ul', { class: 'plain-list flagship-list' });
  const profile =
    b.flagships?.length || b.availability || b.awards?.length
      ? h(
          'section',
          { class: 'panel' },
          h('h3', { class: 'section-title', text: '代表銘柄' }),
          b.flagships?.length ? flagList : h('p', { class: 'muted small', text: '確認できていません。' }),
          AVAILABILITY[b.availability] ? h('p', { class: 'small', text: `買いやすさ：${AVAILABILITY[b.availability].label}` }) : null,
          b.awards?.length
            ? h('div', { class: 'small' }, h('strong', { text: '主な受賞' }), h('ul', { class: 'plain-list' }, b.awards.map((a) => h('li', { text: a }))))
            : null,
        )
      : null;
  renderFlagships();

  const place = h(
    'section',
    { class: 'panel' },
    h('h3', { class: 'section-title', text: '場所' }),
    h('p', { text: addressText(b) }),
    b.geo?.precision === 'area' ? h('p', { class: 'field-hint', text: '地図の位置はおおよそです（番地までは合わせていません）。' }) : null,
    !b.geo ? h('p', { class: 'field-hint', text: '番地が確認できていないため、地図には表示していません。' }) : null,
    b.geo && b.status !== 'closed' ? h('a', { class: 'btn btn-small', href: `#/breweries/map?id=${encodeURIComponent(b.id)}`, text: '地図で見る' }) : null,
  );

  const links = Object.entries(b.links || {}).filter(([, url]) => isSafeUrl(url));
  const linkSection = links.length
    ? h(
        'section',
        { class: 'panel' },
        h('h3', { class: 'section-title', text: 'リンク' }),
        h(
          'ul',
          { class: 'plain-list' },
          links.map(([k, url]) => h('li', {}, h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: `${LINK_LABELS[k] || k} ↗` }))),
        ),
      )
    : null;

  const mine = h('section', { class: 'panel' });
  renderMine();

  // ---- イベント（events.json のシリーズの breweryIds で紐付け） ----
  const related = eventData ? eventsForBrewery(joinEvents(eventData), b.id, localDateString()) : { upcoming: [], past: [] };
  const eventItem = (e) =>
    h(
      'li',
      {},
      h(
        'a',
        { class: 'menu-item brewery-event', href: `#/event/${encodeURIComponent(e.id)}` },
        h(
          'span',
          { class: 'brewery-event-text' },
          h('span', { text: e.name }),
          h('span', { class: 'muted small', text: [formatEventDates(e.startDate, e.endDate), EVENT_KINDS[e.kind], e.moreCount ? `ほか${e.moreCount}回` : ''].filter(Boolean).join('・') }),
        ),
      ),
    );
  const eventsSection =
    related.upcoming.length || related.past.length
      ? h(
          'section',
          { class: 'panel' },
          h('h3', { class: 'section-title', text: 'イベント' }),
          related.upcoming.length ? h('ul', { class: 'card-list' }, collapseSeries(related.upcoming).map(eventItem)) : h('p', { class: 'muted small', text: 'これからのイベントは載っていません。' }),
          related.past.length ? h('p', { class: 'small muted', text: '終了したイベント' }) : null,
          related.past.length ? h('ul', { class: 'card-list' }, related.past.map(eventItem)) : null,
        )
      : null;

  // ---- 行った・行きたい・メモ ----
  const visitList = h('ul', { class: 'plain-list visit-list' });
  const dateInput = h('input', { type: 'date', value: todayString(), max: todayString(), 'aria-label': '行った日' });
  const wantBtn = h('button', { type: 'button', class: 'chip', onclick: () => save({ wantToVisit: !note.wantToVisit }) }, '行きたい');
  const memo = h('textarea', { rows: 3, placeholder: 'メモ（おすすめ・行き方など）', 'aria-label': 'メモ', value: note.memo || '', onchange: () => save({ memo: memo.value }) });
  const visits = h(
    'section',
    { class: 'panel' },
    h('h3', { class: 'section-title', text: 'あなたのメモ' }),
    h('div', { class: 'row' }, dateInput, h('button', { type: 'button', class: 'btn btn-small btn-primary', text: '行った', onclick: () => addVisit() }), wantBtn),
    visitList,
    memo,
    h('p', { class: 'field-hint', text: 'メモはこの端末に保存され、バックアップに含まれます。' }),
  );
  renderNote();

  const provenance = h(
    'details',
    { class: 'panel brewery-source' },
    h('summary', { text: '情報の出典と確認状況' }),
    h('p', { class: 'small', text: `確認方法：${VERIFICATION_LABELS[b.verification] || b.verification || '不明'}` }),
    b.checkedAt ? h('p', { class: 'small', text: `確認日：${formatDate(b.checkedAt)}` }) : null,
    b.sourceNotes ? h('p', { class: 'small', text: `確認に使った情報：${b.sourceNotes}` }) : null,
    isSafeUrl(b.profileSource)
      ? h('p', { class: 'small' }, '代表銘柄・特徴の確認：', h('a', { href: b.profileSource, target: '_blank', rel: 'noopener noreferrer', text: `${new URL(b.profileSource).hostname} ↗` }), b.profileCheckedAt ? `（${formatDate(b.profileCheckedAt)}）` : '')
      : null,
    h(
      'ul',
      { class: 'plain-list small' },
      (b.sources || []).filter((s) => isSafeUrl(s.url)).map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: `${s.label} ↗` }))),
    ),
    creditNote(data.meta),
    h('p', { class: 'small' }, '誤りに気づいたら ', h('a', { href: 'feedback/', text: '感想フォーム' }), ' から教えてください。'),
  );

  outlet.replaceChildren(...[head, profile, eventsSection, mine, visits, place, linkSection, provenance].filter(Boolean));

  function renderMine() {
    mine.replaceChildren(
      h('h3', { class: 'section-title', text: '記録した銘柄' }),
      myBeers.length
        ? h(
            'ul',
            { class: 'plain-list' },
            myBeers.map((x) => h('li', {}, h('a', { href: `#/beer/${encodeURIComponent(x.id)}`, text: x.name }), x.status === 'want' ? h('span', { class: 'muted small', text: '（飲みたい）' }) : null)),
          )
        : h('p', { class: 'muted small', text: 'まだありません。銘柄のブリュワー欄の名前がこのブリュワーと一致すると、ここに表示されます。' }),
    );
  }

  /** 代表銘柄。記録・リストにまだ無いものは「飲みたい」でリストに追加できる */
  function renderFlagships() {
    const known = new Map(myBeers.map((x) => [x.nameKey || normalize(x.name), x]));
    flagList.replaceChildren(
      ...(b.flagships || []).map((f) => {
        const style = app.styles.find((x) => x.id === f.styleId);
        const mineBeer = known.get(normalize(f.name));
        return h(
          'li',
          { class: 'row flagship' },
          h('span', { class: 'flagship-name' }, h('strong', { text: f.name }), style ? h('span', { class: 'muted small', text: ` ${style.name}` }) : null),
          mineBeer
            ? h('a', { class: 'small', href: `#/beer/${encodeURIComponent(mineBeer.id)}`, text: mineBeer.status === 'want' ? '飲みたいリスト ›' : '記録済み ›' })
            : h('button', { type: 'button', class: 'btn btn-small', text: '＋飲みたい', 'aria-label': `${f.name}を飲みたいリストに追加`, onclick: () => addWant(f) }),
        );
      }),
    );
  }

  async function addWant(f) {
    try {
      const saved = await app.db.saveBeer(createBeer({ name: f.name, brewery: b.name, breweryId: b.id, styleId: f.styleId || null, status: 'want' }));
      myBeers.push(saved);
      renderFlagships();
      renderMine();
      showToast(`「${f.name}」を飲みたいリストに追加しました`);
    } catch (e) {
      console.error(e);
      showToast(errorText(e, '飲みたいリストに追加'), { duration: 8000 });
    }
  }

  function renderNote() {
    wantBtn.setAttribute('aria-pressed', String(Boolean(note.wantToVisit)));
    visitList.replaceChildren(
      ...note.visited.map((d) =>
        h('li', { class: 'row' }, h('span', { text: `${formatDate(d)} に行った` }), h('button', { type: 'button', class: 'link danger', text: '削除', 'aria-label': `${formatDate(d)}の記録を削除`, onclick: () => save({ visited: note.visited.filter((x) => x !== d) }) })),
      ),
    );
  }

  function addVisit() {
    const d = dateInput.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      showToast('日付を選んでください');
      return;
    }
    if (note.visited.includes(d)) {
      showToast('その日はもう記録しています');
      return;
    }
    save({ visited: [...note.visited, d] }, '行った日を記録しました');
  }

  async function save(patch, message) {
    const next = makeBreweryNote(b.id, { ...note, ...patch });
    try {
      await app.db.saveBreweryNote(b.id, next);
      note = next || { visited: [], wantToVisit: false, memo: '' };
      renderNote();
      if (message) showToast(message);
    } catch (e) {
      console.error(e);
      showToast(errorText(e, 'メモを保存'), { duration: 8000 });
    }
  }
}
