#!/bin/bash
# Start script for the Skyvern UI on Railway.
set -e

# Public URLs the browser uses, all on the gateway's domain.
PUBLIC_URL="${SKYVERN_PUBLIC_URL%/}"
if [ -n "$PUBLIC_URL" ]; then
  WS_URL="${PUBLIC_URL/#https:/wss:}"
  WS_URL="${WS_URL/#http:/ws:}"
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-$PUBLIC_URL/api/v1}"
  export VITE_WSS_BASE_URL="${VITE_WSS_BASE_URL:-$WS_URL/api/v1}"
  export VITE_ARTIFACT_API_BASE_URL="${VITE_ARTIFACT_API_BASE_URL:-$PUBLIC_URL}"
fi
export VITE_BROWSER_STREAMING_MODE="${VITE_BROWSER_STREAMING_MODE:-cdp}"
export VITE_ENABLE_CODE_BLOCK="${VITE_ENABLE_CODE_BLOCK:-true}"
export VITE_ENABLE_LOG_ARTIFACTS="${VITE_ENABLE_LOG_ARTIFACTS:-false}"
export VITE_ENABLE_2FA_NOTIFICATIONS="${VITE_ENABLE_2FA_NOTIFICATIONS:-true}"
export VITE_ENVIRONMENT="${VITE_ENVIRONMENT:-local}"

# The UI server needs the organization API key that the API creates on its first start.
# Until it's available, serve a "starting" page on 8080 (so the health check passes), then hand over.
if [ -z "$SKYVERN_API_KEY" ]; then
  SKYVERN_API_KEY="$(node /app/railway-wait.mjs)"
  export SKYVERN_API_KEY
fi

cd /app
exec /bin/bash /app/entrypoint-skyvernui.sh
