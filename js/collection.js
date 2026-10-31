// コレクション（スタイル図鑑・達成バッジ）の集計。DOM に依存しない純粋関数
// どの集計も「飲んだ記録（checkin）」1件を1杯として数える。銘柄が見つからない記録は除く。

/**
 * スタイル図鑑。styles の順に、そのスタイルを何杯飲んだかと最初に飲んだ日を返す。
 * @returns {Array<{ style, count, firstDate: string|null }>}
 */
export function styleCollection(beers, checkins, styles) {
  const styleOf = new Map(beers.map((b) => [b.id, b.styleId]));
  const stat = new Map(styles.map((s) => [s.id, { count: 0, firstDate: null }]));
  for (const c of checkins) {
    const s = stat.get(styleOf.get(c.beerId));
    if (!s) continue;
    s.count++;
    if (c.date && (!s.firstDate || c.date < s.firstDate)) s.firstDate = c.date;
  }
  return styles.map((style) => ({ style, ...stat.get(style.id) }));
}

const SEASON_OF_MONTH = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];

/** バッジの判定に使う数をまとめて数える */
export function collectionFacts({ beers, checkins, styles, breweryIdOf = () => null, prefOf = () => null, notes = [] }) {
  const beerById = new Map(beers.map((b) => [b.id, b]));
  const mine = checkins.filter((c) => beerById.has(c.beerId));
  const styleById = new Map(styles.map((s) => [s.id, s]));
  const triedStyles = new Set();
  const breweries = new Set();
  const perBeer = new Map();
  const perDate = new Map();
  const seasons = new Set();
  let tasted = 0;
  for (const c of mine) {
    const beer = beerById.get(c.beerId);
    if (styleById.has(beer.styleId)) triedStyles.add(beer.styleId);
    const bid = breweryIdOf(beer);
    if (bid) breweries.add(bid);
    perBeer.set(beer.id, (perBeer.get(beer.id) || 0) + 1);
    if (c.date) {
      if (!perDate.has(c.date)) perDate.set(c.date, new Set());
      perDate.get(c.date).add(beer.id);
      seasons.add(SEASON_OF_MONTH[Number(c.date.slice(5, 7)) - 1]);
    }
    const t = c.tasting || {};
    const hasTaste = ['bitter', 'sweet', 'sour', 'body', 'aroma'].some((k) => typeof t[k] === 'number');
    if (hasTaste || t.flavorTags?.length || t.tasteTags?.length || t.flavorCustom?.length || t.tasteCustom?.length) tasted++;
  }
  const prefs = new Set([...breweries].map(prefOf).filter(Boolean));
  const inCategory = (cat) => styles.filter((s) => s.category === cat).map((s) => s.id);
  const triedIn = (cat) => inCategory(cat).filter((id) => triedStyles.has(id)).length;
  const categories = [...new Set(styles.map((s) => s.category))];
  return {
    checkins: mine.length,
    styles: triedStyles.size,
    stylesTotal: styles.length,
    categories: categories.filter((cat) => triedIn(cat) > 0).length,
    categoriesTotal: categories.length,
    triedIn,
    totalIn: (cat) => inCategory(cat).length,
    breweries: breweries.size,
    prefs: prefs.size,
    visited: notes.filter((n) => n?.visited?.length).length,
    tasted,
    maxSameBeer: Math.max(0, ...perBeer.values()),
    maxBeersInDay: Math.max(0, ...[...perDate.values()].map((s) => s.size)),
    seasons: seasons.size,
  };
}

// バッジの定義。value(facts) が goal 以上で獲得。tier は bronze / silver / gold
const BADGE_DEFS = [
  { id: 'first', title: 'はじめの1杯', desc: '最初の1杯を記録する', glyph: '1', tier: 'bronze', goal: 1, value: (f) => f.checkins },
  { id: 'cups-10', title: '10杯', desc: '10杯を記録する', glyph: '10', tier: 'bronze', goal: 10, value: (f) => f.checkins },
  { id: 'cups-50', title: '50杯', desc: '50杯を記録する', glyph: '50', tier: 'silver', goal: 50, value: (f) => f.checkins },
  { id: 'cups-100', title: '100杯', desc: '100杯を記録する', glyph: '100', tier: 'gold', goal: 100, value: (f) => f.checkins },
  { id: 'styles-5', title: 'スタイル探検家', desc: '5つのスタイルを飲む', glyph: '5', tier: 'bronze', goal: 5, value: (f) => f.styles },
  { id: 'styles-12', title: 'スタイル通', desc: '12のスタイルを飲む', glyph: '12', tier: 'silver', goal: 12, value: (f) => f.styles },
  { id: 'styles-all', title: '図鑑コンプリート', desc: '図鑑のスタイルをすべて飲む', glyph: '全', tier: 'gold', goal: (f) => f.stylesTotal, value: (f) => f.styles },
  { id: 'categories', title: 'ビール世界一周', desc: 'すべての系統（ラガー・ダーク・ベルギーなど）を1つ以上飲む', glyph: '周', tier: 'gold', goal: (f) => f.categoriesTotal, value: (f) => f.categories },
  { id: 'hophead', title: 'ホップヘッド', desc: 'ペールエール・IPA 系のスタイルをすべて飲む', glyph: 'IPA', tier: 'silver', goal: (f) => f.totalIn('ペールエール・IPA'), value: (f) => f.triedIn('ペールエール・IPA') },
  { id: 'dark', title: '黒ビール党', desc: 'ダーク系のスタイルをすべて飲む', glyph: '黒', tier: 'silver', goal: (f) => f.totalIn('ダーク'), value: (f) => f.triedIn('ダーク') },
  { id: 'sour', title: '酸味の探求者', desc: 'サワー系のスタイルをすべて飲む', glyph: '酸', tier: 'silver', goal: (f) => f.totalIn('サワー'), value: (f) => f.triedIn('サワー') },
  { id: 'breweries-5', title: '醸造所めぐり', desc: 'ブリュワー情報に載っている5つの醸造所のビールを飲む', glyph: '5', tier: 'bronze', goal: 5, value: (f) => f.breweries },
  { id: 'breweries-20', title: '醸造所コレクター', desc: '20の醸造所のビールを飲む', glyph: '20', tier: 'silver', goal: 20, value: (f) => f.breweries },
  { id: 'prefs-5', title: '旅するビール好き', desc: '5つの都道府県の醸造所のビールを飲む', glyph: '県', tier: 'silver', goal: 5, value: (f) => f.prefs },
  { id: 'visit-1', title: '醸造所へ', desc: '醸造所に「行った」を記録する', glyph: '訪', tier: 'bronze', goal: 1, value: (f) => f.visited },
  { id: 'tasted-10', title: 'テイスター', desc: '味・香り・テイスティングを10杯分入力する', glyph: '味', tier: 'silver', goal: 10, value: (f) => f.tasted },
  { id: 'favorite', title: '推し銘柄', desc: '同じ銘柄を5回記録する', glyph: '推', tier: 'bronze', goal: 5, value: (f) => f.maxSameBeer },
  { id: 'flight', title: '飲み比べ', desc: '1日に3種類の銘柄を記録する', glyph: '3', tier: 'bronze', goal: 3, value: (f) => f.maxBeersInDay },
  { id: 'seasons', title: '四季のビール', desc: '春・夏・秋・冬のすべての季節に記録する', glyph: '季', tier: 'silver', goal: 4, value: (f) => f.seasons },
];

/**
 * バッジの一覧と進み具合。
 * @returns {Array<{ id, title, desc, glyph, tier, goal, now, achieved }>}
 */
export function computeBadges(facts) {
  return BADGE_DEFS.map((d) => {
    const goal = typeof d.goal === 'function' ? d.goal(facts) : d.goal;
    const now = Math.min(d.value(facts), goal);
    return { id: d.id, title: d.title, desc: d.desc, glyph: d.glyph, tier: d.tier, goal, now, achieved: goal > 0 && now >= goal };
  });
}

/** 前回までに見せたバッジ（seen）に無い、新しく獲得したバッジ */
export function newlyEarned(badges, seen) {
  const s = new Set(seen || []);
  return badges.filter((b) => b.achieved && !s.has(b.id));
}

/**
 * 記録した直後に見せる「ひとこと」。記録は保存済み（checkins に含まれる）として数える。
 * @returns {{ cupNo: number, firstBeer: boolean, beerCount: number, newStyle: object|null, dexTried: number, dexTotal: number }}
 */
export function checkinHighlights(beers, checkins, styles, beerId) {
  const beer = beers.find((b) => b.id === beerId);
  const beerCount = checkins.filter((c) => c.beerId === beerId).length;
  const dex = styleCollection(beers, checkins, styles);
  const mine = dex.find((d) => d.style.id === beer?.styleId);
  return {
    cupNo: checkins.length,
    firstBeer: beerCount === 1,
    beerCount,
    newStyle: mine && mine.count === 1 ? mine.style : null,
    dexTried: dex.filter((d) => d.count > 0).length,
    dexTotal: dex.length,
  };
}
