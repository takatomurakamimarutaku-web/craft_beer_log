// 知識ページのデータ処理（DOM に依存しない）
import { normalize } from './search.js';

/** Phase 1〜3 の暫定スタイル名。移行で未知の ID になったとき「その他」の名前として使う */
export const LEGACY_STYLE_NAMES = {
  pilsner: 'ピルスナー',
  'pale-ale': 'ペールエール',
  ipa: 'IPA',
  'hazy-ipa': 'ヘイジーIPA',
  'double-ipa': 'ダブルIPA',
  'amber-ale': 'アンバーエール',
  porter: 'ポーター',
  stout: 'スタウト',
  weizen: 'ヴァイツェン',
  'belgian-white': 'ベルジャンホワイト',
  saison: 'セゾン',
  sour: 'サワー',
};

/** スタイル一覧のデータ版。styles.json の構成を変えたら上げる */
export const STYLES_VERSION = 2;

/**
 * 銘柄のスタイル ID を現在のスタイル一覧に合わせる（純粋関数）。
 * 一覧に無い ID は「その他」に移し、元の名前を自由入力欄に残す。変更が無ければ null。
 */
export function migrateBeerStyle(beer, validIds, legacyNames = LEGACY_STYLE_NAMES) {
  const id = beer.styleId;
  if (!id || id === 'other' || validIds.has(id)) return null;
  return { ...beer, styleId: 'other', styleOther: beer.styleOther || legacyNames[id] || id };
}

// ---- 色 ----

// SRM 値と表示色の対応（画面表示用の近似。実際の色は液量や光で変わる）
const SRM_COLORS = [
  [1, '#ffe699'],
  [2, '#ffd878'],
  [3, '#ffca5a'],
  [4, '#ffbf42'],
  [6, '#f8a600'],
  [8, '#ea8f00'],
  [10, '#de7c00'],
  [13, '#cb6200'],
  [17, '#b04500'],
  [20, '#9b3200'],
  [24, '#7c2100'],
  [30, '#5d1400'],
  [40, '#36080a'],
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** SRM 値から表示用の色（#rrggbb）を返す。範囲外は端の色 */
export function srmToHex(srm) {
  if (typeof srm !== 'number' || Number.isNaN(srm)) return '#f8a600'; // SRM 6 相当
  if (srm <= SRM_COLORS[0][0]) return SRM_COLORS[0][1];
  for (let i = 1; i < SRM_COLORS.length; i++) {
    const [s1, c1] = SRM_COLORS[i];
    if (srm <= s1) {
      const [s0, c0] = SRM_COLORS[i - 1];
      const t = (srm - s0) / (s1 - s0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, '0')).join('');
    }
  }
  return SRM_COLORS[SRM_COLORS.length - 1][1];
}

/** スタイルのイラストに使う SRM（指定が無ければ範囲の中央） */
export function styleDisplaySrm(style) {
  if (typeof style.displaySrm === 'number') return style.displaySrm;
  if (Array.isArray(style.srm)) return (style.srm[0] + style.srm[1]) / 2;
  return 6;
}

/** 明るい色の上では暗い文字を使うための判定 */
export function isLightColor(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

// ---- 検索 ----

/**
 * 知識データをキーワードで絞り込む。空白区切りの語をすべて含むもの（AND）。
 * getTexts: 項目から検索対象の文字列配列を返す関数
 */
export function searchKnowledge(items, query, getTexts) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => {
    const hay = getTexts(item).filter(Boolean).map(normalize).join('\n');
    return words.every((w) => hay.includes(w));
  });
}

export const hopTexts = (x) => [x.name, x.nameEn, x.origin, ...(x.aliases || []), x.aroma, ...(x.styles || [])];

/** 香りタグで絞り込む（指定したタグをすべて持つもの）。tags が空なら全件 */
export function filterByTags(items, tags) {
  if (!tags || !tags.length) return items;
  return items.filter((x) => tags.every((t) => x.flavorTags.includes(t)));
}

export const HOP_USE_LABELS = { aroma: '香りづけ', bittering: '苦味づけ', dual: '香り・苦味の両用' };

export const basicTexts = (a) => [
  a.name,
  a.summary,
  ...a.sections.flatMap((s) => [s.heading, ...s.body]),
  ...(a.steps || []).flatMap((s) => [s.name, s.text]),
];

export const termTexts = (t) => [t.name, t.fullName, ...(t.aliases || []), t.summary];

export const styleTexts = (s) => [s.name, s.nameEn, s.category, ...(s.aliases || []), s.summary, s.flavor];

/** 範囲を「4.2〜5.8」の形にする。null は「さまざま」 */
export function formatRange(range, unit = '') {
  if (!Array.isArray(range)) return 'さまざま';
  const f = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${f(range[0])}〜${f(range[1])}${unit}`;
}

// ---- 画像（data/images.json） ----

export const IMAGE_KINDS = ['styles', 'hops'];
export const IMAGE_LICENSES = ['ai', 'cc-by', 'cc-by-sa', 'cc0', 'pd', 'own', 'permission'];

/** スタイル・ホップの画像情報。無ければ null（イラストを表示する） */
export function imageEntry(images, kind, id) {
  const e = images?.[kind]?.[id];
  return e && typeof e.file === 'string' ? e : null;
}

/** 画像の下に出す表記（純粋関数）。AI生成は仮である旨、CC素材は作者とライセンスを示す */
export function imageCaption(e) {
  if (!e) return '';
  switch (e.license) {
    case 'ai':
      return 'AI生成のイメージ（仮）。実際のビール・ホップとは異なる場合があります';
    case 'cc-by':
    case 'cc-by-sa':
      return `写真：${e.author}（${e.license === 'cc-by' ? 'CC BY' : 'CC BY-SA'} ${e.licenseVersion || ''}`.trimEnd() + '）';
    case 'cc0':
      return e.author ? `写真：${e.author}（CC0）` : '写真（CC0）';
    case 'pd':
      return e.author ? `写真：${e.author}（パブリックドメイン）` : '写真（パブリックドメイン）';
    case 'own':
      return e.author ? `写真：${e.author}` : '';
    case 'permission':
      return `写真提供：${e.author}`;
    default:
      return '';
  }
}

export const GLASS_LABELS = {
  flute: 'ピルスナーグラス（フルート型）',
  nonic: 'パイントグラス（ノニック）',
  tulip: 'チューリップグラス',
  weizen: 'ヴァイツェングラス',
  snifter: 'スニフター',
  goblet: 'ゴブレット',
  stange: 'シュタンゲ',
};
