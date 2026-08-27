# syntax=docker/dockerfile:1

# ---------- builder ----------
FROM rust:1-bookworm AS builder

WORKDIR /build

# Compile dependencies against a stub main.rs first. This layer is only
# invalidated when Cargo.toml or Cargo.lock change, so ordinary source edits
# reuse the cached dependency build.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src \
    && echo 'fn main() {}' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src

# Real sources. cargo compares mtimes, so the stub must be replaced by
# something strictly newer or the binary is not rebuilt.
COPY src ./src
RUN touch src/main.rs \
    && cargo build --release --locked

# ---------- runtime ----------
FROM debian:bookworm-slim AS runtime

# reqwest is built with default-tls (OpenSSL), so libssl and the CA bundle are
# required at runtime. curl backs the HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        libssl3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --uid 10001 facilitator

# The crate name appears only here; the runtime path is stable, so renaming the
# package again only requires touching this line.
COPY --from=builder /build/target/release/facilitator-4mica /usr/local/bin/facilitator

USER facilitator
WORKDIR /home/facilitator

ENV HOST=0.0.0.0 \
    PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

# exec form: the binary runs as PID 1 and receives SIGTERM directly, which
# src/server/mod.rs already handles for graceful shutdown.
ENTRYPOINT ["facilitator"]
