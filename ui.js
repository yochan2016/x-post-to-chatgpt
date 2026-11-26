const DEFAULT_TEMPLATE = `
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
{images}`;

const MAX_URL_LENGTH = 30000;

const els = {
  author: document.getElementById("author"),
  datetime: document.getElementById("datetime"),
  link: document.getElementById("link"),
  text: document.getElementById("text"),
  quotedSection: document.getElementById("quoted-section"),
  quoted: document.getElementById("quoted"),
  repliesSection: document.getElementById("replies-section"),
  replies: document.getElementById("replies"),
  repliesCount: document.getElementById("replies-count"),
  imagesSection: document.getElementById("images-section"),
  images: document.getElementById("images"),
  template: document.getElementById("template"),
  prompt: document.getElementById("prompt"),
  note: document.getElementById("note"),
  launch: document.getElementById("launch"),
  copy: document.getElementById("copy"),
  close: document.getElementById("close"),
  status: document.getElementById("status"),
};

let snapshot = null;
let template = DEFAULT_TEMPLATE;

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

// 本文のプレースホルダーだけを一度で置換する。
// 投稿本文に $& や {quoted} が含まれても、置換構文や二重置換の影響を受けない。
const PLACEHOLDER_RE = /\{(author|datetime|url|text|quoted|replies|images)\}/g;

function buildPrompt(data, tpl) {
  let text = tpl;
  if (!data.quoted) text = text.replace(/【引用ポスト】\s*\{quoted\}/, "");
  if (!data.replies || data.replies.length === 0) {
    text = text.replace(/【表示中のリプライ】\s*\{replies\}/, "");
  }
  if (!data.images || data.images.length === 0) {
    text = text.replace(/【添付画像】\s*\{images\}/, "");
  }
  const replies = (data.replies || [])
    .map((reply) => `- ${reply.author} ${reply.handle}\n${reply.text}`)
    .join("\n\n");
  const values = {
    author: [data.author, data.handle].filter(Boolean).join(" "),
    datetime: data.datetime || "",
    url: data.url || "",
    text: data.text || "",
    quoted: data.quoted || "",
    replies,
    images: (data.images || []).join("\n"),
  };
  return text
    .replace(PLACEHOLDER_RE, (match, key) => values[key] ?? match)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\s+$/, "");
}

function encodedLength(prompt) {
  return "codex://new?prompt=".length + encodeURIComponent(prompt).length;
}

// サロゲートペア（絵文字など）を割らないように切り詰める
function truncateAtCodePoint(text, max) {
  if (text.length <= max) return text;
  let cut = max;
  const code = text.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return text.slice(0, cut);
}

const ELLIPSIS = "\n（以下略）";

function omissionNote(dropped) {
  return dropped.length > 0 ? `長いため、${dropped.join("・")}を省略しました。` : "";
}

function fitPrompt(data, tpl) {
  const dropped = [];
  let prompt = buildPrompt(data, tpl);
  if (encodedLength(prompt) <= MAX_URL_LENGTH) {
    return { prompt, note: "" };
  }

  let current = { ...data, replies: [] };
  dropped.push("表示中のリプライ");
  prompt = buildPrompt(current, tpl);
  if (encodedLength(prompt) <= MAX_URL_LENGTH) {
    return { prompt, note: omissionNote(dropped) };
  }

  if (current.quoted) {
    current = { ...current, quoted: "" };
    dropped.push("引用ポスト");
    prompt = buildPrompt(current, tpl);
    if (encodedLength(prompt) <= MAX_URL_LENGTH) {
      return { prompt, note: omissionNote(dropped) };
    }
  }

  // 「（以下略）」を含めた最終形で上限を測る
  const originalText = current.text || "";
  let body = originalText;
  while (body.length > 100) {
    const candidate = buildPrompt({ ...current, text: `${body}${ELLIPSIS}` }, tpl);
    if (encodedLength(candidate) <= MAX_URL_LENGTH) break;
    body = truncateAtCodePoint(body, Math.floor(body.length * 0.85));
  }
  current = { ...current, text: `${body}${ELLIPSIS}` };
  if (body.length < originalText.length) dropped.push("本文");
  prompt = buildPrompt(current, tpl);
  if (encodedLength(prompt) <= MAX_URL_LENGTH) {
    return { prompt, note: omissionNote(dropped) };
  }

  // 本文を削っても収まらない場合の最後の手段として画像リンクを落とす
  if (current.images && current.images.length > 0) {
    current = { ...current, images: [] };
    dropped.push("添付画像");
    prompt = buildPrompt(current, tpl);
    if (encodedLength(prompt) <= MAX_URL_LENGTH) {
      return { prompt, note: omissionNote(dropped) };
    }
  }

  return { prompt, note: "テンプレートが長すぎて上限に収まりません。プロンプトを短くしてください。" };
}

// X はタイムラインで縮小版（name=small / 680px）を配信する。
// 画像内の文字まで読ませたいので、プロンプトには拡大版（元画像が小さければ同じ）を載せる。
function imageUrlForPrompt(src) {
  try {
    const url = new URL(src);
    if (url.hostname !== "pbs.twimg.com") return src;
    url.searchParams.set("name", "large");
    return url.toString();
  } catch {
    return src;
  }
}

function refreshPrompt() {
  if (!snapshot) return;
  const data = { ...snapshot, images: (snapshot.images || []).map(imageUrlForPrompt) };
  const { prompt, note } = fitPrompt(data, template);
  els.prompt.value = prompt;
  const notes = [];
  if (snapshot.truncated) {
    notes.push("本文が省略されています。X側で「さらに表示」を開いてから再実行してください。");
  }
  if (note) notes.push(note);
  // テンプレートを編集済みの環境では {images} が無く、画像リンクが付かない
  if (snapshot.images?.length && !template.includes("{images}")) {
    notes.push("テンプレートに {images} が無いため、画像リンクは含まれていません。");
  }
  els.note.textContent = notes.join(" ");
}

function renderMeta(data) {
  els.author.textContent = [data.author, data.handle].filter(Boolean).join(" ");
  els.datetime.textContent = data.datetime
    ? new Date(data.datetime).toLocaleString("ja-JP")
    : "";
  if (data.url) {
    els.link.href = data.url;
    els.link.textContent = data.url;
  } else {
    els.link.removeAttribute("href");
    els.link.textContent = "";
  }
}

function renderReplies(replies) {
  els.replies.replaceChildren();
  if (!replies || replies.length === 0) {
    els.repliesSection.hidden = true;
    return;
  }
  els.repliesSection.hidden = false;
  els.repliesCount.textContent = `(${replies.length})`;
  for (const reply of replies) {
    const wrap = document.createElement("div");
    wrap.className = "reply";
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = [reply.author, reply.handle].filter(Boolean).join(" ");
    const body = document.createElement("div");
    body.textContent = reply.text;
    wrap.append(who, body);
    els.replies.append(wrap);
  }
}

async function copyImage(src, button) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "…";
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    setStatus("画像をコピーしました。ChatGPTの入力欄で Ctrl+V してください。");
  } catch (error) {
    setStatus(`画像をコピーできませんでした: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function renderImages(images) {
  els.images.replaceChildren();
  if (!images || images.length === 0) {
    els.imagesSection.hidden = true;
    return;
  }
  els.imagesSection.hidden = false;
  for (const src of images) {
    const figure = document.createElement("figure");
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    const button = document.createElement("button");
    button.textContent = "コピー";
    button.addEventListener("click", () => copyImage(src, button));
    figure.append(img, button);
    els.images.append(figure);
  }
}

function showError(message) {
  els.launch.disabled = true;
  els.copy.disabled = true;
  els.prompt.disabled = true;
  setStatus(message, true);
}

// Firefox がフォーカスを失ったら（＝ChatGPT などの外部アプリが前面に出たら）このウィンドウを閉じる。
// background のイベントページは休止しうるので、ウィンドウ自身が監視する。
const CLOSE_AFTER_LAUNCH_MS = 120000;
let closeArmed = false;

function armCloseOnSwitch() {
  if (closeArmed) return;
  closeArmed = true;
  const launchedAt = Date.now();
  const listener = async (windowId) => {
    if (windowId !== browser.windows.WINDOW_ID_NONE) return;
    if (Date.now() - launchedAt > CLOSE_AFTER_LAUNCH_MS) {
      browser.windows.onFocusChanged.removeListener(listener);
      return;
    }
    // 起動直後のフォーカス揺れや、許可ダイアログから戻った場合は閉じない
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (document.hasFocus()) return;
    browser.windows.onFocusChanged.removeListener(listener);
    const self = await browser.windows.getCurrent();
    await browser.windows.remove(self.id).catch(() => {});
  };
  browser.windows.onFocusChanged.addListener(listener);
}

async function launch() {
  const prompt = els.prompt.value.trimEnd();
  if (!prompt.trim()) return;
  const url = `codex://new?prompt=${encodeURIComponent(prompt)}`;
  if (url.length > 31000) {
    setStatus("プロンプトが長すぎます。短くしてから再度お試しください。", true);
    return;
  }
  setStatus("ChatGPTを起動しています…");
  armCloseOnSwitch();
  location.href = url;
}

async function init() {
  const token = new URLSearchParams(location.search).get("token");
  const stored = await browser.storage.local.get("template");
  if (stored.template) template = stored.template;
  els.template.value = template;

  els.template.addEventListener("input", () => {
    template = els.template.value;
    browser.storage.local.set({ template });
    refreshPrompt();
  });
  els.launch.addEventListener("click", launch);
  els.copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(els.prompt.value);
    setStatus("プロンプトをコピーしました。");
  });
  els.close.addEventListener("click", () => {
    browser.runtime.sendMessage({ type: "closeWindow" }).catch(() => window.close());
  });

  if (!token) {
    showError("対象の投稿を特定できませんでした。投稿のボタンから開き直してください。");
    return;
  }

  let response = null;
  try {
    response = await browser.runtime.sendMessage({ type: "resolve", token });
  } catch (error) {
    showError(`投稿を取得できませんでした: ${error.message}`);
    return;
  }
  snapshot = response?.data ?? null;
  if (!snapshot) {
    showError("投稿を読み取れませんでした。このウィンドウを閉じて、もう一度開いてください。");
    return;
  }

  renderMeta(snapshot);
  els.text.textContent = snapshot.text;
  if (snapshot.quoted) {
    els.quotedSection.hidden = false;
    els.quoted.textContent = snapshot.quoted;
  }
  renderReplies(snapshot.replies);
  renderImages(snapshot.images);
  refreshPrompt();
}

init().catch((error) => showError(`初期化に失敗しました: ${error.message}`));
