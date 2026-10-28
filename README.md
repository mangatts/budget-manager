# Budget Manager

A personal budget manager built with plain HTML, CSS, and JavaScript. It runs offline, installs like an app, and stores data on your device so it doesn't reset.

- [Architecture](docs/ARCHITECTURE.md)
- [Smart Coach / insights](docs/INSIGHTS.md)
- [Security plan (NIST-aligned)](docs/SECURITY.md)
- [Agile backlog & sprints](docs/BACKLOG.md)

## Run locally

```bash
python3 -m http.server 5500
# open http://localhost:5500
```

> Don't open `index.html` directly as a `file://` URL. Browser storage and offline support only work reliably over `http://localhost` or HTTPS.
