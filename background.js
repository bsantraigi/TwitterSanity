let settings = null;

async function loadSettings() {
  const defaults = {
    enabled: false,
    apiServer: 'http://localhost:8080',
    modelName: 'meta-llama-3.1-8b-instruct',
    prompt: `You are a content quality filter. Evaluate if the following tweet contains valuable information about books, events, non-incremental AI research, scientific news, or other substantive content. Respond with only "keep" or "remove".

Tweet: "{tweet}"

Decision:`
  };
  settings = await chrome.storage.local.get(defaults);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "evaluateTweet") {
    if (!settings) {
      loadSettings().then(() => evaluateTweet(request.text, sendResponse));
    } else {
      evaluateTweet(request.text, sendResponse);
    }
    return true;
  }
});

async function evaluateTweet(tweetText, sendResponse) {
  if (!settings.enabled) {
    sendResponse({ shouldKeep: true });
    return;
  }

  const prompt = settings.prompt.replace('{tweet}', tweetText);

  try {
    const response = await fetch(`${settings.apiServer}/v1/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.modelName,
        prompt: prompt,
        max_tokens: 10,
        temperature: 0.1
      })
    });

    const data = await response.json();
    const decision = data.choices[0].text.trim().toLowerCase();
    sendResponse({ shouldKeep: decision === 'keep' });
  } catch (error) {
    console.error('Error calling LLM:', error);
    sendResponse({ shouldKeep: true });
  }
}

// Initialize settings
loadSettings();
