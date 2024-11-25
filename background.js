let settings = null;

async function loadSettings() {
  const defaults = {
    enabled: false,
    apiServer: 'http://localhost:8080',
    modelName: 'llama-3.2-3b-instruct',
    prompt: `You are a content quality filter. Evaluate if the following tweet contains valuable information about books, events, non-incremental AI research, scientific news, or other substantive content. Respond with only "keep" or "hide".

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


function logEvaluation(tweetText, decision, error = null) {
  const truncatedTweet = tweetText.slice(0, 50) + (tweetText.length > 50 ? '...' : '');
  if (error) {
    console.log(`🔴 Error evaluating tweet: "${truncatedTweet}"\nError: ${error}`);
  } else {
    shouldKeep = !decision.includes('hide');
    console.log(`${shouldKeep ? '✅' : '❌'} Tweet "${truncatedTweet}" -> ${decision}`);
  }
}

async function evaluateTweet(tweetText, sendResponse) {
  if (!settings.enabled) {
    console.log('⚪ Filter disabled, keeping tweet');
    sendResponse({ shouldKeep: true });
    return;
  }

  const prompt = settings.prompt.replace('{tweet}', tweetText);
  console.log(`🔄 Evaluating tweet with ${settings.modelName} at ${settings.apiServer}`);

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
    logEvaluation(tweetText, decision);
    console.log('📤 Sending response:', data);
    shouldKeep = !decision.includes('hide');
    sendResponse({ shouldKeep: shouldKeep, response: data });
  } catch (error) {
    logEvaluation(tweetText, 'keep', error);
    console.log('🔴 Error:', error);
    sendResponse({ shouldKeep: true, error: error.message });
  }
}

// Initialize settings
loadSettings();
