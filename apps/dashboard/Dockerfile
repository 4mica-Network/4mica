# syntax=docker/dockerfile:1
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1

RUN apk add --no-cache libc6-compat && \
    npm install -g pnpm@10.28.2 turbo@2.9.16

FROM base AS pruner
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/dashboard ./apps/dashboard

RUN turbo prune @4mica/dashboard --docker

FROM base AS builder
WORKDIR /app

ENV HUSKY=0

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

# Vite inlines import.meta.env.VITE_* at build time, so these must be set
# before the build rather than only at runtime — the runner is a static nginx
# with no JS execution to read env from.
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_API_URL
ARG VITE_BASE_URL
ARG VITE_APP_URL
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT

ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    VITE_API_URL=$VITE_API_URL \
    VITE_BASE_URL=$VITE_BASE_URL \
    VITE_APP_URL=$VITE_APP_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT

# turbo (not `vite build` directly) so @4mica/ui's dist/ is built first — it is
# the only workspace package that emits one.
RUN turbo build --filter=@4mica/dashboard

RUN node apps/dashboard/scripts/render-security-headers.mjs /app/security-headers.conf

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0 AS runner

# vite.config.ts sets no build.outDir, so the export lands in the Vite default.
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/security-headers.conf /etc/nginx/snippets/security-headers.conf

EXPOSE 8080
