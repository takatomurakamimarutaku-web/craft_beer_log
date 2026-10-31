// 共有（Web Share。使えないときは文章をコピー）
import { styleLabel, SERVING_LABELS } from './models.js';
import { tasteLabels, flavorLabels } from './tasting.js';

/** 共有する文章（純粋関数）。checkin が無ければ銘柄の情報だけ */
export function buildShareText(beer, checkin, styles, { tagLabels = {} } = {}) {
  const lines = [];
  lines.push(`🍺 ${beer.name}${beer.brewery ? `（${beer.brewery}）` : ''}`);
  const meta = [styleLabel(beer, styles), typeof beer.abv === 'number' ? `${beer.abv.toFixed(1)}%` : ''].filter(Boolean).join(' / ');
  if (meta) lines.push(meta);
  if (checkin) {
    const parts = [];
    if (typeof checkin.rating === 'number') parts.push('★'.repeat(checkin.rating) + '☆'.repeat(5 - checkin.rating));
    if (checkin.serving) parts.push(SERVING_LABELS[checkin.serving]);
    if (checkin.place?.name) parts.push(`@${checkin.place.name}`);
    if (parts.length) lines.push(parts.join(' '));
    const taste = tasteLabels(checkin.tasting);
    if (taste.length) lines.push(`味：${taste.join('、')}`);
    const flavor = flavorLabels(checkin.tasting, tagLabels);
    if (flavor.length) lines.push(`香り：${flavor.join('、')}`);
    if (checkin.memo && checkin.memo.trim()) lines.push(checkin.memo.trim());
  }
  lines.push('#ホップ手帖');
  return lines.join('\n');
}

/**
 * 共有する。写真があれば1枚添付（端末が対応していれば）。
 * @returns 'shared' | 'copied' | 'cancelled' | 'manual'
 */
export async function shareContent({ title, text, photo, fileName = 'beer.jpg' }) {
  if (navigator.share) {
    const data = { title, text };
    if (photo) {
      const file = new File([photo], fileName, { type: photo.type || 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) data.files = [file];
    }
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // 共有に失敗したらコピーに切り替える
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'manual';
  }
}
