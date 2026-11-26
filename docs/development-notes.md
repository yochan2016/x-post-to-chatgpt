# 開発ノート — X Post to ChatGPT（Firefox 拡張）

最終更新: 2026-11-26

この文書は**開発者向けの記録**です。設計判断の理由、実機で分かった落とし穴、署名・配布の手順を残しています。利用者向けの説明は [README.md](../README.md) を参照してください。

## 1. 目的

Firefox で表示中の X 投稿を、ChatGPT デスクトップアプリの**新規チャット**へ渡す。

- X への追加 API 呼び出し・自動巡回・自動スクロールはしない
- 表示済み DOM のみを読む（「さらに表示」は展開する）
- 自動送信はしない。ChatGPT 側で内容を確認してユーザーが送信する
- 可能な限り拡張単体で完結（Native Messaging 不使用）

## 2. 環境（検証済み）

| 項目 | 値 |
|---|---|
| OS | Windows |
| Firefox | 160.0.1（通常版・署名必須） |
| ChatGPT デスクトップ | `OpenAI.Codex 26.1120.6357.0`（`ChatGPT.exe`） |
| プロトコル | `codex`（MSIX `uap3:Protocol Name="codex" Parameters="--single-argument %1"`） |
| 検証プロファイル | 一時プロファイル＋実プロファイルの両方で確認済み |
| Node.js / web-ext | 24.22.1 / 10.8（`npm run sign` 用） |

### ディープリンクの確定仕様

- `codex://new?prompt=<URLエンコード>` で **Chat モードの新規チャットにプリフィル（未送信）**
- `codex://threads/new?prompt=...` も同等
- クエリは `prompt` のみ許可。生の `#` は拒否されるため必ずエンコード
- **モードは継承**する。Chat タブなら Chat、Work タブなら Work の新規タスクになる。URL で強制不可
- URL 長の実測:
  - 本文 1,518 文字 / URL 13,645 → OK
  - 本文 3,620 文字 / URL 32,531 → OK
  - 本文 4,070 文字 / URL 36,581 → **起動失敗**（Windows コマンドライン上限）
  - 安全域は URL 30,000 文字以下（日本語本文 約 3,300 文字）
- 画像データはディープリンクで渡せない。**本文に URL を載せれば ChatGPT 側が取得できる**（2026-11-26 実機確認）。クリップボード経由の添付も可
- `moz-extension://` から `codex://` 起動可。初回のみ許可ダイアログ（「常に許可」可）

## 3. 現在の状態

**実装・実機確認済み（0.2.3）。**

**配布（2026-11-26 公開済み）:** GitHub Releases で配布中（最新 0.2.3）。AMO unlisted（自己配布）で署名し、`update_url` で自動更新する。

- リポジトリ: https://github.com/yochan2016/x-post-to-chatgpt
- 配信: GitHub Pages（ブランチ `main` / フォルダ `/docs`）の `updates.json`
- リリース: `v0.2.3`（アセット名 `x-post-to-chatgpt-0.2.3.xpi`、`Content-Type: application/x-xpinstall` で配信されることを確認）

- 0.1.1: 署名後に自動クローズが効かなくなった件を修正（監視を background から ui.js へ移動。詳細は §6）。実機確認済み
- 0.2.0: 公開前レビューの P0 を反映。データ申告を `websiteContent` に、投稿データの受け渡しをウィンドウ単位のトークンに、リプライ抽出を会話タイムライン内に限定
- 0.2.1: `gecko.update_url` を追加（自己配布の自動更新）。`npm run lint` は `--self-hosted` 付きに変更。`docs/updates.json` を GitHub Pages で配信する
- 0.2.2: 長文処理の堅牢化（サロゲートを割らない切詰め、「（以下略）」込みの長さ判定、引用も省略対象に）、プレースホルダー置換を1回のコールバックに、プライベートウィンドウ非対応（`incognito: not_allowed`）
- 0.2.3: 画像を URL としてプロンプトの `【添付画像】` に載せる（ChatGPT 側が取得）。省略理由を積み上げ表示。保存済みテンプレートに `{images}` が無い場合は注意書きを出す。実機確認済み（2026-11-26）

**0.2.1 実機確認済み（2026-11-26）**: 自動クローズ／同一ページから続けて2つ開いたときの取り違え防止／リプライ欄への無関係な投稿の混入なし、をすべて確認。

**自動更新も実機確認済み（2026-11-26）**: 0.2.1 をインストールした状態で 0.2.2 をリリース → `about:addons` の歯車「更新を確認」で 0.2.2 に置き換わることを確認。GitHub Pages の `updates.json` → Release の XPI という経路が通っている。
- 初回署名は API 投入から数十秒で**自動承認**（人手レビューなし）。出力は `web-ext-artifacts/<hash>-<version>.xpi`（ファイル名は AMO が決める。配布時に改名してよい）
- 拡張 ID を `x-post-to-chatgpt@local` → `x-post-to-chatgpt@yodaki.net` に変更（**署名済みのため以後変更不可**）
- `strict_min_version` を 128 → 140（`data_collection_permissions` の対象バージョン）
- ライセンスは PolyForm Noncommercial 1.0.0。AMO unlisted はコード公開を要求せず、GitHub 公開と両立する
- API キーはユーザー環境変数 `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` に入れる（`setx` で永続化可）。**`setx` で登録した値は、すでに起動しているターミナルやエディタには反映されない**ので、シェルを開き直すか `[Environment]::GetEnvironmentVariable(...,'User')` で読み直してから `npm run sign` を実行する

確認済みの動作:

- 投稿内ボタン（吹き出しアイコン）→ 確認ウィンドウ → ChatGPT へプリフィル
- 右クリック「この投稿を ChatGPT へ」
- 「さらに表示」の自動展開と全文取得
- 長文時のリプライ省略・本文切り詰め
- 画像の PNG クリップボードコピー
- 「ChatGPTで開く」後、ChatGPT が前面に出たら確認ウィンドウを自動削除
- テンプレート（空行 + `---` + 各セクション）

## 4. ファイル構成

```
（リポジトリのルート）
  manifest.json      MV3 / Firefox
  background.js      メニュー、ウィンドウ生成、スナップショット
  content.js         DOM 抽出、投稿内ボタン、コンテキスト対象の記憶
  ui.html            確認ウィンドウ
  ui.css
  ui.js              プレビュー、テンプレート、プロンプト生成、起動、画像コピー
  icons/             icon-48 / icon-96
  README.md          利用者向け
  LICENSE            PolyForm Noncommercial 1.0.0（XPI に同梱）
  docs/development-notes.md   この文書（パッケージには含めない）
  package.json       web-ext 10 の lint / build / sign
  web-ext-config.mjs パッケージ除外指定
  .gitignore
```

### manifest の要点

- `browser_specific_settings.gecko.id`: `x-post-to-chatgpt@yodaki.net`（**署名後に変更不可**）
- `strict_min_version`: `140.0`（`data_collection_permissions` の組み込み同意 UI が 140 以降）
- `data_collection_permissions.required`: `["websiteContent"]`（2025-11-03 以降 AMO 新規提出で必須。Mozilla の定義では「アドオンまたはローカルのブラウザの外で扱われるデータ」が送信に当たるため、`none` ではなくウェブサイトの内容として申告する）
- `permissions`: `menus`, `storage`
- `update_url`: `https://yochan2016.github.io/x-post-to-chatgpt/updates.json`（自己配布の自動更新。AMO ホストではないので `web-ext lint` は `--self-hosted` を付ける）
- `host_permissions`: `https://x.com/*`, `https://twitter.com/*`, `https://pbs.twimg.com/*`
- `background.scripts`: `background.js`（Firefox の MV3 イベントページ）
- `action` に `default_popup` は**なし**（クリックで中央の投稿を開く）
- `content_scripts`: x.com / twitter.com、`document_idle`

## 5. データフロー

```
[content.js]
  投稿内ボタン click / contextmenu
    → serialize(article)（「さらに表示」を展開してから抽出）
    → background へ runtime.sendMessage
         { type: "open", data, pos: {x,y} }   … ボタン
         （contextmenu は lastContextArticle を記憶するだけ）

[background.js]
  open → prune → トークン発行 → storage.session に保存 → windows.create(ui.html?token=...)
  menus.onClicked → getContextPost → 無ければ getCenterPost → ウィンドウ
  action.onClicked → getCenterPost → ウィンドウ

[ui.js]
  resolve(token) → background が storage から取り出して**削除**して返す
  プレビュー表示 → プロンプト生成
  「ChatGPTで開く」→ windows.onFocusChanged を自前で監視 → location.href = codex://new?prompt=...
```

### メッセージ

| 送信元 | type | 内容 |
|---|---|---|
| content → bg | `open` | 投稿データ＋クリック座標 |
| bg → content | `getCenterPost` | 画面中央付近の投稿を展開・抽出 |
| bg → content | `getContextPost` | 最後に右クリックした投稿を展開・抽出 |
| ui → bg | `resolve` | token の投稿データを取り出して返す（読み取り後に削除） |
| ui → bg | `closeWindow` | 自ウィンドウを削除 |

### storage

| キー | 内容 |
|---|---|
| `storage.session["snap:<token>"]` | 抽出済み投稿データ（`{at, data}`）。UI が読むと削除、1時間で自動失効 |
| `storage.local["template"]` | ユーザー編集したテンプレート |

## 6. 実装の要点

### 投稿内ボタン

- `article[data-testid="tweet"]` ごとに、`[data-testid="reply"]` を含む `div[role="group"]` を探して末尾に追加
- 34px の円形、`data-xpc-btn` で重複防止
- MutationObserver（250ms スロットル）で再追加
- アイコンは吹き出し SVG。ホバーで青

### 抽出

| 項目 | セレクタ |
|---|---|
| 本文 | `[data-testid="tweetText"]` の `innerText` |
| 投稿者 | `[data-testid="User-Name"]` の1行目 / `@` 行 |
| 日時 | `time[datetime]` |
| URL | `time` の親 `a`、無ければ `a[href*="/status/"]` |
| 引用 | `[role="link"] [data-testid="tweetText"]`（本文と別要素のとき） |
| 画像 | `[data-testid="tweetPhoto"] img`（重複除去） |
| リプライ | `/status/<id>` ページのみ。対象記事の後続 `article` を最大10件 |

### 「さらに表示」

- `[data-testid="tweet-text-show-more-link"]` を優先
- 無ければ `[role="button"], button` のラベルが `さらに表示` / `Show more` / `もっと見る`
- クリック後、最大1.5秒（100ms×15）本文長の増加を待つ
- 増えなければ `truncated: true`。UI に「本文が省略されています…」を表示

### プロンプト生成

既定テンプレート（**1行目は空行**）:

```
（1行目：空行）
---
【投稿者】{author}
【日時】{datetime}
【URL】{url}

【本文】
{text}

【引用ポスト】
{quoted}

【表示中のリプライ】
{replies}

【添付画像】
{images}
```

- 引用・リプライ・画像が空なら該当セクションごと削除
- 連続改行を最大2つに圧縮、行末空白を除去（先頭の空行は保持）
- 置換は `{author}` などのプレースホルダーだけを**1回のコールバックで**行う。本文に `$&`・`` $` ``・`{quoted}` が含まれても化けない（v0.2.2〜）
- 長すぎる場合: リプライ削除 → 引用削除 → 本文を85%ずつ切り詰め（**コードポイント単位**でサロゲートを割らない）＋「（以下略）」→ それでも収まらなければ画像リンク削除
- 省略した内容は `長いため、表示中のリプライ・本文を省略しました。` のように積み上げて表示する（v0.2.3〜）
- 長さ判定は「（以下略）」を足した**最終形**の `encodedLength` で行う
- 起動時は `url.length > 31000` をブロック
- 画像リンクは 1 枚あたり約 80 文字なので、残すために本文が削られる量は日本語で 10 文字程度。画像を優先して残す

### 画像

- **リンク方式（既定）:** `pbs.twimg.com` の URL を `【添付画像】` に列挙する。ChatGPT 側が取得して読む（2026-11-26 実機確認: Chat モードで取得できた）
- `pbs.twimg.com` は認証不要・`access-control-allow-origin: *`・`content-type: image/png` で返る（`name=medium` は約 160KB）
- **コピー方式（併用可）:** `fetch(pbs.twimg.com)` → `createImageBitmap` → canvas → `toBlob("image/png")` → `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])`。ボタンクリックのユーザー操作内なので `clipboardWrite` 権限なしで動作（検証済み）。1枚ずつ
- 保存済みテンプレートに `{images}` が無い場合は画像リンクが付かないため、確認ウィンドウに注意書きを出す（v0.2.3〜）
- タイムラインでは `name=small`（680px）が配信されるため、プロンプトに載せるときだけ `name=large` に置き換える。実測: 元画像が 998x685 の投稿では `large` / `orig` / `4096x4096` がすべて同一バイト、`small` は 680x467。拡大はされず、縮小版を避けるだけ

### 自動クローズ

- 「ChatGPTで開く」時に **ui.js 自身**が `browser.windows.onFocusChanged` を監視する（v0.1.1〜）
- `WINDOW_ID_NONE`（Firefox 全体が非フォーカス）になったら 300ms 待ち、`document.hasFocus()` が false なら自ウィンドウを `windows.remove`
- **許可ダイアログ表示中は Firefox のフォーカスは失われない**ため、ダイアログは消えない
- 許可後に ChatGPT が前面に出た時点で 1〜2 秒で閉じる（v0.1.0 で実機確認済み）
- キャンセル時は、フォーカスが戻るので閉じない
- 起動後 120 秒を超えたら監視をやめる

#### v0.1.0 で自動クローズが効かなかった件（v0.1.1 で変更）

**観測された事実**: 0.1.0（署名済み）では、ディープリンク起動後に確認ウィンドウが閉じなかった。0.1.1 では同じ操作で閉じる（実機確認済み）。

**原因は未確定。** 候補は3つ:

1. background（MV3 イベントページ）が休止して `windows.onFocusChanged` を取りこぼした
2. 旧実装の `now - at < 500`（起動から 500ms 未満のフォーカス喪失を無視）に当たった。ChatGPT が起動済みなら許可ダイアログを挟まず 500ms 以内に前面化しうる
3. フォーカス喪失イベント自体が発火しなかった（Windows のフォアグラウンド制限で ChatGPT が前面に出ない等）

1 については、Firefox が `onFocusChanged` を永続イベントとして実装しているため休止だけでは説明できない、という指摘がある（未検証）。

0.1.1 は 1・2 のどちらでも成立するように、**監視を ui.js へ移し**（1を排除）、**下限の待ちを廃止して 300ms 後に `hasFocus()` で再判定**（2を排除）した。3 の場合は ChatGPT が前面に出ていないので、ウィンドウが残るのは許容範囲とする。

**教訓**: 署名済み（正式インストール）では background がイベントページになり、常駐を前提にした状態管理は信用できない。時間経過で起きるイベント（フォーカス等）に依存する処理は、そのとき生きている UI 側に置く。

## 7. 既知の制約・未解決

1. **Chat モード必須**。ChatGPT が Work タブだと Work の新規タスクになる（回避策なし）
2. **URL 長**。日本語本文 約3,300文字が上限。超過時は自動で省略される
3. **画像は1枚ずつ**。クリップボードは1画像のみ
4. **確認ウィンドウのタイトル接頭辞**（旧: `UI 動作確認: ...`）は、0.1.0 の再インストールで解消。現在は `拡張機能: (X Post to ChatGPT) - X投稿 → ChatGPT`
5. **ボタンの視認性**。18px の吹き出しが共有アイコンの右に出るだけで、最初は見落としやすい
6. **右クリックメニューは埋もれる**。他拡張が多いと下の方に追加される
7. **X の DOM 変更**で抽出・ボタン追加が壊れる可能性
8. **拡張 ID は署名後に変更不可**。変えると別アドオン扱いになり、既存インストールは引き継がれない
9. **テンプレートの保存**。UI で編集すると `storage.local` に保存され、既定テンプレートを上書きする
10. **画像取得は pbs.twimg.com への fetch**。厳密に「追加リクエストゼロ」にしたい場合は無効化を検討
11. **リプライ抽出は DOM 構造に依存**。`section[aria-label="Timeline: Conversation"]` と見出し／`placementTracking` を境界の手がかりにしている。X 側の変更で境界を誤ると、リプライが欠けるか、逆に余分な投稿が混ざる可能性がある
12. **投稿が無いページでは何も起きない**。`/explore` や設定画面でツールバーボタンを押しても、`article[data-testid="tweet"]` が無ければデータが取れず、窓もエラーも出さない（意図した挙動。通知が欲しければ要検討）
13. **プライベートウィンドウでは動かない**（`incognito: "not_allowed"`）。有効にすると、確認ウィンドウが通常ウィンドウとして開き、投稿内容が `storage.session` に残るため
14. **未解決**: 2026-11-26 に「インストール済みの 0.2.1 が `about:addons` から消えていた」という報告があった。原因不明（自動更新の失敗で削除される経路は無いはず）。再現したら `extensions.json` と `extensions.webextensions.uuids` を確認する

## 8. 配布・署名・確認方法

### 署名（AMO unlisted）

```
npm install                 # 初回のみ（web-ext 10）
npm run lint                # errors 0 / warnings 1（Android 未対応の警告のみ）
npm run sign                # AMO で署名 → web-ext-artifacts/*.xpi
```

- API キーは https://addons.mozilla.org/developers/addon/api/key/ で発行し、`WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` に入れる（`setx` で永続化可）
- 署名には毎回 `version` を上げる。同じ版は AMO が拒否する
- 出力ファイル名は AMO が決める（`<hash>-<version>.xpi`）。配布時に改名してよい
- 0.1.0 は `Waiting for validation` → `Waiting for approval` → 数十秒で自動承認。人手レビューに入る場合は数日かかることがある
- `--no-input` を付けているので、対話待ちで止まることはない
- `npm run build` の ZIP 内容は manifest / JS / CSS / HTML / icons / README / LICENSE のみ（`docs/` と `package.json` は `web-ext-config.mjs` で除外）
- **`npm run build` の `.zip` は署名なし**。Firefox に入れると「このアドオンは検証されていないため、インストールできませんでした」で弾かれる。入れるのは `npm run sign` が出力する `.xpi`。紛らわしいので、検証用にビルドした ZIP は消しておく

### インストール（常設）

1. `about:addons` → 歯車 →「ファイルからアドオンをインストール」
2. `web-ext-artifacts/` の署名済み XPI を選択
3. ツールバーのパズルアイコン → 拡張の「…」→「ツールバーに固定」

再起動後も残る。unlisted は自動更新なし。新版は XPI を入れ直す（設定・テンプレートは保持）。

**旧 ID（`@local`）の一時アドオンが読み込まれたままだと別アドオンとして並ぶ**ので、`about:debugging` で先に削除する。

### 開発時の動作確認（署名・パッケージ不要）

通常の修正は**ソースフォルダをそのまま読み込む**。`npm run sign` と XPI 作成が必要なのは、常設インストールするときだけ。

```
npx web-ext run --firefox-profile "C:\path\to\dev-profile" --start-url https://x.com/home
```

1. `about:profiles` で開発用プロファイルを1つ作り、一度 X にログインしておく
2. 以後は上記コマンドだけ。`manifest.json` を読んで署名なしで起動し、ファイル保存で自動リロード（`--no-reload` で無効化）

- プロファイルを指定しないと毎回まっさらな一時プロファイルになり、X のログインが毎回必要になる
- 手動で読み込む場合: `about:debugging#/runtime/this-firefox` →「一時的なアドオンを読み込む…」→ `manifest.json`（フォルダ内の任意のファイルでよい）
- 一時アドオンは Firefox 終了で消える
- **署名済み XPI を入れたプロファイルでは、同じ ID のため一時アドオンとして読み込めない**（`already installed`）。開発は別プロファイルで行う
- 既存タブは F5（コンテンツスクリプトは再読み込みされない）

### ライセンス

- PolyForm Noncommercial 1.0.0。非商用のみ許諾
- 署名済み XPI にも `LICENSE` を同梱（Notices 条項の「許諾条件を一緒に渡す」を満たすため）
- AMO の unlisted 署名はコードの公開を要求しない。GitHub 公開・非OSIライセンスと両立する

### 自動更新（update_url）

- `manifest.json` の `gecko.update_url` → `https://yochan2016.github.io/x-post-to-chatgpt/updates.json`
- `docs/updates.json` が実体。GitHub Pages を **ブランチ `main` / フォルダ `/docs`** で有効にすると配信される
- `update_link` は `https://github.com/yochan2016/x-post-to-chatgpt/releases/download/v<version>/x-post-to-chatgpt-<version>.xpi`。**Release の添付ファイル名をこの名前に揃える**
- `update_url` も署名対象なので、追加した版（0.2.1）は一度手動で入れる必要がある
- `web-ext lint` は既定で AMO ホスト前提の `MANIFEST_UPDATE_URL` エラーを出す。`--self-hosted` を付ける（`npm run lint` に設定済み）
- GitHub の Release 添付 URL は 302 リダイレクトになる。Firefox は追従するが、もし更新が失敗する場合は XPI を `docs/` に置いて Pages から直接配信する

### コード更新時

- 開発中: `web-ext run`（自動リロード）または `about:debugging` の「再読み込み」。XPI は作らない
- 配布時: `version` を上げる → `npm run lint` → `npm run sign` → XPI を GitHub Release に `x-post-to-chatgpt-<version>.xpi` で添付 → `docs/updates.json` を更新
- **既存タブは F5**（コンテンツスクリプトは再読み込みされない）

### 構文チェック

```
node --check content.js
node --check background.js
node --check ui.js
```

### 自動検証（前回使った方法）

- ヘッドレス Firefox + Marionette（port 2828）
- 拡張を XPI に zip → `Addon:Install`（temporary）
- ローカル HTTP で X 風の fixture を配信 → `WebDriver:Navigate`
- `WebDriver:ExecuteScript` で `[data-xpc-btn]` の有無・クリックを確認
- fixture の HTML は一時ファイルだったため現在は未保存。必要なら再作成

### プロンプト生成のロジック検証

`ui.js` の `buildPrompt` / `fitPrompt` は DOM 非依存なので、Node の `vm` に DOM スタブを渡して実ファイルを読み込み、直接呼び出して検証できる（v0.2.2 で使用）。

- 長文＋絵文字（サロゲート境界で切られる入力）で例外が出ないこと
- 本文に `$&` / `` $` `` / `$'` / `{quoted}` を入れても改変されないこと
- 長い引用が省略され、最終的な `encodedLength` が 30,000 以下に収まること
- 画像あり／なしで `【添付画像】` が入る／消えること、長文でも画像リンクが最後まで残ること（v0.2.3）

## 9. 次の作業候補

- ボタンの視認性改善（青にする／ホバーで「ChatGPT」ラベル）
- 「確認ウィンドウのタイトル接頭辞」の原因調査
- X の DOM 変更に対するフォールバック（セレクタ複数化）
- 引用ポストの画像・投稿者・URL の取得精度向上
- 画像リンクは URL 方式で複数枚そのまま渡る。クリップボード側（1枚ずつ）の UX 改善は優先度を下げた
- GitHub 公開（PolyForm Noncommercial、`LICENSE` と README は整備済み）
- 公開時に自己配布の自動更新を有効化するか判断（`gecko.update_url` を GitHub の JSON に向ける）
- 画像リンクを載せない設定（現状はテンプレートから `【添付画像】` を消す運用）

## 10. 実機検証時の注意（重要）

- **画面を操作する前には必ず「これから画面を操作します」と宣言し、ユーザーの引き渡しを待つ。**
  無断でキー入力・クリックを送ると、他のアプリに入力が流れる。
- `SendKeys` を使う前に `GetForegroundWindow()` が対象ウィンドウと一致することを確認する。
  一致しなければ送らない。
- 可能なら GUI 操作を避け、ヘッドレス（Marionette / WebDriver）で検証する。
- クリップボードに検証用文字列を残さない。
- 検証後は必ず後片付けする:
  - 一時アドオンを削除
  - 開いたタブを閉じる
  - ChatGPT のテスト下書きを削除
- ChatGPT ウィンドウはユーザーが移動することがある。**クリック直前に `GetWindowRect` で座標を取り直す**。
- ATOK 使用環境では、入力欄のクリアが `Ctrl+A` → `Delete` で効かないことがある。
  `Esc` を押してから操作する。それでも消えない場合は「新しいチャット」を開いてから消す。
- 圧縮前の確認ウィンドウは `windows.create` の別ウィンドウ。`window.close()` は効かないことがあるため、
  background の `windows.remove` 経由で閉じる。
