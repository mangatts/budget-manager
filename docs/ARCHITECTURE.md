# Budget Manager — Architecture

A small, private app for credit cards and monthly cash flow, built with plain HTML, CSS, and JavaScript. No server, no build step, no third-party runtime code.

**Related docs:** [PRODUCT.md](PRODUCT.md) · [SECURITY.md](SECURITY.md) · [BACKLOG.md](BACKLOG.md)

## 1. Decisions

| Topic | Decision |
|---|---|
| Scope | Income, fixed expenses, cards, and dated balance check-ins. No spending entries. |
| Payoff method | Minimums on every card, the rest to the highest APR (avalanche). |
| Currency | USD only. Money is integer cents; APR is integer basis points (24.99% = 2499). |
| Storage | IndexedDB on the device. Encrypted backups move data between devices. No sync. |
| Hosting | GitHub Pages (HTTPS). CSP in a `<meta>` tag. |
| Security | NIST CSF 2.0 + SSDF, OWASP checklists. See SECURITY.md. |

## 2. Layers

```
┌──────────────────────────────────────────────────────────┐
│ Views (views/)  textContent only, never innerHTML         │
│ Home · Check-in · Setup (+ card/income/expense forms)     │
│ More · Backups · Delete everything · #/design             │
└──────────────▲───────────────────────┬───────────────────┘
               │ re-render             │ user actions
┌──────────────┴───────────────────────▼───────────────────┐
│ Store (store.js): state + validated actions, each → undo │
└──────────────▲───────────────────────┬───────────────────┘
               │                       │
┌──────────────┴──────────┐  ┌─────────▼───────────────────┐
│ services/planner.js     │  │ services/validate.js        │
│ pure math: monthly pay, │  │ every form input            │
│ minimums, avalanche,    │  │ services/backup.js + crypto │
│ trend, payoff estimate  │  │ services/legacy.js (v1 data)│
└─────────────────────────┘  └─────────────▲───────────────┘
                                           │
┌──────────────────────────────────────────▼───────────────┐
│ Repository (allow-listed stores) → IndexedDB adapter     │
└──────────────────────────────────────────────────────────┘
  sw.js → offline cache · manifest.json → installable · CSP → no inline/third-party code
```

Rules: the UI never touches IndexedDB; all outside data goes through `validate.js` or the backup validator; the planner is pure functions (data in, plan out).

## 3. Data model (database v8)

```js
// cards
{ id, name, limitCents: 500000 | null, aprBps: 2499, minPaymentCents: 3500, createdAt, updatedAt }
// checkins (keyPath "date": one per day)
{ date: "2026-11-22", balances: [{ cardId, balanceCents }], createdAt }
// incomes
{ id, name, amountCents, frequency: "weekly" | "biweekly" | "semimonthly" | "monthly", createdAt, updatedAt }
// expenses
{ id, name, amountCents, dayOfMonth: 1–31 | null, createdAt, updatedAt }
// meta
{ key: "carriedOver", value: 1 }      // v1 data already moved over
{ key: "lastBackupAt", value: 1761650000000 }
```

Stores from v1 (`transactions`, `categories`, `bills`, `debts`, …) still exist because migrations only move forward. They are read once on first open (debts → cards plus a check-in for today, active bills → expenses, take-home pay → monthly income) and cleared by "Delete everything". Old backups (schema 1–7) restore through the same conversion.

## 4. The plan (services/planner.js)

1. Monthly income = Σ amount × paychecks per year ÷ 12 (weekly 52, every 2 weeks 26, twice a month 24, monthly 12).
2. Each card's balance comes from the newest check-in that includes it.
3. Minimum due = min(minimum payment, balance).
4. Left over = income − fixed expenses − minimums. Negative means short.
5. The extra is given to cards from highest APR to lowest (ties: smaller balance first), up to each card's balance.
6. Debt-free estimate: month by month, add interest (balance × APR ÷ 12), then pay with the same budget. Shows "won't go down" if it can't finish within 50 years or can't cover the minimums.
7. Trend = change between the two newest check-ins, counting cards in both.

## 5. Folders

```
index.html · manifest.json · sw.js
css/      tokens, fonts, base, layout, components
js/       app.js, router.js, store.js, appStore.js, prefs-boot.js
  db/       indexeddb.js (migrations), repository.js, memory.js (tests)
  services/ planner.js, validate.js, legacy.js, backup.js, crypto.js, preferences.js, pwa.js
  ui/       form.js, choiceGroup.js, toast.js, backupReminder.js
  views/    home.js, checkin.js, setup.js, more.js, backup.js, wipe.js, design.js
  utils/    dom.js, money.js, dates.js, id.js, contrast.js
tests/    unit tests; tests/e2e/ browser checks at 390×844
```

## 6. Design

Same design system as before: Atkinson Hyperlegible (self-hosted), deep teal accent, AA contrast in light and dark (tests enforce it), three text sizes, 48px tap targets, status shown with icon + words, Undo on every change. Live reference at `#/design`.
