#!/usr/bin/env bash
# PulseWatch smoke test.
#
# Drives the full demo loop against a running stack:
#   healthy target UP -> flaky DEGRADED -> DOWN + incident -> acknowledge
#   -> recovery -> incident RESOLVED -> metrics -> pause/resume
#
# Requires the demo profile:
#   docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile demo up --build -d
#   docker compose exec -T api node dist/database/seed.js
set -euo pipefail

API="${API_URL:-http://localhost:3001/api/v1}"
FLAKY="${FLAKY_URL:-http://localhost:8082}"
EMAIL="${ADMIN_EMAIL:-admin@pulsewatch.local}"
PASSWORD="${ADMIN_PASSWORD:-AdminPass123!}"

pass() { printf '  [ok]   %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1" >&2; exit 1; }
step() { printf '\n== %s\n' "$1"; }

# Minimal JSON reader so the script needs no jq.
jsonpath() { node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let value;
    try { value = JSON.parse(raw); } catch { process.stdout.write(""); return; }
    for (const key of process.argv[1].split(".")) {
      if (value === null || value === undefined) break;
      value = Array.isArray(value) && /^\d+$/.test(key) ? value[Number(key)] : value[key];
    }
    process.stdout.write(value === undefined || value === null ? "" : String(value));
  });' "$1"; }

get()  { curl -sS -H "authorization: Bearer $TOKEN" "$API$1"; }
post() {
  local body="${2-}"
  [ -n "$body" ] || body='{}'
  curl -sS -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d "$body" "$API$1"
}

check_now() {
  local response
  response=$(post "/targets/$1/check-now")
  local code
  code=$(jsonpath statusCode <<<"$response")
  [ -z "$code" ] || fail "check-now failed: $response"
}

step 'Liveness and readiness'
[ "$(curl -sS "$API/health" | jsonpath status)" = 'ok' ] || fail 'liveness'
pass 'GET /health returns ok'
[ "$(curl -sS "$API/health/ready" | jsonpath status)" = 'ready' ] || fail 'readiness'
pass 'GET /health/ready reports database + scheduler'

step 'Authentication'
TOKEN=$(curl -sS -X POST -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "$API/auth/login" | jsonpath accessToken)
[ -n "$TOKEN" ] || fail 'login did not return a token'
pass 'admin login'
[ "$(get /auth/me | jsonpath role)" = 'ADMIN' ] || fail '/auth/me role'
pass 'GET /auth/me returns ADMIN'

step 'SSRF defence'
BLOCKED=$(post /targets '{"name":"blocked scheme","url":"file:///etc/passwd"}' | jsonpath statusCode)
[ "$BLOCKED" = '400' ] || fail "blocked scheme should be rejected (got $BLOCKED)"
pass 'file:// target rejected'
CREDS=$(post /targets '{"name":"creds","url":"https://user:pw@example.com/"}' | jsonpath statusCode)
[ "$CREDS" = '400' ] || fail "credentialed URL should be rejected (got $CREDS)"
pass 'URL with credentials rejected'

step 'Locate demo targets'
TARGETS=$(get '/targets?limit=50')
HEALTHY_ID=$(node -e '
  let raw=""; process.stdin.on("data",c=>raw+=c); process.stdin.on("end",()=>{
    const t=JSON.parse(raw).items.find(x=>x.name==="Demo healthy service");
    process.stdout.write(t?t.id:"");});' <<<"$TARGETS")
FLAKY_ID=$(node -e '
  let raw=""; process.stdin.on("data",c=>raw+=c); process.stdin.on("end",()=>{
    const t=JSON.parse(raw).items.find(x=>x.name==="Demo flaky service");
    process.stdout.write(t?t.id:"");});' <<<"$TARGETS")
[ -n "$HEALTHY_ID" ] && [ -n "$FLAKY_ID" ] || fail 'demo targets not seeded'
pass "healthy=$HEALTHY_ID flaky=$FLAKY_ID"

step 'Healthy target becomes UP'
check_now "$HEALTHY_ID"
[ "$(get "/targets/$HEALTHY_ID" | jsonpath status)" = 'UP' ] || fail 'healthy target not UP'
pass 'healthy target is UP'

step 'Failure thresholds: DEGRADED -> DOWN + incident'
curl -sS "$FLAKY/admin/heal" >/dev/null
check_now "$FLAKY_ID"
curl -sS "$FLAKY/admin/fail" >/dev/null

check_now "$FLAKY_ID"
[ "$(get "/targets/$FLAKY_ID" | jsonpath status)" = 'DEGRADED' ] || fail 'failure 1 should be DEGRADED'
pass 'failure 1/3 -> DEGRADED'

check_now "$FLAKY_ID"
[ "$(get "/targets/$FLAKY_ID" | jsonpath status)" = 'DEGRADED' ] || fail 'failure 2 should be DEGRADED'
pass 'failure 2/3 -> DEGRADED'

check_now "$FLAKY_ID"
[ "$(get "/targets/$FLAKY_ID" | jsonpath status)" = 'DOWN' ] || fail 'failure 3 should be DOWN'
pass 'failure 3/3 -> DOWN'

INCIDENT_ID=$(get "/incidents?targetId=$FLAKY_ID&status=OPEN" | jsonpath items.0.id)
[ -n "$INCIDENT_ID" ] || fail 'no incident opened at the failure threshold'
pass "incident opened: $INCIDENT_ID"

step 'Incident acknowledgement and notes'
[ "$(post "/incidents/$INCIDENT_ID/acknowledge" | jsonpath status)" = 'ACKNOWLEDGED' ] || fail 'acknowledge'
pass 'incident acknowledged'
post "/incidents/$INCIDENT_ID/notes" '{"content":"Smoke test note: demo-flaky forced to 503."}' >/dev/null
[ -n "$(get "/incidents/$INCIDENT_ID" | jsonpath notes.0.id)" ] || fail 'note not stored'
pass 'incident note added'

step 'Recovery threshold resolves the incident'
curl -sS "$FLAKY/admin/heal" >/dev/null
check_now "$FLAKY_ID"
[ "$(get "/targets/$FLAKY_ID" | jsonpath status)" = 'DOWN' ] || fail 'success 1 should still be DOWN'
pass 'success 1/2 -> still DOWN (recovery pending)'

check_now "$FLAKY_ID"
[ "$(get "/targets/$FLAKY_ID" | jsonpath status)" = 'UP' ] || fail 'success 2 should be UP'
pass 'success 2/2 -> UP'
[ "$(get "/incidents/$INCIDENT_ID" | jsonpath status)" = 'RESOLVED' ] || fail 'incident not resolved'
pass 'incident resolved automatically'

step 'Metrics'
METRICS=$(get "/targets/$FLAKY_ID/metrics?window=24h")
TOTAL=$(jsonpath uptime.totalChecks <<<"$METRICS")
UPTIME=$(jsonpath uptime.uptimePercent <<<"$METRICS")
[ -n "$TOTAL" ] && [ "$TOTAL" -gt 0 ] || fail 'metrics reported no samples'
pass "24h uptime ${UPTIME}% over ${TOTAL} checks"
[ -n "$(get '/dashboard/summary' | jsonpath totalTargets)" ] || fail 'dashboard summary'
pass 'dashboard summary responds'

step 'Pause and resume'
[ "$(post "/targets/$FLAKY_ID/pause" | jsonpath status)" = 'PAUSED' ] || fail 'pause'
pass 'target paused'
PAUSED_CHECK=$(post "/targets/$FLAKY_ID/check-now" | jsonpath statusCode)
[ "$PAUSED_CHECK" = '409' ] || fail "paused target should not be checkable (got $PAUSED_CHECK)"
pass 'paused target refuses check-now (409)'
[ "$(post "/targets/$FLAKY_ID/resume" | jsonpath status)" = 'UNKNOWN' ] || fail 'resume'
pass 'target resumed'

step 'Scheduler runs checks on its own'
# Regression guard: every assertion above uses check-now, which would still
# pass if the scheduler's due-target query were broken. This proves the timer
# path works too.
BEFORE_CHECK=$(get "/targets/$FLAKY_ID" | jsonpath lastCheckedAt)
printf '  ...  waiting up to 75s for a scheduled check\n'
SCHEDULED=false
for _ in $(seq 1 15); do
  sleep 5
  AFTER_CHECK=$(get "/targets/$FLAKY_ID" | jsonpath lastCheckedAt)
  if [ -n "$AFTER_CHECK" ] && [ "$AFTER_CHECK" != "$BEFORE_CHECK" ]; then
    SCHEDULED=true
    break
  fi
done
[ "$SCHEDULED" = 'true' ] || fail 'scheduler never checked the target on its own'
pass 'scheduler-driven check observed'

step 'Archive'
[ "$(post "/targets/$HEALTHY_ID/archive" | jsonpath archived)" = 'true' ] || fail 'archive'
pass 'healthy target archived'
post "/targets/$HEALTHY_ID/resume" >/dev/null || true

printf '\nAll smoke checks passed.\n'
