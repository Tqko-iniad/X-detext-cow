const DEFAULT_SETTINGS = {
  keywords: ["ushi"],
  aiDetectionEnabled: false,
  aiModel: "gpt-5.4-mini",
  desktopNotifications: true,
  pageToast: true
};

const keywordsInput = document.getElementById("keywords");
const aiDetectionEnabledInput = document.getElementById("aiDetectionEnabled");
const iniadApiKeyInput = document.getElementById("iniadApiKey");
const aiModelInput = document.getElementById("aiModel");
const desktopNotificationsInput = document.getElementById("desktopNotifications");
const pageToastInput = document.getElementById("pageToast");
const statusText = document.getElementById("status");

let statusTimer;

function showStatus(message) {
  window.clearTimeout(statusTimer);
  statusText.textContent = message;
  statusTimer = window.setTimeout(() => {
    statusText.textContent = "";
  }, 1600);
}

function saveSettings() {
  const keywords = normalizeKeywords(keywordsInput.value);
  const nextSettings = {
    keywords,
    aiDetectionEnabled: aiDetectionEnabledInput.checked,
    aiModel: aiModelInput.value || DEFAULT_SETTINGS.aiModel,
    desktopNotifications: desktopNotificationsInput.checked,
    pageToast: pageToastInput.checked
  };

  chrome.storage.sync.set(nextSettings, () => {});
  chrome.storage.local.set({ iniadApiKey: iniadApiKeyInput.value.trim() }, () => {
    keywordsInput.value = keywords.join("\n");

    showStatus("保存しました");
  });
}

function normalizeKeywords(value) {
  const keywords = String(value)
    .split(/[\n,、]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  return [...new Set(keywords)].length > 0
    ? [...new Set(keywords)]
    : DEFAULT_SETTINGS.keywords;
}

Promise.all([
  chrome.storage.sync.get(DEFAULT_SETTINGS),
  chrome.storage.local.get({ iniadApiKey: "" })
]).then(([items, localItems]) => {
    const keywords = Array.isArray(items.keywords)
      ? items.keywords
      : normalizeKeywords(items.keyword || DEFAULT_SETTINGS.keywords.join("\n"));

    keywordsInput.value = keywords.join("\n");
    aiDetectionEnabledInput.checked = Boolean(items.aiDetectionEnabled);
    aiModelInput.value = items.aiModel || DEFAULT_SETTINGS.aiModel;
    iniadApiKeyInput.value = localItems.iniadApiKey || "";
    desktopNotificationsInput.checked = Boolean(items.desktopNotifications);
    pageToastInput.checked = Boolean(items.pageToast);
});

keywordsInput.addEventListener("change", saveSettings);
aiDetectionEnabledInput.addEventListener("change", saveSettings);
iniadApiKeyInput.addEventListener("change", saveSettings);
aiModelInput.addEventListener("change", saveSettings);
desktopNotificationsInput.addEventListener("change", saveSettings);
pageToastInput.addEventListener("change", saveSettings);
