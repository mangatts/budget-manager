# AI Coach: design and security review (E8-S0)

> **Status:** design only. Nothing here is built or deployed. **E8-S1 and E8-S2 are blocked** until the owner decides the open questions in §8 (they involve an account, an API key, money, and a change to the app's privacy promise).

The optional level-4 coach from [INSIGHTS.md](INSIGHTS.md): ask "How can I save $200 next month?" and get an answer built from **your own numbers**, with every figure checkable.

---

## 1. What changes, and why it needs this review

Today the app makes **no network calls** except loading itself (SECURITY.md §2.6), and CSP is `connect-src 'self'`. An AI coach needs one outside connection. That is the biggest change to the threat model since the project started, so it gets its own design and review before any code.

**Principles (unchanged from INSIGHTS.md level 4):**
1. **Off by default.** Turned on only from an opt-in screen that shows exactly what will be sent.
2. **Only summaries leave the device.** Never transactions, notes, merchant names, descriptions, account numbers, goal or debt names, or the file names of imports.
3. **No API key in the browser.** A tiny proxy holds it.
4. **Answers must cite our numbers.** Figures the model states are checked against what we sent; anything unverifiable is not shown.
5. **Everything else keeps working offline.** The coach is an extra, never a dependency.

---

## 2. Architecture

```
Browser (the app)                    Proxy (Cloudflare Worker)                 Claude API
─────────────────                    ─────────────────────────                 ──────────
coachSummary(state) ──► POST /coach ──► validate shape + size ──► POST /v1/messages
 (pure, on device)       { summary,       rate-limit per install      model: claude-opus-5-5
                           question }     add system prompt + key      structured output
render as text  ◄── verified JSON ◄──── check citations ◄──────────── JSON answer
```

- **Client** (`js/services/coach/summary.js`, `js/views/coach.js`): builds the summary, shows it in full on the opt-in screen, sends it only after the person taps **Ask**, renders the answer with `el()` (text only).
- **Proxy** (`proxy/coach-worker.js`, deployed separately): the only holder of `ANTHROPIC_API_KEY` (a Worker secret). Stateless; **does not log request bodies**.
- **CSP** gains exactly one origin: `connect-src 'self' https://<coach-worker>.workers.dev`. Nothing else changes (no third-party scripts).

---

## 3. What is sent (the whole payload)

Built by a pure function so it can be unit-tested and shown verbatim before sending:

```js
{
  "version": 1,
  "month": "2026-09",                         // the last complete month
  "incomeCents": 450000,                      // take-home, or recorded money in
  "spendingByGroup": { "need": 230000, "want": 95000, "savings": 20000 },
  "categories": [                             // DEFAULT category keys only, never custom names
    { "key": "food_away", "cents": 41000, "usualCents": 30500 },
    { "key": "housing", "cents": 140000, "usualCents": 140000 }
  ],
  "benchmarkGaps": [ { "key": "food_away", "yourShare": 0.18, "typicalShare": 0.06 } ],
  "nextStep": "high-interest",                // step id only
  "checkupScore": 70,
  "emergencyMonths": 0.8,
  "highInterestDebtCents": 240000,            // a total, no names or rates per lender
  "question": "How can I save $200 next month?"   // ≤ 300 chars, typed by the person
}
```

- **Custom categories** are sent as `"other"` (their names could identify a person or a lender).
- The **question** is free text the person typed. The opt-in screen says so, and the proxy caps it at 300 characters.
- The payload is about **1–2 KB**.

---

## 4. Model and request (checked with the claude-api reference, Oct 2026)

| Choice | Value | Why |
|---|---|---|
| Model | `claude-opus-5-5` | Current default Opus. Any change of model is the owner's call. |
| Thinking | omitted (adaptive, always on for this model) | `{type:"disabled"}` returns a 400 on Opus 5.5 |
| Effort | `output_config.effort: "low"` | Short advice over a small summary; raise only if answers measure poorly |
| Output | `output_config.format` = JSON schema below | Lets the proxy verify every cited figure |
| `max_tokens` | 2,000 | Answers are short; the schema caps list lengths |
| Refusals | `fallbacks: "default"` + beta `server-side-fallback-2026-07-01`; always check `stop_reason` | A declined request gets a plain "The coach can't help with that one" |
| Caching | `cache_control` on the fixed system prompt | The system prompt is identical on every call |
| Prefill / sampling params | not used | Both return 400 on this model / API version |

**Answer schema** (structured output):

```json
{
  "answer": "string, ≤ 600 chars, plain language",
  "steps": [ { "text": "string ≤ 200", "figures": [ { "path": "categories[0].cents", "cents": 41000 } ] } ],
  "notAdvice": true
}
```

**Citation check (proxy, then again in the client):** every `figures[].path` must resolve in the summary that was sent, and its `cents` must equal the value there. Any step whose figure doesn't match is dropped. If the answer text contains a dollar amount that no figure backs, the whole answer is replaced with "The coach couldn't back that up with your numbers. Try asking another way." The UI shows each cited figure next to the step ("Dining Out last month: $410"), so the person can check it.

---

## 5. Threat model additions

| Threat | Example | Control |
|---|---|---|
| **Key theft** | Key copied from the client or the repo | Key only as a Worker secret; never in the repo or the browser; GitHub secret scanning already on |
| **Proxy abuse** | Someone scripts the endpoint and runs up the bill | Origin check (Pages origin only) + per-install token (random, created at opt-in) with a daily cap (e.g. 20 questions) + a global monthly spend limit set on the Anthropic workspace |
| **Over-sharing** | A merchant name or note leaks into the payload | Summary is built from an allow-list of fields; unit test asserts no free text except `question`; the opt-in screen shows the exact JSON |
| **Prompt injection via the question** | "Ignore your rules and…" | The question goes in the user turn, never the system prompt; the output schema plus the citation check limit what can come back; answers render as text only |
| **Made-up numbers** | "You spend $900 on dining" when it's $410 | Citation check (§4); unbacked amounts are removed |
| **XSS from the answer** | Model returns `<img onerror>` | Rendered with `el()` text nodes only (no HTML); Trusted Types and CSP unchanged |
| **Proxy logs** | Bodies kept in Worker logs | Worker logs status codes and sizes only; Cloudflare log retention set to minimum |
| **Availability** | Proxy down, offline | The coach says "Unavailable right now"; nothing else depends on it |
| **Cost surprise** | Heavy use | Anthropic workspace spend limit; per-install daily cap; estimate below |

**Cost estimate:** about 1.5 K input + 0.6 K output tokens per question ≈ 1.5 K × $4/M + 0.6 K × $20/M ≈ **$0.02 per question** (less with the cached system prompt). 20 questions/day/person is about $0.40 per person per day at worst. That is why a hard spend limit is required before launch.

---

## 6. Opt-in screen (E8-S1)

More → AI coach (off):
- Plain explanation: "Answers come from Claude, an AI by Anthropic. To answer, it needs a summary of your numbers. Your entries, notes, merchant names, and account details never leave this device."
- **"See exactly what's sent"**: the summary JSON for this month, rendered as a readable table plus the raw JSON.
- Turn on / turn off. Turning off deletes the install token. A note that Anthropic's API data policy applies to what's sent (link).
- Off again after "Delete everything" and after restoring a backup (the token isn't backed up).

## 7. Tests required before E8-S2 ships

- Summary: allow-list only; custom category → `"other"`; no notes/merchants/names in any field (property test over random states).
- Citation checker: matching figures kept; mismatched and unbacked amounts removed.
- Proxy: rejects oversize bodies, wrong origin, missing token, extra fields; never logs bodies; handles `stop_reason: "refusal"`.
- Browser: coach hidden until opt-in; payload shown equals payload sent; offline → friendly message; 0 CSP violations with the one new origin.

## 8. Decisions needed from the owner (blocking E8-S1/S2)

1. **Go / no-go:** accept one outside connection (changes "no network calls" in SECURITY.md §2.6 to "none unless you turn on the AI coach").
2. **Accounts:** a Cloudflare account for the Worker, and an Anthropic API key with a **monthly spend limit** you set.
3. **Model:** `claude-opus-5-5` (recommended default above), or a cheaper model if you prefer lower cost per question.
4. **Limits:** daily questions per install (suggested 20) and the monthly spend cap.
