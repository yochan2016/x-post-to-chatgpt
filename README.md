# X Post to ChatGPT

Firefox で表示中の X 投稿を、ChatGPT デスクトップアプリの新規チャットへ渡す拡張機能です。

- X への追加リクエスト、自動巡回、自動スクロールは行いません
- 表示済みの DOM だけを読みます
- 自動送信はしません（ChatGPT 側で内容を確認して送信）

## インストール

最新版は [Releases](https://github.com/yochan2016/x-post-to-chatgpt/releases/latest) から `x-post-to-chatgpt-<version>.xpi` をダウンロードしてください。

`about:addons` の歯車 →「ファイルからアドオンをインストール」でその `.xpi` を選びます（XPI を Firefox のウィンドウへドラッグしても入ります）。一度入れれば Firefox を再起動しても残ります。

配布用の XPI は Mozilla AMO の自己配布（unlisted）で署名しています。拡張 ID は `x-post-to-chatgpt@yodaki.net` で、Firefox 140 以降が必要です。

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

## ChatGPT に渡るデータ

「ChatGPTで開く」を押すと、次の内容が `codex://` リンクとして **ChatGPT デスクトップアプリ**へ渡ります。

- 投稿者名・@ハンドル・日時・投稿 URL・本文・引用ポスト・表示中のリプライ
- 画像は URL を載せず、`コピー` を押したときだけ `pbs.twimg.com` から取得してクリップボードへ入れます

拡張機能が独自のサーバーへ送信することはありません（送信先はユーザーが開いた ChatGPT アプリのみ）。ただしアプリの外へデータが出るため、Firefox のインストール画面では「ウェブサイトのコンテンツ」へのアクセスを要求します。これは AMO のデータ申告（`websiteContent`）に基づく表示です。

## ライセンス

PolyForm Noncommercial License 1.0.0（`LICENSE`）。非商用目的での利用・改変・再配布ができます。商用利用は許諾されません。

署名済み XPI にも `LICENSE` を同梱しています。PolyForm の Notices 条項により、再配布する場合はこの許諾条件も一緒に渡してください。

## 開発

Node.js 20 以上が必要です。

```
npm install     # 初回のみ
npm run lint    # manifest とコードの静的検査（自己配布向けに --self-hosted）
npm run build   # web-ext-artifacts/ に ZIP を作成
npm run sign    # AMO で署名（unlisted）して XPI を取得
```

`npm run build` の `.zip` は**署名されていません**。Firefox に入れようとすると「このアドオンは検証されていないため、インストールできませんでした」で弾かれます。インストールするのは `npm run sign` が出力する **`.xpi`** です。

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
- unlisted は AMO からの自動更新がありません。`update_url` で自前の更新情報を配っています（下記）
- 拡張 ID（`browser_specific_settings.gecko.id`）は署名後に変更できません。変えると別アドオン扱いになり、既存のインストールは引き継がれません

### 自動更新

`manifest.json` の `gecko.update_url` が `https://yochan2016.github.io/x-post-to-chatgpt/updates.json` を指しており、Firefox が定期的（約1日）に確認します。

1. `manifest.json` の `version` を上げて `npm run sign`
2. GitHub Releases で新しいタグを作り、XPI を **`x-post-to-chatgpt-<version>.xpi`** の名前で添付
3. `docs/updates.json` の `version` と `update_link` を新しい版に書き換えて push
4. GitHub Pages（ブランチ `main` / フォルダ `/docs`）が有効なら、次回の確認で自動更新される

`update_url` は署名済みパッケージに含まれるため、**0.2.1 は最初だけ手動でインストール**する必要があります。以後は自動です。

設計判断の理由や実機で分かった落とし穴は [docs/development-notes.md](docs/development-notes.md) にまとめています。

## 構成

| ファイル | 役割 |
|---|---|
| `manifest.json` | 定義（MV3 / Firefox） |
| `background.js` | 右クリックメニュー、確認ウィンドウの起動、投稿データの受け渡し |
| `content.js` | X の DOM 読み取り、投稿内ボタンの追加 |
| `ui.html` / `ui.js` / `ui.css` | 確認ウィンドウ（プレビュー・編集・起動・画像コピー） |
| `icons/` | アイコン |
| `docs/development-notes.md` | 開発ノート（設計判断・検証結果・署名手順） |
| `package.json` | `web-ext` の lint / build / sign スクリプト |
| `web-ext-config.mjs` | パッケージに含めないファイルの指定 |
| `LICENSE` | PolyForm Noncommercial 1.0.0 |
