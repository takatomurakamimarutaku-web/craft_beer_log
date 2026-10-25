// ブリュワー情報（DOM に依存しない）
import { normalize } from './search.js';

/** 都道府県（JIS X 0401 の2桁コード） */
export const PREFS = {
  '01': '北海道', '02': '青森県', '03': '岩手県', '04': '宮城県', '05': '秋田県', '06': '山形県', '07': '福島県',
  '08': '茨城県', '09': '栃木県', '10': '群馬県', '11': '埼玉県', '12': '千葉県', '13': '東京都', '14': '神奈川県',
  '15': '新潟県', '16': '富山県', '17': '石川県', '18': '福井県', '19': '山梨県', '20': '長野県', '21': '岐阜県',
  '22': '静岡県', '23': '愛知県', '24': '三重県', '25': '滋賀県', '26': '京都府', '27': '大阪府', '28': '兵庫県',
  '29': '奈良県', '30': '和歌山県', '31': '鳥取県', '32': '島根県', '33': '岡山県', '34': '広島県', '35': '山口県',
  '36': '徳島県', '37': '香川県', '38': '愛媛県', '39': '高知県', '40': '福岡県', '41': '佐賀県', '42': '長崎県',
  '43': '熊本県', '44': '大分県', '45': '宮崎県', '46': '鹿児島県', '47': '沖縄県',
};

export const KIND_LABELS = { brewery: '醸造所', brewpub: 'ブルーパブ', contract: '委託醸造', major: '大手の工場' };

export const VERIFICATION_LABELS = {
  official: '公式サイトで確認',
  'official+secondary': '公式サイトと報道・紹介記事で確認',
  secondary: '報道・業界団体・紹介記事で確認',
  'nta-only': '国税局の一覧のみで確認（営業状況は未確認）',
};

export const LINK_LABELS = {
  official: '公式サイト',
  shop: 'オンラインショップ',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  association: '業界団体のページ',
  cityPage: '自治体のページ',
  localPage: '紹介ページ',
  crowdfunding: 'クラウドファンディング',
};

/** 特徴タグ（公式サイトや紹介記事で確認できたものだけ付ける） */
export const FEATURE_LABELS = {
  hoppy: 'ホップの効いたIPA系',
  european: 'ヨーロッパの伝統スタイル',
  local: '地元の素材',
  fruit: '果物のビール',
  organic: 'オーガニック',
  sake: '酒蔵のビール',
  cider: 'シードルも',
  award: '受賞歴あり',
  food: '料理と楽しめる',
};

/** 買いやすさ（知名度の目安。数字が大きいほど手に入りやすい） */
export const AVAILABILITY = {
  local: { rank: 1, label: '現地で飲める・買える' },
  regional: { rank: 2, label: '地元の店でも買える' },
  online: { rank: 3, label: '通販で買える' },
  national: { rank: 4, label: '全国の店で買える' },
};

export const SORTS = { pref: '県ごと', founded: '創業が古い順', availability: '買いやすい順' };

/** 一覧・地図に出すもの（ビール製造をやめたものは除く） */
export function activeBreweries(list) {
  return (list || []).filter((b) => b.status !== 'closed');
}

// 名前の照合で無視する語（「〇〇ブルワリー」と「〇〇」を同じとみなす）
const NOISE = /株式会社|有限会社|合同会社|\(株\)|\(有\)|\(同\)|ブリュワリー|ブルワリー|ブルーイング|ブリューイング|ブルーワリー|醸造所|ビール工房|brewing company|brewing co\.?|brewery|brewing|brewpub|beer|ビール|[\s・･.,'’&＆-]/g;

/** ゆるい照合キー（表記揺れ・社名の有無・「ブルワリー」等を吸収） */
export function looseKey(value) {
  return normalize(value).replace(NOISE, '');
}

function namesOf(b) {
  return [b.name, b.nameKana, b.nameEn, ...(b.aliases || [])].filter(Boolean);
}

/**
 * 照合用の索引。exact は正規化キー、loose はゆるいキーから ID の集合を引く。
 * 製造をやめたブリュワーも過去の記録に紐づけられるよう含める。
 */
export function buildBreweryIndex(list) {
  const exact = new Map();
  const loose = new Map();
  const byId = new Map();
  const add = (map, key, id) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(id);
  };
  for (const b of list || []) {
    byId.set(b.id, b);
    for (const n of namesOf(b)) {
      add(exact, normalize(n), b.id);
      // 2文字以下のゆるいキーは誤一致が多いので使わない
      const lk = looseKey(n);
      if (lk.length > 2) add(loose, lk, b.id);
    }
  }
  return { exact, loose, byId };
}

/**
 * 入力されたブリュワー名を照合する。
 * @returns {{ id: string|null, candidates: string[] }} 一意に決まれば id、複数なら candidates
 */
export function matchBrewery(text, index) {
  const key = normalize(text);
  if (!key) return { id: null, candidates: [] };
  let ids = index.exact.get(key);
  if (!ids || !ids.size) {
    const lk = looseKey(text);
    ids = lk.length > 2 ? index.loose.get(lk) : null;
  }
  const list = ids ? [...ids] : [];
  return { id: list.length === 1 ? list[0] : null, candidates: list.length > 1 ? list : [] };
}

/** 銘柄のブリュワーID。手動で選んだ breweryId を優先し、無ければ名前が一意に一致したもの */
export function resolveBreweryId(beer, index) {
  if (beer.breweryId && index.byId.has(beer.breweryId)) return beer.breweryId;
  return matchBrewery(beer.brewery, index).id;
}

/** ブリュワーIDごとの銘柄の一覧 */
export function groupBeersByBrewery(beers, index) {
  const map = new Map();
  for (const beer of beers) {
    const id = resolveBreweryId(beer, index);
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(beer);
  }
  return map;
}

/**
 * 一覧の絞り込みと並べ替え。キーワードは名前・住所・代表銘柄に一致させる。
 * sort：pref（県コード順）／founded（創業が古い順、不明は後ろ）／availability（買いやすい順、不明は後ろ）。
 * 同じ順位はよみがな順。
 * @param {{ pref?: string, query?: string, feature?: string, sort?: string }} filter
 */
export function filterBreweries(list, { pref = '', query = '', feature = '', sort = 'pref' } = {}) {
  const q = normalize(query);
  const kana = (a, b) => (a.nameKana || a.name).localeCompare(b.nameKana || b.name, 'ja');
  const year = (b) => b.founded ?? 9999;
  const avail = (b) => AVAILABILITY[b.availability]?.rank ?? 0;
  const cmp = {
    pref: (a, b) => a.prefCode.localeCompare(b.prefCode),
    founded: (a, b) => year(a) - year(b),
    availability: (a, b) => avail(b) - avail(a),
  }[sort] || (() => 0);
  return list
    .filter((b) => !pref || b.prefCode === pref)
    .filter((b) => !feature || (b.features || []).includes(feature))
    .filter((b) => !q || [...namesOf(b), b.city, b.address, ...(b.flagships || []).map((f) => f.name)].some((s) => normalize(s).includes(q)))
    .sort((a, b) => cmp(a, b) || kana(a, b));
}

/** 都道府県ごとの件数（コード順） */
export function countByPref(list) {
  const counts = new Map();
  for (const b of list) counts.set(b.prefCode, (counts.get(b.prefCode) || 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * ピンの状態。飲んだ（記録した銘柄がある）を優先し、次に行った、行きたい。
 * @returns {'tried'|'visited'|'want'|'none'}
 */
export function pinState(id, triedIds, notes) {
  if (triedIds.has(id)) return 'tried';
  const n = notes.get(id);
  if (n?.visited?.length) return 'visited';
  if (n?.wantToVisit) return 'want';
  return 'none';
}

export const PIN_LABELS = { tried: '飲んだ', visited: '行った', want: '行きたい', none: '未訪問' };

/** 行ったメモ。空になったら null（保存せず削除する） */
export function makeBreweryNote(breweryId, { visited = [], wantToVisit = false, memo = '' } = {}, now = new Date()) {
  const dates = [...new Set(visited.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().reverse();
  const text = String(memo || '').trim();
  if (!dates.length && !wantToVisit && !text) return null;
  return { breweryId, visited: dates, wantToVisit: Boolean(wantToVisit), memo: text, updatedAt: now.toISOString() };
}

/** 住所の表示（番地が分からないものは市町村まで） */
export function addressText(b) {
  return b.address || `${PREFS[b.prefCode] || ''}${b.city || ''}`;
}

/** 外部リンクとして開いてよい URL か（http/https のみ） */
export function isSafeUrl(url) {
  return typeof url === 'string' && /^https?:\/\/[^\s]+$/i.test(url);
}
