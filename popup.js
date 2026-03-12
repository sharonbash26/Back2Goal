/**
 * Back2Goal - Chrome Extension Popup
 * Handles navigation, form state, and chrome.storage sync
 */

const FREE_PLAN_LIMIT = 4;

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initProtectionToggle();
  initScheduleControls();
  initReminderSelector();
  initSaveButton();
  initBlockedSites();
  loadSettings();
  initKaipyMilestone();
});

function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const pages = document.querySelectorAll('.page');

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetPage = btn.dataset.page;
      if (!targetPage) return;

      navButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
      navButtons.forEach((b) => {
        if (b !== btn) b.removeAttribute('aria-current');
      });

      pages.forEach((page) => {
        const isTarget = page.id === `page-${targetPage}`;
        page.classList.toggle('active', isTarget);
        page.hidden = !isTarget;
      });
    });
  });
}

function initProtectionToggle() {
  const toggle = document.getElementById('protection-toggle');
  const statusLabel = document.getElementById('protection-status-label');

  function updateLabel() {
    if (!statusLabel || !toggle) return;
    const isOn = toggle.checked;
    statusLabel.textContent = isOn ? 'ON' : 'OFF';
    statusLabel.classList.toggle('on', isOn);
    statusLabel.classList.toggle('off', !isOn);
    // Keep role="switch" aria-checked in sync
    toggle.setAttribute('aria-checked', isOn ? 'true' : 'false');
  }

  toggle?.addEventListener('change', updateLabel);
  updateLabel();
}

function initScheduleControls() {
  document.querySelectorAll('.day-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', !pressed);
    });
  });
}

function initReminderSelector() {
  const slider = document.getElementById('reminder-slider');
  const display = document.getElementById('reminder-value-display');
  if (!slider || !display) return;

  // Tick sound: short AudioContext beep on each step change
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

  function formatInterval(minutes) {
    if (minutes < 60) return `Every ${minutes} min`;
    // Round to nearest 0.5 hour, display cleanly
    const rawH = minutes / 60;
    const rounded = Math.round(rawH * 2) / 2;
    if (rounded === 1) return 'Every 1 hour';
    // Format: "1.5 hours" or "2 hours" — no trailing .0
    const label = Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
    return `Every ${label} hours`;
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

    // Play tick only when value actually changes step
    if (_lastTickValue !== null && _lastTickValue !== minutes) playTick();
    _lastTickValue = minutes;

    const text = formatInterval(minutes);
    display.textContent = text;
    slider.setAttribute('aria-valuenow', minutes);
    slider.setAttribute('aria-valuetext', text);
    updateSliderFill();
  }

  slider.addEventListener('input', updateSlider);
  updateSlider();
}

function initSaveButton() {
  const saveBtn = document.getElementById('save-settings');
  saveBtn?.addEventListener('click', saveSettings);
}

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
        onConfirm: () => {},
      });
      return;
    }

    showInputModal({
      title: 'Add a Distraction Zone',
      placeholder: 'Add a distracting site...',
      confirmLabel: 'Add site',
      onConfirm: (value) => {
        if (!value) return;
        const li = document.createElement('li');
        li.className = 'blocked-row';
        li.innerHTML = `
          <span class="blocked-name">${escapeHtml(value)}</span>
          <div class="blocked-row-actions">
            <button type="button" class="btn-remove-site" aria-label="Remove ${escapeHtml(value)} from blocked sites">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>`;
        list.appendChild(li);
      },
    });
  });
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
  if (_modalEscHandler)  document.removeEventListener('keydown', _modalEscHandler);
  _modalTrapHandler = null;
  _modalEscHandler = null;
  // Restore focus to the element that opened the modal
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

  // Focus first interactive element
  requestAnimationFrame(() => firstFocusEl?.focus());

  // Focus trap
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

  // Close on backdrop click
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); }, { once: true });
}

function showModal({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', confirmClass = 'modal-btn-confirm', onConfirm }) {
  const modal = getModal();
  if (!modal) return;

  modal.querySelector('#modal-title').textContent = title;
  const messageEl = modal.querySelector('#modal-message');
  messageEl.textContent = '';
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
  const MILESTONE_MS = 60 * 60 * 1000; // 1 hour
  const HIDE_AFTER_MS = 12000;          // 12 seconds — enough time to read
  const STORAGE_KEY = 'kaipyLastShown';

  const container = document.getElementById('kaipy-container');
  if (!container) return;

  let idleTimer = null;
  let hideTimer = null;

  /* ------ Confetti ------ */
  const CONFETTI_COLORS = [
    '#10B981', '#34D399', '#6EE7B7',  // brand greens
    '#F59E0B', '#FCD34D', '#FDE68A',  // golds
    '#F472B6', '#A78BFA', '#60A5FA',  // accent pops
  ];

  function launchConfetti() {
    const canvas = document.getElementById('kaipy-confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = document.documentElement.clientWidth  || 360;
    canvas.height = document.documentElement.clientHeight || 580;

    const PARTICLE_COUNT = 60;
    const DURATION_MS    = 3200;
    const start          = performance.now();

    // Burst origin: bottom-right area near Keepi
    const originX = canvas.width  - 50;
    const originY = canvas.height - 120;

    const particles = Array.from({ length: PARTICLE_COUNT }, () => {
      const angle  = (Math.random() * 260 - 220) * (Math.PI / 180); // fan upward-left
      const speed  = 2.5 + Math.random() * 4.5;
      const size   = 4 + Math.random() * 6;
      const shape  = Math.random() < 0.5 ? 'rect' : 'circle';
      return {
        x:    originX,
        y:    originY,
        vx:   Math.cos(angle) * speed,
        vy:   Math.sin(angle) * speed,
        rot:  Math.random() * 360,
        rotV: (Math.random() - 0.5) * 8,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        w:    size,
        h:    shape === 'rect' ? size * 0.45 : size,
        shape,
        opacity: 1,
      };
    });

    function draw(now) {
      const elapsed = now - start;
      if (elapsed > DURATION_MS) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const progress = elapsed / DURATION_MS;

      particles.forEach((p) => {
        p.x   += p.vx;
        p.y   += p.vy;
        p.vy  += 0.12;           // gravity
        p.vx  *= 0.995;          // slight air drag
        p.rot += p.rotV;
        // Fade out in last 40% of duration
        p.opacity = progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      });

      requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
  }

  /* ------ Success Chime (Web Audio) ------ */
  function playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Three ascending notes: C5 → E5 → G5 (major triad arpeggio)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        const t0 = ctx.currentTime + i * 0.13;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.28, t0 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);

        osc.start(t0);
        osc.stop(t0 + 0.6);
      });
    } catch (_) {
      // AudioContext blocked — silently skip
    }
  }

  /* ------ Show Keepi ------ */
  function showKaipy() {
    // Don't re-show if already visible
    if (!container.hidden) return;

    // Record the time we last showed Keepi
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: Date.now() });
    }

    // Reset animation by forcing reflow
    container.hidden = false;
    container.style.animation = 'none';
    void container.offsetWidth; // trigger reflow
    container.style.animation = '';

    // Fire confetti + chime when Keepi reaches her float position (~650ms into slide-up)
    setTimeout(() => {
      launchConfetti();
      playChime();
    }, 620);

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      container.hidden = true;
    }, HIDE_AFTER_MS);
  }

  function scheduleKaipy() {
    clearTimeout(idleTimer);

    // Check if protection is on before scheduling
    const toggle = document.getElementById('protection-toggle');
    if (!toggle?.checked) return;

    // Check if we already showed Keepi within the last hour
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([STORAGE_KEY], (data) => {
        const last = data[STORAGE_KEY] || 0;
        const elapsed = Date.now() - last;
        const remaining = elapsed >= MILESTONE_MS ? 0 : MILESTONE_MS - elapsed;
        idleTimer = setTimeout(showKaipy, remaining || MILESTONE_MS);
      });
    } else {
      // Fallback for non-extension context (dev preview)
      idleTimer = setTimeout(showKaipy, MILESTONE_MS);
    }
  }

  // Reset the idle timer on any user interaction
  const interactionEvents = ['click', 'keydown', 'input', 'change'];
  interactionEvents.forEach((evt) => {
    document.addEventListener(evt, () => {
      clearTimeout(idleTimer);
      scheduleKaipy();
    }, { passive: true });
  });

  // Start on load
  scheduleKaipy();

  // Test button — exposes showKeepi for manual triggering
  const testBtn = document.getElementById('test-kaipy');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      // Force show regardless of idle state
      container.hidden = true; // reset so animation replays
      showKaipy();
    });
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function loadSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(
      ['protectionEnabled', 'activeDays', 'startTime', 'endTime', 'reminderInterval'],
      (data) => {
        const toggle = document.getElementById('protection-toggle');
        if (toggle && data.protectionEnabled !== undefined) {
          toggle.checked = data.protectionEnabled;
          const statusLabel = document.getElementById('protection-status-label');
          if (statusLabel) {
            statusLabel.textContent = data.protectionEnabled ? 'ON' : 'OFF';
            statusLabel.classList.toggle('on', data.protectionEnabled);
            statusLabel.classList.toggle('off', !data.protectionEnabled);
          }
        }
        if (data.startTime) {
          const startInput = document.getElementById('start-time');
          if (startInput) startInput.value = data.startTime;
        }
        if (data.endTime) {
          const endInput = document.getElementById('end-time');
          if (endInput) endInput.value = data.endTime;
        }
        if (data.reminderInterval) {
          const slider = document.getElementById('reminder-slider');
          if (slider) {
            slider.value = data.reminderInterval;
            slider.dispatchEvent(new Event('input'));
          }
        }
        if (data.activeDays && Array.isArray(data.activeDays)) {
          const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
          days.forEach((day, i) => {
            const btn = document.querySelector(`.day-btn[data-day="${day}"]`);
            if (btn && data.activeDays[i] !== undefined) {
              btn.setAttribute('aria-pressed', data.activeDays[i] ? 'true' : 'false');
            }
          });
        }
      }
    );
  }
}

function saveSettings() {
  const toggle = document.getElementById('protection-toggle');
  const startTime = document.getElementById('start-time')?.value || '09:00';
  const endTime = document.getElementById('end-time')?.value || '18:00';
  const slider = document.getElementById('reminder-slider');
  const reminderInterval = slider ? parseInt(slider.value, 10) : 15;

  const activeDays = [];
  document.querySelectorAll('.day-btn').forEach((btn) => {
    activeDays.push(btn.getAttribute('aria-pressed') === 'true');
  });

  const settings = {
    protectionEnabled: toggle?.checked ?? true,
    startTime,
    endTime,
    reminderInterval,
    activeDays,
  };

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set(settings, () => {
      const saveBtn = document.getElementById('save-settings');
      const originalText = saveBtn.textContent;
      saveBtn.textContent = 'Saved!';
      saveBtn.disabled = true;
      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
      }, 1500);
    });
  }
}
