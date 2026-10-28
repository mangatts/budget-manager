# Contributing

## Workflow

`main` is protected: **all changes go through a pull request**, and nobody pushes to it directly.

1. **Pick a story** from the board / [docs/BACKLOG.md](docs/BACKLOG.md).
2. **Branch** from `main`, named `<type>/<story>-<short-name>`:
   - `feat/E1-S3-add-expense`, `fix/E2-S3-restore-crash`, `chore/E0-ci`, `docs/insights-benchmarks`
3. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add expense form`, `fix: reject negative amounts`, `docs: …`, `test: …`, `chore: …`, `security: …`
4. **Check locally** before pushing:
   ```bash
   bash scripts/check-security.sh
   node --test tests/        # once tests exist
   ```
5. **Open a PR** and fill in the template checklist.
6. **Review:** run `/code-review` and `/security-review` in Claude Code, then fix the findings or ticket them.
7. **Merge** once CI is green and all conversations are resolved. PRs are **squash-merged** and the branch is deleted automatically.

## Rules enforced on `main`

| Rule | Why |
|---|---|
| Pull request required | Every change gets reviewed and checked |
| Required checks: `checks`, `dependency-review` | Security guardrails, JS syntax, unit tests, vulnerable dependencies |
| Branch must be up to date with `main` | Checks run against the real result of merging |
| All review conversations resolved | Nothing is left unanswered |
| Squash merge only + linear history | One clean commit per story, easy to revert |
| No force-push, no branch deletion | History can't be rewritten or lost |
| Secret scanning + push protection | Blocks commits containing keys or tokens |
| Dependabot alerts + security updates | Flags and fixes vulnerable dependencies |
| Actions pinned to commit SHAs, read-only token | Supply-chain hardening (NIST SSDF PS/PW) |

## Coding rules (short version)

- No `innerHTML`, `eval`, inline scripts, or inline event handlers. Build DOM with `utils/dom.js`.
- No third-party runtime code, CDNs, or network calls.
- All outside data (forms, CSV, backups) goes through `validate.js`.
- Money is stored as integer cents. Show it with `formatCents()` from `utils/money.js`.
- Styling: use the tokens in `css/tokens.css` and the classes in `css/components.css`. Never hard-code a color (a test enforces this). Check new UI on `#/design`, in both themes, at Extra large text.
- Keep PRs small (aim for < 400 changed lines).
- Never use real financial data in tests, fixtures, or screenshots.
