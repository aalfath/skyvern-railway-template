[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/skyvern-1?utm_medium=integration&utm_source=button&utm_campaign=skyvern)

# Skyvern on Railway

One-click Railway template for [Skyvern](https://github.com/Skyvern-AI/skyvern) **v1.0.58**, an open-source tool that automates browser workflows with LLMs and computer vision.

## What it deploys

| Service | Built from | What it does |
|---|---|---|
| `Skyvern` | `gateway/` (Caddy 2.11.9) | Public entry point on port 8080. Asks for a username and password before the web UI (Skyvern's UI has no login of its own), routes `/api/*`, `/v1/*`, `/v2/*` and WebSocket streams to the API, and `/artifact/*` to the artifact server. |
| `skyvern-api` | `api/` (`public.ecr.aws/skyvern/skyvern:v1.0.58`) | Skyvern API, browser (Chromium on Xvfb) and task runner on port 8000. On first start it runs the database migrations and creates the organization and its API key. Also runs a small helper server on 9090 (private network only) that serves artifacts, hands the first-start key to the UI, and relays the UI's local diagnostics (`/api/v1/internal/*/status`), which the API answers only for loopback callers. Volume: `/data` (artifacts, recordings, downloads, browser sessions, credential vault, the API key file). |
| `skyvern-ui` | `ui/` (`public.ecr.aws/skyvern/skyvern-ui:v1.0.58`) | Skyvern web UI on port 8080, private network only. Waits for the API's first-start key, then serves the app. |
| `Postgres` | Railway's Postgres | Database. Volume: `/var/lib/postgresql/data`. |

Upstream images are pinned by version and digest in each `Dockerfile`. Upstream's optional parts are left out: Vaultwarden/Bitwarden CLI, the VNC port and the Streamlit demo.

## Variables

| Service | Variable | Default | Notes |
|---|---|---|---|
| `Skyvern` | `SKYVERN_USERNAME` | `admin` | Login for the web UI. |
| `Skyvern` | `SKYVERN_PASSWORD` | generated | Login for the web UI. Read it from the service's Variables tab. |
| `skyvern-api` | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | empty | Optional. Set at least one so Skyvern has a model, or add one later under **Settings > Custom LLMs** (OpenAI-compatible, OpenRouter, Ollama, Gemini). The start script enables each provider whose key is set and picks a default `LLM_KEY` (OpenAI GPT-5.5, else Claude Sonnet 4.6, else Gemini 3.0 Flash). Set `LLM_KEY` yourself to choose another model. |
| `skyvern-api` | `SECRET_KEY`, `ENCRYPTOR_AES_SECRET_KEY`, `SKYVERN_UI_BOOTSTRAP_TOKEN` | generated | Signing key for API keys, at-rest encryption key, and the token the UI uses to fetch the API key. Don't change them after the first deploy. |

Everything else (paths, browser type, streaming mode, URLs between services) is set in the start scripts or derived with Railway reference variables. Any upstream setting from Skyvern's [`.env.example`](https://github.com/Skyvern-AI/skyvern/blob/v1.0.58/.env.example) can be added to `skyvern-api` as a variable.

## After deploy

1. Open the `Skyvern` service's public URL and log in with `SKYVERN_USERNAME` / `SKYVERN_PASSWORD`. The first start of `skyvern-api` takes a few minutes; until then the UI shows "Skyvern is starting".
2. If you didn't set an LLM key, add a model under **Settings > Custom LLMs**.
3. For the SDK, MCP or REST calls, copy the API key from **Settings** and call `https://YOUR-DOMAIN/api/v1/...` with the `x-api-key` header. The API checks its own key, so these calls don't need the gateway login.

## Updates

Railway tells you when this template's repo changes. Each change bumps the pinned upstream version in `api/Dockerfile` and `ui/Dockerfile` and is listed in [`CHANGELOG.md`](CHANGELOG.md), breaking changes first. Read it, then apply the update from your project. Database migrations run automatically on the next start of `skyvern-api`.

## Licence

Skyvern is AGPL-3.0 (Skyvern-AI). The wrapper files in this repo are MIT.
