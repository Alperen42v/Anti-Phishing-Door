function getMsg(key, fallbackText) {
  let message = browser.i18n.getMessage(key);
  if (!message || message === "") return fallbackText;
  return message;
}

function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

document.getElementById("alertMsg").textContent = getMsg("alertMsg", "Not in whitelist — proceed?");
document.getElementById("urlBox").textContent = getMsg("urlBox", "You are trying to visit");
document.getElementById("rulesTitle").textContent = getMsg("rulesTitle", "Security check (3 golden rules)");
document.getElementById("rule1").textContent = getMsg("rule1", "Look for typosquatting or character tricks (e.g., g00gle.com)");
document.getElementById("rule2").textContent = getMsg("rule2", "Is this the exact page you expected?");
document.getElementById("rule3").textContent = getMsg("rule3", "Is there a valid SSL certificate (HTTPS)?");

document.querySelector("#go-back span").textContent = getMsg("btnBack", "Return to safe zone");
document.querySelector("#proceed span").textContent = getMsg("btnProceed", "Proceed anyway");

const urlParams = new URLSearchParams(window.location.search);
const targetUrl = urlParams.get("target");
const punycodeFlag = urlParams.get("punycode") === "1";
const mixedScriptFlag = urlParams.get("mixedScript") === "1";
const similarFlag = urlParams.get("similar") === "1";
const isHttpsFlag = urlParams.get("isHttps") === "1";

document.getElementById("target-url").textContent = targetUrl || getMsg("unknownUrl", "Unknown address");

const SVG_NS = "http://www.w3.org/2000/svg";

function buildCheckSvg(passed) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");

  if (passed) {
    const polyline = document.createElementNS(SVG_NS, "polyline");
    polyline.setAttribute("points", "20 6 9 17 4 12");
    svg.appendChild(polyline);
  } else {
    const line1 = document.createElementNS(SVG_NS, "line");
    line1.setAttribute("x1", "18");
    line1.setAttribute("y1", "6");
    line1.setAttribute("x2", "6");
    line1.setAttribute("y2", "18");
    const line2 = document.createElementNS(SVG_NS, "line");
    line2.setAttribute("x1", "6");
    line2.setAttribute("y1", "6");
    line2.setAttribute("x2", "18");
    line2.setAttribute("y2", "18");
    svg.appendChild(line1);
    svg.appendChild(line2);
  }

  return svg;
}

function renderRuleCheck(elementId, passed) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.classList.add(passed ? "pass" : "fail");
  el.appendChild(buildCheckSvg(passed));
}

renderRuleCheck("rule1-check", !punycodeFlag && !mixedScriptFlag && !similarFlag);
renderRuleCheck("rule3-check", isHttpsFlag);

document.getElementById("go-back").addEventListener("click", () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    browser.tabs.getCurrent().then((tab) => {
      if (tab && tab.id !== undefined) {
        browser.tabs.remove(tab.id);
      } else {
        window.close();
      }
    }).catch(() => {
      window.close();
    });
  }
});

document.getElementById("proceed").addEventListener("click", () => {
  if (!targetUrl) return;
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
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const result = await browser.storage.local.get({ settings: { theme: "auto" } });
    applyTheme(result.settings.theme);
  } catch (error) {
    console.error(error);
  }
});