# Budget Manager — Architecture

A personal budget manager built with plain HTML, CSS, and JavaScript. You should be able to use it every day on a laptop and a phone, and your data should never reset. Instead of making you set "expected vs. actual" budgets, it compares your spending to **industry benchmarks** and **learns from your habits** to tell you where to cut back.

**Related docs**
- [PRODUCT.md](PRODUCT.md): what makes us different (Next Best Step, Safe to Spend, Cut Plan, What-If)
- [INSIGHTS.md](INSIGHTS.md): how the "smart coach" works (benchmarks → learning → optional AI)
- [SECURITY.md](SECURITY.md): security plan based on NIST guidelines
- [BACKLOG.md](BACKLOG.md): Agile process, epics, user stories, sprint plan

---

## 0. Decisions (locked in)

| Topic | Decision |
|---|---|
| Currency | **USD only** (`$`). No currency picker. |
| Sync | **Not now.** Everything is stored on the device. Data moves between devices with an encrypted Export/Import. |
| Budget style | **No "expected vs. actual" budgets.** Spending is measured against **industry benchmarks** (50/30/20 rule, BLS/HUD guidance) and the user's own learned patterns. |
| Smart coach | Starts with **clear rules** (the examples in INSIGHTS.md), then **learns on-device** from user spending and feedback. An optional AI coach may come later. |
| Bank statements | Upload a CSV, then **the user confirms the category for every row**. Suggestions are allowed; auto-filing is not. |
| Design | **Usable by every age group**: big, clear, plain-language, accessible. Use design skills when building the UI. |
| Process | **Agile** (Scrum-lite, 1-week sprints). See BACKLOG.md. |
| Security | **NIST-aligned** (CSF 2.0 + SSDF SP 800-218), with OWASP checklists for web specifics. See SECURITY.md. |

---

## 1. Goals

| Goal | What it means |
|---|---|
| **Daily use** | Add an expense in under 5 seconds. Opens like an app from the home screen or dock. |
| **Data never resets** | Data survives refreshes, browser restarts, and updates to the app, and there's a backup if the browser loses it anyway. |
| **Helpful, not bossy** | Tells you *where* to save and *how much*, in plain words, without making you set up budgets. |
| **Private & secure** | No accounts, no server, no trackers. Data never leaves the device unless you export it. |
| **Simple stack** | Vanilla HTML/CSS/JS with ES modules. No build step and no third-party runtime dependencies. |

---

## 2. Making the data stick

| Option | Survives refresh | Risk of loss | Works on phone | Verdict |
|---|---|---|---|---|
| JS variables only | ❌ | Lost on every refresh | ✅ | No |
| `localStorage` | ✅ | ~5 MB cap; Safari can wipe it after 7 days without a visit | ✅ | Small UI preferences only |
| **IndexedDB** | ✅ | Large capacity; still in the browser, so it can be cleared | ✅ | **Primary store** |
| File System Access API | ✅ | Very safe | ❌ Chrome/Edge desktop only | Maybe later |
| Cloud DB | ✅ | Safest | ✅ | Not planned |

### 4 layers of protection
1. **IndexedDB** as the main database in the browser.
2. **`navigator.storage.persist()`** asks the browser not to evict the data.
3. **Installed PWA**: works offline, and on iPhone it avoids Safari's 7-day wipe.
4. **Encrypted backups**: one-tap export/import, plus a "last backup: X days ago" reminder.

### Things that WILL wipe data
- Opening `index.html` as a `file://` URL. **Always use `http://localhost` or HTTPS.**
- Clearing site data, using private/incognito windows, or changing the URL or port.

### Hosting
- **Local dev:** `python3 -m http.server 5500`
- **Everyday use:** **GitHub Pages** (free, HTTPS, stable URL). Install the PWA from there.
  - *Security note:* GitHub Pages can't set custom HTTP headers, so the CSP goes in a `<meta>` tag. If headers become necessary, move to Cloudflare Pages or Netlify (both free). See SECURITY.md.

---

## 3. High-level architecture

```
┌──────────────────────────────────────────────────────────┐
│  UI layer (views/)  – textContent only, never innerHTML   │
│  Home · Add · History · Tips · Import · Settings          │
└──────────────▲───────────────────────┬────────────────────┘
               │ re-render             │ user actions
┌──────────────┴───────────────────────▼────────────────────┐
│  Store (store.js) – state + actions + subscribe           │
└──────────────▲───────────────────────┬────────────────────┘
               │                       │
┌──────────────┴───────────────────────▼────────────────────┐
│  Services                                                 │
│  ┌─ insights/  (the "smart coach", see INSIGHTS.md) ────┐ │
│  │  benchmarks.js  L1: industry rules (50/30/20, etc.)  │ │
│  │  patterns.js    L2: learned personal baselines       │ │
│  │  learner.js     L3: learns from 👍/👎 feedback        │ │
│  │  engine.js      runs all, scores, ranks the tips     │ │
│  └──────────────────────────────────────────────────────┘ │
│  statementImport/  CSV → validate → review queue          │
│  backup.js         encrypted export / import              │
│  crypto.js         Web Crypto (AES-256-GCM, PBKDF2)       │
│  validate.js       schema checks on ALL incoming data     │
│  migrations.js     upgrade old data shapes                │
└──────────────▲───────────────────────┬────────────────────┘
               │                       │
┌──────────────┴───────────────────────▼────────────────────┐
│  Repository interface → IndexedDB adapter                 │
└───────────────────────────────────────────────────────────┘

  sw.js          → offline cache (versioned; self-update)
  manifest.json  → installable app
  CSP <meta>     → blocks inline/third-party scripts
```

**Key rules**
1. The UI never talks to IndexedDB directly.
2. **All data from outside** (form input, CSV files, backup files) goes through `validate.js` before it is stored.
3. **The insights engine is pure functions** (data in, tips out). That makes it easy to test, and the rules can be swapped for smarter models later without touching the UI.

---

## 4. Data model

All money is stored as **integer cents** (`1250` = $12.50).

```js
// transactions
{
  id: "uuid",
  type: "expense" | "income",
  amountCents: 1250,
  categoryId: "uuid",
  date: "2026-10-28",
  note: "Lunch",                       // max 200 chars
  merchant: "Chipotle" | null,         // cleaned name (imports)
  source: "manual" | "import",
  importId: null | "uuid",
  fingerprint: null | "sha256-hex",    // duplicate detection
  createdAt: 1761650000000,
  updatedAt: 1761650000000
}

// categories
{
  id: "uuid",
  name: "Dining Out",
  type: "expense" | "income",
  bucket: "need" | "want" | "savings", // used by the 50/30/20 benchmark
  benchmarkKey: "food_away",           // links to benchmark table
  icon: "🍽️",
  order: 7,                            // display order
  archived: false
}
// Default ids are stable ("c-dining") so future migrations can find them.

// profile (single record; optional, makes benchmarks more accurate)
{
  key: "profile",
  monthlyTakeHomeCents: 450000 | null, // null → estimated from income entries
  householdSize: 1 | null
}

// insightFeedback (what the app learns from)
{
  id: "uuid",
  insightType: "pace_over_benchmark",
  categoryId: "uuid",
  shownAt: 1761650000000,
  response: "helpful" | "not_helpful" | "dismissed" | "doing_it",
  month: "2026-10"
}

// learnerState (on-device learned weights and baselines)
{ key: "weights",   value: { "pace_over_benchmark": 1.2, "small_stuff": 0.6, ... } }
{ key: "baselines", value: { "<categoryId>": { median: 41000, mad: 6000, months: 4 } } }

// merchantRules (from YOUR confirmations; suggestions only)
{ id: "uuid", pattern: "CHIPOTLE", categoryId: "uuid", timesConfirmed: 3 }

// imports + pendingTransactions (bank statement review queue)
{ id, fileName, uploadedAt, rowCount, status: "reviewing" | "done" }
{ id, importId, date, amountCents, type, merchant, rawDescription /* masked */,
  suggestedCategoryId, decision: "pending" | "approved" | "skipped" }

// meta
{ key: "schemaVersion", value: 1 }
{ key: "lastBackupAt",  value: 1761650000000 }
{ key: "textSize",      value: "normal" | "large" | "extra-large" }
```

**Removed:** the `budgets` store (no expected-vs-actual).

**Object stores:** `transactions` (indexes: `date`, `categoryId`, `fingerprint`), `categories`, `profile`, `insightFeedback` (index: `month`), `learnerState`, `merchantRules`, `imports`, `pendingTransactions` (index: `importId`), `meta`.

---

## 5. Folder structure

```
budget-manager/
├── index.html
├── manifest.json           # install as an app (name, icons, colors)
├── sw.js                   # offline: caches only our files; updates wait for "Update"
├── css/
│   ├── tokens.css          # design tokens: colors (light/dark), type, space, text sizes
│   ├── fonts.css           # self-hosted Atkinson Hyperlegible Next & Mono
│   ├── base.css            # reset, typography, focus, reduced motion
│   ├── layout.css          # header, screen column, tab bar
│   └── components.css      # buttons, fields, choices, lists, money, pills, cards
├── fonts/                  # .woff2 files + OFL licenses
├── js/
│   ├── prefs-boot.js       # applies saved text size/theme before first paint
│   ├── app.js
│   ├── router.js
│   ├── store.js            # state + validated actions (each returns undo)
│   ├── appStore.js         # the app's single store on IndexedDB
│   ├── db/
│   │   ├── repository.js   # the only data interface (allowed stores only)
│   │   ├── indexeddb.js    # versioned migrations; never edit a released one
│   │   └── memory.js       # same interface, for unit tests
│   ├── services/
│   │   ├── insights/
│   │   │   ├── benchmarks.js
│   │   │   ├── benchmarkData.js   # the numbers + sources
│   │   │   ├── patterns.js
│   │   │   ├── learner.js
│   │   │   └── engine.js
│   │   ├── statementImport/
│   │   │   ├── csvParser.js
│   │   │   ├── bankFormats.js
│   │   │   └── suggest.js
│   │   ├── preferences.js  # text size + theme (allow-listed, localStorage)
│   │   ├── pwa.js          # service worker, install prompt, storage persistence
│   │   ├── history.js      # filter/search/group/totals for History
│   │   ├── categories.js   # defaults, seeded once
│   │   ├── backup.js       # build, open, and strictly validate backups
│   │   ├── crypto.js       # AES-256-GCM + PBKDF2 (Web Crypto)
│   │   ├── validate.js
│   │   └── migrations.js
│   ├── ui/
│   │   └── choiceGroup.js  # shared components built with utils/dom.js
│   ├── views/
│   │   ├── design.js       # #/design reference page (hidden route)
│   │   ├── backup.js       # More → Backups (save / restore)
│   │   ├── categories.js   # More → Categories (list + edit)
│   │   ├── wipe.js         # More → Delete everything
│   │   ├── more.js         # More → Display settings
│   │   ├── home.js
│   │   ├── addTransaction.js
│   │   ├── history.js
│   │   ├── tips.js
│   │   ├── importReview.js
│   │   └── settings.js
│   └── utils/
│       ├── money.js        # USD formatting (Intl.NumberFormat)
│       ├── dates.js
│       ├── contrast.js     # WCAG contrast ratio (tests + design page)
│       ├── dom.js          # safe element helpers (no innerHTML)
│       └── id.js           # crypto.randomUUID()
├── tests/                  # insights + validation + crypto unit tests
├── icons/                  # app icons (scripts/make-icons.mjs renders them)
└── docs/
```

---

## 6. Screens

Bottom tabs: **Home · Add (＋) · History · Tips · More**

1. **Home**: money in, money out, and what's left this month. A **50/30/20 bar** (needs / wants / savings) compared with the recommended split, the **top 2 tips**, and recent transactions.
2. **Add**: amount (keypad first), money in/out toggle, big category buttons, date (defaults to today), and an optional note.
3. **History**: grouped by day, filter by month/category, search, edit/delete with undo.
4. **Tips (Smart Coach)**: all current tips, ranked by how much they'd save. Each has **"Why am I seeing this?"** and 👍 / 👎 / "I'm on it".
5. **More → Import Statement**: upload a CSV and review/categorize the rows.
6. **More → Settings**: take-home pay (optional), categories, text size, encrypted backup/restore, storage status, and "Delete all data".

---

## 7. Bank statement import

**Principle:** nothing is categorized behind your back.

```
Upload CSV → Validate (size/type/rows) → Parse → Mask account #s → Dedupe → Review → Approved
                                                                             │
                                                     your choices → merchantRules (suggestions)
```

- Review one row at a time (phone) or as a list (desktop). The suggested category is **highlighted, not pre-selected**.
- **Add / Skip / Undo** buttons, a "12 of 84 done" counter, and **Finish later** (the queue is saved).
- "Always use Dining Out for CHIPOTLE?" teaches a merchant rule with one tap.
- CSV first, starting with common bank layouts plus manual column matching for others. PDF maybe later.
- The file is read in the browser and never uploaded. Only the needed fields are kept (see SECURITY.md).

---

## 8. Design for every age group

| Guideline | How |
|---|---|
| Readable | 18px base font, Atkinson Hyperlegible. Text size setting: Normal (18px) / Large (21.6px) / Extra large (25.2px), with no flash on load. |
| Easy to tap | Targets ≥ 48×48px, well spaced. |
| Plain language | "Money in / Money out", "Needs / Wants / Savings". No jargon. |
| Contrast | WCAG 2.2 AA. Never color alone: warnings use an icon + words. |
| Labels | Every icon has a text label. |
| Forgiving | Undo after delete. Confirm destructive actions. |
| Accessible | Semantic HTML, keyboard usable, screen-reader tested, respects "reduce motion". |
| Light & dark | Follows the device by default; More → Display can force Light or Dark. |

**Design system (built in E0-S2):**
- **Font:** Atkinson Hyperlegible Next for text and Atkinson Hyperlegible Mono for money, both by the Braille Institute for low-vision readers. Self-hosted, 52 KB total.
- **Colors:** a deep teal accent and teal-tinted neutrals.
- **No-shame money colors:** money in is green with a "+". Money out uses the normal text color with a "−".
- **Status colors:** good, warning and critical, always shown with an icon and words.
- **Where it lives:** everything is in `css/tokens.css`. Tests enforce AA contrast in both themes and ban hard-coded colors elsewhere.
- **Live reference:** the `#/design` page.
- **Charts:** use the **dataviz** skill for every chart (like the 50/30/20 bar).

---

## 9. Default categories (editable)

| Category | Bucket | Benchmark key |
|---|---|---|
| Housing (rent/mortgage) | Need | `housing` |
| Utilities | Need | `utilities` |
| Groceries | Need | `food_home` |
| Transportation | Need | `transportation` |
| Gas | Need | `transportation` |
| Health & Insurance | Need | `healthcare` |
| Debt Payments (minimums) | Need | `debt` |
| Dining Out | Want | `food_away` |
| Shopping | Want | `apparel_misc` |
| Subscriptions | Want | `entertainment` |
| Entertainment | Want | `entertainment` |
| Personal Care | Want | `personal_care` |
| Gifts | Want | `gifts` |
| Savings / Investing | Savings | `savings` |
| Extra Debt Payoff | Savings | `savings` |
| Other | Want | none |

**Money in:** Paycheck · Side Income · Gifts Received · Refunds · Other Income
