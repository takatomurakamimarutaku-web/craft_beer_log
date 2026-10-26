// 集計（DOM に依存しない純粋関数）
import { compareCheckinsDesc } from './models.js';

/** 評価の平均（小数第1位）・最新値・件数。未評価の記録は除外する */
export function summarizeRatings(checkins) {
  const rated = checkins.filter((c) => typeof c.rating === 'number');
  if (!rated.length) return { count: 0, avg: null, latest: null };
  const sum = rated.reduce((acc, c) => acc + c.rating, 0);
  const latest = [...rated].sort(compareCheckinsDesc)[0];
  return { count: rated.length, avg: Math.round((sum / rated.length) * 10) / 10, latest: latest.rating };
}

// ---- Phase 6: 統計 ----
// どの集計も「飲んだ記録（checkin）」1件を1杯として数える。銘柄が見つからない記録は除く。

function joinBeers(beers, checkins) {
  const byId = new Map(beers.map((b) => [b.id, b]));
  const out = [];
  for (const c of checkins) {
    const beer = byId.get(c.beerId);
    if (beer) out.push({ c, beer });
  }
  return out;
}

function byCountDesc(a, b) {
  return b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
}

/**
 * スタイル別の杯数（多い順）。styleId が空のものは key: null（未入力）、その他は自由入力名ごとにまとめず 'other' 1つにする。
 * @returns {Array<{ key, label, count }>}
 */
export function countByStyle(beers, checkins, styles) {
  const names = new Map(styles.map((s) => [s.id, s.name]));
  const counts = new Map();
  for (const { beer } of joinBeers(beers, checkins)) {
    const key = beer.styleId || null;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key === null ? '未入力' : key === 'other' ? 'その他' : names.get(key) || key, count }))
    .sort((a, b) => b.count - a.count || tail(a.key) - tail(b.key) || byCountDesc(a, b));
}

// 同じ杯数なら、実在のスタイル → その他 → 未入力 の順にする
function tail(key) {
  return key === null ? 2 : key === 'other' ? 1 : 0;
}

// 度数の区切り（min 以上 max 未満。max が null は上限なし）
export const ABV_BINS = [
  { min: 0, max: 4, label: '〜4%' },
  { min: 4, max: 5, label: '4%台' },
  { min: 5, max: 6, label: '5%台' },
  { min: 6, max: 7, label: '6%台' },
  { min: 7, max: 8, label: '7%台' },
  { min: 8, max: 10, label: '8〜9%台' },
  { min: 10, max: null, label: '10%〜' },
];

/** 度数の分布（杯数）。度数が未入力の杯は unknown に数える */
export function abvHistogram(beers, checkins, bins = ABV_BINS) {
  const out = bins.map((b) => ({ ...b, count: 0 }));
  let unknown = 0;
  for (const { beer } of joinBeers(beers, checkins)) {
    if (typeof beer.abv !== 'number') {
      unknown++;
      continue;
    }
    const bin = out.find((b) => beer.abv >= b.min && (b.max === null || beer.abv < b.max));
    if (bin) bin.count++;
  }
  return { bins: out, unknown };
}

/** ブリュワー別の杯数 上位 n 件。表記ゆれは正規化キーでまとめ、表示名は最も多い表記 */
export function topBreweries(beers, checkins, n = 10) {
  const groups = new Map();
  for (const { beer } of joinBeers(beers, checkins)) {
    const name = String(beer.brewery || '').trim();
    if (!name) continue;
    const key = beer.breweryKey || name;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, count: 0, names: new Map() }));
    g.count++;
    g.names.set(name, (g.names.get(name) || 0) + 1);
  }
  return [...groups.values()]
    .map((g) => ({ key: g.key, label: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0], count: g.count }))
    .sort(byCountDesc)
    .slice(0, n);
}

/** 直近 months か月（当月を含む）の月別杯数。古い月から順。記録が無い月も 0 で返す */
export function monthlyCounts(checkins, { months = 12, now = new Date() } = {}) {
  const keys = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const c of checkins) {
    const k = typeof c.date === 'string' ? c.date.slice(0, 7) : '';
    if (counts.has(k)) counts.set(k, counts.get(k) + 1);
  }
  return keys.map((key) => ({ key, label: `${Number(key.slice(5))}月`, year: Number(key.slice(0, 4)), count: counts.get(key) }));
}

/**
 * 提供形態別の杯数と1杯あたりの平均価格（価格の入っている杯だけで平均、円単位に四捨五入）。
 * 提供形態が未入力の杯は key: null。
 */
export function servingStats(checkins, labels = {}) {
  const groups = new Map();
  for (const c of checkins) {
    const key = c.serving || null;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, count: 0, priced: 0, sum: 0 }));
    g.count++;
    if (typeof c.price === 'number') {
      g.priced++;
      g.sum += c.price;
    }
  }
  return [...groups.values()]
    .map((g) => ({ key: g.key, label: g.key === null ? '未入力' : labels[g.key] || g.key, count: g.count, priced: g.priced, avgPrice: g.priced ? Math.round(g.sum / g.priced) : null }))
    .sort(byCountDesc);
}

/** 評価が minRating 以上の杯に付いた香りタグの回数（多い順） */
export function favoriteFlavorTags(checkins, { minRating = 4, labels = {} } = {}) {
  const counts = new Map();
  for (const c of checkins) {
    if (typeof c.rating !== 'number' || c.rating < minRating) continue;
    for (const t of new Set(c.tasting?.flavorTags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, label: labels[key] || key, count })).sort(byCountDesc);
}

/**
 * 好きな香りタグに合うホップ。ホップの香りタグに含まれる好みのタグの回数を合計し、多い順に n 件。
 * 合計 0 のホップは含めない。
 */
export function hopsForFavoriteTags(hops, favorites, n = 5) {
  const weight = new Map(favorites.map((f) => [f.key, f.count]));
  return hops
    .map((hop) => {
      const matched = hop.flavorTags.filter((t) => weight.has(t));
      return { hop, matched, score: matched.reduce((s, t) => s + weight.get(t), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.matched.length - a.matched.length || (a.hop.name < b.hop.name ? -1 : 1))
    .slice(0, n);
}

/**
 * イベント別の杯数（多い順）。名前は配信データ → 参加状況の写し → 記録のお店の名前の順に探す
 * @param {Map<string,string>} names イベントの id → 名前
 */
export function eventStats(checkins, names = new Map()) {
  const groups = new Map();
  for (const c of checkins) {
    const id = c.place?.eventId;
    if (!id) continue;
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { key: id, label: names.get(id) || c.place.name || 'イベント', count: 0, sum: 0, rated: 0 }));
    g.count++;
    if (typeof c.rating === 'number') {
      g.sum += c.rating;
      g.rated++;
    }
  }
  return [...groups.values()]
    .map(({ sum, rated, ...g }) => ({ ...g, avgRating: rated ? Math.round((sum / rated) * 10) / 10 : null }))
    .sort(byCountDesc);
}

/**
 * 今月のまとめ（記録一覧の上に出す）。month は 'YYYY-MM'（省略時は now の月）。
 * topStyle は今月いちばん多いスタイル（未入力は除く。同数なら countByStyle と同じ順）、無ければ null。
 * @returns {{ month, count, beerCount, avg, topStyle }}
 */
export function monthSummary(beers, checkins, styles, { now = new Date() } = {}) {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const inMonth = checkins.filter((c) => typeof c.date === 'string' && c.date.startsWith(month));
  const joined = joinBeers(beers, inMonth);
  const top = countByStyle(beers, inMonth, styles).find((s) => s.key !== null);
  return {
    month,
    count: joined.length,
    beerCount: new Set(joined.map(({ beer }) => beer.id)).size,
    avg: summarizeRatings(joined.map(({ c }) => c)).avg,
    topStyle: top ? top.label : null,
  };
}
