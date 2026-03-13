/**
 * Back2Goal - Chrome Extension Popup
 * Handles navigation, form state, and chrome.storage sync
 */

const FREE_PLAN_LIMIT = 4;
const DEFAULT_BLOCKED_SITES = ['facebook.com', 'instagram.com', 'ynet.co.il', 'tiktok.com'];

// Ordered to match data-day attributes in the HTML (Sun → Sat)
const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initProtectionToggle();
  initScheduleControls();
  initReminderSelector();
  initSaveButton();
  initBlockedSites();
  initUpgradeButtons();
  loadSettings();
  initKaipyMilestone();
});

/* ----------------------------------------
   Navigation
   ---------------------------------------- */

function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const pages = document.querySelectorAll('.page');

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetPage = btn.dataset.page;
      if (!targetPage) return;

      navButtons.forEach((b) => {
        b.classList.remove('active');
        b.removeAttribute('aria-current');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');

      pages.forEach((page) => {
        const isTarget = page.id === `page-${targetPage}`;
        page.classList.toggle('active', isTarget);
        page.hidden = !isTarget;
      });
    });
  });
}

/* ----------------------------------------
   Protection toggle
   ---------------------------------------- */

function initProtectionToggle() {
  const toggle = document.getElementById('protection-toggle');
  const statusLabel = document.getElementById('protection-status-label');

  function updateLabel() {
    if (!statusLabel || !toggle) return;
    const isOn = toggle.checked;
    statusLabel.textContent = isOn ? 'ON' : 'OFF';
    statusLabel.classList.toggle('on', isOn);
    statusLabel.classList.toggle('off', !isOn);
    toggle.setAttribute('aria-checked', isOn ? 'true' : 'false');
  }

  toggle?.addEventListener('change', updateLabel);
  updateLabel();
}

/* ----------------------------------------
   Active Days — toggle + live summary sync
   ---------------------------------------- */

function initScheduleControls() {
  document.querySelectorAll('.day-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!pressed));
      btn.classList.toggle('active', !pressed);
      // Reflect change live in the Quick Summary
      updateQuickSummary();
    });
  });
}

/* ----------------------------------------
   Reminder slider — live display + summary sync
   ---------------------------------------- */

function initReminderSelector() {
  const slider = document.getElementById('reminder-slider');
  const display = document.getElementById('reminder-value-display');
  if (!slider || !display) return;

  let _tickCtx = null;
  let _lastTickValue = null;

  function playTick() {
    try {
      if (!_tickCtx) _tickCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = _tickCtx.createOscillator();
      const gain = _tickCtx.createGain();
      osc.connect(gain);
      gain.connect(_tickCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, _tickCtx.currentTime);
      gain.gain.setValueAtTime(0.04, _tickCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, _tickCtx.currentTime + 0.06);
      osc.start(_tickCtx.currentTime);
      osc.stop(_tickCtx.currentTime + 0.06);
    } catch (_) {
      // AudioContext not available — silently skip
    }
  }

  function updateSliderFill() {
    const min = Number(slider.min);
    const max = Number(slider.max);
    const val = Number(slider.value);
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.background =
      `linear-gradient(to right, var(--color-accent-ui) ${pct}%, var(--color-border) ${pct}%)`;
  }

  function updateSlider() {
    const minutes = Number(slider.value);

    if (_lastTickValue !== null && _lastTickValue !== minutes) playTick();
    _lastTickValue = minutes;

    const text = formatReminderInterval(minutes);
    display.textContent = text;
    slider.setAttribute('aria-valuenow', minutes);
    slider.setAttribute('aria-valuetext', text);
    updateSliderFill();

    // Keep Quick Summary in sync while dragging
    updateQuickSummary();
  }

  slider.addEventListener('input', updateSlider);
  updateSlider();
}

/* ----------------------------------------
   Save button
   ---------------------------------------- */

function initSaveButton() {
  const saveBtn = document.getElementById('save-settings');
  saveBtn?.addEventListener('click', saveSettings);
}

/* ----------------------------------------
   Upgrade buttons — open payment page
   ---------------------------------------- */

function initUpgradeButtons() {
  function openUpgrade() {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: 'https://stripe.com' });
    } else {
      window.open('https://stripe.com', '_blank');
    }
  }

  // Mini banner on Overview page
  document.querySelectorAll('.btn-upgrade').forEach((btn) => {
    btn.addEventListener('click', openUpgrade);
  });

  // Full PRO page CTA button
  document.querySelectorAll('.btn-primary.btn-full').forEach((btn) => {
    btn.addEventListener('click', openUpgrade);
  });
}

/* ----------------------------------------
   Blocked sites list
   ---------------------------------------- */

function initBlockedSites() {
  const list = document.getElementById('blocked-sites-list');
  const addBtn = document.getElementById('btn-add-site');

  if (!list || !addBtn) return;

  list.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.btn-remove-site');
    if (!removeBtn) return;
    const row = removeBtn.closest('.blocked-row');
    const siteName = row?.querySelector('.blocked-name')?.textContent?.trim() ?? 'this site';

    showModal({
      title: 'Remove site?',
      message: `"${siteName}" will be unblocked and removed from your list.`,
      confirmLabel: 'Remove',
      confirmClass: 'modal-btn-danger',
      onConfirm: () => row.remove(),
    });
  });

  addBtn.addEventListener('click', () => {
    const currentCount = list.querySelectorAll('.blocked-row').length;
    if (currentCount >= FREE_PLAN_LIMIT) {
      showModal({
        title: 'Free plan limit reached',
        message: "You've used all 4 slots. Upgrade to PRO to block unlimited sites.",
        confirmLabel: 'Upgrade to PRO',
        confirmClass: 'modal-btn-info',
        cancelLabel: 'Maybe later',
        onConfirm: () => {
          if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
            chrome.tabs.create({ url: 'https://stripe.com' });
          }
        },
      });
      return;
    }

    showInputModal({
      title: 'Add a Distraction Zone',
      placeholder: 'e.g. twitter.com',
      confirmLabel: 'Add site',
      onConfirm: (value) => {
        if (!value) return;
        appendBlockedSiteRow(list, value);
      },
    });
  });
}

/* ----------------------------------------
   Blocked-site row factory
   ---------------------------------------- */

function appendBlockedSiteRow(list, siteName) {
  const li = document.createElement('li');
  li.className = 'blocked-row';
  li.innerHTML = `
    <span class="blocked-name">${escapeHtml(siteName)}</span>
    <div class="blocked-row-actions">
      <button type="button" class="btn-remove-site" aria-label="Remove ${escapeHtml(siteName)} from blocked sites">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  list.appendChild(li);
}

/* ----------------------------------------
   Quick Summary — live sync from current UI state
   ---------------------------------------- */

function formatReminderInterval(minutes) {
  const m = Number(minutes);
  if (m < 60) return `Every ${m} min`;
  const rawH = m / 60;
  const rounded = Math.round(rawH * 2) / 2;
  if (rounded === 1) return 'Every 1 hour';
  return `Every ${rounded} hours`;
}

function formatReminderShort(minutes) {
  const m = Number(minutes);
  if (m < 60) return `${m} min`;
  const rawH = m / 60;
  const rounded = Math.round(rawH * 2) / 2;
  return rounded === 1 ? '1 hr' : `${rounded} hrs`;
}

function getActiveDayLabels() {
  const active = [];
  DAY_ORDER.forEach((day) => {
    const btn = document.querySelector(`.day-btn[data-day="${day}"]`);
    if (btn && btn.getAttribute('aria-pressed') === 'true') {
      active.push(DAY_LABELS[day]);
    }
  });
  if (active.length === 0) return 'None';
  if (active.length === 7) return 'Every day';
  // Compact range: Mon–Fri
  if (active.length === 5 &&
      active.join(',') === 'Mon,Tue,Wed,Thu,Fri') return 'Mon–Fri';
  if (active.length === 2 &&
      active.join(',') === 'Sat,Sun') return 'Weekends';
  return active.join(', ');
}

function updateQuickSummary() {
  const daysEl = document.getElementById('summary-active-days');
  const reminderEl = document.getElementById('summary-reminder');

  if (daysEl) daysEl.textContent = getActiveDayLabels();

  if (reminderEl) {
    const slider = document.getElementById('reminder-slider');
    const minutes = slider ? Number(slider.value) : 15;
    reminderEl.textContent = formatReminderShort(minutes);
  }
}

/* ----------------------------------------
   Load settings from chrome.storage.local
   ---------------------------------------- */

function loadSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(
      ['protectionEnabled', 'activeDays', 'startTime', 'endTime', 'reminderInterval', 'blockedSites'],
      (data) => {
        // Protection toggle
        const toggle = document.getElementById('protection-toggle');
        if (toggle && data.protectionEnabled !== undefined) {
          toggle.checked = data.protectionEnabled;
          toggle.setAttribute('aria-checked', data.protectionEnabled ? 'true' : 'false');
          const statusLabel = document.getElementById('protection-status-label');
          if (statusLabel) {
            statusLabel.textContent = data.protectionEnabled ? 'ON' : 'OFF';
            statusLabel.classList.toggle('on', data.protectionEnabled);
            statusLabel.classList.toggle('off', !data.protectionEnabled);
          }
        }

        // Start / end time
        if (data.startTime) {
          const el = document.getElementById('start-time');
          if (el) el.value = data.startTime;
        }
        if (data.endTime) {
          const el = document.getElementById('end-time');
          if (el) el.value = data.endTime;
        }

        // Reminder slider
        if (data.reminderInterval) {
          const slider = document.getElementById('reminder-slider');
          if (slider) {
            slider.value = data.reminderInterval;
            slider.dispatchEvent(new Event('input')); // triggers updateSlider + updateQuickSummary
          }
        }

        // Active days
        if (Array.isArray(data.activeDays)) {
          DAY_ORDER.forEach((day, i) => {
            const btn = document.querySelector(`.day-btn[data-day="${day}"]`);
            if (btn && data.activeDays[i] !== undefined) {
              const isActive = Boolean(data.activeDays[i]);
              btn.setAttribute('aria-pressed', String(isActive));
              btn.classList.toggle('active', isActive);
            }
          });
        }

        // Blocked sites
        const list = document.getElementById('blocked-sites-list');
        if (list) {
          list.innerHTML = '';
          const sites = Array.isArray(data.blockedSites) ? data.blockedSites : DEFAULT_BLOCKED_SITES;
          sites.forEach((site) => appendBlockedSiteRow(list, site));
        }

        // Sync Quick Summary with whatever was just loaded
        updateQuickSummary();
      }
    );
  } else {
    // Non-extension context: render defaults
    const list = document.getElementById('blocked-sites-list');
    if (list) {
      list.innerHTML = '';
      DEFAULT_BLOCKED_SITES.forEach((site) => appendBlockedSiteRow(list, site));
    }
    updateQuickSummary();
  }
}

/* ----------------------------------------
   Save settings to chrome.storage.local
   ---------------------------------------- */

function saveSettings() {
  const toggle = document.getElementById('protection-toggle');
  const startTime = document.getElementById('start-time')?.value || '09:00';
  const endTime = document.getElementById('end-time')?.value || '18:00';
  const slider = document.getElementById('reminder-slider');
  const reminderInterval = slider ? parseInt(slider.value, 10) : 15;

  // Collect active days in DAY_ORDER (Sun → Sat)
  const activeDays = DAY_ORDER.map((day) => {
    const btn = document.querySelector(`.day-btn[data-day="${day}"]`);
    return btn ? btn.getAttribute('aria-pressed') === 'true' : false;
  });

  // Collect blocked sites from live DOM
  const blockedSites = [];
  document.querySelectorAll('#blocked-sites-list .blocked-name').forEach((el) => {
    const name = el.textContent.trim();
    if (name) blockedSites.push(name);
  });

  const settings = {
    protectionEnabled: toggle?.checked ?? true,
    startTime,
    endTime,
    reminderInterval,
    activeDays,
    blockedSites,
  };

  const saveBtn = document.getElementById('save-settings');

  function showSavedFeedback() {
    if (!saveBtn) return;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saved! ✅';
    saveBtn.disabled = true;
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 2000);
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set(settings, () => {
      updateQuickSummary();
      showSavedFeedback();
    });
  } else {
    // Non-extension context: still update summary + show feedback
    updateQuickSummary();
    showSavedFeedback();
  }
}

/* ----------------------------------------
   Modal helpers — accessible, focus-trapped
   ---------------------------------------- */

let _modalReturnFocus = null;
let _modalTrapHandler = null;
let _modalEscHandler = null;

function getModal() {
  return document.getElementById('app-modal');
}

function closeModal() {
  const modal = getModal();
  if (!modal) return;
  modal.hidden = true;
  if (_modalTrapHandler) document.removeEventListener('keydown', _modalTrapHandler);
  if (_modalEscHandler) document.removeEventListener('keydown', _modalEscHandler);
  _modalTrapHandler = null;
  _modalEscHandler = null;
  if (_modalReturnFocus && typeof _modalReturnFocus.focus === 'function') {
    _modalReturnFocus.focus();
  }
  _modalReturnFocus = null;
}

function _openModal(firstFocusEl) {
  const modal = getModal();
  if (!modal) return;

  _modalReturnFocus = document.activeElement;
  modal.hidden = false;

  requestAnimationFrame(() => firstFocusEl?.focus());

  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  _modalTrapHandler = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(modal.querySelectorAll(FOCUSABLE));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  _modalEscHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', _modalTrapHandler);
  document.addEventListener('keydown', _modalEscHandler);

  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); }, { once: true });
}

function showModal({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', confirmClass = 'modal-btn-confirm', onConfirm }) {
  const modal = getModal();
  if (!modal) return;

  modal.querySelector('#modal-title').textContent = title;
  const messageEl = modal.querySelector('#modal-message');
  messageEl.textContent = message;

  const actions = modal.querySelector('#modal-actions');
  actions.innerHTML = '';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = cancelLabel;
  cancelBtn.addEventListener('click', closeModal);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = `modal-btn modal-btn-confirm ${confirmClass}`;
  confirmBtn.textContent = confirmLabel;
  confirmBtn.addEventListener('click', () => { closeModal(); onConfirm?.(); });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);

  _openModal(confirmBtn);
}

function showInputModal({ title, placeholder = '', confirmLabel = 'Add', onConfirm }) {
  const modal = getModal();
  if (!modal) return;

  modal.querySelector('#modal-title').textContent = title;

  const messageEl = modal.querySelector('#modal-message');
  messageEl.innerHTML = '';

  const labelEl = document.createElement('label');
  labelEl.htmlFor = 'modal-site-input';
  labelEl.className = 'sr-only';
  labelEl.textContent = title;

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'modal-site-input';
  input.placeholder = placeholder;
  input.className = 'modal-input';
  input.autocomplete = 'off';

  messageEl.appendChild(labelEl);
  messageEl.appendChild(input);

  const actions = modal.querySelector('#modal-actions');
  actions.innerHTML = '';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'modal-btn modal-btn-confirm';
  confirmBtn.textContent = confirmLabel;
  confirmBtn.addEventListener('click', () => {
    const value = input.value.trim();
    closeModal();
    onConfirm?.(value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);

  _openModal(input);
}

/* ----------------------------------------
   Keepi 1-Hour Focus Milestone
   ---------------------------------------- */

function initKaipyMilestone() {
  const MILESTONE_MS = 60 * 60 * 1000;
  const HIDE_AFTER_MS = 12000;
  const STORAGE_KEY = 'kaipyLastShown';

  const container = document.getElementById('kaipy-container');
  if (!container) return;

  let idleTimer = null;
  let hideTimer = null;

  const CONFETTI_COLORS = [
    '#10B981', '#34D399', '#6EE7B7',
    '#F59E0B', '#FCD34D', '#FDE68A',
    '#F472B6', '#A78BFA', '#60A5FA',
  ];

  function launchConfetti() {
    const canvas = document.getElementById('kaipy-confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = document.documentElement.clientWidth || 360;
    canvas.height = document.documentElement.clientHeight || 580;

    const PARTICLE_COUNT = 60;
    const DURATION_MS = 3200;
    const start = performance.now();
    const originX = canvas.width - 50;
    const originY = canvas.height - 120;

    const particles = Array.from({ length: PARTICLE_COUNT }, () => {
      const angle = (Math.random() * 260 - 220) * (Math.PI / 180);
      const speed = 2.5 + Math.random() * 4.5;
      const size = 4 + Math.random() * 6;
      const shape = Math.random() < 0.5 ? 'rect' : 'circle';
      return {
        x: originX, y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * 360,
        rotV: (Math.random() - 0.5) * 8,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        w: size,
        h: shape === 'rect' ? size * 0.45 : size,
        shape,
        opacity: 1,
      };
    });

    function draw(now) {
      const elapsed = now - start;
      if (elapsed > DURATION_MS) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const progress = elapsed / DURATION_MS;
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.12; p.vx *= 0.995;
        p.rot += p.rotV;
        p.opacity = progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      });
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  function playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        const t0 = ctx.currentTime + i * 0.13;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.28, t0 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
        osc.start(t0); osc.stop(t0 + 0.6);
      });
    } catch (_) { /* AudioContext blocked */ }
  }

  function showKaipy() {
    if (!container.hidden) return;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: Date.now() });
    }
    container.hidden = false;
    container.style.animation = 'none';
    void container.offsetWidth;
    container.style.animation = '';
    setTimeout(() => { launchConfetti(); playChime(); }, 620);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { container.hidden = true; }, HIDE_AFTER_MS);
  }

  function scheduleKaipy() {
    clearTimeout(idleTimer);
    const toggle = document.getElementById('protection-toggle');
    if (!toggle?.checked) return;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([STORAGE_KEY], (data) => {
        const last = data[STORAGE_KEY] || 0;
        const elapsed = Date.now() - last;
        const remaining = elapsed >= MILESTONE_MS ? 0 : MILESTONE_MS - elapsed;
        idleTimer = setTimeout(showKaipy, remaining || MILESTONE_MS);
      });
    } else {
      idleTimer = setTimeout(showKaipy, MILESTONE_MS);
    }
  }

  ['click', 'keydown', 'input', 'change'].forEach((evt) => {
    document.addEventListener(evt, () => { clearTimeout(idleTimer); scheduleKaipy(); }, { passive: true });
  });

  scheduleKaipy();

  const testBtn = document.getElementById('test-kaipy');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      container.hidden = true;
      showKaipy();
    });
  }
}

/* ----------------------------------------
   Utilities
   ---------------------------------------- */

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
