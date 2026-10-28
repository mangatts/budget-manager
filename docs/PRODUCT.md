# Product Vision: What Makes Budget Manager Different

> **One line:** a private money coach that tells you **what to do next**, not just a spreadsheet of what you already spent.

---

## 1. What's already out there

| App type | Examples | What they do well | Where they fall short (for our user) |
|---|---|---|---|
| **Zero-based / envelope** | YNAB, EveryDollar, Goodbudget | Give every dollar a job; strong habits | Steep learning curve; heavy upfront setup; "expected vs. actual" bookkeeping, which is exactly what our user doesn't want |
| **Bank-sync dashboards** | Monarch, Copilot, Empower | Automatic transactions, nice charts | Need your bank login (privacy and security risk), paid subscriptions, mostly **look backward** ("you spent $X") |
| **Subscription killers** | Rocket Money | Find and cancel subscriptions | Narrow; bank login; upsells |
| **"Left to spend"** | PocketGuard | One simple number | Still bank-sync, little guidance on *how* to improve |
| **Spreadsheets** | Excel / Google Sheets | Total control | Manual, no advice, not phone-friendly |

**Market gap:** Mint shut down in 2024. Most replacements either need your bank password and a monthly fee, or need you to become a budgeting expert. Almost none act like an **advisor**, someone who looks at your numbers and says *"here's the one thing to do this month."*

---

## 2. Our unique angle: "Next Best Step"

Four ideas that, **together**, nobody else combines:

### ① Next Best Step (the signature feature)
Real financial advisors follow an **order of operations**. The app works out which step you're on from your numbers and shows **one clear next action**:

| Step | Goal | Example message |
|---|---|---|
| 1 | **Spend less than you earn** | "You spent $90 more than you earned. Let's find it." |
| 2 | **Starter emergency fund** (~$1,000 or 1 month of essentials) | "You're $400 away from your starter safety net." |
| 3 | **Get any employer 401(k) match** | "Free money: are you getting your full match?" |
| 4 | **Pay off high-interest debt** (credit cards, > ~8% APR) | "Your Visa at 24% costs you ~$60/mo in interest. Pay it first." |
| 5 | **Full emergency fund** (3–6 months of essentials) | "2.1 of 3 months saved." |
| 6 | **Save 15–20% for the future** | "You're saving 9%. Here's how to reach 15%." |
| 7 | **Bigger goals** (house, car, travel, kids) | "On track for your house down payment by June 2028." |

*Steps that need info the app doesn't have (like a 401(k) match) ask one simple question first. Users can skip any step.*

### ② Safe to Spend Today
One number on the Home screen, recalculated every time you add an expense:
```
Safe to spend today = (income this month − bills still due − savings goal − already spent) ÷ days left
```
It works **without setting up a budget**, which fits our "no expected vs. actual" decision.

### ③ Cut Plan (coaching, not judging)
Each month the Smart Coach (INSIGHTS.md) suggests **1–2 challenges** based on benchmarks and your habits:
> "Dining Out: $410 → $300 this month. That's **$110 toward your emergency fund**."

You accept or skip. Progress shows on Home. At month end: "You did it, saved $124 🎉" or "Close! $280, try again?" Each challenge is **linked to your Next Best Step**, so cutting back always has a *reason*.

### ④ What-If: see your future
Simple sliders that turn small changes into real outcomes:
- "Cut $100/month from Dining Out → emergency fund done **4 months sooner**."
- "Pay $50 extra on your card → debt-free **11 months sooner**, save **$420** interest."
- "Invest $200/month for 20 years → about **$X**" (shown with a clear assumption, e.g. a 6% average return, plus a not-a-guarantee note)

### Plus the things that make it trustworthy
- **Private by design:** no bank login, no account, no server. Data stays on your device.
- **You approve every category** on statement import (no wrong auto-categorizing).
- **Time cost** (optional): "This $120 purchase = **4.5 hours of work**." Helps for all ages.
- **Built for every age:** big text, plain words, one number and one next step instead of 12 charts.
- **Explains itself:** every tip and step has "Why?" with the math and the source.

---

## 3. Build order: basic first, then layers

| Layer | What the user gets | Builds on |
|---|---|---|
| **1. Basics** (Sprints 0–2) | Add income/expenses, history, categories, never lose data, works offline | — |
| **2. Know where you stand** (Sprint 3) | Month totals, **Safe to Spend Today**, **recurring bills**, 50/30/20 split | Layer 1 data |
| **3. Know what to cut** (Sprints 4–5) | Smart Coach tips (benchmarks + patterns), **Cut Plan** challenges | Layer 2 numbers |
| **4. Know what's next** (Sprint 6) | **Money profile** (savings, debts, goals) → **Next Best Step** + **Money Checkup** score | Layers 2–3 |
| **5. See the future** (Sprint 7) | **What-If** simulator, goal timelines, debt payoff plan | Layer 4 profile |
| **6. Less typing** (Sprints 8–9) | Bank statement import with review | Layer 1 + categorization learning |
| **7. Smarter** (later) | Feedback learning, optional AI coach | Everything |

Each layer is useful on its own, so the app is helpful from week one and gets smarter as it grows.

---

## 4. Money Checkup (score, explained)

A monthly "health check" an advisor would do, scored 0–100 from **5 measurable signals**, each shown as 🟢 / 🟡 / 🔴 with a plain explanation:

| Signal | 🟢 Good | Source of guideline |
|---|---|---|
| Spending vs. income | Spend < income | Basic cash flow |
| Savings rate | ≥ 15–20% | 50/30/20, retirement guidance |
| Emergency fund | ≥ 3 months of essentials | CFPB / common guidance |
| Housing cost | ≤ 30% of income | HUD |
| Debt payments | ≤ 36% of gross income; no high-interest balances | Lender DTI guidance / CFPB |

*All thresholds are verified against current sources in the benchmark story (E4-S1), shown with "Why?", and presented as general education, **not financial advice**.*

---

## 5. Data we'll need to add (beyond ARCHITECTURE.md §4)

```js
// recurringBills: drives "Safe to Spend" and bill reminders
{ id, name: "Rent", amountCents: 140000, categoryId, dayOfMonth: 1, active: true }

// accounts: optional balances for emergency fund and debt steps (entered by hand)
{ id, name: "Savings", kind: "savings" | "checking" | "debt" | "retirement",
  balanceCents, aprBps: 2499 | null, minPaymentCents: null, updatedAt }

// goals
{ id, name: "Emergency fund", targetCents, targetDate: "2027-06" | null, linkedAccountId }

// challenges (Cut Plan)
{ id, month: "2026-11", categoryId, fromCents, targetCents, status: "active" | "won" | "missed" | "skipped" }

// profile additions
{ hourlyTakeHomeCents: null, hasEmployerMatch: true | false | null }
```
Everything is optional and entered by hand; there is still no bank login.

---

## 6. Guardrails (financial-advisor ethics)
- **Education, not advice.** A clear note says the app gives general guidance and you should talk to a licensed professional for personal advice.
- **No product pushing.** No affiliate links, no "open this credit card."
- **No shame.** Celebrate wins; frame overspending as "let's find it," not "you failed."
- **Show assumptions.** Every projection shows its inputs (return %, interest rate) and says it isn't a guarantee.
- **Prefer changeable things.** Suggest wants before needs; flag housing as a long-term decision.
