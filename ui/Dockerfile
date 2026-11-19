# Skyvern UI for Railway.
# Upstream image: public.ecr.aws/skyvern/skyvern-ui, pinned by version and digest.
FROM public.ecr.aws/skyvern/skyvern-ui:v1.0.58@sha256:dff379fa3fd30c832844021db208d9a35c040af717e8b9ae32e102bd87c23050

# Waits for the API's first-start organization key, derives the public URLs, then runs upstream's entrypoint.
COPY railway-start.sh /app/railway-start.sh
COPY railway-wait.mjs /app/railway-wait.mjs

CMD ["/bin/bash", "/app/railway-start.sh"]
