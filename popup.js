/**
 * Back2Goal - Chrome Extension Popup
 * Handles navigation, form state, and chrome.storage sync
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initProtectionToggle();
  initScheduleControls();
  initReminderSelector();
  initSaveButton();
  loadSettings();
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
    if (!statusLabel) return;
    const isOn = toggle?.checked ?? true;
    statusLabel.textContent = isOn ? 'ON' : 'OFF';
    statusLabel.classList.toggle('on', isOn);
    statusLabel.classList.toggle('off', !isOn);
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
  document.querySelectorAll('.segmented-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.segmented-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    });
  });
}

function initSaveButton() {
  const saveBtn = document.getElementById('save-settings');
  saveBtn?.addEventListener('click', saveSettings);
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
          const activeBtn = document.querySelector(
            `.segmented-btn[data-interval="${data.reminderInterval}"]`
          );
          if (activeBtn) {
            document.querySelectorAll('.segmented-btn').forEach((b) => {
              b.classList.remove('active');
              b.setAttribute('aria-pressed', 'false');
            });
            activeBtn.classList.add('active');
            activeBtn.setAttribute('aria-pressed', 'true');
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
  const activeBtn = document.querySelector('.segmented-btn.active');
  const reminderInterval = activeBtn ? parseInt(activeBtn.dataset.interval, 10) : 15;

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
