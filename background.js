let fileWhitelist = [];
let customWhitelist = [];
let whitelistSet = new Set();
let bypassedDomains = new Map();

const DEFAULT_SETTINGS = { theme: 'auto', bypassDuration: 5 };
let settings = { ...DEFAULT_SETTINGS };

const SCRIPT_RANGES = [
  { name: 'cyrillic', regex: /[\u0400-\u04FF]/ },
  { name: 'greek', regex: /[\u0370-\u03FF]/ },
  { name: 'armenian', regex: /[\u0530-\u058F]/ },
  { name: 'hebrew', regex: /[\u0590-\u05FF]/ },
  { name: 'arabic', regex: /[\u0600-\u06FF]/ }
];

const LATIN_LOOKALIKES = new Set([
  '\u0430', '\u0435', '\u043e', '\u0440', '\u0441', '\u0443', '\u0445',
  '\u0410', '\u0415', '\u041e', '\u0420', '\u0421', '\u0423', '\u0425',
  '\u0456', '\u0406'
]);

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

function isPunycode(hostname) {
  return hostname.split(".").some(label => label.startsWith("xn--"));
}

function detectMixedScript(hostname) {
  let foundScripts = new Set();
  if (/[a-zA-Z]/.test(hostname)) foundScripts.add('latin');
  for (let script of SCRIPT_RANGES) {
    if (script.regex.test(hostname)) foundScripts.add(script.name);
  }
  return foundScripts.size > 1;
}

function hasLookalikeChars(hostname) {
  for (let ch of hostname) {
    if (LATIN_LOOKALIKES.has(ch)) return true;
  }
  return false;
}

function levenshteinDistance(a, b) {
  let matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function findClosestWhitelistMatch(domain) {
  let bestMatch = null;
  let bestDistance = Infinity;
  for (let entry of whitelistSet) {
    if (Math.abs(entry.length - domain.length) > 3) continue;
    let distance = levenshteinDistance(domain, entry);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = entry;
    }
  }
  return { domain: bestMatch, distance: bestDistance };
}

function analyzeDomain(hostname) {
  let punycode = isPunycode(hostname);
  let mixedScript = detectMixedScript(hostname) || hasLookalikeChars(hostname);
  let closest = findClosestWhitelistMatch(hostname);
  let similarToWhitelist = closest.distance > 0 && closest.distance <= 2;

  let riskFlags = {
    punycode,
    mixedScript,
    similarToWhitelist,
    similarDomain: similarToWhitelist ? closest.domain : null
  };

  let highRisk = punycode || mixedScript || similarToWhitelist;

  return { highRisk, riskFlags };
}

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
      let analysis = analyzeDomain(domain);
      let params = new URLSearchParams();
      params.set("target", details.url);
      params.set("punycode", analysis.riskFlags.punycode ? "1" : "0");
      params.set("mixedScript", analysis.riskFlags.mixedScript ? "1" : "0");
      params.set("similar", analysis.riskFlags.similarToWhitelist ? "1" : "0");
      if (analysis.riskFlags.similarDomain) {
        params.set("similarTo", analysis.riskFlags.similarDomain);
      }
      let page = analysis.highRisk ? "block-highrisk.html" : "block.html";
      let blockUrl = browser.runtime.getURL(`${page}?${params.toString()}`);
      return { redirectUrl: blockUrl };
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);