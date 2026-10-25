// テイスティング（Phase 5）：集計・レーダーの座標（DOM に依存しない）
import { radarSvg } from './illust.js';

export const TASTE_AXES = [
  { key: 'bitter', label: '苦味' },
  { key: 'sweet', label: '甘味' },
  { key: 'sour', label: '酸味' },
  { key: 'body', label: 'ボディ' },
  { key: 'aroma', label: '香り' },
];
export const TASTE_MAX = 5;

/** 味の大まかな選択肢（記録画面のチップ。id は保存するので変えない） */
export const TASTE_TAGS = [
  { id: 'crisp', label: 'すっきり' },
  { id: 'sharp', label: 'キレがある' },
  { id: 'dry', label: 'ドライ' },
  { id: 'smooth', label: 'まろやか' },
  { id: 'light', label: '軽い' },
  { id: 'rich', label: '濃厚' },
  { id: 'bitter', label: '苦い' },
  { id: 'sweet', label: '甘い' },
  { id: 'sour', label: '酸っぱい' },
  { id: 'fruity', label: 'フルーティー' },
  { id: 'toasty', label: '香ばしい' },
  { id: 'fizzy', label: '炭酸が強い' },
  { id: 'boozy', label: 'アルコール感' },
];

/** 香りタグ（data/flavor-tags.json）を記録画面で見せるときのまとまり。載っていないタグは「その他」へ */
export const FLAVOR_GROUPS = [
  { label: 'フルーツ', ids: ['citrus', 'tropical', 'stone-fruit', 'berry', 'white-wine', 'banana'] },
  { label: 'ホップ・草花', ids: ['pine', 'resin', 'herbal', 'floral', 'grassy', 'earthy'] },
  { label: '麦芽・焦がし', ids: ['malty', 'caramel', 'roasty', 'chocolate', 'coffee'] },
];

/** 香りタグをグループに分ける（どのグループにも無いものは最後の「その他」） */
export function groupFlavorTags(flavorTags) {
  const byId = new Map(flavorTags.map((t) => [t.id, t]));
  const used = new Set();
  const groups = FLAVOR_GROUPS.map((g) => ({
    label: g.label,
    tags: g.ids.filter((id) => byId.has(id)).map((id) => (used.add(id), byId.get(id))),
  }));
  groups.push({ label: 'その他', tags: flavorTags.filter((t) => !used.has(t.id)) });
  return groups.filter((g) => g.tags.length);
}

/** 味・香りの表示用ラベル（選んだチップ → 自由入力の順） */
export function tasteLabels(t) {
  const label = new Map(TASTE_TAGS.map((x) => [x.id, x.label]));
  return [...(t?.tasteTags || []).map((id) => label.get(id) || id), ...(t?.tasteCustom || [])];
}
export function flavorLabels(t, tagLabels = {}) {
  const get = tagLabels instanceof Map ? (id) => tagLabels.get(id) : (id) => tagLabels[id];
  return [...(t?.flavorTags || []).map((id) => get(id) || id), ...(t?.flavorCustom || [])];
}

const nonEmpty = (a) => Array.isArray(a) && a.length > 0;

/** 5項目のどれか、または味・香りが入っているか */
export function hasTasting(t) {
  if (!t) return false;
  return TASTE_AXES.some((a) => typeof t[a.key] === 'number') || hasWords(t);
}

/** 味・香り（チップか自由入力）が入っているか */
export function hasWords(t) {
  return Boolean(t) && [t.flavorTags, t.flavorCustom, t.tasteTags, t.tasteCustom].some(nonEmpty);
}

/** 5項目のうち数値が入っている項目があるか（レーダーを描くか） */
export function hasScores(t) {
  return Boolean(t) && TASTE_AXES.some((a) => typeof t[a.key] === 'number');
}

/**
 * 記録ごとのテイスティングを項目ごとに平均する（未入力の項目は除いて平均）。
 * 1件も値が無い項目は null。
 */
export function averageTasting(checkins) {
  const out = {};
  for (const { key } of TASTE_AXES) {
    let sum = 0;
    let n = 0;
    for (const c of checkins) {
      const v = c.tasting?.[key];
      if (typeof v === 'number') {
        sum += v;
        n++;
      }
    }
    out[key] = n ? Math.round((sum / n) * 10) / 10 : null;
  }
  return out;
}

/**
 * レーダーチャートの頂点座標。軸は真上から時計回りに等間隔。
 * 未入力（null）の項目は中心に置き missing: true にする（形がゆがまないよう線は中心を通す）。
 * 値は 0〜max に丸める。
 */
export function radarPoints(values, { cx = 0, cy = 0, r = 1, max = TASTE_MAX, axes = TASTE_AXES } = {}) {
  const n = axes.length;
  return axes.map(({ key }, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const raw = values?.[key];
    const missing = typeof raw !== 'number' || Number.isNaN(raw);
    const v = missing ? 0 : Math.min(Math.max(raw, 0), max);
    const d = (v / max) * r;
    return { key, x: round(cx + d * Math.cos(angle)), y: round(cy + d * Math.sin(angle)), missing, value: missing ? null : v };
  });
}

/** 軸の端（目盛り・ラベル用）の座標 */
export function radarAxisEnd(i, { cx = 0, cy = 0, r = 1, n = TASTE_AXES.length } = {}) {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return { x: round(cx + r * Math.cos(angle)), y: round(cy + r * Math.sin(angle)) };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * 香りタグが重なる記録を探す（ホップのページ用）。
 * 重なったタグの数が多い順 → 日付の新しい順。重ならない記録は含めない。
 */
export function matchByFlavorTags(checkins, tags) {
  const want = new Set(tags);
  const out = [];
  for (const c of checkins) {
    const matched = (c.tasting?.flavorTags || []).filter((t) => want.has(t));
    if (matched.length) out.push({ checkin: c, matched });
  }
  return out.sort((a, b) => b.matched.length - a.matched.length || (a.checkin.date < b.checkin.date ? 1 : a.checkin.date > b.checkin.date ? -1 : 0));
}

/** テイスティングの値からレーダーチャートの SVG 文字列を作る */
export function tastingRadarSvg(values, { size = 220, compact = false } = {}) {
  const c = size / 2;
  const r = c;
  const points = radarPoints(values, { cx: c, cy: c, r });
  const axisEnds = TASTE_AXES.map((_, i) => radarAxisEnd(i, { cx: c, cy: c, r }));
  const title = TASTE_AXES.map((a, i) => `${a.label}${points[i].missing ? '未入力' : points[i].value}`).join('、');
  return radarSvg({ points, axisEnds, labels: TASTE_AXES.map((a) => a.label), max: TASTE_MAX, size, compact, title: `テイスティング：${title}` });
}
