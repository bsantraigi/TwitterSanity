console.log('Twitter Filter content script loaded!');

// Add these basic event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded in Twitter page');
});

window.addEventListener('load', () => {
  console.log('Window fully loaded in Twitter page');
});

// Test message to background script
chrome.runtime.sendMessage({ type: "test" }, response => {
  console.log('Got response from background script:', response);
});


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
    // show a popup
    console.log('Filter status changed:', request.enabled);

    filterEnabled = request.enabled;
    // Show all tweets when filter is disabled
    if (!filterEnabled) {
      document.querySelectorAll(TWEET_SELECTOR).forEach(tweet => {
        tweet.style.display = '';
      });
    } else {
      // Reprocess visible tweets when filter is enabled
      // add a incremental delay before calling processTweet, such that twitter doesn't block the extension
      //   document.querySelectorAll(TWEET_SELECTOR).forEach(processTweet);
      let delay = 0;
      document.querySelectorAll(TWEET_SELECTOR).forEach(tweet => {
        setTimeout(() => processTweet(tweet), delay);
        delay += 500;
      });
    }
  }
});

function processTweet(tweetElement) {
  if (!filterEnabled) return;
  if (processedTweets.has(tweetElement)) return;
  processedTweets.add(tweetElement);

  const tweetText = tweetElement.querySelector('[data-testid="tweetText"]')?.innerText;
  if (!tweetText) return;
  
  console.log(`📨 Processing tweet: "${tweetText.slice(0, 50)}..."`);
  
  chrome.runtime.sendMessage(
    { type: "evaluateTweet", text: tweetText },
    response => {
      console.log(`Raw response: ${JSON.stringify(response)}`);
      console.log(`📥 Received response for tweet: ${response.shouldKeep ? 'keep' : 'hide'}`);
      if (!response.shouldKeep) {
        tweetElement.style.display = 'none';
        console.log('🙈 Hidden tweet');
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