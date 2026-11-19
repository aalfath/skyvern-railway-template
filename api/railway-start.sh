#!/bin/bash
# Start script for the Skyvern API on Railway.
# Sets the defaults upstream's docker-compose.yml sets, picks the LLM provider from the
# API keys you set, starts the artifact/bootstrap server, then runs upstream's entrypoint
# (database check, alembic migrations, first organization + API key, Xvfb, API server).
set -e

# Fixed settings from upstream's docker-compose.yml. Every one can be overridden with a variable.
export ENV="${ENV:-local}"
export SKYVERN_DEV_NO_RELOAD="${SKYVERN_DEV_NO_RELOAD:-true}"   # no uvicorn auto-reload in a server
export PORT="${SKYVERN_API_PORT:-8000}"   # fixed: the UI and gateway reach the API on 8000
export BROWSER_TYPE="${BROWSER_TYPE:-chromium-headful}"
export BROWSER_STREAMING_MODE="${BROWSER_STREAMING_MODE:-cdp}"
export ENABLE_CODE_BLOCK="${ENABLE_CODE_BLOCK:-true}"
export CREDENTIAL_VAULT_TYPE="${CREDENTIAL_VAULT_TYPE:-skyvern}"
export ENABLE_LOCAL_CREDENTIAL_VAULT="${ENABLE_LOCAL_CREDENTIAL_VAULT:-true}"
export MAX_STEPS_PER_RUN="${MAX_STEPS_PER_RUN:-50}"

# Everything Skyvern writes lives on the /data volume.
export DATA_ROOT="${DATA_ROOT:-/data}"
export ARTIFACT_STORAGE_PATH="${ARTIFACT_STORAGE_PATH:-$DATA_ROOT/artifacts}"
export VIDEO_PATH="${VIDEO_PATH:-$DATA_ROOT/videos}"
export HAR_PATH="${HAR_PATH:-$DATA_ROOT/har}"
export LOG_PATH="${LOG_PATH:-$DATA_ROOT/log}"
export DOWNLOAD_PATH="${DOWNLOAD_PATH:-$DATA_ROOT/downloads}"
export BROWSER_SESSION_BASE_PATH="${BROWSER_SESSION_BASE_PATH:-$DATA_ROOT/browser_sessions}"
export LOCAL_CREDENTIAL_VAULT_PATH="${LOCAL_CREDENTIAL_VAULT_PATH:-$DATA_ROOT/credential_vault}"
export SKYVERN_CREDENTIALS_FILE="${SKYVERN_CREDENTIALS_FILE:-$DATA_ROOT/.skyvern/credentials.toml}"
mkdir -p "$ARTIFACT_STORAGE_PATH" "$VIDEO_PATH" "$HAR_PATH" "$LOG_PATH" "$DOWNLOAD_PATH" \
  "$BROWSER_SESSION_BASE_PATH" "$LOCAL_CREDENTIAL_VAULT_PATH" "$(dirname "$SKYVERN_CREDENTIALS_FILE")"

# At-rest encryption (needed by the Google integrations) when a key is set.
if [ -n "$ENCRYPTOR_AES_SECRET_KEY" ]; then
  export ENABLE_ENCRYPTION="${ENABLE_ENCRYPTION:-true}"
fi

# LLM providers: enable each provider whose API key is set, and pick a default model
# from the first one available unless LLM_KEY is set. With no key at all Skyvern still
# starts; add a model later in the UI under Settings > Custom LLMs.
first_llm=""
second_llm=""
if [ -n "$OPENAI_API_KEY" ]; then
  export ENABLE_OPENAI="${ENABLE_OPENAI:-true}"
  [ -z "$first_llm" ] && first_llm="OPENAI_GPT5_5" && second_llm="OPENAI_GPT5_4_MINI"
fi
if [ -n "$ANTHROPIC_API_KEY" ]; then
  export ENABLE_ANTHROPIC="${ENABLE_ANTHROPIC:-true}"
  [ -z "$first_llm" ] && first_llm="ANTHROPIC_CLAUDE4.6_SONNET" && second_llm="ANTHROPIC_CLAUDE4.5_HAIKU"
fi
if [ -n "$GEMINI_API_KEY" ]; then
  export ENABLE_GEMINI="${ENABLE_GEMINI:-true}"
  [ -z "$first_llm" ] && first_llm="GEMINI_3.0_FLASH"
fi
if [ -n "$OPENROUTER_API_KEY" ] && [ -n "$OPENROUTER_MODEL" ]; then
  export ENABLE_OPENROUTER="${ENABLE_OPENROUTER:-true}"
  [ -z "$first_llm" ] && first_llm="OPENROUTER"
fi
if [ -z "$LLM_KEY" ] && [ -n "$first_llm" ]; then
  export LLM_KEY="$first_llm"
  if [ -z "$SECONDARY_LLM_KEY" ] && [ -n "$second_llm" ]; then
    export SECONDARY_LLM_KEY="$second_llm"
  fi
fi
if [ -n "$LLM_KEY" ]; then
  echo "Skyvern LLM: LLM_KEY=$LLM_KEY${SECONDARY_LLM_KEY:+, SECONDARY_LLM_KEY=$SECONDARY_LLM_KEY}"
else
  echo "Skyvern LLM: no provider key set. Add a model in Settings > Custom LLMs, or set OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY on this service."
fi

# Wait for Postgres (Railway starts all services together; migrations need the database).
python - <<'PY'
import os, socket, sys, time
from sqlalchemy.engine import make_url
u = make_url(os.environ.get("DATABASE_STRING", ""))
if not u.host:
    sys.exit(0)
deadline = time.time() + 300
while True:
    try:
        socket.create_connection((u.host, u.port or 5432), timeout=5).close()
        print(f"Postgres at {u.host}:{u.port or 5432} is reachable")
        break
    except OSError as e:
        if time.time() > deadline:
            print(f"Postgres not reachable after 300 s: {e}")
            sys.exit(1)
        print(f"Waiting for Postgres at {u.host}:{u.port or 5432} ({e})")
        time.sleep(3)
PY

# Artifact + bootstrap server (port 9090, private network only; the gateway routes /artifact/* to it).
node /app/railway-aux-server.mjs &

cd /app
exec /bin/bash /app/entrypoint-skyvern.sh
