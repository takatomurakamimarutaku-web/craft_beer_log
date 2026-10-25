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
