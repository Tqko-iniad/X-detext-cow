const DEFAULT_SETTINGS = {
  keywords: ["ushi"],
  aiDetectionEnabled: false,
  aiModel: "gpt-5.4-mini"
};

const INIAD_CHAT_COMPLETIONS_URL =
  "https://api.openai.iniad.org/api/v1/chat/completions";

function getStorage(area, keys) {
  return new Promise((resolve) => {
    chrome.storage[area].get(keys, resolve);
  });
}

function createAiPrompt(text, keywords) {
  return [
    {
      role: "system",
      content:
        "You are a strict Japanese text detector. Decide whether the user's text contains any target keyword directly, in kana, kanji reading, romanized Japanese reading, or a plausible Japanese reading. Return only compact JSON with keys match, keyword, reason. Do not include markdown."
    },
    {
      role: "user",
      content: JSON.stringify({
        targetKeywords: keywords,
        text
      })
    }
  ];
}

function parseAiResponse(content) {
  const jsonText = String(content || "").match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) {
    return { match: false, keyword: "", reason: "" };
  }

  try {
    const parsed = JSON.parse(jsonText);
    return {
      match: parsed.match === true,
      keyword: typeof parsed.keyword === "string" ? parsed.keyword : "",
      reason: typeof parsed.reason === "string" ? parsed.reason : ""
    };
  } catch {
    return { match: false, keyword: "", reason: "" };
  }
}

async function runAiDetection(text) {
  const [syncSettings, localSettings] = await Promise.all([
    getStorage("sync", DEFAULT_SETTINGS),
    getStorage("local", { iniadApiKey: "" })
  ]);

  const apiKey = String(localSettings.iniadApiKey || "").trim();
  const keywords = Array.isArray(syncSettings.keywords)
    ? syncSettings.keywords.filter(Boolean)
    : DEFAULT_SETTINGS.keywords;

  if (!syncSettings.aiDetectionEnabled || !apiKey || !text.trim()) {
    return { match: false, keyword: "", reason: "" };
  }

  const response = await fetch(INIAD_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: syncSettings.aiModel || DEFAULT_SETTINGS.aiModel,
      messages: createAiPrompt(text.slice(0, 1000), keywords),
      stream: false,
      max_completion_tokens: 80
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`INIAD API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return parseAiResponse(data?.choices?.[0]?.message?.content);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "USHI_DETECTED") {
    if (message?.type === "AI_DETECT_REQUEST") {
      runAiDetection(String(message.text || ""))
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          })
        );
      return true;
    }

    return false;
  }

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: `「${message.keyword || "ushi"}」を検出しました`,
    message:
      message.source === "ai"
        ? "INIAD AI MOP が検出対象を見つけました。"
        : "Xの投稿入力欄に検出対象の文字列または読みが含まれています。"
  });

  return false;
});
