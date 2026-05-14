const DEFAULT_SETTINGS = {
  keywords: ["ushi"],
  aiDetectionEnabled: false,
  aiModel: "gpt-5.4-mini"
};

const INIAD_CHAT_COMPLETIONS_URL =
  "https://api.openai.iniad.org/api/v1/chat/completions";
const AI_TIMEOUT_MS = 12000;

function getStorage(area, keys) {
  return new Promise((resolve) => {
    chrome.storage[area].get(keys, resolve);
  });
}

function createAiPrompt(text, keywords, localSearchText) {
  return [
    {
      role: "system",
      content:
        [
          "You are a strict Japanese reading detector.",
          "Decide whether the user's Japanese text contains any target keyword directly, in kana, kanji reading, romanized Japanese reading, or any plausible dictionary, name, rare, or compound-word reading.",
          "Do not stop at the most common reading. List possible readings mentally, romanize each reading, and return match true if any possible reading contains a target keyword.",
          "Return match false only when no recognized possible reading contains a target keyword.",
          "Important examples: 右心房 is read as うしんぼう / ushinbou, so it contains ushi. 相思相愛 is read as そうしそうあい / soushisouai, so it contains ushi. 影護 can be read as うしろめ / ushirome, so it contains ushi.",
          "Return only compact JSON with keys match, keyword, reading, reason. Do not include markdown."
        ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        targetKeywords: keywords,
        text,
        localSearchText
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
      match: parsed.match === true || parsed.match === "true",
      keyword: typeof parsed.keyword === "string" ? parsed.keyword : "",
      reading: typeof parsed.reading === "string" ? parsed.reading : "",
      reason: typeof parsed.reason === "string" ? parsed.reason : ""
    };
  } catch {
    return { match: false, keyword: "", reason: "" };
  }
}

async function runAiDetection(text, localSearchText) {
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

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(INIAD_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: syncSettings.aiModel || DEFAULT_SETTINGS.aiModel,
        messages: createAiPrompt(
          text.slice(0, 1000),
          keywords,
          String(localSearchText || "").slice(0, 2000)
        ),
        stream: false,
        max_completion_tokens: 120
      })
    });
  } finally {
    clearTimeout(timeoutId);
  }

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
      runAiDetection(
        String(message.text || ""),
        String(message.localSearchText || "")
      )
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
