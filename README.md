# X Post to ChatGPT

Firefox で表示中の X 投稿を、ChatGPT デスクトップアプリの新規チャットへ渡す拡張機能です。

- X への追加リクエスト、自動巡回、自動スクロールは行いません
- 表示済みの DOM だけを読みます
- 自動送信はしません（ChatGPT 側で内容を確認して送信）

## インストール

`about:addons` の歯車 →「ファイルからアドオンをインストール」で署名済みの `.xpi` を選びます（XPI を Firefox のウィンドウへドラッグしても入ります）。一度入れれば Firefox を再起動しても残ります。

配布用の XPI は Mozilla AMO の自己配布（unlisted）で署名します。拡張 ID は `x-post-to-chatgpt@yodaki.net` で、Firefox 140 以降が必要です。

### 開発中の一時読み込み

1. `about:debugging#/runtime/this-firefox` を開く
2. 「一時的なアドオンを読み込む…」をクリック
3. このフォルダの `manifest.json` を選択

同じプロファイルに署名済み XPI が入っていると、ID が同じため一時アドオンとして読み込めません（`already installed`）。開発用のプロファイルを分けてください。

## 使い方

### 投稿内のボタン（主）

各投稿のアクションバー（返信・リポスト・いいねの並び）の右端に吹き出しアイコンが追加されます。

1. アイコンをクリック
2. 小さな確認ウィンドウが開く（本文・投稿者・日時・URL・引用・表示中リプライ・画像）
3. 必要ならプロンプトを編集
4. 「ChatGPTで開く」をクリック
5. 初回だけ「codex リンクを ChatGPT で開くことを許可しますか？」と聞かれる
   - 「常に許可する」にチェックすると以後出ません
6. ChatGPT が **Chat モードの新規チャット** を開き、プロンプトが入力済みになる
7. 内容を確認して送信

### 右クリック（補助）

投稿を右クリック → 「この投稿を ChatGPT へ」→ 同じ確認ウィンドウが開きます。

Firefox は拡張機能のメニューを下の方にまとめるため、他の拡張機能が多いと埋もれます。主導線は投稿内ボタンです。

### ツールバーボタン（補助）

ツールバーのアイコンをクリックすると、画面中央付近の投稿を対象に確認ウィンドウが開きます。

## 長い投稿（「さらに表示」）

タイムラインで本文が省略されている投稿は、抽出前にその投稿の「さらに表示」を自動でクリックして全文を展開します（ページ遷移・スクロールはしません）。

展開できなかった場合は確認ウィンドウに「本文が省略されています」と出ます。その場合は X 側で「さらに表示」を開いてから、もう一度ボタンを押してください。

## 画像

確認ウィンドウの「コピー」で PNG としてクリップボードへ入ります。ChatGPT の入力欄で `Ctrl+V` してください。

- クリップボードに入る画像は 1 枚ずつです
- 画像の取得は既定で有効です（表示済み画像の URL をキャッシュ優先で取得）。不要なら `ui.js` の `renderImages` を外してください

## 注意

- ChatGPT アプリが **Work タブ** のときは Work の新規タスクとして開きます。ディープリンクは現在のモードを継承するため、**Chat タブで使ってください**
- プロンプトは URL に載るため、約 30,000 文字（日本語本文で約 3,300 文字）を超えると起動できません。超える場合はリプライ・本文を自動で省略します
- X の DOM 変更で投稿の抽出やボタン追加が動かなくなる可能性があります

## ライセンス

PolyForm Noncommercial License 1.0.0（`LICENSE`）。非商用目的での利用・改変・再配布ができます。商用利用は許諾されません。

署名済み XPI にも `LICENSE` を同梱しています。PolyForm の Notices 条項により、再配布する場合はこの許諾条件も一緒に渡してください。

## 開発

Node.js 20 以上が必要です。

```
npm install     # 初回のみ
npm run lint    # manifest とコードの静的検査
npm run build   # web-ext-artifacts/ に ZIP を作成
npm run sign    # AMO で署名（unlisted）して XPI を取得
```

### 署名（unlisted）

1. https://addons.mozilla.org/developers/addon/api/key/ で JWT issuer / secret を取得
2. 環境変数に入れる（以後のセッションでも使うなら `setx`、その場限りなら `$env:`）

   ```
   setx WEB_EXT_API_KEY "..."
   setx WEB_EXT_API_SECRET "..."
   ```

3. `manifest.json` の `version` を上げてから `npm run sign`
4. `web-ext-artifacts/` に署名済み XPI ができる（ファイル名は AMO が決める。配布時は改名してよい）

- 同じ `version` は AMO が拒否します。署名のたびに必ず上げてください
- unlisted は自動更新されません。新版は手動で入れ直します
- 拡張 ID（`browser_specific_settings.gecko.id`）は署名後に変更できません。変えると別アドオン扱いになり、既存のインストールは引き継がれません

## 構成

| ファイル | 役割 |
|---|---|
| `manifest.json` | 定義（MV3 / Firefox） |
| `background.js` | 右クリックメニュー、確認ウィンドウの起動、投稿データの受け渡し |
| `content.js` | X の DOM 読み取り、投稿内ボタンの追加 |
| `ui.html` / `ui.js` / `ui.css` | 確認ウィンドウ（プレビュー・編集・起動・画像コピー） |
| `icons/` | アイコン |
| `package.json` | `web-ext` の lint / build / sign スクリプト |
| `web-ext-config.mjs` | パッケージに含めないファイルの指定 |
| `LICENSE` | PolyForm Noncommercial 1.0.0 |
