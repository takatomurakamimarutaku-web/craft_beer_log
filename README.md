# クラフトビール記録

iPhone で使うクラフトビールの記録・検索アプリ（PWA）です。
HTML / CSS / JavaScript（ES Modules）だけで作られており、ビルドは不要です。
データはすべて端末のブラウザ内（IndexedDB）に保存され、外部には送信されません。

## 使い方

1. GitHub Pages などで公開した URL を iPhone の Safari で開く
2. 共有ボタン →「ホーム画面に追加」でアプリとしてインストールする
3. 下部の「＋」から飲んだビールを記録する
   - 銘柄名を入力すると登録済みの銘柄が候補に出ます（ひらがな・カタカナ・全角半角・大文字小文字の違いは同じとみなします）
   - 候補を選ぶと既存の銘柄に記録を追加、選ばなければ新しい銘柄として登録します
   - 名前だけでも保存できます。ブリュワー・スタイル・度数のどれかが空の場合は「未入力あり」と表示されます
   - 写真は1件につき4枚まで。長辺1280px の JPEG に縮小して保存します
4. 「その他」→「設定」でバックアップ（書き出し）と復元ができます。**定期的にバックアップしてください**

> iOS では、Safari で開いたときとホーム画面のアプリとでデータの保存場所が別になります。ホーム画面に追加したアプリで使ってください。

## 画面

| ハッシュ | 画面 |
|---|---|
| `#/beers` | 記録一覧（記録1件ごとのカード、新しい順） |
| `#/beer/:id` | 銘柄の詳細（評価の平均・最新値、飲んだ記録の履歴） |
| `#/beer/:id/edit` | 銘柄の編集 |
| `#/checkin/new`（`?beerId=` で銘柄を指定） | 記録の登録 |
| `#/checkin/:id/edit` | 記録の編集 |
| `#/settings` | 設定・バックアップ・復元 |
| `#/more` | その他メニュー |
| `#/search`, `#/wishlist`, `#/knowledge`, `#/stats` | 今後のフェーズで実装予定 |

## ファイル構成

```
index.html              アプリの土台（下部タブ・ヘッダー）
manifest.webmanifest    PWA の設定
sw.js                   Service Worker（オフライン対応・更新通知）
css/style.css           スタイル（ダークモード対応）
js/app.js               起動処理・ルート定義・SW 登録
js/router.js            ハッシュルーティング
js/db.js                IndexedDB 操作
js/models.js            データの生成・定数
js/validate.js          入力値の検証（純粋関数）
js/search.js            正規化・候補の抽出（純粋関数）
js/stats.js             集計（純粋関数）
js/image.js             写真の縮小・圧縮
js/backup.js            バックアップの書き出し・検証・読み込み
js/ui.js                共通 UI 部品
js/views/*.js           画面ごとの描画処理
data/styles.json        スタイル一覧（暫定。Phase 4 で正式版に置き換え）
data/flavor-tags.json   香りタグの語彙
data/terms.json, data/hops.json  知識データ（Phase 4 で作成）
icons/                  アイコン（SVG と PNG）
scripts/check-pwa.js    PWA 構成の検証
tools/icon-export.html  SVG アイコンから PNG を書き出すページ
test/*.test.js          テスト
```

## データ構造（IndexedDB）

DB 名 `craft-beer-log`、バージョン 1。ID は `crypto.randomUUID()`。

### beers（銘柄）

| 項目 | 内容 |
|---|---|
| id | ID |
| name / brewery | 銘柄名 / ブリュワー |
| styleId / styleOther | スタイルID（`data/styles.json`、`"other"` は自由入力）/ その他のスタイル名 |
| abv | 度数（0〜20、小数第1位）。未入力は null |
| status | `"tried"`（飲んだ）/ `"want"`（飲みたい） |
| nameKey / breweryKey | 検索用の正規化キー（保存時に生成） |
| memo, createdAt, updatedAt | メモ、作成・更新日時（ISO 8601） |

インデックス：`nameKey`, `breweryKey`, `styleId`, `status`

### checkins（飲んだ記録）

| 項目 | 内容 |
|---|---|
| id, beerId | ID、銘柄ID |
| date | 日付（`YYYY-MM-DD`、端末のローカル日付） |
| place | `{ type: "drank" \| "bought", name }` |
| serving | `"draft"`（樽生）/ `"can"` / `"bottle"` / `"other"` / null |
| volumeMl, price | 容量（ml）、価格（円） |
| rating | 評価 1〜5（任意） |
| tasting | `{ bitter, sweet, sour, body, aroma（各1〜5・任意）, flavorTags[] }`（Phase 5 で使用） |
| memo, photoIds[] | メモ、写真ID（最大4件） |
| incomplete | 銘柄のブリュワー・スタイル・度数のいずれかが空なら true |
| createdAt, updatedAt | 作成・更新日時 |

インデックス：`beerId`, `date`

### photos

`{ id, blob（JPEG 長辺1280px）, thumb（JPEG 長辺300px） }`

### meta

`{ key, value }`。`lastBackupAt`（最終バックアップ日時）を保存します。

### 正規化（検索キー）

NFKC 正規化 → 小文字化 → ひらがなをカタカナに統一 → 前後の空白除去・連続空白を1つに。
例：「ｉｐａ」「IPA」「ipa」は同じ、「ゆかい」で「ユカイ」がヒットします。

### スキーマを変更するとき

`js/db.js` の `DB_VERSION` を上げ、`migrate()` に `if (oldVersion < 新バージョン) { ... }` を追加し、移行のテストを `test/db.test.js` に追加します。

## バックアップ形式

写真を base64 で埋め込んだ JSON ファイル（1ファイル）です。

```json
{
  "format": "craft-beer-log-backup",
  "version": 1,
  "exportedAt": "2026-10-24T12:00:00.000Z",
  "counts": { "beers": 1, "checkins": 1, "photos": 1 },
  "beers": [ ... ],
  "checkins": [ ... ],
  "photos": [ { "id": "...", "type": "image/jpeg", "data": "<base64>", "thumbType": "image/jpeg", "thumb": "<base64>" } ]
}
```

- 読み込み時に形式・バージョン・各データ（ID の重複、銘柄・写真の参照、日付・評価の値）を検証し、問題があれば何も取り込みません
- アプリより新しいバージョンのファイルは読み込みません。古い形式は `js/backup.js` の `UPGRADES` で変換します
- 「既存のデータに追加」では同じ ID のデータは既存を残し、重複させません。「置き換え」は確認のうえ全データを入れ替えます

## テスト

```sh
npm install        # devDependency（fake-indexeddb）のインストール
npm test           # node --test
node scripts/check-pwa.js
```

`check-pwa.js` は次を検証します。

- manifest の必須項目（name, short_name, start_url, scope, display=standalone, 色, 192/512/maskable のアイコン）とアイコンファイルの存在
- `sw.js` の `PRECACHE_URLS` のファイルがすべて存在すること、`js/` `css/` `data/` `icons/` のファイルに漏れがないこと
- HTML / CSS / JS / SVG / manifest に絶対パス（`/` 始まり）や外部 URL の読み込みが無いこと

## GitHub Pages での公開手順

1. このリポジトリを GitHub に push する
2. GitHub のリポジトリ画面 → Settings → Pages
3. 「Build and deployment」の Source を「Deploy from a branch」、Branch を `main`、フォルダを `/ (root)` にして Save
4. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される
5. iPhone の Safari でその URL を開き、「ホーム画面に追加」する

パスはすべて相対パスなので、サブパス（`/<リポジトリ名>/`）でもそのまま動作します。
`tools/` `scripts/` `test/` も公開されますが、アプリからは読み込まれません。

## キャッシュ更新手順（アプリを更新するとき）

Service Worker がアプリのファイルをキャッシュしているため、**ファイルを変更したら必ず次を行ってください。**

1. `sw.js` の `CACHE_VERSION` を上げる（例：`'v2'` → `'v3'`）
2. ファイルを追加・削除・改名した場合は `sw.js` の `PRECACHE_URLS` も更新する
3. `npm test` と `node scripts/check-pwa.js` が通ることを確認する（キャッシュ対象の漏れはここで検出されます）
4. コミットして push する

利用者側では、アプリを開いたときに新しいバージョンが検出されると「新しいバージョンがあります［更新］」が表示され、［更新］を押すと切り替わります。
iOS ではアプリを開き直したタイミングで更新を確認するため、表示まで時間がかかることがあります（一度アプリを閉じて開き直すと早く確認されます）。

## アイコンの作り方（SVG → PNG）

元データは `icons/icon.svg`（通常）と `icons/icon-maskable.svg`（maskable 用。中央80%のセーフゾーンに収めたもの）です。

**方法1：ブラウザで書き出す（追加ツール不要）**

```sh
npx --yes http-server -p 8080 .   # または python3 -m http.server 8080
```

ブラウザで `http://localhost:8080/tools/icon-export.html` を開き、表示された4つの画像（`apple-touch-icon.png` 180px、`icon-192.png`、`icon-512.png`、`icon-maskable-512.png`）をクリックして保存し、`icons/` に置きます。

**方法2：コマンドで変換する（librsvg が入っている場合）**

```sh
rsvg-convert -w 180 -h 180 icons/icon.svg -o icons/apple-touch-icon.png
rsvg-convert -w 192 -h 192 icons/icon.svg -o icons/icon-192.png
rsvg-convert -w 512 -h 512 icons/icon.svg -o icons/icon-512.png
rsvg-convert -w 512 -h 512 icons/icon-maskable.svg -o icons/icon-maskable-512.png
```

iOS はアイコンの透過部分を黒く塗るため、背景は不透明にしています。アイコンを変えたら CACHE_VERSION を上げてください。

## 外部ライブラリとライセンス

アプリ本体は外部ライブラリを使用していません（CDN も使用しません）。

テスト用の開発依存のみ使用しています（アプリには同梱されません）。

| ライブラリ | 用途 | ライセンス |
|---|---|---|
| [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) | Node.js でのテスト用 IndexedDB | Apache-2.0 |

## 開発フェーズ

- Phase 1：PWA の基盤と記録の基本機能
- Phase 2：データ保護（バックアップ・復元）
- Phase 3：検索・絞り込み・飲みたいリスト（予定）
- Phase 4：クラフトビールの基礎知識ページ（予定）
- Phase 5：テイスティングノートと知識との連携（予定）
- Phase 6：統計・分析・共有（予定）
