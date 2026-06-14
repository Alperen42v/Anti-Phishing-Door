# Anti-Phishing-Door

🛡️ **A ultra-fast, Zero-Trust, Whitelist-based anti-phishing shield for Firefox.**

Anti-Phishing-Door takes a radical approach to web security. Instead of relying on bloated, outdated, and privacy-invasive blacklists that look for known malicious sites, this extension operates on a strict **Zero-Trust Whitelist** model. If a domain isn't explicitly trusted by you or the system, the door stays shut until you verify it.

Built with performance and hardened security in mind, it introduces zero overhead to your browsing experience.

---

## ⚡ Features

- **O(1) Search Complexity:** Uses highly optimized Hash Map (`Set`) structures instead of heavy array loops. Performance remains blistering fast whether you have 10 or 100,000 domains.
- **Reverse Subdomain Parsing:** Smart matching algorithm that automatically decomposes and checks top-level and subdomains securely without scanning the entire database.
- **Bulletproof Security Matrix:** - Strict Protocol Verification (prevents Open Redirect and DOM-based XSS vectors).
  - Internal Extension Message Spoofing protection.
  - Hardened RegExp domain isolation to prevent typosquatting bypasses.
  - **Zero Telemetry / 100% Privacy:** No logging, no tracking, no external analytics APIs. Your data stays in your local browser storage.