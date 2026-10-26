// イベント情報（data/events.json と js/events.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateEventsData,
  joinEvents,
  eventPhase,
  isThisWeekend,
  isStale,
  formatEventDates,
  filterEvents,
  groupUpcoming,
  otherEditions,
  eventScope,
  eventsForBrewery,
  collapseSeries,
  PREFECTURES,
  REGIONS,
} from '../js/events.js';

const data = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const ev = (o) => ({ id: 'x', seriesId: 's', startDate: '2026-11-07', endDate: '2026-11-08', lastVerified: '2026-10-25', status: 'scheduled', ...o });

test('events.json：形式が正しい', () => {
  assert.deepEqual(validateEventsData(data), []);
});

test('events.json：公式リンクと情報源がすべての回にある', () => {
  for (const e of data.events) {
    assert.match(e.officialUrl, /^https?:\/\//, e.id);
    assert.ok(e.sources.length >= 1, e.id);
  }
});

test('validateEventsData：不正なデータを検出する', () => {
  const bad = structuredClone(data);
  bad.events[0].endDate = '2000-01-01';
  bad.events[1].seriesId = 'nope';
  bad.events[2].officialUrl = '';
  bad.series[0].prefecture = 'atlantis';
  const errors = validateEventsData(bad).join('\n');
  assert.match(errors, /endDate が startDate より前/);
  assert.match(errors, /seriesId が見つからない/);
  assert.match(errors, /officialUrl が必要/);
  assert.match(errors, /prefecture が不正/);
  assert.deepEqual(validateEventsData(null), ['データが読めません']);
});

test('PREFECTURES：47都道府県がすべて既知の地方に属する', () => {
  const regions = new Set(REGIONS.map((r) => r.id));
  assert.equal(Object.keys(PREFECTURES).length, 47);
  for (const p of Object.values(PREFECTURES)) assert.ok(regions.has(p.region), p.label);
});

test('eventPhase：開催前・開催中・終了', () => {
  const e = ev();
  assert.equal(eventPhase(e, '2026-11-06'), 'upcoming');
  assert.equal(eventPhase(e, '2026-11-07'), 'ongoing');
  assert.equal(eventPhase(e, '2026-11-08'), 'ongoing');
  assert.equal(eventPhase(e, '2026-11-09'), 'past');
});

test('isThisWeekend：今日から次の日曜までに重なる、開催前のもの', () => {
  const e = ev(); // 2026-11-07(土)〜08(日)
  assert.equal(isThisWeekend(e, '2026-11-04'), true); // 水
  assert.equal(isThisWeekend(e, '2026-11-07'), false); // 当日は開催中
  assert.equal(isThisWeekend(e, '2026-10-31'), false); // 1週間前の土曜
  assert.equal(isThisWeekend(ev({ startDate: '2026-11-08', endDate: '2026-11-08' }), '2026-11-07'), true);
  assert.equal(isThisWeekend(ev({ startDate: '2026-11-09', endDate: '2026-11-09' }), '2026-11-08'), false); // 日曜から見た翌月曜
});

test('isStale：開催予定で最終確認から60日を超えたもの', () => {
  assert.equal(isStale(ev({ lastVerified: '2026-09-08' }), '2026-11-06'), false); // 59日
  assert.equal(isStale(ev({ lastVerified: '2026-09-06' }), '2026-11-06'), true); // 61日
  assert.equal(isStale(ev({ lastVerified: '2026-01-01' }), '2026-12-01'), false); // 終了後は出さない
});

test('formatEventDates：曜日つき、同じ月・年またぎ', () => {
  assert.equal(formatEventDates('2026-11-15', '2026-11-15'), '2026/11/15（日）');
  assert.equal(formatEventDates('2026-11-07', '2026-11-08'), '2026/11/7（土）〜8（日）');
  assert.equal(formatEventDates('2026-10-31', '2026-11-01'), '2026/10/31（土）〜11/1（日）');
  assert.equal(formatEventDates('2026-12-31', '2027-01-02'), '2026/12/31（木）〜2027/1/2（土）');
});

test('joinEvents / filterEvents：シリーズ名・地方・キーワード・時期で絞り込む', () => {
  const events = joinEvents({
    series: [
      { id: 'a', name: '小田原・箱根 クラフトビールフェス', kana: 'おだわら', kind: 'festival', prefecture: 'kanagawa' },
      { id: 'b', name: 'SAPPORO CRAFT BEER FOREST', kana: 'さっぽろ', kind: 'festival', prefecture: 'hokkaido' },
    ],
    events: [
      ev({ id: 'a1', seriesId: 'a', prefecture: 'kanagawa', city: '小田原市', venue: '鈴廣かまぼこの里' }),
      ev({ id: 'b1', seriesId: 'b', prefecture: 'hokkaido', city: '札幌市', venue: 'ばんけい', startDate: '2026-07-11', endDate: '2026-07-12' }),
      ev({ id: 'b2', seriesId: 'b', prefecture: 'hokkaido', city: '札幌市', venue: 'ばんけい', startDate: '2027-07-10', endDate: '2027-07-11' }),
    ],
  });
  const today = '2026-10-25';
  assert.equal(events[0].prefectureLabel, '神奈川県');
  assert.equal(events[0].region, 'kanto');
  assert.deepEqual(filterEvents(events, {}, today).map((e) => e.id), ['a1', 'b2']);
  assert.deepEqual(filterEvents(events, { past: true }, today).map((e) => e.id), ['b1']);
  assert.deepEqual(filterEvents(events, { region: 'hokkaido' }, today).map((e) => e.id), ['b2']);
  assert.deepEqual(filterEvents(events, { q: 'オダワラ' }, today).map((e) => e.id), ['a1']); // ひらがな・カタカナを区別しない
  assert.deepEqual(filterEvents(events, { q: 'かまぼこ' }, today).map((e) => e.id), ['a1']);
  assert.deepEqual(filterEvents(events, { q: 'sapporo' }, today).map((e) => e.id), ['b2']);
  assert.deepEqual(otherEditions(events, events[1]).map((e) => e.id), ['b2']);
});

test('groupUpcoming：開催中・今週末・月ごとの順', () => {
  const list = [
    ev({ id: 'now', startDate: '2026-11-03', endDate: '2026-11-05' }),
    ev({ id: 'weekend', startDate: '2026-11-07', endDate: '2026-11-08' }),
    ev({ id: 'later', startDate: '2026-11-21', endDate: '2026-11-21' }),
    ev({ id: 'next', startDate: '2027-02-12', endDate: '2027-02-14' }),
  ];
  const groups = groupUpcoming(list, '2026-11-04');
  assert.deepEqual(groups.map((g) => g.label), ['開催中', '今週末', '2026年11月', '2027年2月']);
  assert.deepEqual(groups.map((g) => g.events.map((e) => e.id)), [['now'], ['weekend'], ['later'], ['next']]);
});

test('sw.js：イベント情報だけネット優先で取得する', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /const EVENTS_URL = 'data\/events\.json'/);
  assert.match(sw, /fetch\(req, \{ cache: 'no-cache' \}\)/);
});

// ---- E2：参加状況・記録との紐付け ----
import { eventsOnDate, defaultCheckinDate, buildIcs } from '../js/events.js';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from '../js/db.js';
import { createBeer, createCheckin } from '../js/models.js';
import { createBackupBlob, parseBackup } from '../js/backup.js';
import { validateCheckin } from '../js/validate.js';
import { checkinFromDraft } from '../js/views/checkin-form.js';

test('eventsOnDate：その日に開催中のものを、行く・行った → 行きたい → その他の順に', () => {
  const list = [
    ev({ id: 'a', startDate: '2026-11-07', endDate: '2026-11-08' }),
    ev({ id: 'b', startDate: '2026-11-06', endDate: '2026-11-08' }),
    ev({ id: 'c', startDate: '2026-11-08', endDate: '2026-11-08' }),
    ev({ id: 'x', startDate: '2026-11-08', endDate: '2026-11-08', status: 'cancelled' }),
    ev({ id: 'z', startDate: '2026-11-15', endDate: '2026-11-15' }),
  ];
  assert.deepEqual(eventsOnDate(list, '2026-11-08').map((e) => e.id), ['b', 'a', 'c']);
  const plans = new Map([['c', { status: 'going' }], ['a', { status: 'want' }]]);
  assert.deepEqual(eventsOnDate(list, '2026-11-08', plans).map((e) => e.id), ['c', 'a', 'b']);
  assert.deepEqual(eventsOnDate(list, '2026-11-09'), []);
});

test('defaultCheckinDate：開催中は今日、それ以外は初日', () => {
  assert.equal(defaultCheckinDate(ev(), '2026-11-08'), '2026-11-08');
  assert.equal(defaultCheckinDate(ev(), '2026-10-25'), '2026-11-07');
});

test('buildIcs：終日の予定（終了日の翌日まで）、エスケープと75バイトでの折り返し', () => {
  const [e] = joinEvents({
    series: [{ id: 's', name: 'テスト, フェス; 2026', kana: 'て', kind: 'festival', prefecture: 'tokyo' }],
    events: [ev({ seriesId: 's', prefecture: 'tokyo', city: '江東区', venue: '木場公園', hours: '11:00〜20:00', priceNote: '入場無料', note: '', officialUrl: 'https://example.com/' })],
  });
  const ics = buildIcs(e, new Date('2026-10-25T01:02:03.456Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261107\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261109\r\n/);
  assert.match(ics, /DTSTAMP:20261025T010203Z\r\n/);
  assert.match(ics, /SUMMARY:テスト\\, フェス\; 2026\r\n/);
  assert.match(ics, /UID:x@hop-techo/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  // 折り返しを戻すと元の説明文になる
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /DESCRIPTION:11:00〜20:00\\n入場無料\\n公式サイト：https:\/\/example.com\/\\n/);
});

test('validateCheckin / checkinFromDraft：イベントの紐付け（place.eventId）を保つ', () => {
  const v = validateCheckin({ date: '2026-11-07', place: { type: 'drank', name: 'フェス', eventId: 'e1' } });
  assert.deepEqual(v.value.place, { type: 'drank', name: 'フェス', eventId: 'e1' });
  assert.deepEqual(validateCheckin({ date: '2026-11-07', place: { type: 'drank', name: '店', eventId: null } }).value.place, { type: 'drank', name: '店' });
  assert.equal(checkinFromDraft({ placeName: 'フェス', eventId: 'e1' }).place.eventId, 'e1');
  assert.equal(checkinFromDraft({ placeName: '店' }).place.eventId, undefined);
});

test('eventPlans：保存・空なら削除・最初の記録で「行った」', async () => {
  const repo = await openDB({ indexedDB: new IDBFactory() });
  const e = { id: 'e1', name: 'フェス', startDate: '2026-11-07', endDate: '2026-11-08' };
  await repo.saveEventPlan({ id: 'e1', name: 'フェス', startDate: '2026-11-07', endDate: '2026-11-08', status: 'want', memo: '' });
  assert.equal((await repo.getEventPlan('e1')).status, 'want');
  assert.equal((await repo.markEventWent(e)).status, 'went');
  assert.equal((await repo.getEventPlan('e1')).name, 'フェス');
  await repo.saveEventPlan({ id: 'e1', status: null, memo: ' ' });
  assert.equal(await repo.getEventPlan('e1'), undefined);
  const fresh = await repo.markEventWent({ ...e, id: 'e2' });
  assert.deepEqual({ ...fresh, updatedAt: null }, { id: 'e2', name: 'フェス', startDate: '2026-11-07', endDate: '2026-11-08', memo: '', status: 'went', updatedAt: null });
  assert.equal((await repo.listEventPlans()).length, 1);
});

test('バックアップ：参加状況とイベントの紐付けを書き出し・読み込みできる。古いファイルも読める', async () => {
  const src = await openDB({ indexedDB: new IDBFactory() });
  await src.createBeerWithCheckin(createBeer({ name: 'IPA' }), createCheckin({ date: '2026-11-07', place: { type: 'drank', name: 'フェス', eventId: 'e1' } }));
  await src.markEventWent({ id: 'e1', name: 'フェス', startDate: '2026-11-07', endDate: '2026-11-08' });
  const data = parseBackup(await (await createBackupBlob(await src.dumpAll())).text());
  assert.equal(data.checkins[0].place.eventId, 'e1');
  assert.equal(data.eventPlans[0].status, 'went');
  const dst = await openDB({ indexedDB: new IDBFactory() });
  const r = await dst.importData(data, 'replace');
  assert.equal(r.added.eventPlans, 1);
  assert.equal((await dst.getEventPlan('e1')).status, 'went');

  const old = JSON.parse(await (await createBackupBlob(await src.dumpAll())).text());
  delete old.eventPlans;
  assert.deepEqual(parseBackup(JSON.stringify(old)).eventPlans, []);
  old.eventPlans = [{ id: 'e1', status: 'maybe' }];
  assert.throws(() => parseBackup(JSON.stringify(old)), /状態が不正/);
});

// ---- E3：集計・検索 ----
import { eventStats } from '../js/stats.js';
import { buildBeerSummaries, searchBeers, countActiveFilters } from '../js/search.js';
import { withBeerKeys } from '../js/models.js';

test('eventStats：イベント別の杯数と平均評価。名前は渡した対応表 → お店の名前', () => {
  const cs = [
    { place: { eventId: 'a', name: '店A' }, rating: 4 },
    { place: { eventId: 'a', name: '店A' }, rating: 5 },
    { place: { eventId: 'a', name: '店A' }, rating: null },
    { place: { eventId: 'b', name: 'お店の名前' }, rating: null },
    { place: { name: '普通の店' }, rating: 3 },
  ];
  assert.deepEqual(eventStats(cs, new Map([['a', 'フェスA']])), [
    { key: 'a', label: 'フェスA', count: 3, avgRating: 4.5 },
    { key: 'b', label: 'お店の名前', count: 1, avgRating: null },
  ]);
  assert.deepEqual(eventStats([]), []);
});

test('検索：イベントで飲んだ銘柄だけに絞り込める', () => {
  const beers = [withBeerKeys(createBeer({ name: 'A' })), withBeerKeys(createBeer({ name: 'B' }))];
  const cs = [
    createCheckin({ beerId: beers[0].id, place: { type: 'drank', name: 'フェス', eventId: 'e1' } }),
    createCheckin({ beerId: beers[1].id, place: { type: 'drank', name: '店' } }),
  ];
  const s = buildBeerSummaries(beers, cs);
  assert.deepEqual(searchBeers(s, { eventId: 'e1' }).map((x) => x.beer.name), ['A']);
  assert.equal(searchBeers(s, {}).length, 2);
  assert.equal(countActiveFilters({ eventId: 'e1' }), 1);
});

test('お店・醸造所のイベント：フェスと切り替えられ、ブリュワーに紐付く', () => {
  const events = joinEvents({
    series: [
      { id: 'f', name: 'フェス', kana: 'ふぇす', kind: 'festival', prefecture: 'aomori', breweryIds: ['b1'] },
      { id: 't', name: 'TTO', kana: 'てぃーてぃーおー', kind: 'tto', prefecture: 'aomori', breweryIds: ['b1', 'b2'] },
      { id: 'o', name: '開放デー', kana: 'かいほうでー', kind: 'brewery', prefecture: 'aomori', breweryIds: ['b2'] },
    ],
    events: [
      ev({ id: 'f1', seriesId: 'f', prefecture: 'aomori', city: '十和田市', venue: 'A', startDate: '2026-09-19', endDate: '2026-09-20' }),
      ev({ id: 't1', seriesId: 't', prefecture: 'aomori', city: '弘前市', venue: 'B', startDate: '2026-11-07', endDate: '2026-11-07' }),
      ev({ id: 'o1', seriesId: 'o', prefecture: 'aomori', city: '弘前市', venue: 'C', startDate: '2026-11-01', endDate: '2026-11-01' }),
      ev({ id: 'o2', seriesId: 'o', prefecture: 'aomori', city: '弘前市', venue: 'C', startDate: '2026-12-01', endDate: '2026-12-01', status: 'cancelled' }),
    ],
  });
  const today = '2026-10-26';
  assert.deepEqual(events.map(eventScope), ['fes', 'shop', 'shop', 'shop']);
  assert.deepEqual(filterEvents(events, { scope: 'shop' }, today).map((e) => e.id), ['o1', 't1', 'o2']);
  assert.deepEqual(filterEvents(events, { scope: 'fes', past: true }, today).map((e) => e.id), ['f1']);
  assert.equal(filterEvents(events, {}, today).length, 3); // scope 未指定ならすべて
  const b1 = eventsForBrewery(events, 'b1', today);
  assert.deepEqual(b1.upcoming.map((e) => e.id), ['t1']);
  assert.deepEqual(b1.past.map((e) => e.id), ['f1']);
  assert.deepEqual(eventsForBrewery(events, 'b2', today).upcoming.map((e) => e.id), ['o1', 't1']); // 中止は出さない
  assert.deepEqual(eventsForBrewery(events, 'none', today), { upcoming: [], past: [] });
});

test('validateEventsData：お店・醸造所のイベントは breweryIds が必要', () => {
  const base = JSON.parse(JSON.stringify(data));
  base.series[0] = { ...base.series[0], kind: 'tto', breweryIds: undefined };
  assert.ok(validateEventsData(base).some((m) => m.includes('breweryIds が必要')));
  base.series[0].breweryIds = ['Bad Id'];
  assert.ok(validateEventsData(base).some((m) => m.includes('スラッグの配列')));
  base.series[0].breweryIds = ['a', 'a'];
  assert.ok(validateEventsData(base).some((m) => m.includes('breweryIds が重複')));
});

test('events.json：breweryIds はブリュワー情報にある id', () => {
  const breweries = JSON.parse(readFileSync(new URL('../data/breweries.json', import.meta.url), 'utf8'));
  const ids = new Set(breweries.breweries.map((b) => b.id));
  for (const s of data.series) for (const id of s.breweryIds || []) assert.ok(ids.has(id), `${s.id}: ${id}`);
});

test('collapseSeries：同じシリーズは最初の1回にまとめ、残りの回数を数える', () => {
  const list = [ev({ id: 'a1', seriesId: 'a' }), ev({ id: 'b1', seriesId: 'b' }), ev({ id: 'a2', seriesId: 'a' }), ev({ id: 'a3', seriesId: 'a' })];
  assert.deepEqual(collapseSeries(list).map((e) => [e.id, e.moreCount]), [['a1', 2], ['b1', 0]]);
});
