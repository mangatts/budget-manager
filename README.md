# Budget Manager

A simple, private app for your credit cards and monthly cash flow. Enter your income, your fixed expenses, and your cards once. Then check in with a date and each card's balance, and Home tells you:

- how much you bring in each month, after fixed expenses and card minimums
- **what to pay on each card this month** (minimums on every card, the rest to the highest interest rate)
- which bills to keep paying
- how your card debt is changing, and roughly when you'll be debt-free

It runs offline, installs like an app, and keeps your data on your device. No accounts, no bank logins, no card numbers.

Sharing a device? Add people in **More → People** (for example Charles and Albin). Each person gets their own cards, income, expenses and check-ins, and you switch between them in one tap.

**Live app:** https://mangatts.github.io/budget-manager/

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security plan (NIST-aligned)](docs/SECURITY.md)
- [Backlog](docs/BACKLOG.md)

> The earlier, bigger version (spending entries, tips, statement import, What-If) is kept in the git tag [`v1-full-budget-manager`](https://github.com/mangatts/budget-manager/tree/v1-full-budget-manager). When someone opens the new app, their old debts, bills, and take-home pay carry over automatically.

## Run locally

No install needed, just Python 3 (built into macOS) and, for tests, Node.js.

```bash
npm start          # serves the app at http://127.0.0.1:5500 (this computer only)
npm test           # unit tests (Node's built-in test runner)
npm run check      # security guardrails (same as CI)
npm run e2e        # browser checks at phone size (needs Chrome and npm start)
```

Without npm: `python3 -m http.server 5500 --bind 127.0.0.1`

> Don't open `index.html` directly as a `file://` URL. Browser storage and offline support only work reliably over `http://localhost` or HTTPS.
>
> The server only listens on `127.0.0.1` on purpose, so other devices on your Wi-Fi can't reach it. To try the app on your phone, use the GitHub Pages site.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All changes go through a pull request with security checks.
