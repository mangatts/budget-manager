# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report it privately through **GitHub → Security → Report a vulnerability** on this repository. Include:
- What the problem is and its impact
- Steps to reproduce (a sample CSV or backup file is helpful; **never include real financial data**)
- The browser and device you used

You'll get an acknowledgement within 7 days. Confirmed issues are fixed, covered by a regression test, and released as soon as possible.

## Supported versions

Only the latest version on `main` (the live GitHub Pages site) is supported.

## Design

Budget Manager has no server and no accounts, and your data never leaves your device. See [docs/SECURITY.md](../docs/SECURITY.md) for the full security plan (NIST CSF 2.0 / SSDF-aligned).
