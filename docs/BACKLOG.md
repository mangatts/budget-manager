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
| E9 | Safe to Spend + bills | One daily number; recurring bills |
| E10 | Cut Plan | Monthly 1–2 challenges with progress & wins |
| E11 | Next Best Step + Money Checkup | Advisor-style "what to do next" and a 0–100 checkup |
| E12 | What-If | See how small changes affect goals & debt |
| E8 | AI coach (optional) | Opt-in LLM coach, after a security review |

See [PRODUCT.md](PRODUCT.md) for why these make us different.

---

## Backlog (top = highest priority)

### E0: Foundation
- **E0-S1** As a developer, I want the folder structure, `index.html` shell, and a local server so we can build quickly. *(S)*
  - ✅ Done: `index.html` shell with CSP, bottom tab bar, hash router, safe DOM helper (`utils/dom.js`), router tests, `npm start/test/check`.
- **E0-S2** As a user of any age, I want a clear, readable design so the app is easy to use. *(M)*
  - AC: `tokens.css` with color, type scale (18px base), and spacing tokens; light/dark; AA contrast checked; bottom tab bar mockup. Use the design skills.
  - ✅ Done: tokens + Atkinson Hyperlegible fonts, light/dark, More → Display (text size + theme, no flash), base components, `#/design` reference; contrast/token/preferences tests.
- **E0-S3** As a user, I want the app locked down from day one so my data is safe. *(S)*
  - AC: CSP meta, referrer meta, `utils/dom.js` safe helpers, grep check for banned APIs, root `SECURITY.md`.
  - ✅ Done: all of the above, plus `el()` unit tests (fake DOM) and **browser checks in CI** (38 checks: routing, keyboard, text sizes, themes, private mode, 0 CSP violations).
- **E0-S4** As a developer, I want the repo on GitHub with Pages, branch protection, secret scanning, and Dependabot. *(S)*
  - ✅ Done: repo, `main` ruleset, CI (`checks`, `dependency-review`), secret scanning + push protection, Dependabot, PR/issue templates, CONTRIBUTING.md.
  - ✅ Done: GitHub Pages (https://mangatts.github.io/budget-manager/) and CodeQL code scanning (required on `main`).

### E1: Track money
- **E1-S1** As a user, I want my data saved in a database so it's still there tomorrow. *(M)*: IndexedDB adapter, repository, store, schema v1, migrations scaffold.
  - ✅ Done: `js/db/` (IndexedDB + memory adapters, repository), `js/store.js` (validated add/update/delete with undo), `validate.js`, local-date utils; verified across a full browser restart.
- **E1-S2** As a user, I want default categories set up for me so I can start right away. *(S)*
  - ✅ Done: 21 defaults (16 money out with needs/wants/savings bucket, 5 money in), seeded once.
- **E1-S3** As a user, I want to add an expense in under 5 seconds. *(M)*
  - AC: keypad opens first; category buttons; date defaults to today; validation errors in plain words.
  - ✅ Done: Amount focused on open, most-used categories first, 3-tap fast path, Undo toast, keyboard-only flow.
- **E1-S4** As a user, I want to record income so the app knows what I earn. *(S)*
  - ✅ Done: Money in/out toggle switches categories; stays selected for the next entry.
- **E1-S5** As a user, I want to see, search, edit, and delete past transactions, with undo. *(M)*
  - ✅ Done: month switcher + totals, search (note/category, accent-insensitive), grouped by day, tap to edit, delete and edit both undoable, safe `#/edit/<id>` links.
- **E1-S6** As a user, I want to rename, add, or archive categories. *(S)*
  - ✅ Done: rename, add (icon + Need/Want/Savings), hide/show, delete if unused; all undoable.

### E2: Never lose data
- **E2-S1** As a user, I want the browser to keep my data permanently, and to see that it's protected. *(S)*: `storage.persist()` + status.
  - ✅ Done: requested after the first entry and on install; More → Your data shows Protected / Not protected yet + usage.
- **E2-S2** As a user, I want an encrypted backup file I can save anywhere. *(M)*: AES-256-GCM + PBKDF2, passphrase rules, tests.
  - ✅ Done: share sheet on phones, download elsewhere; tamper-evident header.
- **E2-S3** As a user, I want to restore from a backup safely. *(M)*: full validation, all-or-nothing, preview counts before restoring.
  - ✅ Done: tested end to end on a fresh browser profile ("new phone"), with Undo.
- **E2-S4** As a user, I want a reminder when my last backup is old. *(S)*
  - ✅ Done: Home + More after 14 days (or never), "Not now" hides it for a week.
- **E2-S5** As a user, I want to install the app and use it offline. *(M)*: manifest, icons, versioned SW, update prompt.
  - ✅ Done: installable (Android prompt, iPhone steps), works with the server off, safe update flow; tested end to end.
- **E2-S6** As a user, I want to delete all my data if I choose. *(S)*
  - ✅ Done: offers a backup first, type DELETE to confirm, fresh start; app still works offline.

### E3: Home dashboard
- **E3-S1** As a user, I want to see money in, money out, and what's left this month. *(S)*
  - ✅ Done: Home shows in/out/left (Left as the bottom line), recent 5, "See all" to History; updates live.
- **E3-S2** As a user, I want to switch to past months. *(S)*
  - ✅ Done: ‹ › on Home.
- **E3-S3** As a user, I want a simple chart of spending by category. *(M)*: use the dataviz skill.
  - ✅ Done: "Where your money went" on Tips: single-hue bars to scale, top 6 + Everything else, values as text, focus/hover readout, table view.

### E4: Smart Coach L1 (benchmarks)
- **E4-S1** As a user, I want benchmarks based on real, current sources so the advice is trustworthy. *(M)*
  - AC: verify every number in INSIGHTS.md against current BLS CE, HUD, and CFPB publications; store `source` + `asOf`.
  - ✅ Done: BLS CE 2024 (Dec 2025), HUD, CFPB verified. Fixed method: BLS shares compare to spending, not income.
- **E4-S2** As a user, I want to enter my take-home pay (or have it estimated) so comparisons are accurate. *(S)*
  - ✅ Done: More → Your money (take-home + savings %, default 20%); otherwise the median of the last 3 months of money in.
- **E4-S3** As a user, I want to see my Needs / Wants / Savings split against 50/30/20. *(M)*
  - ✅ Done: meters on Home (dataviz skill: same-hue tracks, guideline markers, status = color + ⚠ + words, focus/hover readout, table view); shown after 5 entries + income.
- **E4-S4** As a user, I want tips on which categories are above the guideline and how much I'd save. *(M)*
  - ✅ Done: Tips tab + top 2 on Home; spending-mix vs BLS (share of spending), housing vs HUD 30%; Shopping deliberately not compared (too broad).
- **E4-S5** As a user, I want "Why am I seeing this?" on every tip. *(S)*
  - ✅ Done: every tip lists its math, method note, and source.

### E5: Smart Coach L2 (patterns)
- **E5-S1** Pace projection *(S)*
  - ✅ Done: "running ahead of your usual" (median of last 3 months; skips bills, housing, savings, first week).
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

### E9: Safe to Spend + bills
- **E9-S1** As a user, I want to list my recurring bills (rent, phone, subscriptions) so the app knows what's coming. *(M)*
  - ✅ Done: More → Bills (add/edit/pause/delete, Undo), auto "paid" detection; database migration v2.
- **E9-S2** As a user, I want a "Safe to spend today" number on Home so I know what I can spend without a budget. *(M)*
  - AC: formula in PRODUCT.md §2 ②; updates instantly on every entry; "Why?" shows the math; handles no-income and overspent cases kindly.
  - ✅ Done: hero number on Home, rounded down; "Why?" lists every step.
- **E9-S3** As a user, I want a heads-up before a bill is due. *(S)*
  - ✅ Done: "Bills coming up" on Home (next 7 days + overdue). Push notifications later.

### E10: Cut Plan
- **E10-S1** As a user, I want 1–2 suggested challenges each month based on my spending. *(M)*
- **E10-S2** As a user, I want to accept or skip a challenge and see my progress on Home. *(M)*
- **E10-S3** As a user, I want a month-end result that celebrates wins. *(S)*

### E11: Next Best Step + Money Checkup
- **E11-S1** As a user, I want to (optionally) enter my savings, debts, and goals so advice fits me. *(M)*
- **E11-S2** As a user, I want to see which money step I'm on and one clear next action. *(L, split by step)*
- **E11-S3** As a user, I want a monthly Money Checkup score with 🟢🟡🔴 explanations. *(M)*

### E12: What-If
- **E12-S1** As a user, I want to see how cutting a category changes when I reach a goal. *(M)*
- **E12-S2** As a user, I want a debt payoff plan showing interest saved by paying extra. *(M)*
- **E12-S3** As a user, I want to see long-term growth of saving/investing, with clear assumptions. *(S)*

### E8: AI coach (optional, later)
- **E8-S0** Security review + design of the proxy and data-sharing *(M)*. **Blocks the rest of E8.**
- **E8-S1** Opt-in screen explaining exactly what's sent *(S)*
- **E8-S2** Chat coach using summary data only *(L)*

---

## Tentative sprint plan (we'll adjust as we go)

Basic first, then layers (see PRODUCT.md §3).

| Sprint | Layer | Stories | Demo goal |
|---|---|---|---|
| **0** | Foundation | E0-S1 ✅, E0-S2, E0-S3, E0-S4 | Secure, styled shell live on GitHub Pages |
| **1** | Basics | E1-S1 → S5 | Add expenses & income; they survive closing the browser |
| **2** | Basics | E2-S1 → S6, E1-S6 | Installed on phone, works offline, encrypted backup restores |
| **3** | Know where you stand | E3-S1, S2, E9-S1 → S3, E4-S1 → S3 | Home shows **Safe to Spend Today** + 50/30/20 split |
| **4** | Know what to cut | E4-S4, S5, E3-S3, E5-S1 → S3 | Smart Coach tips with "Why?" |
| **5** | Know what to cut | E5-S4 → S6, E10-S1 → S3 | First **Cut Plan** challenge, month-end win |
| **6** | Know what's next | E11-S1 → S3 | **Next Best Step** + Money Checkup |
| **7** | See the future | E12-S1 → S3 | What-If sliders and debt payoff plan |
| **8–9** | Less typing | E7-S1 → S6 | Import a real statement and categorize it |
| **10** | Smarter | E6-S1 → S3 | Feedback changes which tips show |
| **Later** | AI coach | E8 | Only after a security review |

## "No reset" release checklist (every sprint from Sprint 2 on)
- [ ] Refresh → data still there
- [ ] Quit & reopen browser → still there
- [ ] Restart device → still there
- [ ] Deploy new version → still there (migrations OK)
- [ ] Clear site data → restore encrypted backup → everything back
- [ ] Airplane mode → app works
