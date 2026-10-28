#!/usr/bin/env bash
# Security guardrails for Budget Manager (see docs/SECURITY.md).
# Runs locally (`bash scripts/check-security.sh`) and in CI on every PR.
#
# To allow a flagged line on purpose, add a comment on that line:
#   // security-allow: <reason>
# Every allowance is visible in review, so it needs a real reason.

set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
report() { echo "❌ $1"; echo "$2" | sed 's/^/   /'; echo; fail=1; }

js_files=$(find . -name '*.js' -not -path './node_modules/*' -not -path './.git/*' -not -path './tests/*' 2>/dev/null)
html_files=$(find . -name '*.html' -not -path './node_modules/*' -not -path './.git/*' 2>/dev/null)

scan() { # $1 = regex, $2 = files, $3 = extra grep flags (optional)
  local files
  files=$(echo $2)                 # trim whitespace
  [ -z "$files" ] && return 0      # no files → nothing to scan (grep would read stdin)
  # shellcheck disable=SC2086
  grep -HnE ${3:-} "$1" $files </dev/null 2>/dev/null | grep -v 'security-allow:' || true
}

# 1. Dangerous DOM / code-execution APIs (XSS risk) — use utils/dom.js + textContent.
hits=$(scan '\.(innerHTML|outerHTML)[[:space:]]*\+?=|insertAdjacentHTML|document\.write|\beval[[:space:]]*\(|new[[:space:]]+Function[[:space:]]*\(|set(Timeout|Interval)[[:space:]]*\([[:space:]]*["'"'"'`]' "$js_files $html_files")
[ -n "$hits" ] && report "Banned DOM/code-execution API (use textContent / utils/dom.js)" "$hits"

# 2. Network calls — data must stay on the device. Only sw.js may fetch (same-origin cache).
hits=$(scan '\bfetch[[:space:]]*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon' "$(echo "$js_files" | grep -v '^\./sw\.js$')")
[ -n "$hits" ] && report "Network call outside sw.js (data must stay on device)" "$hits"

# 3. HTML: inline scripts, inline event handlers, third-party resources, missing CSP.
for f in $html_files; do
  hits=$(awk 'tolower($0) ~ /<script/ && tolower($0) !~ /src=/ && $0 !~ /security-allow:/ {print FILENAME":"NR": "$0}' "$f")
  [ -n "$hits" ] && report "Inline <script> (CSP forbids it — move to a .js file)" "$hits"

  hits=$(grep -HnE '<[a-zA-Z][^>]*[[:space:]]on[a-z]+[[:space:]]*=' "$f" | grep -v 'security-allow:' || true)
  [ -n "$hits" ] && report "Inline event handler in $f (use addEventListener)" "$hits"

  hits=$(grep -HniE '<(script|link|img|iframe)[^>]*(src|href)=["'"'"']?(https?:)?//' "$f" | grep -v 'security-allow:' || true)
  [ -n "$hits" ] && report "Third-party resource in $f (no CDNs/external files)" "$hits"

  grep -q 'Content-Security-Policy' "$f" || report "Missing CSP <meta> in $f" "Copy the policy from docs/SECURITY.md §2.1"
done

# 4. Obvious secrets (GitHub push protection is the main guard; this is a backstop).
hits=$(scan '(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_\-]{12,}' "$js_files $html_files" -i)
[ -n "$hits" ] && report "Possible hard-coded secret" "$hits"

if [ "$fail" -eq 0 ]; then
  echo "✅ Security checks passed"
else
  echo "Security checks failed. See docs/SECURITY.md."
fi
exit "$fail"
