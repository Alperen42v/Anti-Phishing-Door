function getMsg(key, fallbackText) {
  let message = browser.i18n.getMessage(key);
  if (!message || message === "") {
    return fallbackText;
  }
  return message;
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

document.getElementById('alertMsg').textContent = getMsg("alertMsg", "⚠️ NOT IN WHITELIST! PROCEED?");
document.getElementById('urlBox').textContent = getMsg("urlBox", "You are trying to visit:");
document.getElementById('rulesTitle').textContent = getMsg("rulesTitle", "Security Check (3 Golden Rules):");
document.getElementById('rule1').textContent = getMsg("rule1", "1. Look for typosquatting or character tricks (e.g., g00gle.com )");
document.getElementById('rule2').textContent = getMsg("rule2", "2. Is this the exact page you expected?");
document.getElementById('rule3').textContent = getMsg("rule3", "3. Is there a valid SSL certificate (HTTPS)?");
document.getElementById('go-back').textContent = getMsg("btnBack", "Return to Safe Zone");
document.getElementById('proceed').textContent = getMsg("btnProceed", "Proceed Anyway (Accept Risk)");

const urlParams = new URLSearchParams(window.location.search);
const targetUrl = urlParams.get('target');

if (targetUrl) {
  document.getElementById('target-url').textContent = targetUrl;
} else {
  document.getElementById('target-url').textContent = getMsg("unknownUrl", "Unknown Address");
}

document.getElementById('go-back').addEventListener('click', () => {
  window.history.back();
});

document.getElementById('proceed').addEventListener('click', () => {
  if (targetUrl) {
    try {
      let url = new URL(targetUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      let domain = url.hostname.toLowerCase().replace(/^www\./, "");
      browser.runtime.sendMessage({ action: "bypass", domain: domain }).then(() => {
        window.location.href = url.href;
      });
    } catch (e) {
      console.error(e);
    }
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const result = await browser.storage.local.get({ settings: { theme: 'auto' } });
    applyTheme(result.settings.theme);
  } catch (error) {
    console.error(error);
  }
});