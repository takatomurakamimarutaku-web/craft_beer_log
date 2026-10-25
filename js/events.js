// イベント情報（data/events.json）の表示用の判定・絞り込み・検証（純粋関数）
import { normalize, includesKey } from './search.js';

export const EVENTS_FORMAT_VERSION = 1;
/** 最終確認からこの日数を過ぎた開催予定のイベントは「情報が古い可能性」を出す */
export const STALE_DAYS = 60;

export const EVENT_KINDS = { festival: 'ビアフェス', beergarden: 'ビアガーデン', tasting: '試飲会・セミナー', other: 'その他' };
export const EVENT_STATUSES = { scheduled: '開催予定', tentative: '予告', cancelled: '中止', postponed: '延期' };

export const REGIONS = [
  { id: 'hokkaido', label: '北海道' },
  { id: 'tohoku', label: '東北' },
  { id: 'kanto', label: '関東' },
  { id: 'chubu', label: '中部' },
  { id: 'kinki', label: '近畿' },
  { id: 'chugoku', label: '中国' },
  { id: 'shikoku', label: '四国' },
  { id: 'kyushu', label: '九州・沖縄' },
];

// [コード, 表示名, 地方]
const PREF_ROWS = [
  ['hokkaido', '北海道', 'hokkaido'],
  ['aomori', '青森県', 'tohoku'], ['iwate', '岩手県', 'tohoku'], ['miyagi', '宮城県', 'tohoku'],
  ['akita', '秋田県', 'tohoku'], ['yamagata', '山形県', 'tohoku'], ['fukushima', '福島県', 'tohoku'],
  ['ibaraki', '茨城県', 'kanto'], ['tochigi', '栃木県', 'kanto'], ['gunma', '群馬県', 'kanto'], ['saitama', '埼玉県', 'kanto'],
  ['chiba', '千葉県', 'kanto'], ['tokyo', '東京都', 'kanto'], ['kanagawa', '神奈川県', 'kanto'],
  ['niigata', '新潟県', 'chubu'], ['toyama', '富山県', 'chubu'], ['ishikawa', '石川県', 'chubu'], ['fukui', '福井県', 'chubu'],
  ['yamanashi', '山梨県', 'chubu'], ['nagano', '長野県', 'chubu'], ['gifu', '岐阜県', 'chubu'], ['shizuoka', '静岡県', 'chubu'],
  ['aichi', '愛知県', 'chubu'],
  ['mie', '三重県', 'kinki'], ['shiga', '滋賀県', 'kinki'], ['kyoto', '京都府', 'kinki'], ['osaka', '大阪府', 'kinki'],
  ['hyogo', '兵庫県', 'kinki'], ['nara', '奈良県', 'kinki'], ['wakayama', '和歌山県', 'kinki'],
  ['tottori', '鳥取県', 'chugoku'], ['shimane', '島根県', 'chugoku'], ['okayama', '岡山県', 'chugoku'],
  ['hiroshima', '広島県', 'chugoku'], ['yamaguchi', '山口県', 'chugoku'],
  ['tokushima', '徳島県', 'shikoku'], ['kagawa', '香川県', 'shikoku'], ['ehime', '愛媛県', 'shikoku'], ['kochi', '高知県', 'shikoku'],
  ['fukuoka', '福岡県', 'kyushu'], ['saga', '佐賀県', 'kyushu'], ['nagasaki', '長崎県', 'kyushu'], ['kumamoto', '熊本県', 'kyushu'],
  ['oita', '大分県', 'kyushu'], ['miyazaki', '宮崎県', 'kyushu'], ['kagoshima', '鹿児島県', 'kyushu'], ['okinawa', '沖縄県', 'kyushu'],
];
export const PREFECTURES = Object.fromEntries(PREF_ROWS.map(([id, label, region]) => [id, { label, region }]));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9-]+$/;
const URL_RE = /^https?:\/\/[^\s/]+\.[^\s]+$/;

/** 端末の日付（YYYY-MM-DD） */
export function localDateString(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}

/** 今日から見た時期：ongoing（開催中）/ upcoming（これから）/ past（終了） */
export function eventPhase(event, today) {
  if (event.endDate < today) return 'past';
  if (event.startDate <= today) return 'ongoing';
  return 'upcoming';
}

/** 今週末（今日〜次の日曜）に開催日が重なるか。開催中のものは含めない */
export function isThisWeekend(event, today) {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=日
  const sat = addDays(today, (6 - dow + 7) % 7);
  const sun = dow === 0 ? today : addDays(sat, 1);
  const from = dow === 0 ? today : sat;
  return event.startDate > today && event.startDate <= sun && event.endDate >= from;
}

/** 開催予定なのに最終確認から STALE_DAYS 日を過ぎているか */
export function isStale(event, today, days = STALE_DAYS) {
  if (eventPhase(event, today) === 'past') return false;
  return daysBetween(event.lastVerified, today) > days;
}

/** "2026/11/7（土）〜8（日）" のような日程の表示 */
export function formatEventDates(startDate, endDate) {
  const wd = (s) => '日月火水木金土'[new Date(`${s}T00:00:00Z`).getUTCDay()];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const start = `${sy}/${sm}/${sd}（${wd(startDate)}）`;
  if (!endDate || endDate === startDate) return start;
  const [ey, em, ed] = endDate.split('-').map(Number);
  const end = ey !== sy ? `${ey}/${em}/${ed}` : em !== sm ? `${em}/${ed}` : `${ed}`;
  return `${start}〜${end}（${wd(endDate)}）`;
}

/** シリーズとイベントを結びつけ、表示に使う項目を足す */
export function joinEvents(data) {
  const series = new Map((data?.series || []).map((s) => [s.id, s]));
  return (data?.events || []).map((e) => {
    const s = series.get(e.seriesId) || {};
    const pref = PREFECTURES[e.prefecture];
    return {
      ...e,
      name: s.name || e.seriesId,
      kana: s.kana || '',
      kind: s.kind || 'other',
      usualPeriod: s.usualPeriod || null,
      prefectureLabel: pref?.label || '',
      region: pref?.region || null,
    };
  });
}

/**
 * 一覧の絞り込みと並べ替え。
 * criteria: { q, region, past }。past=false は終了していないもの（日付の早い順）、true は終了したもの（新しい順）
 */
export function filterEvents(events, { q = '', region = null, past = false } = {}, today) {
  const key = normalize(q);
  const list = events.filter((e) => {
    if ((eventPhase(e, today) === 'past') !== past) return false;
    if (region && e.region !== region) return false;
    if (key) {
      const texts = [e.name, e.kana, e.venue, e.city, e.prefectureLabel, e.edition];
      if (!texts.some((t) => t && includesKey(normalize(t), key))) return false;
    }
    return true;
  });
  return list.sort((a, b) =>
    past ? b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id) : a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
  );
}

/** 今後のイベントを「開催中」「今週末」「YYYY年M月」の見出しで分ける */
export function groupUpcoming(events, today) {
  const groups = [];
  const push = (label, e) => {
    const g = groups.find((x) => x.label === label);
    if (g) g.events.push(e);
    else groups.push({ label, events: [e] });
  };
  for (const e of events) {
    if (eventPhase(e, today) === 'ongoing') push('開催中', e);
    else if (isThisWeekend(e, today)) push('今週末', e);
    else {
      const [y, m] = e.startDate.split('-').map(Number);
      push(`${y}年${m}月`, e);
    }
  }
  const order = (l) => (l === '開催中' ? 0 : l === '今週末' ? 1 : 2);
  return groups.sort((a, b) => order(a.label) - order(b.label));
}

/** 同じシリーズの他の回（新しい順） */
export function otherEditions(events, event) {
  return events.filter((e) => e.seriesId === event.seriesId && e.id !== event.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** data/events.json の検証。エラーメッセージの配列を返す（空なら正常） */
export function validateEventsData(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['データが読めません'];
  if (data.version !== EVENTS_FORMAT_VERSION) errors.push(`version は ${EVENTS_FORMAT_VERSION}`);
  if (!DATE_RE.test(data.updatedAt || '')) errors.push('updatedAt は YYYY-MM-DD');
  const series = Array.isArray(data.series) ? data.series : [];
  const events = Array.isArray(data.events) ? data.events : [];
  if (!series.length) errors.push('series が空です');
  if (!events.length) errors.push('events が空です');

  const seriesIds = new Set();
  for (const s of series) {
    const where = `series ${s.id}`;
    if (!ID_RE.test(s.id || '')) errors.push(`${where}: id はスラッグ`);
    if (seriesIds.has(s.id)) errors.push(`${where}: id が重複`);
    seriesIds.add(s.id);
    if (!s.name?.trim()) errors.push(`${where}: name が空`);
    if (!s.kana?.trim()) errors.push(`${where}: kana が空`);
    if (!(s.kind in EVENT_KINDS)) errors.push(`${where}: kind が不正 (${s.kind})`);
    if (!(s.prefecture in PREFECTURES)) errors.push(`${where}: prefecture が不正 (${s.prefecture})`);
    if (!URL_RE.test(s.officialUrl || '')) errors.push(`${where}: officialUrl が必要`);
    if (s.usualPeriod !== null && typeof s.usualPeriod !== 'string') errors.push(`${where}: usualPeriod は文字列か null`);
  }

  const eventIds = new Set();
  const used = new Set();
  for (const e of events) {
    const where = `event ${e.id}`;
    if (!ID_RE.test(e.id || '')) errors.push(`${where}: id はスラッグ`);
    if (eventIds.has(e.id)) errors.push(`${where}: id が重複`);
    eventIds.add(e.id);
    if (!seriesIds.has(e.seriesId)) errors.push(`${where}: seriesId が見つからない (${e.seriesId})`);
    used.add(e.seriesId);
    if (!(e.status in EVENT_STATUSES)) errors.push(`${where}: status が不正 (${e.status})`);
    for (const k of ['startDate', 'endDate', 'lastVerified']) {
      if (!DATE_RE.test(e[k] || '') || Number.isNaN(Date.parse(e[k]))) errors.push(`${where}: ${k} は YYYY-MM-DD`);
    }
    if (e.startDate > e.endDate) errors.push(`${where}: endDate が startDate より前`);
    if (e.lastVerified > data.updatedAt) errors.push(`${where}: lastVerified が updatedAt より後`);
    if (!(e.prefecture in PREFECTURES)) errors.push(`${where}: prefecture が不正 (${e.prefecture})`);
    for (const k of ['city', 'venue']) if (!e[k]?.trim()) errors.push(`${where}: ${k} が空`);
    if (!URL_RE.test(e.officialUrl || '')) errors.push(`${where}: officialUrl が必要`);
    if (e.ticketUrl !== null && !URL_RE.test(e.ticketUrl || '')) errors.push(`${where}: ticketUrl は URL か null`);
    for (const k of ['edition', 'hours', 'priceNote', 'note']) {
      if (e[k] !== null && e[k] !== undefined && typeof e[k] !== 'string') errors.push(`${where}: ${k} は文字列`);
    }
    if (!Array.isArray(e.sources) || !e.sources.length) errors.push(`${where}: sources が1件以上必要`);
    for (const s of e.sources || []) {
      if (!s.title?.trim() || !URL_RE.test(s.url || '') || !DATE_RE.test(s.accessedAt || '')) errors.push(`${where}: sources の形が不正`);
    }
  }
  for (const id of seriesIds) if (!used.has(id)) errors.push(`series ${id}: 回（events）が1件もありません`);
  return errors;
}
