let fileWhitelist = [];
let customWhitelist = [];
let whitelistSet = new Set();
let bypassedDomains = new Set();

function updateWhitelistSet() {
  whitelistSet = new Set([...fileWhitelist, ...customWhitelist]);
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

let listsLoadedPromise = Promise.all([loadFileWhitelist(), loadCustomWhitelist()]);

browser.storage.onChanged.addListener((changes) => {
  if (changes.customWhitelist) {
    customWhitelist = changes.customWhitelist.newValue || [];
    updateWhitelistSet();
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id) return;
  if (message.action === "bypass" && message.domain) {
    bypassedDomains.add(message.domain);
  }
});

browser.webRequest.onBeforeRequest.addListener(
  async function(details) {
    if (details.type !== "main_frame") return;

    await listsLoadedPromise;

    let url = new URL(details.url);
    if (url.protocol === "moz-extension:") return;

    let domain = url.hostname.replace(/^www\./, "");

    if (bypassedDomains.has(domain)) return;

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