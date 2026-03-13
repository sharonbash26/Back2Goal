/**
 * Back2Goal - Background Service Worker
 * Handles domain-blocking checks for the content script.
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'checkSite') return false;

  const hostname = message.url;

  chrome.storage.local.get(['protectionEnabled', 'blockedSites', 'distractionZones'], (data) => {
    // Respect the master protection toggle
    if (!data.protectionEnabled) {
      sendResponse({ blocked: false });
      return;
    }

    // Support both storage key names: blockedSites (popup) and distractionZones (legacy)
    const zones = [
      ...(Array.isArray(data.distractionZones) ? data.distractionZones : []),
      ...(Array.isArray(data.blockedSites) ? data.blockedSites : []),
    ];

    if (zones.length === 0) {
      sendResponse({ blocked: false });
      return;
    }

    // Normalise each stored entry: strip protocol/www, lowercase, trim
    const normalise = (raw) =>
      raw
        .toLowerCase()
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '');

    const normHostname = normalise(hostname);

    const blocked = zones.some((zone) => {
      const normZone = normalise(zone);
      // Match exact domain or any subdomain (e.g. "facebook.com" blocks "m.facebook.com")
      return normHostname === normZone || normHostname.endsWith(`.${normZone}`);
    });

    sendResponse({ blocked });
  });

  // Return true to keep the message channel open for the async sendResponse
  return true;
});
