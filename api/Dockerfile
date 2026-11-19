# Skyvern API (backend, browser workers, migrations) for Railway.
# Upstream image: public.ecr.aws/skyvern/skyvern, pinned by version and digest.
FROM public.ecr.aws/skyvern/skyvern:v1.0.58@sha256:3f01ecea4113f5b7f035f0ecc48bfe30e67e75a316d898455725671d564f94de

# Railway start script (defaults, LLM provider detection) and the small
# artifact/bootstrap server that replaces the shared Docker volume of upstream's compose file.
COPY railway-start.sh /app/railway-start.sh
COPY railway-aux-server.mjs /app/railway-aux-server.mjs

CMD ["/bin/bash", "/app/railway-start.sh"]
