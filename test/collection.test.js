import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleCollection, collectionFacts, computeBadges, newlyEarned } from '../js/collection.js';

const styles = [
  { id: 'ipa', name: 'IPA', category: 'ペールエール・IPA' },
  { id: 'pale-ale', name: 'ペールエール', category: 'ペールエール・IPA' },
  { id: 'stout', name: 'スタウト', category: 'ダーク' },
];
const beers = [
  { id: 'a', styleId: 'ipa', brewery: 'X' },
  { id: 'b', styleId: 'stout', brewery: 'Y' },
  { id: 'c', styleId: null, brewery: '' },
];
const checkins = [
  { beerId: 'a', date: '2026-01-10' },
  { beerId: 'a', date: '2026-07-01' },
  { beerId: 'b', date: '2026-07-01', tasting: { bitter: 3 } },
  { beerId: 'c', date: '2026-07-01', tasting: { flavorTags: ['citrus'] } },
  { beerId: 'zzz', date: '2026-07-02' },
];

test('styleCollection: スタイルごとの杯数と最初に飲んだ日（未飲は0）', () => {
  const d = styleCollection(beers, checkins, styles);
  assert.deepEqual(
    d.map((x) => [x.style.id, x.count, x.firstDate]),
    [
      ['ipa', 2, '2026-01-10'],
      ['pale-ale', 0, null],
      ['stout', 1, '2026-07-01'],
    ],
  );
});

test('collectionFacts: 杯数・スタイル・醸造所・県・1日の種類・季節・入力した杯', () => {
  const f = collectionFacts({
    beers,
    checkins,
    styles,
    breweryIdOf: (b) => ({ X: 'bx', Y: 'by' })[b.brewery] || null,
    prefOf: (id) => ({ bx: '13', by: '13' })[id],
    notes: [{ breweryId: 'bx', visited: ['2026-01-01'] }, { breweryId: 'by', visited: [], wantToVisit: true }],
  });
  assert.equal(f.checkins, 4, '銘柄が見つからない記録は数えない');
  assert.equal(f.styles, 2);
  assert.equal(f.categories, 2);
  assert.equal(f.categoriesTotal, 2);
  assert.equal(f.triedIn('ペールエール・IPA'), 1);
  assert.equal(f.totalIn('ペールエール・IPA'), 2);
  assert.equal(f.breweries, 2);
  assert.equal(f.prefs, 1);
  assert.equal(f.visited, 1, '行きたいだけのメモは数えない');
  assert.equal(f.maxBeersInDay, 3);
  assert.equal(f.maxSameBeer, 2);
  assert.equal(f.seasons, 2, '1月=冬、7月=夏');
  assert.equal(f.tasted, 2);
});

test('computeBadges: 目標に届いたものだけ獲得。進み具合は目標で頭打ち', () => {
  const f = collectionFacts({ beers, checkins, styles });
  const byId = Object.fromEntries(computeBadges(f).map((b) => [b.id, b]));
  assert.equal(byId.first.achieved, true);
  assert.equal(byId['cups-10'].achieved, false);
  assert.equal(byId['cups-10'].now, 4);
  assert.equal(byId.flight.achieved, true);
  assert.equal(byId.flight.now, 3);
  assert.equal(byId.dark.achieved, true, 'ダーク系はスタウト1種だけなので全部飲んだ');
  assert.equal(byId.hophead.achieved, false);
  assert.equal(byId.categories.achieved, true);
  assert.equal(byId.sour.achieved, false, 'サワー系のスタイルが無いときは獲得にしない（目標0）');
});

test('newlyEarned: 見たことのない獲得済みバッジだけ', () => {
  const badges = [
    { id: 'a', achieved: true },
    { id: 'b', achieved: true },
    { id: 'c', achieved: false },
  ];
  assert.deepEqual(newlyEarned(badges, ['a']).map((b) => b.id), ['b']);
  assert.deepEqual(newlyEarned(badges, null).map((b) => b.id), ['a', 'b']);
});
