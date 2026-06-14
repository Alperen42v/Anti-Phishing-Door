let fileWhitelist = [];
let customWhitelist = [];
let whitelistSet = new Set();
let bypassedDomains = new Map();

const DEFAULT_SETTINGS = { theme: 'auto', bypassDuration: 5 };
let settings = { ...DEFAULT_SETTINGS };

function updateWhitelistSet() {
  whitelistSet = new Set(
    [...fileWhitelist, ...customWhitelist].map(d => d.trim().toLowerCase())
  );
}

function getBypassDurationMs() {
  const minutes = Number(settings.bypassDuration);
  if (minutes === -1) return Infinity;
  if (!minutes || minutes <= 0) return DEFAULT_SETTINGS.bypassDuration * 60 * 1000;
  return minutes * 60 * 1000;
}

async function loadSettings() {
  let result = await browser.storage.local.get({ settings: DEFAULT_SETTINGS });
  settings = { ...DEFAULT_SETTINGS, ...result.settings };
}

async function loadFileWhitelist() {
  try {
    let response = await fetch(browser.runtime.getURL("whitelist.txt"));
    let text = await response.text();
    fileWhitelist = text.split("\n")
                        .map(line => line.trim())
                        .filter(line => line.length > 0 && !line.startsWith("#"));
    updateWhitelistSet();
  } catch (error) {
    console.error(error);
  }
}

async function loadCustomWhitelist() {
  let result = await browser.storage.local.get({ customWhitelist: [] });
  customWhitelist = result.customWhitelist || [];
  updateWhitelistSet();
}

let listsLoadedPromise = Promise.all([loadFileWhitelist(), loadCustomWhitelist(), loadSettings()]);

browser.storage.onChanged.addListener((changes) => {
  if (changes.customWhitelist) {
    customWhitelist = changes.customWhitelist.newValue || [];
    updateWhitelistSet();
  }
  if (changes.settings) {
    settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id) return;
  if (message.action === "bypass" && message.domain) {
    let domain = String(message.domain).toLowerCase();
    bypassedDomains.set(domain, Date.now() + getBypassDurationMs());
  }
});

browser.webRequest.onBeforeRequest.addListener(
  async function(details) {
    if (details.type !== "main_frame") return;

    let url;
    try {
      url = new URL(details.url);
    } catch (e) {
      return;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") return;

    await listsLoadedPromise;

    let domain = url.hostname.toLowerCase().replace(/^www\./, "");
    let bypassExpiry = bypassedDomains.get(domain);
    if (bypassExpiry !== undefined) {
      if (Date.now() < bypassExpiry) {
        return;
      }
      bypassedDomains.delete(domain);
    }

    let domainParts = domain.split(".");
    let isAllowed = false;
    let currentCheck = "";

    for (let i = domainParts.length - 1; i >= 0; i--) {
      currentCheck = currentCheck === "" ? domainParts[i] : domainParts[i] + "." + currentCheck;
      if (whitelistSet.has(currentCheck)) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      let blockUrl = browser.runtime.getURL(`block.html?target=${encodeURIComponent(details.url)}`);
      return { redirectUrl: blockUrl };
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);