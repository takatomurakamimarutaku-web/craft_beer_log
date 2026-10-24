// 性能確認用のダミーデータ生成（テストとブラウザでの確認に使う）
import { createBeer, createCheckin, withBeerKeys } from '../js/models.js';
import { isIncomplete } from '../js/validate.js';

const STYLE_IDS = ['pilsner', 'pale-ale', 'ipa', 'hazy-ipa', 'double-ipa', 'amber-ale', 'porter', 'stout', 'weizen', 'belgian-white', 'saison', 'sour', 'other'];
const BREWERIES = ['ヤッホー', 'うちゅう', 'コエド', 'ベアレン', '箕面', '志賀高原', 'Brew Dog', 'Stone', 'ひでじ', 'いわて蔵', '伊勢角屋', 'Far Yeast', 'Y.MARKET', '京都醸造', 'TDM 1874'];
const WORDS = ['ペール', 'ホッピー', 'ゆかい', 'ナイト', 'サンセット', 'ミルキー', 'ブラック', 'ゴールデン', 'Hazy', 'Juicy', 'West', 'Coast', 'Imperial', 'Session', 'Fresh'];
const SERVINGS = ['draft', 'can', 'bottle', 'other', null];

/** 再現可能な乱数 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * @returns {{ beers, checkins }}
 */
export function generateDummyData({ beers: nBeers = 500, checkins: nCheckins = 2000, seed = 1 } = {}) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const beers = [];
  for (let i = 0; i < nBeers; i++) {
    const styleId = r() < 0.05 ? null : pick(STYLE_IDS);
    beers.push(
      createBeer({
        id: `beer-${i}`,
        name: `${pick(WORDS)} ${pick(WORDS)} ${i}`,
        brewery: r() < 0.05 ? '' : pick(BREWERIES),
        styleId,
        styleOther: styleId === 'other' ? 'グルート' : '',
        abv: r() < 0.05 ? null : Math.round((3 + r() * 10) * 10) / 10,
        status: i % 10 === 0 ? 'want' : 'tried',
      }),
    );
  }
  const tried = beers.filter((b) => b.status === 'tried');
  const checkins = [];
  for (let i = 0; i < nCheckins; i++) {
    const beer = pick(tried);
    const day = new Date(Date.UTC(2024, 0, 1) + Math.floor(r() * 1000) * 86400000).toISOString().slice(0, 10);
    checkins.push(
      createCheckin({
        id: `checkin-${i}`,
        beerId: beer.id,
        date: day,
        place: { type: r() < 0.6 ? 'drank' : 'bought', name: pick(['ビアバーA', '酒屋B', 'ブルーパブC', '']) },
        serving: pick(SERVINGS),
        volumeMl: pick([350, 473, 500, null]),
        price: Math.round(500 + r() * 1500),
        rating: r() < 0.15 ? null : 1 + Math.floor(r() * 5),
        incomplete: isIncomplete(beer),
        createdAt: new Date(Date.UTC(2024, 0, 1) + i * 60000).toISOString(),
      }),
    );
  }
  return { beers: beers.map(withBeerKeys), checkins };
}
