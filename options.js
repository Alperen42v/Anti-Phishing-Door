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
const exportJsonBtn = document.getElementById('export-json-btn');
const exportTxtBtn = document.getElementById('export-txt-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');
const ioStatus = document.getElementById('io-status');

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

function localizePage() {
  document.querySelectorAll('[data-i18n]').forEach((elem) => {
    const key = elem.dataset.i18n;
    const message = browser.i18n.getMessage(key);
    if (message) {
      elem.textContent = message;
    }
  });
  
  if (customDurationInput) {
    customDurationInput.placeholder = browser.i18n.getMessage('optCustomPlaceholder');
  }
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
      empty.textContent = browser.i18n.getMessage('optNoDomains');
      customList.appendChild(empty);
      return;
    }

    result.customWhitelist.forEach((domain) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = domain;
      li.appendChild(label);

      const delBtn = document.createElement('button');
      delBtn.textContent = browser.i18n.getMessage('optDelete');
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

function showIoStatus(message, isError) {
  ioStatus.textContent = message;
  ioStatus.className = 'io-status ' + (isError ? 'error' : 'success');
  setTimeout(() => {
    ioStatus.textContent = '';
    ioStatus.className = 'io-status';
  }, 4000);
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

exportJsonBtn.addEventListener('click', () => {
  browser.storage.local.get({ customWhitelist: [] }).then((result) => {
    const json = JSON.stringify({ customWhitelist: result.customWhitelist }, null, 2);
    downloadFile('anti-phishing-door-whitelist.json', json, 'application/json');
  });
});

exportTxtBtn.addEventListener('click', () => {
  browser.storage.local.get({ customWhitelist: [] }).then((result) => {
    const txt = result.customWhitelist.join('\n');
    downloadFile('anti-phishing-door-whitelist.txt', txt, 'text/plain');
  });
});

function parseImportedContent(filename, text) {
  const isJson = filename.toLowerCase().endsWith('.json');
  if (isJson) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.customWhitelist)) return parsed.customWhitelist;
    throw new Error('invalid json structure');
  }
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

importBtn.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = parseImportedContent(file.name, reader.result)
        .map((d) => String(d).trim().toLowerCase())
        .filter((d) => d.length > 0);

      browser.storage.local.get({ customWhitelist: [] }).then((result) => {
        const merged = Array.from(new Set([...result.customWhitelist, ...imported]));
        browser.storage.local.set({ customWhitelist: merged }).then(() => {
          loadCustomDomains();
          showIoStatus(browser.i18n.getMessage('optImportSuccess') || ('Imported ' + imported.length + ' domains'), false);
        });
      });
    } catch (error) {
      console.error(error);
      showIoStatus(browser.i18n.getMessage('optImportError') || 'Could not read file', true);
    } finally {
      importFileInput.value = '';
    }
  };
  reader.onerror = () => {
    showIoStatus(browser.i18n.getMessage('optImportError') || 'Could not read file', true);
    importFileInput.value = '';
  };
  reader.readAsText(file);
});

document.addEventListener('DOMContentLoaded', () => {
  localizePage();
  loadSettings();
  loadCustomDomains();
  const manifest = browser.runtime.getManifest();
  const versionEl = document.getElementById('ext-version');
  if (versionEl) versionEl.textContent = 'v' + manifest.version;
});