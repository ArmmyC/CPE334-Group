#!/usr/bin/env bash
# Lab 5, SDS section 10: read-only smoke test of a deployed instance.
# Usage: BASE_URL=https://... SMOKE_EMAIL=... SMOKE_PASSWORD=... infra/smoke.sh
# It sends no Origin header, so the API origin check does not apply. It uses the dedicated
# smoke borrower only and changes no business data. The password is never printed.
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${SMOKE_EMAIL:?SMOKE_EMAIL is required}"
: "${SMOKE_PASSWORD:?SMOKE_PASSWORD is required}"
BASE_URL="${BASE_URL%/}"
jar="$(mktemp)"
trap 'rm -f "$jar"' EXIT

fail=0
check() { # label, expected status, actual status
  if [ "$2" = "$3" ]; then echo "ok   $1 ($3)"; else echo "FAIL $1: expected $2, got $3"; fail=1; fi
}
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 -b "$jar" -c "$jar" "$@"; }

check "GET /api/health" 200 "$(status "$BASE_URL/api/health")"
check "GET /api/ready" 200 "$(status "$BASE_URL/api/ready")"
check "GET / (SPA)" 200 "$(status "$BASE_URL/")"

# The credentials reach jq through its environment and curl through stdin, so the password
# never appears in a process argument list.
body="$(SMOKE_EMAIL="$SMOKE_EMAIL" SMOKE_PASSWORD="$SMOKE_PASSWORD" jq -n '{email:env.SMOKE_EMAIL,password:env.SMOKE_PASSWORD}')"
check "POST /api/auth/login" 200 "$(printf '%s' "$body" | status -X POST -H 'Content-Type: application/json' -d @- "$BASE_URL/api/auth/login")"
check "GET /api/equipment-types" 200 "$(status "$BASE_URL/api/equipment-types")"
check "POST /api/auth/logout" 204 "$(status -X POST "$BASE_URL/api/auth/logout")"

if [ "$fail" -ne 0 ]; then echo "Smoke test failed."; exit 1; fi
echo "Smoke test passed."
