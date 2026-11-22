# Security Plan

This plan follows US national (NIST/CISA) guidance, using OWASP's checklists for web-specific details:

| Framework | What we use it for |
|---|---|
| **NIST Cybersecurity Framework (CSF) 2.0** | Overall structure: Govern, Identify, Protect, Detect, Respond, Recover |
| **NIST SP 800-218: Secure Software Development Framework (SSDF)** | How we build: secure defaults, reviews, dependency hygiene, fixing vulnerabilities |
| **CISA Secure by Design** | Secure by default, no "security settings" the user has to turn on |
| **NIST-approved cryptography** (FIPS 197 AES, SP 800-38D GCM, SP 800-132 PBKDF2) | Encrypted backups |
| **OWASP ASVS + Top 10** (industry checklist) | Concrete web checks: XSS, CSP, input validation |

> Review this file every few sprints. Standards get updated, so check for newer versions during the security review.

---

## 1. Govern: scope and threat model

**What we protect:** the user's card balances, interest rates, credit limits, income, fixed expenses, and backup files. The app never asks for card or account numbers.

**What we don't have (by design):** no server, no accounts, no passwords to steal, no analytics. That removes most of the attack surface.

| Threat | Example | Main control |
|---|---|---|
| Cross-site scripting (XSS) | A malicious card or expense name like `<img onerror=…>` | `textContent` only + strict CSP + Trusted Types |
| Malicious file | A huge or malformed backup file crashes the app or injects data | Size/record limits + schema validation |
| Supply chain | A compromised CDN or npm package | **Zero runtime third-party code**. Dev tools pinned + audited |
| Leaked backup file | A backup emailed or left in Downloads | **Encrypted by default** (AES-256-GCM) |
| Lost or shared device | Someone opens the app on your phone | Device lock (OS). Optional app lock later |
| Over-collection | Storing card numbers or bank logins | Never asked for: only a nickname, rate, minimum, limit, and balance |
| Stale or poisoned cache | An old service worker serving bad code | Versioned SW, same-origin only, update flow |
| Secrets in repo | An API key committed by accident | No secrets in the client + GitHub secret scanning |

---

## 2. Protect: controls

### 2.1 Content Security Policy (in `index.html`)
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self';
  worker-src 'self';
  manifest-src 'self';
  object-src 'none';
  base-uri 'none';
  form-action 'none';
  require-trusted-types-for 'script';
  trusted-types bm-sw;
  upgrade-insecure-requests">
```
- No inline scripts or styles, no `eval`, no third-party origins.
- Trusted Types: the only allowed policy is `bm-sw` (`js/services/pwa.js`), which permits exactly one script URL, `./sw.js`, to register the offline worker.
- GitHub Pages can't send headers like `frame-ancestors`, `X-Content-Type-Options`, or `Referrer-Policy`. Add `<meta name="referrer" content="no-referrer">`. **If we need real headers, move to Cloudflare Pages or Netlify**, which use a `_headers` file.

### 2.2 Safe rendering
- Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, or `eval`.
- All DOM is built through `utils/dom.js` helpers (`el('div', {class}, text)`) using `textContent`.
- A lint rule or grep check in the Definition of Done blocks these APIs.

### 2.3 Input validation (`validate.js`)
| Input | Rules |
|---|---|
| Amount | Positive, ≤ $1,000,000, at most 2 decimals, converted to integer cents |
| Amount or zero | Card balance and minimum payment may be $0 (paid off / nothing due) |
| Interest rate (APR) | 0–99.99%, parsed as text into basis points (no floating point) |
| Date (check-in) | Valid ISO date, 2000-01-01 to today (no future check-ins) |
| Names | Trimmed, ≤ 40 chars, control and text-direction characters stripped |
| Pay frequency | One of weekly, biweekly, semimonthly, monthly |
| Due day | Optional, whole number 1–31 |
| Check-in balances | Every current card needs one; ids of unknown cards are ignored |
| Backup import | Valid format version, decrypts OK, **every record passes the schema** or the import is rejected (no partial corruption) |

### 2.4 Encryption for backups (NIST-approved algorithms via Web Crypto)
| Item | Choice |
|---|---|
| Cipher | **AES-256-GCM** (FIPS 197 / SP 800-38D) |
| Key derivation | **PBKDF2-HMAC-SHA-256** (SP 800-132), **600,000 iterations** (OWASP current recommendation) |
| Salt | 16 random bytes per backup (`crypto.getRandomValues`) |
| IV | 12 random bytes per encryption, never reused |
| File format | `{ format: "bm-backup", v: 1, kdf: { name, hash, iterations, salt }, cipher: { name, iv }, ciphertext }`. The header is bound as AES-GCM additional data, so any edit (e.g. a lower iteration count) fails to open. Iterations accepted: 600k–10M. |
| Passphrase | Min 12 characters (passphrases encouraged), checked against a small list of common passwords. **Warning: a forgotten passphrase means the backup can't be recovered.** |

- **Restore** (built in E2-S3): ≤ 10 MB file → JSON → decrypt → **every record re-validated and rebuilt from known fields** → preview → one all-or-nothing database transaction → Undo. A single bad record rejects the whole backup.
- Passphrases are NFC-normalized (same passphrase on any device), min 12 characters, common choices refused.
- Backups from the earlier, bigger version (schema 1–7) are validated the same way; only debts, active bills and take-home pay are carried over.
- **On-device data** is protected by the OS (device lock, disk encryption). An optional app-level lock can be evaluated later. It's deferred because it adds data-loss risk if the user forgets the PIN.

### 2.5 Data minimization
- Only what the plan needs: card nickname, APR, minimum, optional limit, and balances by date; income amount and frequency; expense name, amount and optional due day.
- No card numbers, account numbers, bank logins, or statements.
- Data left from the earlier version (spending entries, categories) is never shown, and "Delete everything" removes it too.

### 2.6 Privacy
- No analytics, trackers, ads, or external fonts/CDNs.
- No network calls at all except loading the app itself.
- "Delete all data" in Settings wipes IndexedDB, caches, and localStorage.

### 2.7 Service worker (built in E2-S5)
- Caches only same-origin app files, from a generated list (`npm run precache`). CI fails if the list is stale.
- Never handles other origins or non-GET requests, and never caches user data (IndexedDB holds that).
- Versioned cache (content hash). Old caches are deleted on activate. Install bypasses the HTTP cache so versions never mix.
- Updates wait: "New version ready · Update". The app never swaps code mid-session.
- Registered through the `bm-sw` Trusted Types policy, which allows only `./sw.js`.

---

## 3. Secure development (NIST SSDF)

| SSDF practice | How we do it |
|---|---|
| **PO: Prepare the organization** | This doc + security items in the Definition of Done (BACKLOG.md) |
| **PS: Protect the software** | GitHub: branch protection on `main`, PRs required, **secret scanning + push protection on**, Dependabot alerts on, 2FA on the account |
| **PW: Produce well-secured software** | Threat model above; code review (`/code-review` + `/security-review` before each merge); unit tests for `validate.js`, `crypto.js`, and parsers; no third-party runtime deps |
| **RV: Respond to vulnerabilities** | `SECURITY.md` at repo root with how to report; fix, then add a regression test, then release |

Dev-only tools (test runner, linter), if added, are pinned with a lockfile and run through `npm audit`. They never ship to users.

---

## 4. Detect, respond, recover

- **Detect:** backup import validation and an IndexedDB integrity check on startup (schema version + record shape). Errors show plain-language messages, never stack traces.
- **Respond:** if a bad release ships, bump the SW version so clients update. A rollback is a `git revert` and redeploy.
- **Recover:** encrypted backups with a reminder if the last one is older than 14 days. Restore is tested every release (see the "no reset" checklist in BACKLOG.md).

---

## 5. Security checklist (part of the Definition of Done)

- [ ] No `innerHTML`/`eval`/inline scripts added (grep check passes)
- [ ] CSP unchanged, or changes reviewed
- [ ] New inputs go through `validate.js`, with tests
- [ ] No secrets, keys, or personal data in code or commits
- [ ] No new third-party runtime code
- [ ] `/security-review` run on the change, with findings fixed or ticketed
- [ ] Data stays on the device (no new network calls)
- [ ] `npm run e2e` passes, with 0 console errors or CSP violations (runs in CI)
