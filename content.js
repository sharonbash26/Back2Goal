/**
 * Back2Goal - Content Script
 * Checks the current site against the blocked list and injects the
 * intervention overlay when a match is found.
 */

const MOTIVATION_MESSAGES = [
  {
    headline: "Hey — your goal is waiting.",
    body: "Every minute here is a minute stolen from the future you're building.",
  },
  {
    headline: "This isn't where you want to be.",
    body: "You opened this tab by habit. Your goals didn't change. Close it.",
  },
  {
    headline: "One decision away from focus.",
    body: "The version of you who achieves their goal doesn't scroll here. Be that version.",
  },
  {
    headline: "Your future self is watching.",
    body: "What would they say right now? Go back and do the work.",
  },
  {
    headline: "Distraction detected.",
    body: "You set this block for a reason. Trust past-you. Get back to it.",
  },
  {
    headline: "This site is a distraction zone.",
    body: "You've already decided this isn't worth your time. Respect that decision.",
  },
  {
    headline: "Focus is a muscle.",
    body: "Every time you resist, it gets stronger. Close this tab and flex.",
  },
  {
    headline: "Progress > perfection > procrastination.",
    body: "Even five focused minutes beats an hour of scrolling. Go.",
  },
];

function pickRandomMessage() {
  return MOTIVATION_MESSAGES[Math.floor(Math.random() * MOTIVATION_MESSAGES.length)];
}

function showIntervention() {
  // Prevent double-injection
  if (document.getElementById('b2g-overlay')) return;

  const msg = pickRandomMessage();

  const overlay = document.createElement('div');
  overlay.id = 'b2g-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'b2g-headline');

  overlay.innerHTML = `
    <div class="b2g-card">
      <div class="b2g-logo">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="20" fill="#10B981"/>
          <circle cx="20" cy="20" r="13" fill="none" stroke="#ffffff" stroke-width="2.5"/>
          <circle cx="20" cy="20" r="5" fill="#ffffff"/>
          <line x1="20" y1="7" x2="20" y2="2" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <span class="b2g-brand">Back2Goal</span>
      </div>

      <div class="b2g-badge">Distraction Zone</div>

      <h1 id="b2g-headline" class="b2g-headline">${escapeHtml(msg.headline)}</h1>
      <p class="b2g-body">${escapeHtml(msg.body)}</p>

      <button id="b2g-back-btn" class="b2g-btn-primary" autofocus>
        ← Back to work
      </button>

      <button id="b2g-dismiss-btn" class="b2g-btn-ghost">
        I'll stay anyway (not recommended)
      </button>

      <p class="b2g-hint">Managed by Back2Goal · <a href="#" id="b2g-settings-link">Edit blocked sites</a></p>
    </div>
  `;

  document.body.appendChild(overlay);
  // Prevent background page from scrolling
  document.documentElement.style.overflow = 'hidden';

  document.getElementById('b2g-back-btn').addEventListener('click', () => {
    history.back();
    // Fallback: if there's no history, close the tab
    setTimeout(() => window.close(), 300);
  });

  document.getElementById('b2g-dismiss-btn').addEventListener('click', () => {
    overlay.remove();
    document.documentElement.style.overflow = '';
  });

  document.getElementById('b2g-settings-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'openPopup' });
  });
}

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

// Run the check as soon as the content script loads
chrome.runtime.sendMessage(
  { type: 'checkSite', url: window.location.hostname },
  (response) => {
    if (chrome.runtime.lastError) return; // Extension context invalidated — ignore
    if (response && response.blocked) {
      showIntervention();
    }
  }
);
