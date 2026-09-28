# syntax=docker/dockerfile:1

ARG ELIXIR_VERSION=1.20.4
ARG OTP_VERSION=29.0.6
ARG ALPINE_VERSION=3.24
ARG NODE_VERSION=22.23.2
ARG AUBE_VERSION=1.21.0
ARG MANAVAULT_ASSET_VERSION

# Hex images pin the OTP patch release as well as Elixir. Keep the builder's
# Alpine minor version aligned with the runner for native release dependencies.
ARG BUILDER_IMAGE=hexpm/elixir:${ELIXIR_VERSION}-erlang-${OTP_VERSION}-alpine-3.24.1
ARG RUNNER_IMAGE=alpine:${ALPINE_VERSION}

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node-runtime

FROM ${BUILDER_IMAGE} AS builder

ARG AUBE_VERSION
COPY --from=node-runtime /usr/local /usr/local

RUN apk add --no-cache build-base git curl ca-certificates tar

WORKDIR /app

# aube is the JavaScript package manager used by the repo (pnpm-compatible).
# Pin the release and verify its checksum instead of piping a remote installer
# to the shell. Update AUBE_VERSION and both checksums together (musl builds,
# since the builder is Alpine).
ARG TARGETARCH
ARG AUBE_SHA256_AMD64=6761c69514475a87b375d02a3782ebbab1dfdf181a584ee6b6c91814a882cb37
ARG AUBE_SHA256_ARM64=07da9245c5ac2ef540ed59f795aeee6986d8a9ed5127d4d9c97cbfd1cc05c308
RUN set -eu; \
  arch="${TARGETARCH:-$(uname -m)}"; \
  case "$arch" in \
    amd64|x86_64) aube_arch=x86_64; aube_sha="$AUBE_SHA256_AMD64" ;; \
    arm64|aarch64) aube_arch=aarch64; aube_sha="$AUBE_SHA256_ARM64" ;; \
    *) echo "unsupported build arch: ${arch}" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://github.com/aubepkg/aube/releases/download/v${AUBE_VERSION}/aube-v${AUBE_VERSION}-${aube_arch}-unknown-linux-musl.tar.gz" -o /tmp/aube.tar.gz; \
  echo "${aube_sha}  /tmp/aube.tar.gz" | sha256sum -c -; \
  tar -xzf /tmp/aube.tar.gz -C /tmp aube; \
  install /tmp/aube /usr/local/bin/aube; \
  rm -f /tmp/aube /tmp/aube.tar.gz; \
  aube --version

RUN mix local.hex --force && mix local.rebar --force

# The asset version is read at runtime only (ManavaultWeb.AssetVersion), so it is set in the
# runner stage. A per-commit value here would invalidate every layer below on every build.
ENV MIX_ENV=prod

COPY mix.exs mix.lock ./
RUN mix deps.get --only $MIX_ENV
RUN mkdir config

COPY config/config.exs config/${MIX_ENV}.exs config/
RUN mix deps.compile

# Install JavaScript packages before copying the code, so they stay cached until the
# lockfile changes.
COPY package.json aube-lock.yaml ./
RUN aube install --frozen-lockfile

COPY priv priv
COPY lib lib
COPY vite.config.ts codegen.ts capacitor.config.json ./
COPY assets assets

RUN mix compile
RUN mix assets.deploy

COPY config/runtime.exs config/
RUN mix release

FROM golang:1.26.8-alpine3.24 AS healthcheck-builder
# Build a static TCP healthcheck helper so the runtime image does not need curl
# and health is not coupled to background sync HTTP status.
WORKDIR /src/healthcheck
RUN printf '%s\n' \
  'package main' \
  '' \
  'import (' \
  '  "fmt"' \
  '  "net"' \
  '  "os"' \
  '  "time"' \
  ')' \
  '' \
  'func main() {' \
  '  port := os.Getenv("PORT")' \
  '  if port == "" {' \
  '    port = "4000"' \
  '  }' \
  '  conn, err := net.DialTimeout("tcp", "127.0.0.1:"+port, 4*time.Second)' \
  '  if err != nil {' \
  '    fmt.Fprintln(os.Stderr, err)' \
  '    os.Exit(1)' \
  '  }' \
  '  _ = conn.Close()' \
  '}' \
  > /tmp/manavault-healthcheck.go \
  && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /go/bin/manavault-healthcheck /tmp/manavault-healthcheck.go

FROM rust:1.98.0-alpine3.24 AS preview-builder
# resvg avoids the GLib/GIO and Cairo dependencies of rsvg-convert, including
# CVE-2026-58016, which has no fixed package in Alpine's stable repositories.
RUN apk add --no-cache musl-dev \
  && cargo install resvg --version 0.48.1 --locked

FROM ${RUNNER_IMAGE} AS runner

ARG MANAVAULT_ASSET_VERSION

RUN apk upgrade --no-cache \
  && apk add --no-cache libstdc++ openssl ncurses-libs ca-certificates lksctp-tools su-exec ttf-dejavu

COPY --from=healthcheck-builder /go/bin/manavault-healthcheck /usr/local/bin/manavault-healthcheck
COPY --from=preview-builder /usr/local/cargo/bin/resvg /usr/local/bin/resvg

ENV LANG=C.UTF-8
ENV LANGUAGE=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app
RUN addgroup -S app && adduser -S -G app -h /home/app -s /bin/sh app && mkdir -p /data && chown -R app:app /app /data

ENV MIX_ENV=prod
ENV PHX_SERVER=true
ENV PORT=4000
ENV DATA_DIR=/data
ENV DATABASE_PATH=/data/manavault.db
ENV MANAVAULT_ASSET_VERSION=${MANAVAULT_ASSET_VERSION}

COPY --from=builder --chown=app:app /app/_build/prod/rel/manavault ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chown -R app:app /app && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["/usr/local/bin/manavault-healthcheck"]
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/app/bin/manavault", "start"]
