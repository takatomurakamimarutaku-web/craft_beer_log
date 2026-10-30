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

/**
 * 振り返り（年または月）。period は 'YYYY' か 'YYYY-MM'。
 * 「はじめて」は period より前に記録が無い銘柄・スタイル。
 * @returns {{ period, count, beerCount, avg, newBeers, newStyles: string[], topBeer, bestBeer, topStyle, topBrewery, busiest, flavorTop }}
 */
export function buildRecap(beers, checkins, styles, period) {
  const inPeriod = (c) => typeof c.date === 'string' && c.date.startsWith(period);
  const before = (c) => typeof c.date === 'string' && c.date < period;
  const all = joinBeers(beers, checkins);
  const rows = all.filter(({ c }) => inPeriod(c));
  const earlierBeers = new Set(all.filter(({ c }) => before(c)).map(({ beer }) => beer.id));
  const earlierStyles = new Set(all.filter(({ c }) => before(c)).map(({ beer }) => beer.styleId));
  const styleName = new Map(styles.map((s) => [s.id, s.name]));

  const perBeer = new Map();
  for (const { c, beer } of rows) {
    const p = perBeer.get(beer.id) || { beer, count: 0, best: null };
    p.count++;
    if (typeof c.rating === 'number' && (p.best === null || c.rating > p.best)) p.best = c.rating;
    perBeer.set(beer.id, p);
  }
  const list = [...perBeer.values()];
  const byName = (a, b) => String(a.beer.name).localeCompare(String(b.beer.name), 'ja');
  const topBeer = [...list].sort((a, b) => b.count - a.count || byName(a, b))[0] || null;
  const bestBeer = list.filter((p) => p.best !== null).sort((a, b) => b.best - a.best || b.count - a.count || byName(a, b))[0] || null;

  const newStyles = [];
  for (const { beer } of rows) {
    const id = beer.styleId;
    if (id && styleName.has(id) && !earlierStyles.has(id) && !newStyles.includes(styleName.get(id))) newStyles.push(styleName.get(id));
  }
  // 年は月ごと、月は日ごとにいちばん多かった時期
  const unit = period.length === 4 ? 7 : 10;
  const perUnit = new Map();
  for (const { c } of rows) perUnit.set(c.date.slice(0, unit), (perUnit.get(c.date.slice(0, unit)) || 0) + 1);
  const busiest = [...perUnit.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  const flavor = new Map();
  for (const { c } of rows) for (const t of new Set(c.tasting?.flavorTags || [])) flavor.set(t, (flavor.get(t) || 0) + 1);

  const style = countByStyle(beers, rows.map(({ c }) => c), styles).find((s) => s.key !== null);
  const brewery = topBreweries(beers, rows.map(({ c }) => c), 1)[0];
  return {
    period,
    count: rows.length,
    beerCount: perBeer.size,
    avg: summarizeRatings(rows.map(({ c }) => c)).avg,
    newBeers: list.filter((p) => !earlierBeers.has(p.beer.id)).length,
    newStyles,
    topBeer: topBeer && topBeer.count > 1 ? topBeer : null,
    bestBeer,
    topStyle: style ? { label: style.label, count: style.count } : null,
    topBrewery: brewery ? { label: brewery.label, count: brewery.count } : null,
    busiest: busiest ? { key: busiest[0], count: busiest[1] } : null,
    flavorTop: [...flavor.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([key, count]) => ({ key, count })),
  };
}

/** 記録のある年（新しい順）と、その年の記録のある月（新しい順） */
export function recapPeriods(checkins) {
  const months = new Set(checkins.map((c) => (typeof c.date === 'string' ? c.date.slice(0, 7) : '')).filter((m) => /^\d{4}-\d{2}$/.test(m)));
  const years = [...new Set([...months].map((m) => m.slice(0, 4)))].sort().reverse();
  return years.map((year) => ({ year, months: [...months].filter((m) => m.startsWith(year)).sort().reverse() }));
}

/**
 * あなたの好みのスタイル（平均評価が高い順。評価のある杯が minCount 以上のもの）と、
 * まだ飲んでいないスタイルのおすすめ。
 * おすすめの点数：好きなスタイルと同じ系統 +3、苦味（IBU）の範囲の重なり ×2、色（SRM）の近さ ×1 を、好きなスタイルごとに計算して最大のもの。
 * @returns {{ liked: Array<{ style, avg, count }>, picks: Array<{ style, because }> }}
 */
export function tastePicks(beers, checkins, styles, { minCount = 1, n = 3 } = {}) {
  const styleById = new Map(styles.map((s) => [s.id, s]));
  const sums = new Map();
  const tried = new Set();
  for (const { c, beer } of joinBeers(beers, checkins)) {
    if (!styleById.has(beer.styleId)) continue;
    tried.add(beer.styleId);
    if (typeof c.rating !== 'number') continue;
    const s = sums.get(beer.styleId) || { sum: 0, count: 0 };
    s.sum += c.rating;
    s.count++;
    sums.set(beer.styleId, s);
  }
  const liked = [...sums.entries()]
    .filter(([, s]) => s.count >= minCount && s.sum / s.count >= 3.5)
    .map(([id, s]) => ({ style: styleById.get(id), avg: Math.round((s.sum / s.count) * 10) / 10, count: s.count }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count || a.style.name.localeCompare(b.style.name, 'ja'))
    .slice(0, 3);
  const overlap = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return 0;
    const inter = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
    const span = Math.max(a[1], b[1]) - Math.min(a[0], b[0]);
    return inter > 0 && span > 0 ? inter / span : 0;
  };
  const mid = (r) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : null);
  const picks = styles
    .filter((s) => !tried.has(s.id))
    .map((s) => {
      let best = { score: 0, because: null };
      for (const l of liked) {
        const L = l.style;
        const srm = mid(s.srm) !== null && mid(L.srm) !== null ? Math.max(0, 1 - Math.abs(mid(s.srm) - mid(L.srm)) / 20) : 0;
        const score = (s.category === L.category ? 3 : 0) + overlap(s.ibu, L.ibu) * 2 + srm;
        if (score > best.score) best = { score, because: L };
      }
      return { style: s, because: best.because, score: best.score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.style.name.localeCompare(b.style.name, 'ja'))
    .slice(0, n)
    .map(({ style, because }) => ({ style, because }));
  return { liked, picks };
}
