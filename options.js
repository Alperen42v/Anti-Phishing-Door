const DEFAULT_SETTINGS = {
  theme: 'auto',
  bypassDuration: 5
};

const PRESET_DURATIONS = ['5', '10', '20', '-1'];

const domainInput = document.getElementById('domain-input');
const addBtn = document.getElementById('add-btn');
const customList = document.getElementById('custom-list');
const customDurationRow = document.getElementById('custom-duration-row');
const customDurationInput = document.getElementById('custom-duration-input');

let settings = { ...DEFAULT_SETTINGS };

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function setActiveSegment(containerId, value) {
  document.querySelectorAll(`#${containerId} button`).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === String(value));
  });
}

function saveSettings() {
  browser.storage.local.set({ settings });
}

async function loadSettings() {
  const result = await browser.storage.local.get({ settings: DEFAULT_SETTINGS });
  settings = { ...DEFAULT_SETTINGS, ...result.settings };

  applyTheme(settings.theme);
  setActiveSegment('theme-segmented', settings.theme);

  if (PRESET_DURATIONS.includes(String(settings.bypassDuration))) {
    setActiveSegment('bypass-segmented', settings.bypassDuration);
    customDurationRow.classList.remove('visible');
  } else {
    setActiveSegment('bypass-segmented', 'custom');
    customDurationInput.value = settings.bypassDuration;
    customDurationRow.classList.add('visible');
  }
}

document.querySelectorAll('#theme-segmented button').forEach((btn) => {
  btn.addEventListener('click', () => {
    settings.theme = btn.dataset.value;
    applyTheme(settings.theme);
    setActiveSegment('theme-segmented', settings.theme);
    saveSettings();
  });
});

document.querySelectorAll('#bypass-segmented button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const value = btn.dataset.value;
    setActiveSegment('bypass-segmented', value);

    if (value === 'custom') {
      customDurationRow.classList.add('visible');
      customDurationInput.focus();

      const current = parseInt(customDurationInput.value, 10);
      if (current > 0) {
        settings.bypassDuration = current;
        saveSettings();
      }
    } else {
      customDurationRow.classList.remove('visible');
      settings.bypassDuration = parseInt(value, 10);
      saveSettings();
    }
  });
});

customDurationInput.addEventListener('input', () => {
  const value = parseInt(customDurationInput.value, 10);
  if (value > 0) {
    settings.bypassDuration = value;
    saveSettings();
  }
});

function loadCustomDomains() {
  browser.storage.local.get({ customWhitelist: [] }).then((result) => {
    customList.innerHTML = '';

    if (result.customWhitelist.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-hint';
      empty.style.background = 'transparent';
      empty.style.border = 'none';
      empty.style.justifyContent = 'center';
      empty.textContent = 'There is no domain added yet.';
      customList.appendChild(empty);
      return;
    }

    result.customWhitelist.forEach((domain) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = domain;
      li.appendChild(label);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Sil';
      delBtn.className = 'delete-btn';
      delBtn.addEventListener('click', () => {
        removeDomain(domain);
      });
      li.appendChild(delBtn);

      customList.appendChild(li);
    });
  });
}

function removeDomain(domain) {
  browser.storage.local.get({ customWhitelist: [] }).then((result) => {
    let list = result.customWhitelist.filter((d) => d !== domain);
    browser.storage.local.set({ customWhitelist: list }).then(loadCustomDomains);
  });
}

addBtn.addEventListener('click', () => {
  const domain = domainInput.value.trim().toLowerCase();
  if (domain) {
    browser.storage.local.get({ customWhitelist: [] }).then((result) => {
      let list = result.customWhitelist;
      if (!list.includes(domain)) {
        list.push(domain);
        browser.storage.local.set({ customWhitelist: list }).then(() => {
          domainInput.value = '';
          loadCustomDomains();
        });
      }
    });
  }
});

domainInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addBtn.click();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadCustomDomains();
});