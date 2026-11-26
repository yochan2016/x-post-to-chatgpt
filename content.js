(() => {
  const BTN_ATTR = "data-xpc-btn";
  const BUTTON_CLASS = "xpc-btn";
  const MAX_REPLIES = 10;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function textOf(el) {
    return el ? (el.innerText || "").trim() : "";
  }

  function nameParts(article) {
    const el = article.querySelector('[data-testid="User-Name"]');
    if (!el) return { author: "", handle: "" };
    const lines = (el.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
    return {
      author: lines[0] || "",
      handle: lines.find((l) => l.startsWith("@")) || "",
    };
  }

  function collectReplies(article) {
    if (!/\/status\/\d+/.test(location.pathname)) return [];
    const all = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const index = all.indexOf(article);
    if (index < 0) return [];
    return all.slice(index + 1, index + 1 + MAX_REPLIES).map((reply) => {
      const textEl = reply.querySelector('[data-testid="tweetText"]');
      if (!textEl) return null;
      const { author, handle } = nameParts(reply);
      return { author, handle, text: textOf(textEl) };
    }).filter(Boolean);
  }

  function findShowMore(article) {
    const direct = article.querySelector('[data-testid="tweet-text-show-more-link"]');
    if (direct) return direct;
    for (const el of article.querySelectorAll('[role="button"], button')) {
      const label = (el.innerText || "").trim();
      if (label === "さらに表示" || label === "Show more" || label === "もっと見る") {
        return el;
      }
    }
    return null;
  }

  function textLength(article) {
    const el = article.querySelector('[data-testid="tweetText"]');
    return el ? (el.innerText || "").length : 0;
  }

  async function expandArticle(article) {
    const more = findShowMore(article);
    if (!more) return { expanded: false, truncated: false };

    const before = textLength(article);
    more.click();

    for (let i = 0; i < 15; i += 1) {
      await sleep(100);
      if (textLength(article) > before) {
        return { expanded: true, truncated: false };
      }
    }
    return { expanded: false, truncated: !!findShowMore(article) };
  }

  function readPost(article) {
    const { author, handle } = nameParts(article);
    const timeEl = article.querySelector("time[datetime]");
    const datetime = timeEl?.getAttribute("datetime") || "";
    const url = timeEl?.closest("a")?.href
      || article.querySelector('a[href*="/status/"]')?.href
      || location.href;
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = textOf(textEl);
    const quotedEl = article.querySelector('[role="link"] [data-testid="tweetText"]');
    const quoted = quotedEl && quotedEl !== textEl ? textOf(quotedEl) : "";
    const images = [...new Set(
      [...article.querySelectorAll('[data-testid="tweetPhoto"] img')]
        .map((img) => img.currentSrc || img.src)
        .filter(Boolean)
    )];
    return {
      author,
      handle,
      datetime,
      url,
      text,
      quoted,
      images,
      replies: collectReplies(article),
      collectedAt: new Date().toISOString(),
    };
  }

  async function serialize(article) {
    const { truncated } = await expandArticle(article);
    const data = readPost(article);
    data.truncated = truncated;
    return data;
  }

  function centerArticle() {
    const viewportHeight = window.innerHeight;
    let best = null;
    let bestDistance = Infinity;
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const rect = article.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > viewportHeight) continue;
      const distance = Math.abs((rect.top + rect.bottom) / 2 - viewportHeight / 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = article;
      }
    }
    return best;
  }

  function actionBar(article) {
    for (const group of article.querySelectorAll('div[role="group"]')) {
      if (group.querySelector('[data-testid="reply"]')) return group;
    }
    return null;
  }

  function injectStyle() {
    if (document.getElementById("xpc-style")) return;
    const style = document.createElement("style");
    style.id = "xpc-style";
    style.textContent = `
      .${BUTTON_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        margin-left: 4px;
        padding: 0;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        color: rgb(113, 118, 123);
        cursor: pointer;
        flex: 0 0 auto;
      }
      .${BUTTON_CLASS}:hover {
        background: rgba(29, 155, 240, 0.1);
        color: rgb(29, 155, 240);
      }
    `;
    document.head.appendChild(style);
  }

  function addButton(article) {
    if (article.querySelector(`[${BTN_ATTR}]`)) return;
    const bar = actionBar(article);
    if (!bar) return;
    injectStyle();

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.setAttribute(BTN_ATTR, "1");
    button.setAttribute("aria-label", "ChatGPTへ");
    button.title = "ChatGPTへ";
    button.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>`;

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const data = await serialize(article);
      browser.runtime.sendMessage({
        type: "open",
        data,
        pos: { x: event.screenX, y: event.screenY },
      }).catch(() => {});
    });

    bar.appendChild(button);
  }

  function scan() {
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      addButton(article);
    }
  }

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      scan();
    }, 250);
  }

  let lastContextArticle = null;

  document.addEventListener("contextmenu", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    lastContextArticle = target?.closest('article[data-testid="tweet"]') || null;
  }, true);

  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "getCenterPost") {
      const article = centerArticle();
      return article ? serialize(article) : Promise.resolve(null);
    }
    if (msg?.type === "getContextPost") {
      const article = lastContextArticle?.isConnected ? lastContextArticle : null;
      return article ? serialize(article) : Promise.resolve(null);
    }
    return undefined;
  });

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();
