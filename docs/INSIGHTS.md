# Smart Coach — How Insights Work

**Goal:** no "set a budget, then compare actual". The app looks at what you actually spend, compares it to **industry benchmarks** and **your own patterns**, and tells you **where to cut back and by how much**. It improves as it learns what's useful to you.

It is built in levels. Each level works on its own, and each one adds to the one before it.

```
Level 1  Industry benchmarks     ← works from day 1
Level 2  Your personal patterns  ← after ~1 month of data
Level 3  Learns from feedback    ← improves which tips you see
Level 4  AI coach (optional)     ← later, opt-in only
```

All of Levels 1–3 run **on your device**, with no internet and no data leaving the phone.

---

## Level 1: Industry benchmarks ("the industry calc")

### A. The 50/30/20 rule (main framework)
Take-home pay is split into:
- **50% Needs**: housing, utilities, groceries, transportation, health, minimum debt payments
- **30% Wants**: dining out, shopping, entertainment, subscriptions, personal care
- **20% Savings**: savings, investing, extra debt payoff

Each category has a `bucket` (see ARCHITECTURE.md §9). The Home screen shows your actual split against 50/30/20.

### B. Category benchmarks (verified Oct 2026, E4-S1)

All values live in `js/services/insights/benchmarkData.js`, each with `source`, `url`, `asOf`, and `note`. A unit test checks that every entry has them and that the BLS numbers add up.

**Two kinds of benchmark. Mixing them up would give wrong advice:**

**1. Measured against income**

| Key | Guideline | Source |
|---|---|---|
| `needs` / `wants` / `savings` | 50% / 30% / 20% of take-home pay | 50/30/20 rule of thumb (Warren & Tyagi, *All Your Worth*), labeled as a rule of thumb |
| `housing` | > 30% of income (incl. utilities) = cost-burdened; > 50% = severe | **HUD** CHAS definitions. HUD uses gross income, and we only have take-home, so our check is a bit stricter. |
| `debt` | All debt payments ≤ 36% of gross income (homeowners); 15–20% for renters (excl. rent) | **CFPB** *Your Money, Your Goals* DTI tool |
| `emergency` | 3–6 months of living expenses saved | **CFPB** |

**2. Typical spending mix: compared to your share of *money out*, never to income**

Source: **BLS Consumer Expenditures 2024** (USDL-25-1586, released Dec 19, 2025). Average spending was $78,535.

BLS's total includes "personal insurance and pensions" ($9,797, mostly Social Security payroll deductions). People don't log those as spending, so the base is **$68,738**.

| Key | BLS 2024 $/yr | Share of total spending (published) | Share used by the app (normalized) |
|---|---|---|---|
| `housing` (incl. utilities) | 26,266 | 33.4% | 38.2% |
| `transportation` | 13,318 | 17.0% | 19.4% |
| `food_home` (groceries) | 6,224 | 7.9% | 9.1% |
| `food_away` (dining out) | 3,945 | 5.0% | 5.7% |
| `healthcare` | 6,197 | 7.9% | 9.0% |
| `entertainment` | 3,609 | 4.6% | 5.3% |
| `apparel` | 2,001 | 2.5% | 2.9% |
| `personal_care` | 978 | 1.2% | 1.4% |
| `education` | 1,569 | 2.0% | 2.3% |
| `cash_contributions` (gifts, donations) | 2,292 | 2.9% | 3.3% |

**Time window:** tips look at **whole calendar months** (your last 1–3 complete months with spending, averaged per month), so monthly bills like rent count exactly once. Brand-new users with no complete month get spending-mix tips from the 20th of their first month (that month so far, not scaled up). The housing check waits for a complete month.

**Shopping is not compared** to any BLS line. It mixes clothing, household goods, electronics and more, and comparing it to clothing alone (2.9%) would overstate the gap. It still gets "running ahead of your usual" tips (Level 2), which compare you only with yourself.

Update every year when BLS publishes. A changed number only needs `benchmarkData.js` and its test updated.

### C. What income is used?
1. If the user entered **take-home pay** in Settings, use that.
2. Otherwise, **estimate** it from the median of the last 1–3 months of "money in" entries.
3. If neither exists, show only spending-only tips and a gentle prompt: "Add your pay to unlock comparisons."

### Example Level 1 tips
- "Dining out is **9%** of your spending. A typical household spends about 6%. Getting to 6% would save **~$110/month**."
- "Wants are **41%** of your income (guideline: 30%). Your biggest wants: Dining Out, Shopping."
- "You're saving **6%**. The guideline is 20%. Even 10% would be **$270/month** more."
- "Housing is **38%** of your income, above the 30% guideline. This is hard to change fast, so focus on Dining Out and Shopping first."

---

## Level 2: Your personal patterns (learned from your data)

Each pattern is simple statistics computed on the device in `patterns.js`.

| Pattern | How it's computed | Example tip |
|---|---|---|
| **Pace** | spent so far ÷ days elapsed × days in month, compared with benchmark and your usual | "At this pace Dining Out will hit **$410** this month, $110 more than your usual." |
| **Your usual** | Rolling **median** of the last 3–6 months per category (resistant to one-off spikes) | "Groceries is **$65 higher** than your usual month." |
| **Unusual spike** | Value > median + 3 × MAD (robust outlier test) | "A $340 Shopping charge on Oct 12 is much larger than usual. Was that planned?" |
| **Small stuff adds up** | Count of transactions < $15 in a category or merchant | "22 coffee purchases = **$118** this month (**$1,400/yr**)." |
| **Repeating charges** | Same merchant + similar amount (±5%) at ~monthly intervals | "You pay **$15.49/mo** for Netflix. Still using it?" |
| **Best month** | Lowest month for a category in the last 6 | "Your best Dining Out month was $190. Matching it saves **$140**." |
| **Day/week habits** | Spending by weekday | "Most of your Dining Out happens on **Fridays**." |
| **Money left** | Income − expenses this month | "You have **$320 left** this month." |

**Minimum data rules:** a pattern only shows when there's enough data (e.g. "your usual" needs ≥ 2 months). Without that, the app says "Keep adding expenses. More tips unlock after a month."

---

## Level 3: Learning what helps you

The app learns **which tips to show** and **how to categorize** without any cloud AI.

### A. Tip ranking (learns from feedback)
Every tip gets a score:

```
score = estimatedMonthlySavings × confidence × weight[insightType] × freshness
```

- `estimatedMonthlySavings`: dollars, so the most valuable advice comes first
- `confidence`: 0–1, rising with more months of data
- `weight[insightType]`: **learned**. It starts at 1.0, goes up when you tap 👍 or "I'm on it", and goes down on 👎 or dismiss (a simple multiplicative update, clamped between 0.2 and 3)
- `freshness`: lowers tips you've already seen recently, so it doesn't nag

### B. Progress tracking ("did it work?")
If you tap **"I'm on it"** on a tip, the app checks next month: "You cut Dining Out by **$95**, nice work! 🎉" Positive feedback keeps people using it.

### C. Category suggestions (bank import)
- `merchantRules` from your past confirmations (exact keyword matches)
- Later: a small **Naive Bayes** classifier on description words, trained only on your own confirmed transactions
- Always a **suggestion**: highlighted, never pre-selected

---

## Level 4: Optional AI coach (later, opt-in)

A conversational coach ("How can I save $200 next month?") using an LLM API.

**Rules if we build it:**
- **Off by default.** It needs clear opt-in with a plain explanation of what is sent.
- **Only send summaries**: monthly category totals and benchmark gaps. **Never** raw transactions, notes, merchant names, or account numbers.
- **No API key in the browser.** It needs a tiny proxy (e.g. a Cloudflare Worker) holding the key, with rate limits. That adds a backend, so it goes through a security review first (SECURITY.md).
- Answers **must cite the numbers** from Levels 1–3 so they can be checked. No made-up figures.
- Use the latest available Claude model at build time (check the claude-api skill then).

---

## Guardrails (all levels)

- **Not financial advice.** A short note on the Tips screen says the tips are general guidance.
- **Every tip explains itself.** "Why am I seeing this?" shows the math and the benchmark source.
- **No shaming.** Encouraging tone, and wins are celebrated as well as overspending.
- **Prioritize what's changeable.** Wants come before needs. For housing, the app notes it's a long-term change.
- **Max 3 tips on Home**, so the user isn't overwhelmed.

---

## Insight object (what `engine.js` returns)

```js
{
  id: "pace_over_benchmark:food_away:2026-10",
  type: "pace_over_benchmark",
  level: 1 | 2 | 3,
  categoryId: "uuid",
  title: "Dining Out is running high",
  message: "At this pace you'll spend $410 this month. About $180 more than the typical guideline.",
  estimatedMonthlySavingsCents: 18000,
  confidence: 0.8,
  why: { formula: "...", inputs: {...}, source: "BLS CE 2024" },
  score: 14400
}
```

## Testing
`engine.js` and `patterns.js` are pure functions, so `tests/` contains fixture months (normal, overspending, new user, irregular income), and each test asserts the exact tips produced.
