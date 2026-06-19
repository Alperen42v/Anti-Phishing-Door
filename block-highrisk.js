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

function buildCheckItem(passed, title, description) {
  let item = document.createElement("div");
  item.className = "check-item";

  let icon = document.createElement("div");
  icon.className = "check-icon " + (passed ? "pass" : "fail");
  icon.appendChild(buildCheckSvg(passed));

  let text = document.createElement("div");
  text.className = "check-text";
  let strong = document.createElement("strong");
  strong.textContent = title;
  let span = document.createElement("span");
  span.textContent = description;
  text.appendChild(strong);
  text.appendChild(span);

  item.appendChild(icon);
  item.appendChild(text);
  return item;
}

document.getElementById("alertMsg").textContent = getMsg("alertMsgHighRisk", "Likely phishing attempt");
document.getElementById("urlBox").textContent = getMsg("urlBox", "You are trying to visit");
document.getElementById("backText").textContent = getMsg("btnBack", "Return to safe zone");
document.getElementById("proceedText").textContent = getMsg("btnProceedSmall", "accept risk & proceed");

const urlParams = new URLSearchParams(window.location.search);
const targetUrl = urlParams.get("target");
const punycodeFlag = urlParams.get("punycode") === "1";
const mixedScriptFlag = urlParams.get("mixedScript") === "1";
const similarFlag = urlParams.get("similar") === "1";
const similarTo = urlParams.get("similarTo");

document.getElementById("target-url").textContent = targetUrl || getMsg("unknownUrl", "Unknown address");

const checksBlock = document.getElementById("checks-block");

checksBlock.appendChild(buildCheckItem(
  !punycodeFlag,
  getMsg("checkPunycodeTitle", "Punycode check"),
  punycodeFlag
    ? getMsg("checkPunycodeFail", "Disguised character encoding detected")
    : getMsg("checkPunycodePass", "No disguised characters detected")
));

checksBlock.appendChild(buildCheckItem(
  !mixedScriptFlag,
  getMsg("checkScriptTitle", "Script consistency"),
  mixedScriptFlag
    ? getMsg("checkScriptFail", "Mixed alphabets detected in domain")
    : getMsg("checkScriptPass", "Single character set used")
));

let similarDesc;
if (similarFlag && similarTo) {
  similarDesc = getMsg("checkSimilarFailWithDomain", "Nearly identical to") + " " + similarTo;
} else if (similarFlag) {
  similarDesc = getMsg("checkSimilarFail", "Nearly identical to a trusted domain");
} else {
  similarDesc = getMsg("checkSimilarPass", "No close match found");
}

checksBlock.appendChild(buildCheckItem(
  !similarFlag,
  getMsg("checkSimilarTitle", "Whitelist similarity"),
  similarDesc
));

document.getElementById("go-back").addEventListener("click", () => {
  window.history.back();
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