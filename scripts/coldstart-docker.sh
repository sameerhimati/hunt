#!/usr/bin/env bash
# Cold start, Docker path: does `docker compose up` on a clean machine reach a
# working app?
#
# "Clean" is the whole point, so this refuses to reuse anything — no cached
# data directory, no previously built image layers of hunt's own stage. What it
# is proving is the sentence in the README: clone, compose up, open the browser.
# A run that passes because the last run left something behind proves nothing.
set -euo pipefail

PORT="${HUNT_PORT:-3000}"
DATA_DIR="$(mktemp -d)/hunt-data"
COMPOSE_PROJECT="hunt-coldstart-$$"

cleanup() {
  docker compose -p "$COMPOSE_PROJECT" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

echo "→ cold start (docker) on port $PORT, data in $DATA_DIR"
mkdir -p "$DATA_DIR"

HUNT_PORT="$PORT" HUNT_DATA_DIR="$DATA_DIR" \
  docker compose -p "$COMPOSE_PROJECT" up --build --detach

echo "→ waiting for the app to answer"
for _ in $(seq 1 90); do
  # A redirect is success, not failure: a first boot with no data sends the user
  # to /onboarding, so 200 and 3xx both mean the server is up and routing.
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
  case "$code" in
    2*|3*) echo "→ answered $code"; break ;;
  esac
  sleep 2
done

if [[ ! "${code:-}" =~ ^[23] ]]; then
  echo "✗ never answered (last: ${code:-none})" >&2
  docker compose -p "$COMPOSE_PROJECT" logs --tail 50 >&2
  exit 1
fi

# The database migrates itself on first query, so a working app must have
# written one. This catches the failure where the server boots and every page
# 500s underneath it.
if [[ ! -f "$DATA_DIR/hunt.db" ]]; then
  echo "✗ no database was created in $DATA_DIR — the app booted but never migrated" >&2
  exit 1
fi

echo "✓ docker cold start reached a working app"
