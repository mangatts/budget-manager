## What & why
<!-- What does this PR change, and which story does it complete? -->
Story: E?-S?

## How to test
<!-- Steps a reviewer can follow on a phone and a desktop. -->
1.

## Screenshots
<!-- Required for UI changes: phone + desktop, light + dark. -->

---

## Definition of Done (docs/BACKLOG.md)
- [ ] Acceptance criteria met
- [ ] Works on phone (Safari + Chrome) and desktop
- [ ] Works offline (from Sprint 2)
- [ ] Data survives refresh + browser restart
- [ ] Unit tests added/updated for logic (validation, insights, crypto, parsers)

## Security (docs/SECURITY.md §5)
- [ ] No `innerHTML` / `eval` / inline scripts or handlers (`bash scripts/check-security.sh` passes)
- [ ] CSP unchanged, or the change is explained above
- [ ] All new inputs go through `validate.js`, with tests
- [ ] No secrets, keys, or personal/financial data in code, tests, or screenshots
- [ ] No new third-party runtime code or network calls
- [ ] `/security-review` run, with findings fixed or ticketed

## Accessibility
- [ ] Keyboard usable, visible focus
- [ ] Screen-reader labels on controls and icons
- [ ] Tap targets ≥ 48px, AA contrast, no color-only meaning
- [ ] Works at "Extra Large" text size

## Review
- [ ] `/code-review` run, with findings addressed
- [ ] PR is small and focused (aim for < 400 changed lines)
