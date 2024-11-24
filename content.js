const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const processedTweets = new Set();
let filterEnabled = false;

// Load initial state
chrome.storage.local.get({ enabled: false }, (result) => {
  filterEnabled = result.enabled;
});

// Listen for filter status changes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'filterStatusChanged') {
    filterEnabled = request.enabled;
    // Show all tweets when filter is disabled
    if (!filterEnabled) {
      document.querySelectorAll(TWEET_SELECTOR).forEach(tweet => {
        tweet.style.display = '';
      });
    } else {
      // Reprocess visible tweets when filter is enabled
      document.querySelectorAll(TWEET_SELECTOR).forEach(processTweet);
    }
  }
});

function processTweet(tweetElement) {
  if (!filterEnabled) return;
  if (processedTweets.has(tweetElement)) return;
  processedTweets.add(tweetElement);

  const tweetText = tweetElement.querySelector('[data-testid="tweetText"]')?.innerText;
  if (!tweetText) return;

  chrome.runtime.sendMessage(
    { type: "evaluateTweet", text: tweetText },
    response => {
      if (!response.shouldKeep) {
        tweetElement.style.display = 'none';
      }
    }
  );
}

const observer = new MutationObserver((mutations) => {
  if (!filterEnabled) return;
  
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tweets = node.matches(TWEET_SELECTOR) ? 
          [node] : 
          Array.from(node.querySelectorAll(TWEET_SELECTOR));
        
        tweets.forEach(processTweet);
      }
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

document.querySelectorAll(TWEET_SELECTOR).forEach(processTweet);