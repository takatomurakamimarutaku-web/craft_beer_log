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
