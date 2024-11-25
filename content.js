const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const processedTweets = new Set();
const blurredTweetIds = new Set();
let filterEnabled = false;
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Load initial state
chrome.storage.local.get({ enabled: false, evaluationCache: {} }, (result) => {
  filterEnabled = result.enabled;
});

// Add CSS for blur effect using a data attribute selector
const style = document.createElement('style');
style.textContent = `
  article[data-blur-state="blurred"] {
    filter: blur(8px);
    transition: filter 0.3s ease;
  }
  article[data-blur-state="blurred"]:hover {
    filter: blur(0);
  }
`;
document.head.appendChild(style);

// Helper function to get tweet ID from element
function getTweetId(tweetElement) {
  // First try to get it from the article element
  let tweetId = tweetElement.getAttribute('aria-labelledby')?.split(' ')[0];
  
  // If not found, try to get it from the time element
  if (!tweetId) {
    const timeElement = tweetElement.querySelector('time');
    const timeParent = timeElement?.parentElement;
    if (timeParent && timeParent.tagName === 'A') {
      const href = timeParent.getAttribute('href');
      tweetId = href?.split('/').pop();
    }
  }
  
  return tweetId;
}

// Helper function to apply blur
function applyBlur(tweetElement) {
  const tweetId = getTweetId(tweetElement);
  if (tweetId && blurredTweetIds.has(tweetId)) {
    tweetElement.setAttribute('data-blur-state', 'blurred');
  }
}

// Cache management functions
function getCacheKey(text) {
  // Create a simple hash of the tweet text to use as cache key
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `tweet_${hash}`;
}

async function getFromCache(text) {
  const cacheKey = getCacheKey(text);
  const result = await chrome.storage.local.get({ evaluationCache: {} });
  const cache = result.evaluationCache;
  
  if (cache[cacheKey]) {
    const { timestamp, shouldKeep } = cache[cacheKey];
    if (Date.now() - timestamp < CACHE_EXPIRATION) {
      console.log('🎯 Cache hit for tweet');
      return shouldKeep;
    } else {
      // Remove expired cache entry
      delete cache[cacheKey];
      await chrome.storage.local.set({ evaluationCache: cache });
    }
  }
  return null;
}

async function saveToCache(text, shouldKeep) {
  const cacheKey = getCacheKey(text);
  const result = await chrome.storage.local.get({ evaluationCache: {} });
  const cache = result.evaluationCache;
  
  cache[cacheKey] = {
    timestamp: Date.now(),
    shouldKeep
  };
  
  await chrome.storage.local.set({ evaluationCache: cache });
  console.log('💾 Cached evaluation result');
}

// Listen for filter status changes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'filterStatusChanged') {
    console.log('Filter status changed:', request.enabled);
    filterEnabled = request.enabled;
    
    if (!filterEnabled) {
      // Remove blur from all tweets and clear the blurred set
      document.querySelectorAll(TWEET_SELECTOR).forEach(tweet => {
        tweet.removeAttribute('data-blur-state');
      });
      blurredTweetIds.clear();
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

async function processTweet(tweetElement) {
  if (!filterEnabled) return;
  
  const tweetId = getTweetId(tweetElement);
  if (!tweetId) return;
  
  if (processedTweets.has(tweetId)) {
    // If we've already processed this tweet, just apply the blur if needed
    applyBlur(tweetElement);
    return;
  }
  
  processedTweets.add(tweetId);

  const tweetText = tweetElement.querySelector('[data-testid="tweetText"]')?.innerText;
  if (!tweetText) return;
  
  console.log(`📨 Processing tweet: "${tweetText.slice(0, 50)}..."`);
  
  // Check cache first
  const cachedResult = await getFromCache(tweetText);
  if (cachedResult !== null) {
    if (!cachedResult) {
      blurredTweetIds.add(tweetId);
      tweetElement.setAttribute('data-blur-state', 'blurred');
      console.log('🌫️ Blurred tweet (from cache)', tweetId);
    }
    return;
  }
  
  // If not in cache, evaluate tweet
  chrome.runtime.sendMessage(
    { type: "evaluateTweet", text: tweetText },
    async response => {
      console.log(`Raw response: ${JSON.stringify(response)}`);
      console.log(`📥 Received response for tweet: ${response.shouldKeep ? 'keep' : 'blur'}`);
      
      // Cache the result
      await saveToCache(tweetText, response.shouldKeep);
      
      if (!response.shouldKeep) {
        blurredTweetIds.add(tweetId);
        tweetElement.setAttribute('data-blur-state', 'blurred');
        console.log('🌫️ Blurred tweet', tweetId);
      }
    }
  );
}

// Create a more aggressive observer that watches for attribute changes as well
const observer = new MutationObserver((mutations) => {
  if (!filterEnabled) return;
  
  for (const mutation of mutations) {
    // Handle new nodes
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tweets = node.matches(TWEET_SELECTOR) ? 
            [node] : 
            Array.from(node.querySelectorAll(TWEET_SELECTOR));
          
          tweets.forEach(processTweet);
        }
      }
    }
    
    // Handle attribute changes
    if (mutation.type === 'attributes') {
      const target = mutation.target;
      if (target.matches(TWEET_SELECTOR)) {
        applyBlur(target);
      }
    }
  }
});

// Observe both child list and attribute changes
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class'] // Only watch for class changes
});

// Process initial tweets
document.querySelectorAll(TWEET_SELECTOR).forEach(processTweet);

// Persist blurred tweet IDs to storage
function saveBlurredTweets() {
  chrome.storage.local.set({ 
    blurredTweets: Array.from(blurredTweetIds) 
  });
}

// Load blurred tweets from storage
chrome.storage.local.get({ blurredTweets: [] }, (result) => {
  result.blurredTweets.forEach(id => blurredTweetIds.add(id));
  // Re-apply blur to any visible tweets
  document.querySelectorAll(TWEET_SELECTOR).forEach(applyBlur);
});

// Save blurred tweets whenever the set changes
const originalAdd = blurredTweetIds.add.bind(blurredTweetIds);
blurredTweetIds.add = function(id) {
  originalAdd(id);
  saveBlurredTweets();
};