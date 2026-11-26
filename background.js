const MENU_ID = "xpost-to-chatgpt";
const SNAP_PREFIX = "snap:";
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

function snapshotKey(tabId) {
  return SNAP_PREFIX + tabId;
}

async function saveSnapshot(tabId, data) {
  await browser.storage.session.set({ [snapshotKey(tabId)]: data });
}

async function loadSnapshot(tabId) {
  const key = snapshotKey(tabId);
  const stored = await browser.storage.session.get(key);
  return stored[key] ?? null;
}

async function openUi(tabId, pos) {
  const url = browser.runtime.getURL(`ui.html?tabId=${tabId}`);
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

async function resolveSnapshot(tabId) {
  const stored = await loadSnapshot(tabId);
  if (stored) return stored;
  const data = await requestPost(tabId, "getCenterPost");
  if (data) await saveSnapshot(tabId, data);
  return data;
}

browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const data = (await requestPost(tab.id, "getContextPost"))
    || (await requestPost(tab.id, "getCenterPost"));
  if (!data) return;
  await saveSnapshot(tab.id, data);
  await openUi(tab.id);
});

browser.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  const data = await requestPost(tab.id, "getCenterPost");
  if (!data) return;
  await saveSnapshot(tab.id, data);
  await openUi(tab.id);
});

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "open" && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    return saveSnapshot(tabId, msg.data)
      .then(() => openUi(tabId, msg.pos))
      .then(() => ({ ok: true }));
  }
  if (msg?.type === "resolve") {
    return resolveSnapshot(msg.tabId).then((data) => ({ data }));
  }
  if (msg?.type === "closeWindow" && sender.tab?.windowId != null) {
    return browser.windows.remove(sender.tab.windowId)
      .then(() => ({ ok: true }))
      .catch(() => ({ ok: false }));
  }
  return undefined;
});
