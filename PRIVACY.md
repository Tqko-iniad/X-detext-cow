# Privacy Policy

X Keyword Notifier does not collect, transmit, sell, or store personal data on any external server.

The extension reads text inside X/Twitter post composer fields only in your browser, only to check whether the configured keywords or romanized readings are present. The default keyword is `ushi`.

The extension bundles local Japanese tokenization and romanization libraries so it can detect readings such as `相思相愛` -> `soushisouai`. This processing happens locally in the browser.

If INIAD AI MOP detection is enabled, text from the X/Twitter composer is sent to `https://api.openai.iniad.org/api/v1/chat/completions` for detection after local detection does not find a match. If INIAD AI MOP detection is disabled, composer text is not sent to that API.

Settings such as the keyword and notification toggles are stored with Chrome extension storage so they can persist in your browser. The INIAD API key is stored with `chrome.storage.local`. No analytics, tracking pixels, or remote scripts are used by this extension.
