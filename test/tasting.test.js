import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { radarPoints, radarAxisEnd, averageTasting, hasTasting, hasScores, matchByFlavorTags, tastingRadarSvg, TASTE_AXES, TASTE_TAGS, groupFlavorTags, hasWords, tasteLabels, flavorLabels } from '../js/tasting.js';
import { validateCheckin, parseTasting, parseCustomWords } from '../js/validate.js';
import { createCheckin } from '../js/models.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≒ ${b}`);

test('radarPoints：満点は軸の端、真上から時計回り', () => {
  const pts = radarPoints({ bitter: 5, sweet: 5, sour: 5, body: 5, aroma: 5 }, { cx: 100, cy: 100, r: 100 });
  assert.deepEqual(pts.map((p) => p.key), TASTE_AXES.map((a) => a.key));
  near(pts[0].x, 100);
  near(pts[0].y, 0); // 真上
  assert.ok(pts[1].x > 100 && pts[1].y < 100, '2本目は右上');
  assert.ok(pts[4].x < 100, '5本目は左側');
  for (let i = 0; i < 5; i++) {
    const e = radarAxisEnd(i, { cx: 100, cy: 100, r: 100 });
    near(pts[i].x, e.x);
    near(pts[i].y, e.y);
  }
});

test('radarPoints：値に比例した距離', () => {
  const [p] = radarPoints({ bitter: 3 }, { cx: 0, cy: 0, r: 50 });
  near(p.x, 0);
  near(p.y, -30);
  assert.equal(p.value, 3);
});

test('radarPoints：未入力は中心に置き missing、範囲外は丸める', () => {
  const pts = radarPoints({ bitter: null, sweet: undefined, sour: 9, body: -1, aroma: NaN }, { cx: 10, cy: 20, r: 40 });
  assert.equal(pts[0].missing, true);
  assert.deepEqual([pts[0].x, pts[0].y], [10, 20]);
  assert.equal(pts[1].missing, true);
  assert.equal(pts[2].missing, false);
  assert.equal(pts[2].value, 5, '上限で丸める');
  assert.equal(pts[3].value, 0, '下限で丸める');
  assert.equal(pts[4].missing, true, 'NaN は未入力扱い');
  assert.ok(radarPoints(null).every((p) => p.missing), 'values が無くても落ちない');
});

test('averageTasting：項目ごとに未入力を除いて平均', () => {
  const avg = averageTasting([
    { tasting: { bitter: 4, sweet: null, sour: 1 } },
    { tasting: { bitter: 5, sweet: null, sour: 2 } },
    { tasting: null },
  ]);
  assert.equal(avg.bitter, 4.5);
  assert.equal(avg.sweet, null);
  assert.equal(avg.sour, 1.5);
  assert.equal(avg.aroma, null);
  assert.deepEqual(averageTasting([]), { bitter: null, sweet: null, sour: null, body: null, aroma: null });
});

test('hasTasting / hasScores', () => {
  assert.equal(hasTasting(createCheckin().tasting), false);
  assert.equal(hasTasting({ flavorTags: ['citrus'] }), true);
  assert.equal(hasScores({ flavorTags: ['citrus'] }), false);
  assert.equal(hasScores({ body: 2 }), true);
});

test('parseTasting / validateCheckin：1〜5の整数か未入力、タグは重複除去', () => {
  assert.deepEqual(parseTasting({ bitter: '3', sweet: '', flavorTags: ['citrus', 'citrus', 1, ''] }), {
    bitter: 3, sweet: null, sour: null, body: null, aroma: null, flavorTags: ['citrus'],
    flavorCustom: [], tasteTags: [], tasteCustom: [],
  });
  const ng = validateCheckin({ date: '2026-10-01', tasting: { bitter: 6 } });
  assert.equal(ng.ok, false);
  assert.ok(ng.errors.tasting);
  const ok = validateCheckin({ date: '2026-10-01', tasting: { aroma: 5, flavorTags: ['pine'] } });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.tasting.aroma, 5);
  assert.deepEqual(validateCheckin({ date: '2026-10-01' }).value.tasting.flavorTags, [], '未指定でも空の形');
});

test('matchByFlavorTags：重なりの多い順 → 新しい順、重ならない記録は除く', () => {
  const cs = [
    { id: '1', date: '2026-01-01', tasting: { flavorTags: ['citrus'] } },
    { id: '2', date: '2026-03-01', tasting: { flavorTags: ['citrus'] } },
    { id: '3', date: '2026-02-01', tasting: { flavorTags: ['citrus', 'pine', 'coffee'] } },
    { id: '4', date: '2026-04-01', tasting: { flavorTags: ['coffee'] } },
    { id: '5', date: '2026-05-01' },
  ];
  const r = matchByFlavorTags(cs, ['citrus', 'pine']);
  assert.deepEqual(r.map((m) => m.checkin.id), ['3', '2', '1']);
  assert.deepEqual(r[0].matched, ['citrus', 'pine']);
});

test('tastingRadarSvg：未入力の項目は「－」と表示し、全部未入力なら形を描かない', () => {
  const s = tastingRadarSvg({ bitter: 3, sweet: null });
  assert.match(s, /甘味 <tspan font-weight="700">－<\/tspan>/);
  assert.match(s, /aria-label="テイスティング：苦味3、甘味未入力/);
  assert.doesNotMatch(tastingRadarSvg({}), /fill-opacity=".28"/);
  assert.doesNotMatch(tastingRadarSvg({ bitter: 2 }, { compact: true }), /<text/, '小さい版はラベルなし');
});

test('parseCustomWords：読点・カンマ・改行で区切り、空・重複を除き、長さと個数を制限', () => {
  assert.deepEqual(parseCustomWords('ライチ、 ハチミツ,ライチ，\n、'), ['ライチ', 'ハチミツ']);
  assert.deepEqual(parseCustomWords(['  塩気 ', 1, '', '塩気']), ['塩気']);
  assert.deepEqual(parseCustomWords(null), []);
  assert.equal(parseCustomWords('あ'.repeat(30))[0].length, 20);
  assert.equal(parseCustomWords(Array.from({ length: 15 }, (_, i) => `w${i}`)).length, 10);
});

test('味・香り：parseTasting が整え、旧形式（新項目なし）も空配列で読める', () => {
  const t = parseTasting({ tasteTags: ['crisp', 'crisp'], tasteCustom: ['塩気', '塩気'], flavorCustom: 'ライチ、ハチミツ' });
  assert.deepEqual(t.tasteTags, ['crisp']);
  assert.deepEqual(t.tasteCustom, ['塩気']);
  assert.deepEqual(t.flavorCustom, ['ライチ', 'ハチミツ']);
  const old = createCheckin({ tasting: { bitter: 2, flavorTags: ['pine'] } });
  assert.deepEqual([old.tasting.tasteTags, old.tasting.tasteCustom, old.tasting.flavorCustom], [[], [], []]);
  assert.deepEqual(old.tasting.flavorTags, ['pine']);
});

test('hasTasting / hasWords：自由入力だけでも入力ありとみなす', () => {
  assert.equal(hasWords({ tasteCustom: ['塩気'] }), true);
  assert.equal(hasWords({ flavorTags: [], tasteTags: [] }), false);
  assert.equal(hasTasting({ flavorCustom: ['ライチ'] }), true);
  assert.equal(hasTasting({ tasteTags: ['dry'] }), true);
});

test('tasteLabels / flavorLabels：チップ → 自由入力の順でラベルにする', () => {
  const t = { tasteTags: ['crisp', 'unknown'], tasteCustom: ['塩気'], flavorTags: ['citrus'], flavorCustom: ['ライチ'] };
  assert.deepEqual(tasteLabels(t), ['すっきり', 'unknown', '塩気']);
  assert.deepEqual(flavorLabels(t, { citrus: '柑橘' }), ['柑橘', 'ライチ']);
  assert.deepEqual(flavorLabels(t, new Map([['citrus', '柑橘']])), ['柑橘', 'ライチ']);
  assert.deepEqual(tasteLabels(undefined), []);
});

test('TASTE_TAGS は id 重複なし、groupFlavorTags は全タグを1回ずつ含み未分類は「その他」', () => {
  assert.equal(new Set(TASTE_TAGS.map((t) => t.id)).size, TASTE_TAGS.length);
  const tags = JSON.parse(readFileSync(new URL('../data/flavor-tags.json', import.meta.url), 'utf8'));
  const groups = groupFlavorTags(tags);
  const ids = groups.flatMap((g) => g.tags.map((t) => t.id));
  assert.equal(ids.length, tags.length);
  assert.equal(new Set(ids).size, tags.length);
  assert.equal(groups.at(-1).label, 'その他');
  assert.ok(groups.at(-1).tags.some((t) => t.id === 'wood'));
  // グループ定義に存在しない id が混ざっていても落ちない
  assert.deepEqual(groupFlavorTags([{ id: 'x', label: 'X' }]).map((g) => g.label), ['その他']);
});
