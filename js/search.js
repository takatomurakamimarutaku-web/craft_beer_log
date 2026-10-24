// 検索・正規化（DOM に依存しない純粋関数）

/**
 * 検索用の正規化キーを作る。
 * NFKC → 小文字化 → ひらがなをカタカナへ → 前後の空白除去 → 連続空白を1つに
 * 例: 「ｉｐａ」「IPA」「ipa」→ "ipa"、「ゆかい」→「ユカイ」
 */
export function normalize(value) {
  if (value === null || value === undefined) return '';
  let s = String(value).normalize('NFKC').toLowerCase();
  // ぁ(3041)〜ゖ(3096)、ゝゞ(309D-309E) をカタカナ (+0x60) に寄せる
  s = s.replace(/[ぁ-ゖゝゞ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  return s.trim().replace(/\s+/g, ' ');
}

/** 正規化済みキーに、クエリ（未正規化可）が部分一致するか。空のクエリは常に一致 */
export function includesKey(key, query) {
  const q = normalize(query);
  if (!q) return true;
  return (key || '').includes(q);
}

/**
 * 候補の抽出。前方一致を優先し、次に部分一致。
 * @param {Array} items
 * @param {string} query
 * @param {(item) => string} getKey 正規化済みキーを返す関数
 * @param {number} limit
 */
export function suggest(items, query, getKey, limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  const prefix = [];
  const partial = [];
  for (const item of items) {
    const key = getKey(item) || '';
    const pos = key.indexOf(q);
    if (pos === 0) prefix.push(item);
    else if (pos > 0) partial.push(item);
  }
  return prefix.concat(partial).slice(0, limit);
}

// ---- Phase 3: 検索・絞り込み・並べ替え ----

/**
 * 銘柄ごとの集計（検索・並べ替え用）を作る。
 * @returns {Array<{beer, count, lastDate, avgRating, latestRating, placeTypes:Set, servings:Set, incomplete:boolean, photoId}>}
 */
export function buildBeerSummaries(beers, checkins) {
  const byBeer = new Map();
  for (const c of checkins) {
    let list = byBeer.get(c.beerId);
    if (!list) byBeer.set(c.beerId, (list = []));
    list.push(c);
  }
  return beers.map((beer) => {
    const list = byBeer.get(beer.id) || [];
    let lastDate = null;
    let latest = null;
    let sum = 0;
    let rated = 0;
    const placeTypes = new Set();
    const servings = new Set();
    let incomplete = false;
    let photoCheckin = null;
    for (const c of list) {
      if (c.photoIds && c.photoIds.length && (!photoCheckin || compareDesc(c, photoCheckin) < 0)) photoCheckin = c;
      if (lastDate === null || c.date > lastDate) lastDate = c.date;
      if (typeof c.rating === 'number') {
        sum += c.rating;
        rated += 1;
        if (!latest || compareDesc(c, latest) < 0) latest = c;
      }
      if (c.place && c.place.type) placeTypes.add(c.place.type);
      if (c.serving) servings.add(c.serving);
      if (c.incomplete) incomplete = true;
    }
    return {
      beer,
      count: list.length,
      lastDate,
      avgRating: rated ? Math.round((sum / rated) * 10) / 10 : null,
      latestRating: latest ? latest.rating : null,
      placeTypes,
      servings,
      incomplete,
      photoId: photoCheckin ? photoCheckin.photoIds[0] : null,
    };
  });
}

function compareDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.createdAt !== b.createdAt) return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
  return 0;
}

/** 検索条件の初期値 */
export function defaultCriteria() {
  return {
    keyword: '',
    styleIds: [],
    abvMin: null,
    abvMax: null,
    placeTypes: [],
    servings: [],
    ratingMin: null,
    incompleteOnly: false,
    status: 'all', // 'all' | 'tried' | 'want'
    sort: 'lastDate', // 'lastDate' | 'abv' | 'rating' | 'name' | 'count'
    order: 'desc', // 'asc' | 'desc'
  };
}

/** 条件が初期値から変更されている絞り込み項目の数（キーワード・並べ替えを除く） */
export function countActiveFilters(criteria) {
  const c = { ...defaultCriteria(), ...criteria };
  let n = 0;
  if (c.styleIds.length) n++;
  if (c.abvMin !== null || c.abvMax !== null) n++;
  if (c.placeTypes.length) n++;
  if (c.servings.length) n++;
  if (c.ratingMin !== null) n++;
  if (c.incompleteOnly) n++;
  if (c.status !== 'all') n++;
  return n;
}

/** 1件の集計が条件に一致するか */
export function matchesCriteria(summary, criteria) {
  const c = criteria;
  const b = summary.beer;
  if (c.keyword) {
    const q = normalize(c.keyword);
    if (q && !(b.nameKey || '').includes(q) && !(b.breweryKey || '').includes(q)) return false;
  }
  if (c.status && c.status !== 'all' && b.status !== c.status) return false;
  if (c.styleIds && c.styleIds.length && !c.styleIds.includes(b.styleId)) return false;
  if (c.abvMin !== null && c.abvMin !== undefined) {
    if (typeof b.abv !== 'number' || b.abv < c.abvMin) return false;
  }
  if (c.abvMax !== null && c.abvMax !== undefined) {
    if (typeof b.abv !== 'number' || b.abv > c.abvMax) return false;
  }
  if (c.placeTypes && c.placeTypes.length && !c.placeTypes.some((t) => summary.placeTypes.has(t))) return false;
  if (c.servings && c.servings.length && !c.servings.some((s) => summary.servings.has(s))) return false;
  if (c.ratingMin !== null && c.ratingMin !== undefined) {
    if (summary.avgRating === null || summary.avgRating < c.ratingMin) return false;
  }
  if (c.incompleteOnly && !summary.incomplete) return false;
  return true;
}

const SORT_KEYS = {
  lastDate: (s) => s.lastDate,
  abv: (s) => (typeof s.beer.abv === 'number' ? s.beer.abv : null),
  rating: (s) => s.avgRating,
  name: (s) => s.beer.nameKey || '',
  count: (s) => s.count,
};

const collator = new Intl.Collator('ja');

/** 並べ替え。値が無いものは昇順・降順どちらでも末尾に置く。同値は名前順 */
export function sortSummaries(summaries, sort = 'lastDate', order = 'desc') {
  const getKey = SORT_KEYS[sort] || SORT_KEYS.lastDate;
  const dir = order === 'asc' ? 1 : -1;
  return [...summaries].sort((a, b) => {
    const ka = getKey(a);
    const kb = getKey(b);
    const na = ka === null || ka === undefined;
    const nb = kb === null || kb === undefined;
    if (na !== nb) return na ? 1 : -1;
    if (!na && ka !== kb) {
      const cmp = typeof ka === 'string' ? collator.compare(ka, kb) : ka - kb;
      if (cmp !== 0) return cmp * dir;
    }
    return collator.compare(a.beer.nameKey || '', b.beer.nameKey || '');
  });
}

/** 絞り込み＋並べ替え */
export function searchBeers(summaries, criteria) {
  const c = { ...defaultCriteria(), ...criteria };
  return sortSummaries(summaries.filter((s) => matchesCriteria(s, c)), c.sort, c.order);
}
