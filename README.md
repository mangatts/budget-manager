# Budget Manager

A personal budget manager built with plain HTML, CSS, and JavaScript. It runs offline, installs like an app, and stores data on your device so it doesn't reset.

- [Architecture](docs/ARCHITECTURE.md)
- [Smart Coach / insights](docs/INSIGHTS.md)
- [Security plan (NIST-aligned)](docs/SECURITY.md)
- [Agile backlog & sprints](docs/BACKLOG.md)

## Run locally

No install needed, just Python 3 (built into macOS) and, for tests, Node.js.

```bash
npm start          # serves the app at http://127.0.0.1:5500 (this computer only)
npm test           # unit tests (Node's built-in test runner)
npm run check      # security guardrails (same as CI)
```

Without npm: `python3 -m http.server 5500 --bind 127.0.0.1`

> Don't open `index.html` directly as a `file://` URL. Browser storage and offline support only work reliably over `http://localhost` or HTTPS.
>
> The server only listens on `127.0.0.1` on purpose, so other devices on your Wi-Fi can't reach it. To try the app on your phone, use the GitHub Pages site.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All changes go through a pull request with security checks.
