/**
 * Back2Goal - Background Service Worker
 * Handles domain-blocking checks and proactively notifies content scripts
 * when a tab navigates to a blocked site.
 */

console.log('[Back2Goal] Service Worker is awake and running.');

// ─── Helpers ────────────────────────────────────────────────────────────────

const normalise = (raw) =>
  raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

function isBlocked(hostname, zones) {
  const normHostname = normalise(hostname);
  return zones.some((zone) => {
    const normZone = normalise(zone);
    // Exact match or subdomain match (e.g. "facebook.com" blocks "www.facebook.com")
    if (normHostname === normZone || normHostname.endsWith(`.${normZone}`)) return true;
    // Partial name match: "facebook" matches "www.facebook.com" or "facebook.com"
    // Handles cases where user typed just the name without TLD
    if (!normZone.includes('.') && (normHostname === normZone || normHostname.includes(normZone))) return true;
    return false;
  });
}

function getBlockedZones(data) {
  return [
    ...(Array.isArray(data.distractionZones) ? data.distractionZones : []),
    ...(Array.isArray(data.blockedSites) ? data.blockedSites : []),
  ];
}

// ─── Message listener (called by content script on page load) ────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'checkSite') return false;

  console.log('[Back2Goal] checkSite received for:', message.url);

  chrome.storage.local.get(['protectionEnabled', 'blockedSites', 'distractionZones'], (data) => {
    // Treat missing key as enabled (default ON)
    if (data.protectionEnabled === false) {
      console.log('[Back2Goal] Protection is OFF — skipping block.');
      sendResponse({ blocked: false });
      return;
    }

    const zones = getBlockedZones(data);

    if (zones.length === 0) {
      console.log('[Back2Goal] No blocked sites configured.');
      sendResponse({ blocked: false });
      return;
    }

    const blocked = isBlocked(message.url, zones);
    console.log(`[Back2Goal] "${message.url}" blocked=${blocked}`);
    sendResponse({ blocked });
  });

  return true; // Keep message channel open for async sendResponse
});

// ─── Proactive tab listener (catches navigations the content script may miss) ─

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only act when the page has fully committed and has a real URL
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.startsWith('http')) return;

  let hostname;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return;
  }

  console.log(`[Back2Goal] tabs.onUpdated — tab ${tabId} loaded: ${hostname}`);

  chrome.storage.local.get(['protectionEnabled', 'blockedSites', 'distractionZones'], (data) => {
    if (data.protectionEnabled === false) return;

    const zones = getBlockedZones(data);
    if (zones.length === 0) return;

    if (isBlocked(hostname, zones)) {
      console.log(`[Back2Goal] Sending block signal to tab ${tabId} for: ${hostname}`);
      chrome.tabs.sendMessage(tabId, { type: 'blockSite' }, () => {
        // Suppress "no receiver" errors — content script handles this via onMessage too
        void chrome.runtime.lastError;
      });
    }
  });
});
