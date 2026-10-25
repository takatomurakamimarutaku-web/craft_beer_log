import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PREFS,
  KIND_LABELS,
  VERIFICATION_LABELS,
  activeBreweries,
  buildBreweryIndex,
  matchBrewery,
  resolveBreweryId,
  groupBeersByBrewery,
  filterBreweries,
  countByPref,
  pinState,
  makeBreweryNote,
  looseKey,
  isSafeUrl,
} from '../js/breweries.js';

const data = JSON.parse(readFileSync(new URL('../data/breweries.json', import.meta.url), 'utf8'));
const list = data.breweries;

const sample = [
  { id: 'a', name: 'ゆかい醸造所', nameKana: 'ゆかいじょうぞうしょ', nameEn: 'Yukai Brewery', aliases: ['ゆかいビール'], prefCode: '04', city: '仙台市', status: 'active' },
  { id: 'b', name: 'みなと Brewing', nameKana: 'みなとぶるーいんぐ', aliases: [], prefCode: '02', city: '八戸市', status: 'active' },
  { id: 'c', name: 'みなと醸造所', nameKana: 'みなとじょうぞうしょ', aliases: [], prefCode: '03', city: '宮古市', status: 'active' },
  { id: 'd', name: 'むかし麦酒', nameKana: 'むかしばくしゅ', aliases: [], prefCode: '05', city: '秋田市', status: 'closed' },
];

test('データ：必須項目・ID重複・県コード・種別・座標の範囲', () => {
  assert.ok(data.meta.attribution.includes('仙台国税局'), '出典の表示文がある');
  assert.ok(list.length >= 70);
  const ids = new Set();
  for (const b of list) {
    assert.match(b.id, /^[a-z0-9-]+$/, b.id);
    assert.ok(!ids.has(b.id), `ID重複 ${b.id}`);
    ids.add(b.id);
    assert.ok(b.name, b.id);
    assert.ok(PREFS[b.prefCode], `${b.id} 県コード`);
    assert.ok(KIND_LABELS[b.kind], `${b.id} 種別`);
    assert.ok(['active', 'closed'].includes(b.status), `${b.id} 状態`);
    assert.ok(VERIFICATION_LABELS[b.verification], `${b.id} 確認方法`);
    assert.ok(!b.summary || b.summary.length <= 120, `${b.id} 紹介文`);
    assert.ok(Array.isArray(b.aliases));
    assert.ok(Array.isArray(b.sources) && b.sources.every((s) => s.label && isSafeUrl(s.url)), `${b.id} 出典`);
    assert.ok(b.sources.length || b.sourceNotes, `${b.id} 確認に使った情報`);
    for (const url of Object.values(b.links || {})) assert.ok(isSafeUrl(url), `${b.id} リンク ${url}`);
    if (b.geo) {
      // 東北6県の範囲
      assert.ok(b.geo.lat > 36.7 && b.geo.lat < 41.6 && b.geo.lng > 139.1 && b.geo.lng < 142.1, `${b.id} 座標`);
      assert.ok(['block', 'area'].includes(b.geo.precision), `${b.id} 精度`);
    }
  }
});

test('データ：すべての名前・別名が自分自身に一意に一致する（ほかのブリュワーと衝突しない）', () => {
  const index = buildBreweryIndex(list);
  for (const b of list) {
    for (const n of [b.name, b.nameKana, b.nameEn, ...b.aliases].filter(Boolean)) {
      assert.equal(matchBrewery(n, index).id, b.id, `${b.id}: ${n}`);
    }
  }
});

test('照合：表記揺れ（全角・ひらがな・社名・「醸造所」の有無）を吸収する', () => {
  const index = buildBreweryIndex(sample);
  assert.equal(matchBrewery('ゆかい醸造所', index).id, 'a');
  assert.equal(matchBrewery('ユカイジョウゾウショ', index).id, 'a');
  assert.equal(matchBrewery('ＹＵＫＡＩ ＢＲＥＷＥＲＹ', index).id, 'a');
  assert.equal(matchBrewery('株式会社ゆかい醸造所', index).id, 'a');
  assert.equal(matchBrewery('ゆかいビール', index).id, 'a');
  assert.equal(matchBrewery('', index).id, null);
  assert.equal(matchBrewery('知らない醸造所', index).id, null);
  assert.equal(looseKey('ゆかい ブルワリー'), 'ユカイ');
});

test('照合：複数に一致するときは自動で決めず、候補を返す', () => {
  const index = buildBreweryIndex(sample);
  const m = matchBrewery('みなと', index);
  assert.equal(m.id, null);
  assert.deepEqual(m.candidates.sort(), ['b', 'c']);
  // 完全一致する名前があればそれを優先する
  assert.equal(matchBrewery('みなと醸造所', index).id, 'c');
});

test('銘柄との紐づけ：手動の breweryId を優先し、無ければ名前の一致', () => {
  const index = buildBreweryIndex(sample);
  assert.equal(resolveBreweryId({ brewery: 'ゆかい醸造所' }, index), 'a');
  assert.equal(resolveBreweryId({ brewery: 'ゆかい醸造所', breweryId: 'c' }, index), 'c');
  assert.equal(resolveBreweryId({ brewery: 'ゆかい醸造所', breweryId: 'removed' }, index), 'a', '存在しないIDは無視');
  assert.equal(resolveBreweryId({ brewery: 'みなと' }, index), null);
  const groups = groupBeersByBrewery(
    [
      { id: '1', brewery: 'ゆかいビール' },
      { id: '2', brewery: 'Yukai Brewery' },
      { id: '3', brewery: '' },
      { id: '4', brewery: 'むかし麦酒' },
    ],
    index,
  );
  assert.deepEqual(groups.get('a').map((b) => b.id), ['1', '2']);
  assert.deepEqual(groups.get('d').map((b) => b.id), ['4'], '製造をやめたブリュワーにも過去の記録は紐づく');
});

test('一覧：製造をやめたものを除き、県・キーワードで絞り込み、県コード順に並べる', () => {
  const active = activeBreweries(sample);
  assert.deepEqual(active.map((b) => b.id), ['a', 'b', 'c']);
  assert.deepEqual(filterBreweries(active).map((b) => b.id), ['b', 'c', 'a']);
  assert.deepEqual(filterBreweries(active, { pref: '04' }).map((b) => b.id), ['a']);
  assert.deepEqual(filterBreweries(active, { query: '八戸' }).map((b) => b.id), ['b']);
  assert.deepEqual(filterBreweries(active, { query: 'ﾐﾅﾄ' }).map((b) => b.id), ['b', 'c']);
  assert.deepEqual(countByPref(active), [['02', 1], ['03', 1], ['04', 1]]);
});

test('ピンの状態：飲んだ > 行った > 行きたい > 未訪問', () => {
  const notes = new Map([
    ['a', { visited: ['2026-10-01'], wantToVisit: true }],
    ['b', { visited: [], wantToVisit: true }],
  ]);
  assert.equal(pinState('a', new Set(['a']), notes), 'tried');
  assert.equal(pinState('a', new Set(), notes), 'visited');
  assert.equal(pinState('b', new Set(), notes), 'want');
  assert.equal(pinState('c', new Set(), notes), 'none');
});

test('行ったメモ：日付の重複・不正を除いて新しい順、空なら null', () => {
  const now = new Date('2026-10-25T00:00:00Z');
  const n = makeBreweryNote('a', { visited: ['2026-10-01', '2026-10-20', '2026-10-01', 'x'], memo: '  駅近 ' }, now);
  assert.deepEqual(n, { breweryId: 'a', visited: ['2026-10-20', '2026-10-01'], wantToVisit: false, memo: '駅近', updatedAt: now.toISOString() });
  assert.equal(makeBreweryNote('a', { visited: [], wantToVisit: false, memo: ' ' }), null);
  assert.equal(makeBreweryNote('a', { wantToVisit: true }).wantToVisit, true);
});

test('外部リンク：http/https 以外は開かない', () => {
  assert.equal(isSafeUrl('https://example.com/a'), true);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl(null), false);
});
