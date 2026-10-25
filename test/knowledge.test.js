import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srmToHex, styleDisplaySrm, searchKnowledge, styleTexts, formatRange, filterByTags, hopTexts, basicTexts } from '../js/knowledge.js';
import { glassSvg, rangeBarSvg, ibuScaleSvg, srmScaleSvg, hopConeSvg, hopArtSvg, GLASS_TYPES } from '../js/illust.js';

test('srmToHex：端・中間・不正値', () => {
  assert.equal(srmToHex(0), '#ffe699');
  assert.equal(srmToHex(1), '#ffe699');
  assert.equal(srmToHex(40), '#36080a');
  assert.equal(srmToHex(80), '#36080a');
  assert.match(srmToHex(5), /^#[0-9a-f]{6}$/);
  assert.equal(srmToHex(NaN), srmToHex(6));
  assert.equal(srmToHex(6), '#f8a600');
  // 数値が大きいほど暗い
  const lum = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5), 16);
  assert.ok(lum(srmToHex(3)) > lum(srmToHex(12)) && lum(srmToHex(12)) > lum(srmToHex(35)));
});

test('styleDisplaySrm：指定値 → 範囲の中央 → 既定値', () => {
  assert.equal(styleDisplaySrm({ displaySrm: 7, srm: [1, 40] }), 7);
  assert.equal(styleDisplaySrm({ displaySrm: null, srm: [2, 4] }), 3);
  assert.equal(styleDisplaySrm({ displaySrm: null, srm: null }), 6);
});

test('searchKnowledge：表記ゆれを吸収し、複数語は AND', () => {
  const items = [
    { name: 'ヘイジーIPA', nameEn: 'Hazy IPA', category: 'ペールエール・IPA', aliases: ['NEIPA'], summary: '', flavor: 'トロピカル' },
    { name: 'スタウト', nameEn: 'Irish Stout', category: 'ダーク', aliases: [], summary: '', flavor: 'コーヒー' },
  ];
  assert.equal(searchKnowledge(items, '', styleTexts).length, 2);
  assert.deepEqual(searchKnowledge(items, 'へいじー', styleTexts).map((s) => s.name), ['ヘイジーIPA']);
  assert.deepEqual(searchKnowledge(items, 'ｎｅｉｐａ', styleTexts).map((s) => s.name), ['ヘイジーIPA']);
  assert.deepEqual(searchKnowledge(items, 'stout コーヒー', styleTexts).map((s) => s.name), ['スタウト']);
  assert.equal(searchKnowledge(items, 'stout トロピカル', styleTexts).length, 0);
});

test('formatRange', () => {
  assert.equal(formatRange([4.2, 5.8], '%'), '4.2〜5.8%');
  assert.equal(formatRange([20, 40]), '20〜40');
  assert.equal(formatRange(null), 'さまざま');
});

test('glassSvg：全グラスで切り抜きIDが一意、色は検証される', () => {
  const a = glassSvg('tulip', '#123456');
  const b = glassSvg('tulip', '#123456');
  const id = (s) => s.match(/clipPath id="([^"]+)"/)[1];
  assert.notEqual(id(a), id(b));
  assert.match(a, /fill="#123456"/);
  assert.doesNotMatch(glassSvg('nonic', 'red;"><script>'), /script/);
  for (const g of GLASS_TYPES) assert.match(glassSvg(g, '#ffffff'), /^<svg[\s\S]*<\/svg>$/);
  assert.match(glassSvg('unknown', '#ffffff'), /<svg/, '不明なグラスはパイントで描く');
});

test('rangeBarSvg：範囲外は上限で切り、null は空バー', () => {
  assert.match(rangeBarSvg([50, 150], 100), /x="100.0" y="2" width="100.0"/);
  assert.doesNotMatch(rangeBarSvg(null, 100), /y="2"/);
});

test('ibuScaleSvg / srmScaleSvg：範囲の無いスタイルは除き、名前はエスケープする', () => {
  const styles = [
    { name: 'A<b>', ibu: [10, 20], srm: [2, 4] },
    { name: 'サワー', ibu: null, srm: null },
  ];
  const ibu = ibuScaleSvg(styles);
  assert.match(ibu, /A&lt;b&gt;/);
  assert.doesNotMatch(ibu, /サワー<\/text>/);
  assert.equal((ibu.match(/rx="6"/g) || []).length, 1);
  const srm = srmScaleSvg(styles, srmToHex);
  assert.equal((srm.match(/height="16"/g) || []).length, 40, '色見本は40段階');
  assert.match(srm, />79</, 'SRM 40 ≒ EBC 79');
  assert.match(ibuScaleSvg([]), /^<svg/, '0件でも描ける');
});

test('filterByTags：選んだタグをすべて持つものだけ', () => {
  const hops = [
    { id: 'a', flavorTags: ['citrus', 'tropical'] },
    { id: 'b', flavorTags: ['citrus', 'pine'] },
    { id: 'c', flavorTags: ['spicy'] },
  ];
  assert.equal(filterByTags(hops, []).length, 3);
  assert.equal(filterByTags(hops, undefined).length, 3);
  assert.deepEqual(filterByTags(hops, ['citrus']).map((x) => x.id), ['a', 'b']);
  assert.deepEqual(filterByTags(hops, ['citrus', 'pine']).map((x) => x.id), ['b']);
  assert.deepEqual(filterByTags(hops, ['citrus', 'spicy']), []);
});

test('ホップ：キーワード（別名・産地）と香りタグの組み合わせ', () => {
  const hops = [
    { name: 'コロンバス', nameEn: 'Columbus', origin: 'アメリカ', aliases: ['CTZ'], aroma: '', styles: [], flavorTags: ['earthy'] },
    { name: 'ザーツ', nameEn: 'Saaz', origin: 'チェコ', aliases: [], aroma: '', styles: ['チェコのピルスナー'], flavorTags: ['spicy'] },
  ];
  assert.deepEqual(searchKnowledge(hops, 'ctz', hopTexts).map((x) => x.nameEn), ['Columbus']);
  assert.deepEqual(searchKnowledge(hops, 'ちぇこ', hopTexts).map((x) => x.nameEn), ['Saaz']);
  assert.equal(filterByTags(searchKnowledge(hops, 'ちぇこ', hopTexts), ['earthy']).length, 0);
});

test('hopConeSvg：苞の数と title のエスケープ', () => {
  const s = hopConeSvg({ title: '<x>' });
  assert.equal((s.match(/stroke-width="1.2"/g) || []).length, 20 + 1, '苞20枚＋葉1枚');
  assert.match(s, /aria-label="&lt;x&gt;"/);
});

test('hopArtSvg：香りタグのモチーフ（最大3つ・未知のタグは無視）と背景色', async () => {
  const { readFileSync } = await import('node:fs');
  const s = hopArtSvg({ flavorTags: ['citrus', 'malty', 'pine', 'herbal', 'floral'], title: '<x>' });
  assert.deepEqual([...s.matchAll(/data-aroma="([^"]+)"/g)].map((m) => m[1]), ['citrus', 'pine', 'herbal']);
  assert.match(s, /fill="#f2a33a" fill-opacity=".22"/, '背景は最初の香りの色');
  assert.match(s, /aria-label="&lt;x&gt;"/);
  assert.doesNotMatch(hopArtSvg({ flavorTags: [] }), /data-aroma/);
  // 全品種で少なくとも1つモチーフが出る。上位3つの組み合わせが同じ品種はない
  const hops = JSON.parse(readFileSync(new URL('../data/hops.json', import.meta.url), 'utf8'));
  const keys = hops.map((x) => [...hopArtSvg({ flavorTags: x.flavorTags }).matchAll(/data-aroma="([^"]+)"/g)].map((m) => m[1]).join(','));
  for (const [i, k] of keys.entries()) assert.ok(k, `${hops[i].id}: モチーフが無い`);
  assert.equal(new Set(keys).size, keys.length, '絵柄が重複する品種がある');
});

test('basicTexts：入門記事を本文・工程名でも検索できる', async () => {
  const { readFileSync } = await import('node:fs');
  const basics = JSON.parse(readFileSync(new URL('../data/basics.json', import.meta.url), 'utf8'));
  const ids = (q) => searchKnowledge(basics, q, basicTexts).map((a) => a.id);
  assert.ok(ids('下面発酵').includes('fermentation'));
  assert.ok(ids('ルプリン').includes('hops'));
  assert.ok(ids('製麦').includes('brewing'));
  assert.deepEqual(ids('存在しない語句'), []);
});

test('imageEntry / imageCaption：画像の有無と表記', async () => {
  const { imageEntry, imageCaption } = await import('../js/knowledge.js');
  const images = { styles: { ipa: { file: 'images/styles/ipa.webp', license: 'ai' } }, hops: {} };
  assert.equal(imageEntry(images, 'styles', 'ipa').file, 'images/styles/ipa.webp');
  assert.equal(imageEntry(images, 'hops', 'citra'), null);
  assert.equal(imageEntry({}, 'styles', 'ipa'), null);
  assert.equal(imageEntry(null, 'styles', 'ipa'), null);
  assert.match(imageCaption({ license: 'ai' }), /AI生成.*仮/);
  assert.equal(imageCaption({ license: 'cc-by', author: 'Taro', licenseVersion: '4.0' }), '写真：Taro（CC BY 4.0）');
  assert.equal(imageCaption({ license: 'cc-by-sa', author: 'Hanako' }), '写真：Hanako（CC BY-SA）');
  assert.equal(imageCaption({ license: 'cc0' }), '写真（CC0）');
  assert.equal(imageCaption({ license: 'pd', author: 'Jiro' }), '写真：Jiro（パブリックドメイン）');
  assert.equal(imageCaption(null), '');
});
