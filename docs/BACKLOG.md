# Agile Plan & Backlog

## How we work (Scrum-lite for a small team)

| Practice | How |
|---|---|
| **Sprint length** | 1 week |
| **Sprint planning** | Start of sprint: pick stories from the top of the backlog that fit the week |
| **Daily check-in** | Quick note at the start of each work session: what's done, what's next, what's blocked |
| **Sprint review / demo** | End of sprint: use the app on a real phone and laptop and show what works |
| **Retro** | End of sprint, 3 questions: what went well, what didn't, what we'll change |
| **Board** | GitHub Projects (once the repo is on GitHub): `Backlog → Ready → In Progress → Review → Done` |
| **Stories** | "As a [user], I want [thing] so that [benefit]", with acceptance criteria |
| **Sizing** | T-shirt sizes: S (≤ half day), M (1–2 days), L (3+ days, split it) |
| **Plan changes** | Expected and welcome. Re-prioritize the backlog at every sprint planning |

### Definition of Ready (before a story starts)
- [ ] Clear user story + acceptance criteria
- [ ] Size S or M (L gets split)
- [ ] Any design or security questions answered

### Definition of Done (before a story is "Done")
- [ ] Acceptance criteria met
- [ ] Works on phone (Safari + Chrome) and desktop
- [ ] Works offline (after Sprint 2)
- [ ] Data survives refresh + browser restart
- [ ] Accessible: keyboard, screen-reader labels, 48px targets, AA contrast, works at "Extra Large" text
- [ ] **Security checklist passed** (SECURITY.md §5)
- [ ] Unit tests for logic (validation, insights, crypto, parsers)
- [ ] Code reviewed and merged via PR

---

## Epics

| ID | Epic | Goal |
|---|---|---|
| E0 | Foundation | Repo, structure, design tokens, security baseline |
| E1 | Track money | Add, edit, delete, and view income & expenses |
| E2 | Never lose data | Persistence, encrypted backups, installable PWA, offline |
| E3 | Home dashboard | See the month at a glance |
| E4 | Smart Coach L1 | Industry benchmarks & 50/30/20 |
| E5 | Smart Coach L2 | Personal patterns |
| E6 | Smart Coach L3 | Learns from feedback, tracks progress |
| E7 | Bank statement import | CSV → review → categorize |
| E8 | AI coach (optional) | Opt-in LLM coach, after a security review |

---

## Backlog (top = highest priority)

### E0: Foundation
- **E0-S1** As a developer, I want the folder structure, `index.html` shell, and a local server so we can build quickly. *(S)*
  - ✅ Done: `index.html` shell with CSP, bottom tab bar, hash router, safe DOM helper (`utils/dom.js`), router tests, `npm start/test/check`.
- **E0-S2** As a user of any age, I want a clear, readable design so the app is easy to use. *(M)*
  - AC: `tokens.css` with color, type scale (18px base), and spacing tokens; light/dark; AA contrast checked; bottom tab bar mockup. Use the design skills.
- **E0-S3** As a user, I want the app locked down from day one so my data is safe. *(S)*
  - AC: CSP meta, referrer meta, `utils/dom.js` safe helpers, grep check for banned APIs, root `SECURITY.md`.
- **E0-S4** As a developer, I want the repo on GitHub with Pages, branch protection, secret scanning, and Dependabot. *(S)*
  - ✅ Done: repo, `main` ruleset, CI (`checks`, `dependency-review`), secret scanning + push protection, Dependabot, PR/issue templates, CONTRIBUTING.md.
  - ⏳ Remaining: GitHub Pages (needs `index.html`), plus **CodeQL** code scanning (enable once JS files exist, then add it as a required check).

### E1: Track money
- **E1-S1** As a user, I want my data saved in a database so it's still there tomorrow. *(M)*: IndexedDB adapter, repository, store, schema v1, migrations scaffold.
- **E1-S2** As a user, I want default categories set up for me so I can start right away. *(S)*
- **E1-S3** As a user, I want to add an expense in under 5 seconds. *(M)*
  - AC: keypad opens first; category buttons; date defaults to today; validation errors in plain words.
- **E1-S4** As a user, I want to record income so the app knows what I earn. *(S)*
- **E1-S5** As a user, I want to see, search, edit, and delete past transactions, with undo. *(M)*
- **E1-S6** As a user, I want to rename, add, or archive categories. *(S)*

### E2: Never lose data
- **E2-S1** As a user, I want the browser to keep my data permanently, and to see that it's protected. *(S)*: `storage.persist()` + status.
- **E2-S2** As a user, I want an encrypted backup file I can save anywhere. *(M)*: AES-256-GCM + PBKDF2, passphrase rules, tests.
- **E2-S3** As a user, I want to restore from a backup safely. *(M)*: full validation, all-or-nothing, preview counts before restoring.
- **E2-S4** As a user, I want a reminder when my last backup is old. *(S)*
- **E2-S5** As a user, I want to install the app and use it offline. *(M)*: manifest, icons, versioned SW, update prompt.
- **E2-S6** As a user, I want to delete all my data if I choose. *(S)*

### E3: Home dashboard
- **E3-S1** As a user, I want to see money in, money out, and what's left this month. *(S)*
- **E3-S2** As a user, I want to switch to past months. *(S)*
- **E3-S3** As a user, I want a simple chart of spending by category. *(M)*: use the dataviz skill.

### E4: Smart Coach L1 (benchmarks)
- **E4-S1** As a user, I want benchmarks based on real, current sources so the advice is trustworthy. *(M)*
  - AC: verify every number in INSIGHTS.md against current BLS CE, HUD, and CFPB publications; store `source` + `asOf`.
- **E4-S2** As a user, I want to enter my take-home pay (or have it estimated) so comparisons are accurate. *(S)*
- **E4-S3** As a user, I want to see my Needs / Wants / Savings split against 50/30/20. *(M)*
- **E4-S4** As a user, I want tips on which categories are above the guideline and how much I'd save. *(M)*
- **E4-S5** As a user, I want "Why am I seeing this?" on every tip. *(S)*

### E5: Smart Coach L2 (patterns)
- **E5-S1** Pace projection *(S)*
- **E5-S2** "Your usual" baselines (median) and higher-than-usual tips *(M)*
- **E5-S3** Unusual spike detection *(S)*
- **E5-S4** Small purchases add up *(S)*
- **E5-S5** Repeating charges / subscriptions finder *(M)*
- **E5-S6** Best-month savings target *(S)*

### E6: Smart Coach L3 (learning)
- **E6-S1** As a user, I want to tell the app 👍 / 👎 / "I'm on it" so it shows me more useful tips. *(M)*
- **E6-S2** As a user, I want tips ranked by how much money they'd save me. *(S)*
- **E6-S3** As a user, I want to see if I actually saved money after acting on a tip. *(M)*

### E7: Bank statement import
- **E7-S1** Upload + validate + parse CSV (limits, errors per row) *(M)*
- **E7-S2** Common bank column layouts + manual column matching *(M)*
- **E7-S3** Mask account numbers, clean merchant names *(S)*
- **E7-S4** Duplicate detection *(S)*
- **E7-S5** Review screen: add / skip / undo / finish later *(L, split into review UI + queue persistence)*
- **E7-S6** Merchant rules + suggestions (highlighted, never pre-selected) *(M)*

### E8: AI coach (optional, later)
- **E8-S0** Security review + design of the proxy and data-sharing *(M)*. **Blocks the rest of E8.**
- **E8-S1** Opt-in screen explaining exactly what's sent *(S)*
- **E8-S2** Chat coach using summary data only *(L)*

---

## Tentative sprint plan (we'll adjust as we go)

| Sprint | Focus | Stories | Demo goal |
|---|---|---|---|
| **0** | Foundation | E0-S1 → S4 | Empty but secure, styled shell live on GitHub Pages |
| **1** | Track money | E1-S1 → S5 | Add expenses & income, close the browser, they're still there |
| **2** | Never lose data | E2-S1 → S6, E1-S6 | Installed on phone, works offline, encrypted backup restores |
| **3** | Home + benchmarks | E3-S1, S2, E4-S1 → S3 | See the 50/30/20 split for real data |
| **4** | Coach tips | E4-S4, S5, E3-S3, E5-S1 | Home shows top tips with "why" |
| **5** | Patterns | E5-S2 → S6 | Personalized tips after a month of data |
| **6** | Learning | E6-S1 → S3 | Feedback changes which tips show |
| **7–8** | Bank import | E7-S1 → S6 | Import a real statement, categorize it, no duplicates |
| **Later** | AI coach | E8 | Only after a security review |

---

## "No reset" release checklist (every sprint from Sprint 2 on)
- [ ] Refresh → data still there
- [ ] Quit & reopen browser → still there
- [ ] Restart device → still there
- [ ] Deploy new version → still there (migrations OK)
- [ ] Clear site data → restore encrypted backup → everything back
- [ ] Airplane mode → app works
