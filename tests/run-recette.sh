#!/usr/bin/env bash
# Runs the whole acceptance book against a deployed stack, one pass per group, and keeps
# each pass's JSON report in test-results/runs/ (input of tests/report/build-report.mjs).
#   RECETTE_WEB=http://localhost:13000 RECETTE_API=http://localhost:14000/api bash tests/run-recette.sh [groups...]
set -u
export RECETTE_WEB="${RECETTE_WEB:-http://localhost:13000}" RECETTE_API="${RECETTE_API:-http://localhost:14000/api}"
mkdir -p test-results/runs
groups=("${@:-smoke api ai perf desktop responsive}")
[ $# -eq 0 ] && groups=(smoke api ai perf desktop responsive)
n=1
for g in "${groups[@]}"; do
  case "$g" in
    smoke|api|ai|perf) args=(--project=api "tests/e2e/$g.spec.ts") ;;
    desktop) args=(--project=desktop) ;;
    responsive) args=(--project=tablet --project=mobile) ;;
    *) echo "unknown group $g"; continue ;;
  esac
  echo "=== $g"
  npx playwright test -c tests "${args[@]}" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^\s+(x|-) |^\s+[0-9]+ (passed|failed|skipped|did not run|flaky)"
  cp test-results/recette.json "test-results/runs/$n-$g.json"
  n=$((n + 1))
done
echo "=== done"
