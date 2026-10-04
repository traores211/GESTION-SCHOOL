#!/bin/sh
# Runs every end-to-end script against the running API and prints a summary.
#   docker compose exec backend sh test/run-e2e.sh
cd "$(dirname "$0")/.." || exit 1
failed=0
for name in e2e-auth e2e-audit e2e-admissions e2e-planning e2e-tenancy e2e-records e2e-payments e2e-messaging e2e-privacy e2e-imports e2e-bulletins e2e-portal e2e-insights e2e-discipline e2e-family e2e-platform e2e-teacher-scope e2e-group e2e-files e2e-documents e2e-promotion e2e-gate e2e-smart-entry e2e-showcase e2e-dashboards e2e-pupil e2e-supervision e2e-leaks; do
  if timeout 300 node "test/$name.js" > "/tmp/$name.log" 2>&1; then
    echo "OK    $name ($(grep -c '✔' "/tmp/$name.log") vérifications)"
  else
    echo "ÉCHEC $name"
    grep -E '✘|Error' "/tmp/$name.log" | head -8
    failed=1
  fi
done
exit $failed
