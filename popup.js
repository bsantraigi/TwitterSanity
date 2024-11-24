console.log('Popup script loaded!');


document.addEventListener('DOMContentLoaded', async () => {
  const defaults = {
    enabled: false,
    apiServer: 'http://localhost:8080',
    modelName: 'meta-llama-3.1-8b-instruct',
    prompt: `You are a content quality filter. Evaluate if the following tweet contains valuable information about books, events, non-incremental AI research, scientific news, or other substantive content. Respond with only "keep" or "remove".

Tweet: "{tweet}"

Decision:`
  };

  // Load saved settings
  const settings = await chrome.storage.local.get(defaults);
  
  // Initialize UI
  document.getElementById('enabled').checked = settings.enabled;
  document.getElementById('apiServer').value = settings.apiServer;
  document.getElementById('modelName').value = settings.modelName;
  document.getElementById('prompt').value = settings.prompt;
  updateStatus(settings.enabled);

  // Add event listeners
  document.getElementById('enabled').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await chrome.storage.local.set({ enabled });
    updateStatus(enabled);
    // Notify content script of status change
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url.includes('x.com')) {
      chrome.tabs.sendMessage(tab.id, { type: 'filterStatusChanged', enabled });
    }
  });

  ['apiServer', 'modelName', 'prompt'].forEach(id => {
    document.getElementById(id).addEventListener('change', async (e) => {
      await chrome.storage.local.set({ [id]: e.target.value });
    });
  });
});

function updateStatus(enabled) {
  document.getElementById('statusText').textContent = 
    `Filter is ${enabled ? 'enabled' : 'disabled'}`;
}