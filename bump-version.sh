#!/bin/bash
# Bump the app version and service-worker cache name together.
#
# These two must always move as a pair: the version is what Settings shows,
# the cache name is what forces installed apps to refetch. Five consecutive
# bumps once silently no-opped because each edit searched for the PREVIOUS
# version string, which a missed edit had already left stale — so this
# matches on the SHAPE of the value and fails loudly if it cannot.
set -euo pipefail
V="${1:-$(date +%Y.%m.%d)}"
cd "$(dirname "$0")/docs"
python3 - "$V" <<'PY'
import re, sys
v = sys.argv[1]
for path, pat in [("js/app.js", r"export const VERSION = '([^']+)'"),
                  ("sw.js",     r"const CACHE = 'basal-([^']+)'")]:
    s = open(path).read()
    m = re.search(pat, s)
    if not m:
        sys.exit(f"FAILED: no version string in {path}")
    print(f"  {path}: {m.group(1)} -> {v}")
    open(path, "w").write(s[:m.start(1)] + v + s[m.end(1):])
PY
