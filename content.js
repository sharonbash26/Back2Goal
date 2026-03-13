/**
 * Back2Goal - Content Script
 * Reads storage directly, then injects a Shadow DOM overlay.
 * No external URLs, no dependency on the background SW being awake.
 */

const DEFAULT_BLOCKED = ['facebook.com', 'instagram.com', 'tiktok.com', 'ynet.co.il'];

const MESSAGES = [
  { headline: 'פויה! חזרה לעבודה!',          body: 'כל דקה פה היא דקה שנגנבת מהעתיד שלך.' },
  { headline: 'חוצפן! תפסיק לבזבז זמן!',      body: 'הגדרת את האתר הזה כהסחת דעת — כבד את ההחלטה שלך.' },
  { headline: 'חבל על הזמן שלך!',             body: 'המטרות שלך לא השתנו. סגור את הטאב וחזור לפוקוס.' },
  { headline: 'הפוקוס שלך מחכה לך.',          body: 'אפילו חמש דקות של עבודה שוות יותר משעה של גלילה.' },
  { headline: 'העתיד שלך מסתכל עליך עכשיו.',  body: 'מה הוא היה אומר? חזור לעשות את מה שחשוב.' },
];

function pickMessage() {
  return MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function normalise(raw) {
  return raw.toLowerCase().trim()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

function matchesZone(hostname, zone) {
  const h = normalise(hostname);
  const z = normalise(zone);
  if (h === z || h.endsWith('.' + z)) return true;
  if (!z.includes('.') && h.includes(z)) return true;
  return false;
}

// ─── Overlay (Shadow DOM — fully isolated from page CSS/CSP) ─────────────────

function showIntervention() {

  if (document.getElementById('b2g-host')) return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', showIntervention, { once: true });
    return;
  }

  const msg = pickMessage();

  // Host sits on <html>, not <body>, so SPA body-swaps don't remove it
  const host = document.createElement('div');
  host.id = 'b2g-host';
  // Inline styles so nothing depends on an external stylesheet
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'open' });

  // ── Styles (all inline inside shadow, zero external requests) ──
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    #wrap {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(10, 5, 5, 0.82);
      backdrop-filter: blur(22px) saturate(150%);
      -webkit-backdrop-filter: blur(22px) saturate(150%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      animation: b-in .3s ease both;
    }
    @keyframes b-in { from{opacity:0} to{opacity:1} }

    .card {
      width: 100%;
      max-width: 440px;
      background: linear-gradient(150deg, #1a0a0a 0%, #0d0505 100%);
      border: 1px solid rgba(239,68,68,.35);
      border-radius: 22px;
      padding: 44px 36px 34px;
      text-align: center;
      direction: rtl;
      box-shadow: 0 32px 72px rgba(0,0,0,.75), 0 0 80px rgba(239,68,68,.12);
      animation: c-in .4s cubic-bezier(.16,1,.3,1) .05s both;
    }
    @keyframes c-in {
      from { opacity:0; transform:translateY(30px) scale(.95) }
      to   { opacity:1; transform:translateY(0)    scale(1)   }
    }

    .emoji {
      font-size: 64px;
      line-height: 1;
      display: block;
      margin-bottom: 16px;
      animation: e-in .5s cubic-bezier(.34,1.56,.64,1) .1s both;
    }
    @keyframes e-in {
      from { opacity:0; transform:scale(.3) rotate(-20deg) }
      to   { opacity:1; transform:scale(1)  rotate(0deg)   }
    }

    h1 {
      font-size: clamp(26px, 6vw, 34px);
      font-weight: 900;
      line-height: 1.1;
      letter-spacing: -.5px;
      color: #FEF2F2;
      margin-bottom: 12px;
    }

    p {
      font-size: 15px;
      line-height: 1.7;
      color: #FCA5A5;
      margin-bottom: 32px;
    }

    .btn-main {
      display: block;
      width: 100%;
      padding: 17px 24px;
      margin-bottom: 10px;
      background: linear-gradient(135deg, #EF4444 0%, #B91C1C 100%);
      color: #fff;
      border: none;
      border-radius: 14px;
      cursor: pointer;
      font-family: inherit;
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -.2px;
      box-shadow: 0 4px 20px rgba(239,68,68,.45);
      transition: transform .15s ease, box-shadow .15s ease;
    }
    .btn-main:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 28px rgba(239,68,68,.55);
    }
    .btn-main:active { transform: translateY(0); }

    .btn-skip {
      display: block;
      width: 100%;
      padding: 12px 24px;
      background: transparent;
      color: #6B3030;
      border: 1px solid rgba(107,48,48,.4);
      border-radius: 12px;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      transition: color .15s, border-color .15s, background .15s;
    }
    .btn-skip:hover {
      color: #FCA5A5;
      border-color: rgba(252,165,165,.35);
      background: rgba(239,68,68,.07);
    }
  `;

  // ── DOM ──
  const wrap = document.createElement('div');
  wrap.id = 'wrap';

  const card = document.createElement('div');
  card.className = 'card';

  const emoji = document.createElement('span');
  emoji.className = 'emoji';
  emoji.textContent = '🛑';

  const h1 = document.createElement('h1');
  h1.textContent = msg.headline;

  const p = document.createElement('p');
  p.textContent = msg.body;

  const btnMain = document.createElement('button');
  btnMain.className = 'btn-main';
  btnMain.textContent = '💪 צודקת, אני חוזרת למשימות!';

  const btnSkip = document.createElement('button');
  btnSkip.className = 'btn-skip';
  btnSkip.textContent = 'אשאר בכל זאת (לא מומלץ)';

  card.append(emoji, h1, p, btnMain, btnSkip);
  wrap.appendChild(card);
  shadow.append(style, wrap);
  document.documentElement.appendChild(host);
  document.documentElement.style.overflow = 'hidden';

  btnMain.addEventListener('click', () => {
    host.remove();
    document.documentElement.style.overflow = '';
    history.back();
    setTimeout(() => { if (document.getElementById('b2g-host') === null) window.close(); }, 400);
  });

  btnSkip.addEventListener('click', () => {
    host.remove();
    document.documentElement.style.overflow = '';
  });
}

// ─── Storage check ────────────────────────────────────────────────────────────

function runCheck() {
  chrome.storage.local.get(['protectionEnabled', 'blockedSites', 'distractionZones'], (data) => {

    if (data.protectionEnabled === false) return;

    // Use saved sites, or fall back to built-in defaults if storage is empty
    const saved = [
      ...(Array.isArray(data.distractionZones) ? data.distractionZones : []),
      ...(Array.isArray(data.blockedSites)      ? data.blockedSites      : []),
    ];
    const zones = saved.length > 0 ? saved : DEFAULT_BLOCKED;

    const hostname = window.location.hostname;
    const blocked  = zones.some((z) => matchesZone(hostname, z));

    if (blocked) showIntervention();
  });
}

runCheck();

// Also catch proactive signals from background tabs.onUpdated
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'blockSite') showIntervention();
});
