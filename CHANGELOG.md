# Changelog

## v1.0.58 (2026-11-19)

- First release of the Railway template: Skyvern v1.0.58 (`skyvern` and `skyvern-ui` images pinned by digest), a Caddy 2.11.9 gateway with a login in front of the UI, and Railway Postgres. The API's helper server relays the UI's local diagnostics, so the UI doesn't show "Unable to verify Skyvern API key" behind the gateway.
