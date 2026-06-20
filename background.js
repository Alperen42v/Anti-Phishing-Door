let fileWhitelist = [];
let customWhitelist = [];
let whitelistSet = new Set();
let bypassedDomains = new Map();

const DEFAULT_SETTINGS = { theme: 'auto', bypassDuration: 5 };
let settings = { ...DEFAULT_SETTINGS };

const LATIN_LOOKALIKES = new Set([
  '\u0430', '\u0435', '\u043e', '\u0440', '\u0441', '\u0443', '\u0445',
  '\u0410', '\u0415', '\u041e', '\u0420', '\u0421', '\u0423', '\u0425',
  '\u0456', '\u0406'
]);

let whitelistBuckets = new Map();

function updateWhitelistSet() {
  whitelistSet = new Set(
    [...fileWhitelist, ...customWhitelist].map(d => d.trim().toLowerCase())
  );
  whitelistBuckets = new Map();
  for (let entry of whitelistSet) {
    let firstChar = entry.charAt(0);
    if (!whitelistBuckets.has(firstChar)) {
      whitelistBuckets.set(firstChar, []);
    }
    whitelistBuckets.get(firstChar).push(entry);
  }
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

let lastBypassCleanup = 0;
const BYPASS_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function cleanupExpiredBypasses() {
  let now = Date.now();
  if (now - lastBypassCleanup < BYPASS_CLEANUP_INTERVAL_MS) return;
  lastBypassCleanup = now;
  for (let [domain, expiry] of bypassedDomains) {
    if (expiry !== Infinity && now >= expiry) {
      bypassedDomains.delete(domain);
    }
  }
}

function isPunycode(hostname) {
  return hostname.split(".").some(label => label.startsWith("xn--"));
}

const NON_LATIN_SCRIPT_REGEX = /[\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF]/;
const LATIN_REGEX = /[a-zA-Z]/;

function detectMixedScript(hostname) {
  return LATIN_REGEX.test(hostname) && NON_LATIN_SCRIPT_REGEX.test(hostname);
}

function hasLookalikeChars(hostname) {
  for (let ch of hostname) {
    if (LATIN_LOOKALIKES.has(ch)) return true;
  }
  return false;
}

function levenshteinDistance(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let prevRow = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prevRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let currRow = new Array(b.length + 1);
    currRow[0] = i;
    let rowMin = currRow[0];

    for (let j = 1; j <= b.length; j++) {
      if (a.charAt(i - 1) === b.charAt(j - 1)) {
        currRow[j] = prevRow[j - 1];
      } else {
        currRow[j] = Math.min(prevRow[j - 1] + 1, currRow[j - 1] + 1, prevRow[j] + 1);
      }
      if (currRow[j] < rowMin) rowMin = currRow[j];
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    prevRow = currRow;
  }

  return prevRow[b.length];
}

const MAX_SIMILARITY_DISTANCE = 2;

function findClosestWhitelistMatch(domain) {
  let bestMatch = null;
  let bestDistance = MAX_SIMILARITY_DISTANCE + 1;

  let firstChar = domain.charAt(0);
  let candidates = whitelistBuckets.get(firstChar);
  if (!candidates || candidates.length === 0) {
    return { domain: null, distance: Infinity };
  }

  for (let entry of candidates) {
    if (Math.abs(entry.length - domain.length) > MAX_SIMILARITY_DISTANCE) continue;
    let distance = levenshteinDistance(domain, entry, bestDistance - 1);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = entry;
      if (bestDistance === 0) break;
    }
  }

  return { domain: bestMatch, distance: bestDistance > MAX_SIMILARITY_DISTANCE ? Infinity : bestDistance };
}

function analyzeDomain(hostname) {
  let punycode = isPunycode(hostname);
  let mixedScript = detectMixedScript(hostname) || hasLookalikeChars(hostname);
  let closest = findClosestWhitelistMatch(hostname);
  let similarToWhitelist = closest.distance > 0 && closest.distance <= MAX_SIMILARITY_DISTANCE;

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

    cleanupExpiredBypasses();

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
      params.set("isHttps", url.protocol === "https:" ? "1" : "0");
      let page = analysis.highRisk ? "block-highrisk.html" : "block.html";
      let blockUrl = browser.runtime.getURL(`${page}?${params.toString()}`);
      return { redirectUrl: blockUrl };
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);