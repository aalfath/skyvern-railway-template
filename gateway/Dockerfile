# Skyvern gateway for Railway: the public entry point. Puts a login (HTTP basic auth) in front of
# the Skyvern UI, which has no login of its own, and routes API, WebSocket and artifact paths.
FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0

COPY Caddyfile /etc/caddy/Caddyfile
COPY railway-start.sh /railway-start.sh

CMD ["/bin/sh", "/railway-start.sh"]
