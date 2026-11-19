#!/bin/sh
# Hashes the gateway password, then starts Caddy with the Caddyfile.
set -e
: "${SKYVERN_USERNAME:?SKYVERN_USERNAME is required}"
: "${SKYVERN_PASSWORD:?SKYVERN_PASSWORD is required}"
: "${UI_UPSTREAM:?UI_UPSTREAM is required}"
: "${API_UPSTREAM:?API_UPSTREAM is required}"
: "${ARTIFACT_UPSTREAM:?ARTIFACT_UPSTREAM is required}"
export PORT="${GATEWAY_PORT:-8080}"   # fixed: the public domain targets 8080
SKYVERN_PASSWORD_HASH="$(caddy hash-password --plaintext "$SKYVERN_PASSWORD")"
export SKYVERN_PASSWORD_HASH
unset SKYVERN_PASSWORD
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
