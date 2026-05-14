(() => {
  const DEFAULT_SETTINGS = {
    keywords: ["ushi"],
    aiDetectionEnabled: false,
    desktopNotifications: true,
    pageToast: true
  };

  const NOTICE_ID = "x-ushi-notifier-toast";
  const trackedInputs = new WeakMap();
  let settings = { ...DEFAULT_SETTINGS };
  let lastNotifyAt = 0;
  let aiTimer = 0;
  let aiRequestId = 0;
  let tokenizer = null;
  let tokenizerReady = false;

  const editableSelector = [
    '[role="textbox"]',
    '[contenteditable="true"]',
    'textarea',
    'input[type="text"]'
  ].join(",");

  function isTweetComposer(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const textArea = element;
    const accessibleText = [
      textArea.getAttribute("aria-label"),
      textArea.getAttribute("data-testid"),
      textArea.closest('[data-testid="tweetTextarea_0"]')?.getAttribute("data-testid"),
      textArea.closest('[aria-label]')?.getAttribute("aria-label")
    ]
      .filter(Boolean)
      .join(" ");

    if (/tweet|post|reply|ポスト|投稿|返信|ツイート/i.test(accessibleText)) {
      return true;
    }

    return Boolean(
      textArea.closest('[data-testid="tweetTextarea_0"]') ||
        textArea.closest('[data-testid="tweetTextarea_1"]') ||
        textArea.closest('[data-testid="toolBar"]') ||
        textArea.closest('[aria-label*="ポスト"]') ||
        textArea.closest('[aria-label*="投稿"]') ||
        textArea.closest('[aria-label*="返信"]')
    );
  }

  function getText(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value;
    }

    return element.innerText || element.textContent || "";
  }

  function showToast() {
    const existing = document.getElementById(NOTICE_ID);
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement("div");
    toast.id = NOTICE_ID;
    toast.textContent =
      settings.lastMatchSource === "ai"
        ? `AIが「${settings.lastMatchedKeyword || settings.keywords[0]}」を検出しました`
        : `「${settings.lastMatchedKeyword || settings.keywords[0]}」が入力されました`;
    Object.assign(toast.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: "2147483647",
      padding: "12px 16px",
      borderRadius: "8px",
      background: "#0f1419",
      color: "#ffffff",
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: "14px",
      fontWeight: "700"
    });

    document.documentElement.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function notify() {
    const now = Date.now();
    if (now - lastNotifyAt < 1200) {
      return;
    }

    lastNotifyAt = now;
    if (settings.pageToast) {
      showToast();
    }

    if (!settings.desktopNotifications) {
      return;
    }

    try {
      const result = chrome.runtime.sendMessage({
        type: "USHI_DETECTED",
        keyword: settings.lastMatchedKeyword || settings.keywords[0],
        source: settings.lastMatchSource || "local"
      });
      result?.catch?.(() => {});
    } catch {
      // The in-page toast is enough when extension messaging is unavailable.
    }
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function toRomaji(value) {
    if (!window.wanakana?.toRomaji) {
      return normalizeText(value);
    }

    return normalizeText(window.wanakana.toRomaji(value));
  }

  function buildSearchTerms() {
    return settings.keywords
      .flatMap((keyword) => [normalizeText(keyword), toRomaji(keyword)])
      .filter(Boolean)
      .filter((keyword, index, keywords) => keywords.indexOf(keyword) === index);
  }

  function getReading(text) {
    if (!tokenizerReady || !tokenizer) {
      return "";
    }

    try {
      return tokenizer
        .tokenize(text)
        .map((token) => {
          if (token.reading && token.reading !== "*") {
            return token.reading;
          }

          return token.surface_form || "";
        })
        .join("");
    } catch {
      return "";
    }
  }

  function buildSearchText(text) {
    const reading = getReading(text);
    return [
      normalizeText(text),
      toRomaji(text),
      normalizeText(reading),
      toRomaji(reading)
    ]
      .filter(Boolean)
      .join("\n");
  }

  function findMatchedKeyword(text) {
    const searchText = buildSearchText(text);
    return buildSearchTerms().find((keyword) => searchText.includes(keyword)) || "";
  }

  function requestAiDetection(text, element) {
    if (!settings.aiDetectionEnabled || !text.trim()) {
      return;
    }

    window.clearTimeout(aiTimer);
    const requestId = ++aiRequestId;
    aiTimer = window.setTimeout(() => {
      try {
        const response = chrome.runtime.sendMessage({
          type: "AI_DETECT_REQUEST",
          text
        });

        response?.then?.((payload) => {
          if (requestId !== aiRequestId || !payload?.ok || !payload.result?.match) {
            return;
          }

          const matchedKeyword = payload.result.keyword || settings.keywords[0];
          const previousMatchedKeyword = trackedInputs.get(element);
          if (`ai:${matchedKeyword}` === previousMatchedKeyword) {
            return;
          }

          trackedInputs.set(element, `ai:${matchedKeyword}`);
          settings.lastMatchedKeyword = matchedKeyword;
          settings.lastMatchSource = "ai";
          notify();
        });
      } catch {
        // Local detection remains active when extension messaging is unavailable.
      }
    }, 900);
  }

  function inspect(element) {
    if (!isTweetComposer(element)) {
      return;
    }

    const text = getText(element);
    const previousMatchedKeyword = trackedInputs.get(element);
    const matchedKeyword = findMatchedKeyword(text);

    if (matchedKeyword && matchedKeyword !== previousMatchedKeyword) {
      aiRequestId += 1;
      trackedInputs.set(element, matchedKeyword);
      settings.lastMatchedKeyword = matchedKeyword;
      settings.lastMatchSource = "local";
      notify();
      return;
    }

    if (matchedKeyword) {
      trackedInputs.set(element, matchedKeyword);
      return;
    }

    if (!text.trim()) {
      aiRequestId += 1;
      trackedInputs.set(element, "");
      return;
    }

    requestAiDetection(text, element);
  }

  function bindEditable(element) {
    if (!(element instanceof HTMLElement) || trackedInputs.has(element)) {
      return;
    }

    trackedInputs.set(element, "");
    element.addEventListener("input", () => inspect(element), true);
    element.addEventListener("keyup", () => inspect(element), true);
    element.addEventListener("paste", () => window.setTimeout(() => inspect(element), 0), true);
    inspect(element);
  }

  function inspectAll() {
    document.querySelectorAll?.(editableSelector).forEach(inspect);
  }

  function normalizeSettings(items = {}) {
    const rawKeywords = Array.isArray(items.keywords)
      ? items.keywords
      : String(items.keyword || "")
          .split(/[\n,、]/)
          .map((keyword) => keyword.trim());
    const keywords = [...new Set(rawKeywords.filter(Boolean))];

    return {
      ...DEFAULT_SETTINGS,
      ...items,
      keywords: keywords.length > 0 ? keywords : DEFAULT_SETTINGS.keywords,
      lastMatchedKeyword: "",
      lastMatchSource: ""
    };
  }

  function loadSettings() {
    chrome.storage?.sync?.get(DEFAULT_SETTINGS, (items) => {
      settings = normalizeSettings(items);
      inspectAll();
    });
  }

  function loadTokenizer() {
    if (!window.kuromoji?.builder || !chrome.runtime?.getURL) {
      tokenizerReady = true;
      inspectAll();
      return;
    }

    window.kuromoji
      .builder({ dicPath: chrome.runtime.getURL("dict/") })
      .build((error, builtTokenizer) => {
        tokenizer = error ? null : builtTokenizer;
        tokenizerReady = true;
        inspectAll();
      });
  }

  function scan(root = document) {
    if (root instanceof HTMLElement && root.matches(editableSelector)) {
      bindEditable(root);
    }

    root.querySelectorAll?.(editableSelector).forEach(bindEditable);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          scan(node);
        }
      }
    }
  });

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    settings = normalizeSettings({
      ...settings,
      ...Object.fromEntries(
        Object.entries(changes).map(([key, change]) => [key, change.newValue])
      )
    });
    inspectAll();
  });

  loadSettings();
  loadTokenizer();
  scan();
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
