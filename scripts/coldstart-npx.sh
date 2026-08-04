#!/usr/bin/env bash
# Cold start, Node path: does the `hunt-app` launcher reach a working app on a
# machine with nothing but Node?
#
# It runs the launcher against a throwaway data directory, which is the part
# worth proving — that a first boot with no database, no keys and no config
# reaches a page rather than a stack trace. The build itself is assumed present
# (`pnpm build`), because that is what the published package would ship and what
# the launcher refuses to run without.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${HUNT_PORT:-3210}"
DATA_DIR="$(mktemp -d)/hunt-data"

cleanup() {
  [[ -n "${APP_PID:-}" ]] && kill "$APP_PID" 2>/dev/null || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

echo "→ cold start (node) on port $PORT, data in $DATA_DIR"

if [[ ! -d "$ROOT/.next" ]]; then
  echo "✗ no build present — run \`pnpm build\` first" >&2
  exit 1
fi

HUNT_DATA_DIR="$DATA_DIR" PORT="$PORT" node "$ROOT/bin/hunt-app.mjs" >/tmp/hunt-coldstart-npx.log 2>&1 &
APP_PID=$!

echo "→ waiting for the app to answer"
for _ in $(seq 1 45); do
  # 3xx counts: a first boot redirects to /onboarding, which is the app working.
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
  case "$code" in
    2*|3*) echo "→ answered $code"; break ;;
  esac
  sleep 1
done

if [[ ! "${code:-}" =~ ^[23] ]]; then
  echo "✗ never answered (last: ${code:-none})" >&2
  tail -30 /tmp/hunt-coldstart-npx.log >&2
  exit 1
fi

if [[ ! -f "$DATA_DIR/hunt.db" ]]; then
  echo "✗ no database was created in $DATA_DIR — the app booted but never migrated" >&2
  exit 1
fi

# The launcher's own contract: the data directory is the one it was told to use,
# not the working directory. A regression here scatters databases across
# wherever the user happened to run npx from.
echo "✓ node cold start reached a working app, database in the requested directory"
