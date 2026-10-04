# syntax=docker/dockerfile:1
#
# Isolated Linux workspace for running the Elixir and React test suites.
# See .claude/docker-test/README.md. Not used for production images (see ../../Dockerfile).

ARG ELIXIR_VERSION=1.20.4
ARG OTP_VERSION=29.1.1
ARG ALPINE_VERSION=3.24
ARG NODE_VERSION=22.23.2
ARG BUILDER_IMAGE=hexpm/elixir:${ELIXIR_VERSION}-erlang-${OTP_VERSION}-alpine-3.24.2

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node-runtime

FROM rust:1.98.0-alpine3.24 AS resvg-builder
# Same resvg build as the production Dockerfile (deck share preview tests shell out to it).
RUN apk add --no-cache musl-dev \
  && cargo install resvg --version 0.48.1 --locked

FROM ${BUILDER_IMAGE}

ARG AUBE_VERSION=1.21.0
ARG TARGETARCH
ARG AUBE_SHA256_AMD64=6761c69514475a87b375d02a3782ebbab1dfdf181a584ee6b6c91814a882cb37
ARG AUBE_SHA256_ARM64=07da9245c5ac2ef540ed59f795aeee6986d8a9ed5127d4d9c97cbfd1cc05c308

COPY --from=node-runtime /usr/local /usr/local
COPY --from=resvg-builder /usr/local/cargo/bin/resvg /usr/local/bin/resvg

RUN apk add --no-cache build-base git curl ca-certificates tar rsync ttf-dejavu libstdc++

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
  rm -f /tmp/aube /tmp/aube.tar.gz

ENV LANG=C.UTF-8 LC_ALL=C.UTF-8 \
    MIX_ENV=test \
    MIX_DEPS_PATH=/opt/mix/deps \
    MIX_BUILD_PATH=/opt/mix/_build \
    HEX_HOME=/opt/mix/hex \
    MIX_HOME=/opt/mix/home

RUN mix local.hex --force && mix local.rebar --force

# Fetch and compile deps in their own layer so they stay cached until mix.lock changes.
# Deps/build live outside /workspace so syncing source never touches them.
WORKDIR /opt/deps-build
COPY mix.exs mix.lock ./
RUN mkdir config
COPY config/config.exs config/test.exs config/
RUN mix deps.get && mix deps.compile

COPY .claude/docker-test/entrypoint.sh /usr/local/bin/test-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/test-entrypoint.sh && chmod +x /usr/local/bin/test-entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["test-entrypoint.sh"]
CMD ["mix", "test"]
