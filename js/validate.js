// 入力値の検証（DOM に依存しない純粋関数）
// 戻り値は { ok, errors: {項目: メッセージ}, value: 整形済みの値 }

export const ABV_MIN = 0;
export const ABV_MAX = 20;
const SERVINGS = ['draft', 'can', 'bottle', 'other'];
const PLACE_TYPES = ['drank', 'bought'];
const STATUSES = ['tried', 'want'];

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  const s = String(v).normalize('NFKC').trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

/** 度数：空は null。0〜20、小数第1位に丸める */
export function parseAbv(input) {
  if (isBlank(input)) return { value: null, error: null };
  const n = toNumber(input);
  if (!Number.isFinite(n)) return { value: null, error: '度数は数値で入力してください' };
  if (n < ABV_MIN || n > ABV_MAX) return { value: null, error: `度数は${ABV_MIN}〜${ABV_MAX}の範囲で入力してください` };
  return { value: Math.round(n * 10) / 10, error: null };
}

/** 0以上の整数（容量・価格） */
export function parseNonNegativeInt(input, label, max = 1_000_000) {
  if (isBlank(input)) return { value: null, error: null };
  const n = toNumber(input);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { value: null, error: `${label}は整数で入力してください` };
  if (n < 0 || n > max) return { value: null, error: `${label}は0〜${max}の範囲で入力してください` };
  return { value: n, error: null };
}

/** 評価：空は null。1〜5の整数 */
export function parseRating(input) {
  if (isBlank(input)) return { value: null, error: null };
  const n = toNumber(input);
  if (!Number.isInteger(n) || n < 1 || n > 5) return { value: null, error: '評価は1〜5で入力してください' };
  return { value: n, error: null };
}

/** YYYY-MM-DD として実在する日付か */
export function isValidDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 銘柄の検証 */
export function validateBeer(input = {}) {
  const errors = {};
  const name = String(input.name ?? '').trim();
  if (!name) errors.name = '銘柄名を入力してください';
  if (name.length > 200) errors.name = '銘柄名は200文字以内で入力してください';
  const abv = parseAbv(input.abv);
  if (abv.error) errors.abv = abv.error;
  const status = input.status ?? 'tried';
  if (!STATUSES.includes(status)) errors.status = '状態が不正です';
  const styleId = isBlank(input.styleId) ? null : String(input.styleId);
  const value = {
    name,
    brewery: String(input.brewery ?? '').trim(),
    styleId,
    styleOther: styleId === 'other' ? String(input.styleOther ?? '').trim() : '',
    abv: abv.value,
    status,
    memo: String(input.memo ?? ''),
  };
  return { ok: Object.keys(errors).length === 0, errors, value };
}

/** 記録の検証 */
export function validateCheckin(input = {}) {
  const errors = {};
  const date = String(input.date ?? '').trim();
  if (!date) errors.date = '日付を入力してください';
  else if (!isValidDateString(date)) errors.date = '日付が不正です';
  const placeType = input.place?.type ?? 'drank';
  if (!PLACE_TYPES.includes(placeType)) errors.placeType = '飲んだ／買ったを選択してください';
  const serving = isBlank(input.serving) ? null : input.serving;
  if (serving !== null && !SERVINGS.includes(serving)) errors.serving = '提供形態が不正です';
  const volume = parseNonNegativeInt(input.volumeMl, '容量', 10000);
  if (volume.error) errors.volumeMl = volume.error;
  const price = parseNonNegativeInt(input.price, '価格');
  if (price.error) errors.price = price.error;
  const rating = parseRating(input.rating);
  if (rating.error) errors.rating = rating.error;
  const photoIds = Array.isArray(input.photoIds) ? input.photoIds : [];
  if (photoIds.length > 4) errors.photos = '写真は4枚までです';
  const value = {
    date,
    place: {
      type: placeType,
      name: String(input.place?.name ?? '').trim(),
      ...(typeof input.place?.eventId === 'string' && input.place.eventId ? { eventId: input.place.eventId } : {}),
    },
    serving,
    volumeMl: volume.value,
    price: price.value,
    rating: rating.value,
    memo: String(input.memo ?? ''),
    photoIds,
    tasting: parseTasting(input.tasting, errors),
  };
  return { ok: Object.keys(errors).length === 0, errors, value };
}

export const CUSTOM_WORD_MAX = 10;
export const CUSTOM_WORD_LEN = 20;

/** 「その他」の自由入力を語の配列にする（読点・カンマ・改行で区切り、重複と空を除く） */
export function parseCustomWords(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/[、,，\n]+/);
  const out = [];
  for (const w of list) {
    if (typeof w !== 'string') continue;
    const v = w.trim().slice(0, CUSTOM_WORD_LEN);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, CUSTOM_WORD_MAX);
}

const TASTE_KEYS = ['bitter', 'sweet', 'sour', 'body', 'aroma'];

/** テイスティング：5項目は 1〜5 の整数か未入力、味・香りのタグは重複を除いた文字列の配列、自由入力は語の配列 */
export function parseTasting(input = {}, errors = {}) {
  const t = input || {};
  const out = {};
  for (const key of TASTE_KEYS) {
    const v = t[key];
    if (v === null || v === undefined || v === '') out[key] = null;
    else if (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5) out[key] = Number(v);
    else {
      out[key] = null;
      errors.tasting = 'テイスティングは1〜5で入力してください';
    }
  }
  const ids = (a) => [...new Set((Array.isArray(a) ? a : []).filter((x) => typeof x === 'string' && x))];
  out.flavorTags = ids(t.flavorTags);
  out.flavorCustom = parseCustomWords(t.flavorCustom ?? []);
  out.tasteTags = ids(t.tasteTags);
  out.tasteCustom = parseCustomWords(t.tasteCustom ?? []);
  return out;
}

/** 「未入力あり」：ブリュワー・スタイル・度数のいずれかが空 */
export function isIncomplete(beer) {
  if (!beer) return true;
  const noStyle = !beer.styleId || (beer.styleId === 'other' && !String(beer.styleOther || '').trim());
  return !String(beer.brewery || '').trim() || noStyle || typeof beer.abv !== 'number';
}
