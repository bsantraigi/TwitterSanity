// content.js

const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const processedTweets = new Set();
let filterEnabled = false;

// Load initial state
chrome.storage.local.get({ enabled: false }, (result) => {
  filterEnabled = result.enabled;
});

// Add CSS for blur effect
const style = document.createElement('style');
style.textContent = `
  .tweet-blurred {
    filter: blur(8px);
    transition: filter 0.3s ease;
  }
  .tweet-blurred:hover {
    filter: blur(0);
  }
`;
document.head.appendChild(style);

// Listen for filter status changes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'filterStatusChanged') {
    console.log('Filter status changed:', request.enabled);
    filterEnabled = request.enabled;
    
    // Remove blur from all tweets when filter is disabled
    if (!filterEnabled) {
      document.querySelectorAll(TWEET_SELECTOR).forEach(tweet => {
        tweet.classList.remove('tweet-blurred');
      });
    } else {
      // Reprocess visible tweets when filter is enabled
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
      console.log(`📥 Received response for tweet: ${response.shouldKeep ? 'keep' : 'blur'}`);
      if (!response.shouldKeep) {
        tweetElement.classList.add('tweet-blurred');
        console.log('🌫️ Blurred tweet');
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