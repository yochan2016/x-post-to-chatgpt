const MENU_ID = "xpost-to-chatgpt";
const SNAP_PREFIX = "snap:";
const SNAP_TTL_MS = 60 * 60 * 1000;
const UI_WIDTH = 480;
const UI_HEIGHT = 700;

async function setupMenus() {
  await browser.menus.removeAll();
  browser.menus.create({
    id: MENU_ID,
    title: "この投稿を ChatGPT へ",
    contexts: ["page", "image", "link", "selection"],
    documentUrlPatterns: ["https://x.com/*", "https://twitter.com/*"],
  });
}

browser.runtime.onInstalled.addListener(setupMenus);
browser.runtime.onStartup.addListener(setupMenus);

// 投稿データはウィンドウごとのトークンで受け渡す。同じタブから続けて開いても取り違えない。
async function pruneSnapshots() {
  const all = await browser.storage.session.get(null);
  const now = Date.now();
  const stale = Object.entries(all)
    .filter(([key, value]) => key.startsWith(SNAP_PREFIX) && now - (value?.at ?? 0) > SNAP_TTL_MS)
    .map(([key]) => key);
  if (stale.length > 0) await browser.storage.session.remove(stale);
}

async function takeSnapshot(token) {
  const key = SNAP_PREFIX + token;
  const stored = await browser.storage.session.get(key);
  await browser.storage.session.remove(key);
  return stored[key]?.data ?? null;
}

async function openUi(data, pos) {
  await pruneSnapshots();
  const token = crypto.randomUUID();
  await browser.storage.session.set({ [SNAP_PREFIX + token]: { at: Date.now(), data } });
  const url = browser.runtime.getURL(`ui.html?token=${token}`);
  const base = { url, type: "popup", width: UI_WIDTH, height: UI_HEIGHT };
  const options = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)
    ? { ...base, left: Math.round(pos.x - UI_WIDTH / 2), top: Math.round(pos.y - 40) }
    : base;
  try {
    await browser.windows.create(options);
  } catch {
    await browser.windows.create(base);
  }
}

async function requestPost(tabId, type) {
  try {
    return await browser.tabs.sendMessage(tabId, { type });
  } catch {
    return null;
  }
}

browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const data = (await requestPost(tab.id, "getContextPost"))
    || (await requestPost(tab.id, "getCenterPost"));
  if (!data) return;
  await openUi(data);
});

browser.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  const data = await requestPost(tab.id, "getCenterPost");
  if (!data) return;
  await openUi(data);
});

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "open" && sender.tab?.id != null) {
    return openUi(msg.data, msg.pos).then(() => ({ ok: true }));
  }
  if (msg?.type === "resolve") {
    return takeSnapshot(msg.token).then((data) => ({ data }));
  }
  if (msg?.type === "closeWindow" && sender.tab?.windowId != null) {
    return browser.windows.remove(sender.tab.windowId)
      .then(() => ({ ok: true }))
      .catch(() => ({ ok: false }));
  }
  return undefined;
});
