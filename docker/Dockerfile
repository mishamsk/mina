# syntax=docker/dockerfile:1

ARG GO_VERSION=1.26
ARG NODE_VERSION=24.18.0
ARG DEBIAN_VERSION=trixie

FROM node:${NODE_VERSION}-${DEBIAN_VERSION} AS frontend-builder
WORKDIR /src
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./frontend/
WORKDIR /src/frontend
RUN corepack enable && pnpm install --frozen-lockfile
WORKDIR /src
COPY frontend ./frontend
RUN cd frontend && pnpm run build

FROM golang:${GO_VERSION}-${DEBIAN_VERSION} AS go-builder
ARG TARGETOS=linux
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend-builder /src/internal/webui/dist ./internal/webui/dist
RUN CGO_ENABLED=1 GOOS="${TARGETOS}" GOARCH="${TARGETARCH:-$(go env GOARCH)}" \
    go build -trimpath -ldflags="-s -w" -o /out/mina ./cmd/mina

FROM debian:${DEBIAN_VERSION}-slim AS runtime
RUN DEBIAN_FRONTEND=noninteractive apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl tzdata libstdc++6 \
    && groupadd --system --gid 10001 mina \
    && useradd --system --uid 10001 --gid mina --home-dir /nonexistent --shell /usr/sbin/nologin mina \
    && mkdir -p /config/mina /data /cache/mina /backups \
    && chown -R mina:mina /config /data /cache /backups \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

COPY --from=go-builder /out/mina /usr/local/bin/mina
COPY docker/config-template.toml /usr/local/share/mina/config.toml
COPY docker/container-init.sh /usr/local/bin/mina-container-init
COPY docker/entrypoint.sh /usr/local/bin/mina-entrypoint
COPY docker/volume-init.sh /usr/local/bin/mina-volume-init
COPY <<'EOF' /usr/local/bin/mina-healthcheck
#!/bin/sh
set -eu
exec curl --fail --silent --show-error --max-time "${MINA_HEALTHCHECK_TIMEOUT_SECONDS:-2}" "${1:-http://127.0.0.1:8080/api/health}" >/dev/null
EOF
RUN chmod 0755 /usr/local/bin/mina /usr/local/bin/mina-container-init /usr/local/bin/mina-entrypoint /usr/local/bin/mina-healthcheck /usr/local/bin/mina-volume-init

ARG CREATED
ARG REVISION
ARG SOURCE="https://github.com/mishamsk/mina"
ARG VERSION="0.0.0-dev"
LABEL org.opencontainers.image.title="Mina" \
      org.opencontainers.image.description="Local-first personal finance API and web UI" \
      org.opencontainers.image.source="${SOURCE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV XDG_CONFIG_HOME=/config \
    XDG_CACHE_HOME=/cache \
    MINA_DB=/data/mina.duckdb \
    MINA_HOST=0.0.0.0 \
    MINA_PORT=8080 \
    MINA_YES=true

USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["mina-entrypoint"]
CMD ["serve"]
