# ホップ手帖

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
4. 「検索」で名前・ブリュワーのキーワード、スタイル・度数・評価などで絞り込みと並べ替えができます
5. 「その他」→「飲みたいリスト」に気になる銘柄を登録し、飲んだら「飲んだ」から記録します
6. 「その他」→「設定」でバックアップ（書き出し）と復元ができます。**定期的にバックアップしてください**

> iOS では、Safari で開いたときとホーム画面のアプリとでデータの保存場所が別になります。ホーム画面に追加したアプリで使ってください。

## 画面

| ハッシュ | 画面 |
|---|---|
| `#/beers` | 記録一覧（記録1件ごとのカード、新しい順） |
| `#/beer/:id` | 銘柄の詳細（評価の平均・最新値、飲んだ記録の履歴） |
| `#/beer/:id/edit` | 銘柄の編集 |
| `#/checkin/new`（`?beerId=` で銘柄を指定） | 記録の登録 |
| `#/checkin/:id/edit` | 記録の編集 |
| `#/search` | 検索・絞り込み・並べ替え |
| `#/wishlist`, `#/wishlist/new` | 飲みたいリスト |
| `#/settings` | 設定・バックアップ・復元 |
| `#/more` | その他メニュー |
| `#/knowledge`（`?tab=basics\|styles\|terms\|hops`） | 知識（はじめに／スタイル／用語／ホップ、キーワード検索） |
| `#/knowledge/basic/:id` | 入門記事（クラフトビールとは・原料・造り方・発酵・ホップ。工程図・比較表付き） |
| `#/knowledge/style/:id` | スタイルの解説（グラスと色のイラスト、数値の目安、参考リンク） |
| `#/knowledge/term/:id` | 用語の解説（IBU・SRM はスケール図付き） |
| `#/knowledge/hop/:id` | ホップの解説（香りタグ、α酸、よく使われるスタイル）。一覧は `?tab=hops&tag=citrus,pine` で香りタグを指定して開ける |
| `#/events`（`?past=1` で終了したもの） | イベント一覧（開催中・今週末・月ごと。地方とキーワードで絞り込み） |
| `#/event/:id` | イベントの詳細（日程・会場・料金・公式サイト・最終確認日・情報源） |
| `#/stats` | 統計（スタイル別・度数分布・ブリュワーTOP10・月別・提供形態と平均価格・好きな香り・イベント別）。棒をタップすると検索へ |

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
js/events.js            イベント情報の判定・絞り込み・検証（純粋関数）
js/validate.js          入力値の検証（純粋関数）
js/search.js            正規化・検索・絞り込み（純粋関数）
js/stats.js             集計（純粋関数。統計画面の各グラフの元データ）
js/charts.js            自作 SVG の横棒・縦棒グラフ（文字列を返す純粋関数）
js/share.js             共有文の作成と Web Share／コピーへの切り替え
js/tasting.js           テイスティングの平均・レーダーの座標・香りタグの照合（純粋関数）
js/image.js             写真の縮小・圧縮
js/knowledge.js         知識データの検索・SRM の表示色・スタイル移行（純粋関数）
js/illust.js            自作 SVG イラスト（グラス・範囲バーなど）
js/backup.js            バックアップの書き出し・検証・読み込み
js/ui.js                共通 UI 部品
js/views/*.js           画面ごとの描画処理
data/styles.json        スタイル（25件。登録画面の選択肢と知識ページで共用）
data/flavor-tags.json   香りタグの語彙
data/terms.json, data/hops.json  知識データ（Phase 4 で作成）
data/basics.json        入門記事（知識タブの「はじめに」）
data/events.json        全国のビールイベント（アプリ本体と別にネット優先で取得）
icons/                  アイコン（SVG と PNG）
scripts/check-pwa.js    PWA 構成の検証
scripts/check-events.js イベントデータの検証
scripts/dummy-data.js   性能確認用のダミーデータ生成
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
| place | `{ type: "drank" \| "bought", name, eventId? }`。eventId はイベント（`data/events.json`）の回の id。配信からイベントが消えても name は残る |
| serving | `"draft"`（樽生）/ `"can"` / `"bottle"` / `"other"` / null |
| volumeMl, price | 容量（ml）、価格（円） |
| rating | 評価 1〜5（任意） |
| tasting | `{ bitter, sweet, sour, body, aroma（各1〜5・未入力は null）, flavorTags[]（flavor-tags.json の ID） }`。記録画面の「テイスティング」（折りたたみ）で入力 |
| memo, photoIds[] | メモ、写真ID（最大4件） |
| incomplete | 銘柄のブリュワー・スタイル・度数のいずれかが空なら true |
| createdAt, updatedAt | 作成・更新日時 |

インデックス：`beerId`, `date`

### photos

`{ id, blob（JPEG 長辺1280px）, thumb（JPEG 長辺300px） }`

### eventPlans（イベントの参加状況、DB バージョン 3 で追加）

`{ id（イベントの id）, name, startDate, endDate, status: "want" | "going" | "went" | null, memo, updatedAt }`。name と日程は、配信側からイベントが消えても表示できるようにするための写しです。状態もメモも空にすると削除します。イベントで初めて記録したとき、自動で `went` になります。

### meta

`{ key, value }`。`lastBackupAt`（最終バックアップ日時）、`stylesVersion`（実施したスタイル移行の版）を保存します。

### 正規化（検索キー）

NFKC 正規化 → 小文字化 → ひらがなをカタカナに統一 → 前後の空白除去・連続空白を1つに。
例：「ｉｐａ」「IPA」「ipa」は同じ、「ゆかい」で「ユカイ」がヒットします。

### スキーマを変更するとき

`js/db.js` の `DB_VERSION` を上げ、`migrate()` に `if (oldVersion < 新バージョン) { ... }` を追加し、移行のテストを `test/db.test.js` に追加します。

## 知識データ（data/*.json）

アプリには同梱のデータだけを使い、実行時に外部へ取りに行きません（出典リンクは利用者がタップしたときだけ開きます）。説明文は複数の出典を確認したうえで独自にまとめたもので、出典の文章の転載・言い換えではありません。

### styles.json

| 項目 | 内容 |
|---|---|
| id | スラッグ（Phase 1〜3 の暫定 ID はすべて引き継ぎ） |
| name / nameEn / category / aliases | 表示名・英語名・分類・別名（検索対象） |
| summary / flavor / history | 概要・味わい・歴史（history は確認できたものだけ。無ければ null） |
| abv / ibu / srm | `[最小, 最大]`。出典の範囲を合わせた「代表的な目安」。数値の目安が無いものは null |
| displaySrm | イラストの色に使う SRM（範囲が広すぎるときだけ指定。無ければ範囲の中央） |
| glass | `flute` `nonic` `tulip` `weizen` `snifter` `goblet` `stange`（出典で確認できないものは null） |
| pairing | 合う料理の例 |
| rangeNote | 出典による数値の違い |
| sources | `[{ title, url（https）, accessedAt（YYYY-MM-DD） }]` 1件以上 |

### terms.json

`{ id, name, fullName, aliases, summary, body（段落の配列）, scale（"ibu" | "srm" | null）, relatedStyles（スタイルID）, sources }`。scale を指定すると、styles.json の範囲からスケール図を描きます。

### hops.json

`{ id, name, nameEn, aliases, origin, originNote, alpha（α酸 [最小, 最大] %）, use（"aroma" | "bittering" | "dual" | null）, aroma, flavorTags（flavor-tags.json の ID）, styles（表示用）, styleIds（解説へのリンク）, note（出典による違い・要確認）, sources }`

### basics.json

`{ id, name, summary, sections（[{ heading, body（段落の配列） }]）, steps（[{ name, text }] または null。工程の流れとして最初の節の後に表示）, compare（{ columns, rows, note, insertAfter } または null。比較表。insertAfter の節の後に表示）, relatedBasics / relatedStyles / relatedTerms / relatedHops（各データの ID）, sources }`。配列の順が一覧の表示順（読む順）です。

### images.json（スタイル・ホップの画像）

`{ styles: { <スタイルID>: 画像 }, hops: { <ホップID>: 画像 }, breweries: { <ブリュワーID>: ロゴ } }`。画像が無い項目はイラスト（ブリュワーはピン）を表示します。ブリュワーのロゴは 256px 正方形の WebP（images/breweries/<id>.webp、白抜きロゴは暗い背景で塗る）です。

画像 = `{ file（images/styles/<id>.webp など）, license（"ai" | "cc-by" | "cc-by-sa" | "cc0" | "pd" | "own" | "unverified" | "permission"）, author, licenseVersion, sourceUrl, service, generatedAt, prompt }`

- AI生成（license "ai"）は service（生成サービス名）・generatedAt・prompt を必ず記録し、画面に「AI生成のイメージ（仮）」と表示します（文章の指示だけで生成し、ネット上の画像は入力しない）
- CC BY / BY-SA と提供写真は author と sourceUrl が必須で、画面に作者・ライセンス・出典を表示します
- `unverified` は自分と知人のテスト用に一時的に使う、権利を確認していない画像です（ラベル・ロゴ入りや出典サイトの写真）。sourceUrl を必ず記録し、一般公開の前に差し替えます。画面には「権利未確認・テスト用」と表示します
- Wikimedia Commons の写真は CC0・CC BY・パブリックドメイン（pd）のみ使います（一般公開の前に、銘柄のラベルやロゴが写ったものは差し替えを検討）。CC0・pd も author と sourceUrl を記録します
- 画像は長辺 640px 程度の WebP（1枚 50KB 前後）にし、`sw.js` の PRECACHE_URLS に追加します（`images/` も漏れ検査の対象）

### flavor-tags.json

香りタグの語彙 `{ id, label }`。ホップの香り（Phase 4-3）とテイスティング入力（Phase 5）で共用します。

### events.json（イベント情報）

毎年続くイベントを `series`、各年の開催を `events` に分けて持ちます。説明文や画像は持たず、日程・会場・料金などの事実だけを、主催者の公式ページ（無ければ自治体・観光協会のページ）で確認して自分の言葉で書きます。まとめサイトの内容は転載しません。

- series: `id` `name` `kana` `kind`（festival / beergarden / tasting / tto / brewery / other）`prefecture`（都道府県コード。`js/events.js` の `PREFECTURES`）`officialUrl` `usualPeriod`（出典に「例年」とある場合のみ。無ければ null）`breweryIds`（任意。関係する醸造所の `data/breweries.json` の id。tto・brewery では必須）
- 一覧は「フェス」と「お店・醸造所」（kind が tto / brewery）を切り替えて出します。お店・醸造所のイベントは、ブリュワー情報に載っている醸造所が**公式サイトで告知したもの**だけを載せます（Instagram だけの告知は確認できないので載せません）
- events: `id`（変えない）`seriesId` `edition` `status`（scheduled / tentative / cancelled / postponed）`startDate` `endDate` `hours` `prefecture` `city` `venue` `priceNote` `officialUrl` `ticketUrl` `note` `lastVerified` `sources[]`
- 中止になった回も消さずに `status: "cancelled"` にします
- 開催予定で `lastVerified` から60日を過ぎたものは、画面に「情報が古い可能性」と出ます

更新の手順（フェスは月1回と開催2週間前の直前確認、お店・醸造所のイベントも月1回）：

1. 公式ページで新しい回・日程の変更・中止を確認し、`data/events.json` を直して `updatedAt` と各回の `lastVerified` を更新する
2. `node scripts/check-events.js` と `npm test` を通す
3. プルリクエストで差分と公式リンクを確認してマージする

`sw.js` はこのファイルだけネット優先で読むため、**イベント情報だけの更新では `CACHE_VERSION` を上げる必要はありません**（次にイベント画面を開いたときに反映されます）。

### スタイルの移行

起動時とバックアップの読み込み後に、`styles.json` に無い `styleId` を持つ銘柄を「その他」に移し、元の名前を自由入力欄に残します（`js/knowledge.js` の `migrateBeerStyle`）。銘柄ストアの構造は変わらないため DB のバージョンは上げず、実施した版を meta の `stylesVersion` に記録します。スタイルを削除・統合するときは `LEGACY_STYLE_NAMES` に旧名を追加し、`STYLES_VERSION` を上げてください。

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
  "eventPlans": [ ... ],
  "photos": [ { "id": "...", "type": "image/jpeg", "data": "<base64>", "thumbType": "image/jpeg", "thumb": "<base64>" } ]
}
```

- 読み込み時に形式・バージョン・各データ（ID の重複、銘柄・写真の参照、日付・評価の値）を検証し、問題があれば何も取り込みません
- `eventPlans`（イベントの参加状況）は v1.5.0 で追加した任意の項目です。無いファイル（それ以前のバックアップ）も読み込めます
- アプリより新しいバージョンのファイルは読み込みません。古い形式は `js/backup.js` の `UPGRADES` で変換します
- 「既存のデータに追加」では同じ ID のデータは既存を残し、重複させません。「置き換え」は確認のうえ全データを入れ替えます

## 製品化に向けた対応（v1.1.0）

- 初回起動時の案内（20歳以上の確認 → できること → データの保存先）。完了すると meta の `onboardedAt` に記録（`js/views/welcome.js`）
- iPhone の Safari で開いているときは、ホーム画面への追加の案内を表示（判定は `js/install.js`）
- バックアップの案内：未バックアップで最初の記録から30日以上 or 20件以上、最終バックアップから30日以上、またはその後20件以上（`backupReminder`）
- 記録画面の入力途中の内容を meta の `checkinDraft` に自動保存（写真を除く）。タブ・戻るボタンで離れるときは確認する
- エラーは `js/errors.js` で「何が起きたか＋次にすること」の日本語にする（容量不足・DB・許可・通信）
- 文字サイズを iPhone の設定に合わせる（`-apple-system-body`）、フォーカス表示、ダイアログ内のフォーカス閉じ込め、「元に戻す」は10秒、色のコントラスト比4.5以上
- 利用者向けバージョンは `js/version.js` の `APP_VERSION`。更新内容は `data/changelog.json`（package.json と一致することをテストで確認）
- GitHub Actions（`.github/workflows/test.yml`）で push・PR ごとに `npm test` と `check-pwa` を実行

リリースのたびに：`APP_VERSION`・`package.json` の version・`changelog.json` の先頭を更新し、`CACHE_VERSION` を上げる。

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

1. `sw.js` の `CACHE_VERSION` を上げる（例：`'v5'` → `'v6'`）
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
- Phase 3：検索・絞り込み・飲みたいリスト
- Phase 4：クラフトビールの基礎知識ページ（完了：スタイル25件・用語12件・ホップ19品種）
- Phase 5：テイスティングノートと知識との連携（完了）
  - 記録画面でテイスティング（5項目＋香りタグ）を入力、銘柄の詳細にレーダーチャート（平均と記録ごと）
  - レーダーは未入力の項目を中心に置き、ラベルに「－」と表示（形がゆがんで見えないよう、未入力は0とは区別）
  - 銘柄のスタイル → 知識の解説、スタイルの解説 →「このスタイルの自分の記録」、ホップ →「同じ香りタグの自分の記録」
  - 検索に香りタグの絞り込み（銘柄の全記録のタグを合わせ、選んだタグをすべて含むもの）
- Phase 6：統計・分析・共有（完了）
  - 統計は「1記録＝1杯」で数えます。銘柄が削除された記録は、銘柄の情報が要る集計から除きます
  - グラフはすべて自作 SVG。1系列・軸1本・色はテーマ色1色。各グラフに「数値を表で見る」を付け、色だけに頼らない
  - 棒をタップすると、その条件で検索画面を開きます（スタイル・度数・ブリュワー名・月・提供形態・香りタグ）。月の条件は検索画面のチップで外せます
  - 平均価格は価格を入力した杯だけで計算し、何杯分の平均かを表に表示
  - 好きな香り：評価4以上の杯に付けた香りタグを数え、そのタグを多く持つホップを最大5品種提案
  - 銘柄の詳細の「共有」：最新の記録の文面と写真1枚を Web Share で共有。共有できない環境ではクリップボードへコピーし、それもできなければ文面を表示して手動でコピー
  - 記録0件・1件でも表示が崩れないことをテストと画面で確認
