FROM --platform=linux/amd64 oven/bun:1.4.4 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun --no-env-file scripts/compile-sidecar.ts apps/sidecar/src/main.ts bun-linux-x64 /app/cadcamfun-sidecar

FROM --platform=linux/amd64 oven/bun:1.4.4 AS runtime
USER root
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates git ripgrep && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/cadcamfun-sidecar /app/cadcamfun-sidecar
COPY --from=build /app/packages/db/drizzle /app/migrations
RUN mkdir -p /data && chown bun:bun /data
ENV CADCAMFUN_RUNTIME=server \
    CADCAMFUN_DATA_DIR=/data \
    CADCAMFUN_MIGRATIONS_DIR=/app/migrations \
    CADCAMFUN_GATEWAY_PORT=8080
USER bun
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/app/cadcamfun-sidecar"]
