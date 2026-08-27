# syntax=docker/dockerfile:1
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache libc6-compat && \
    npm install -g pnpm@10.28.2 turbo

FROM base AS pruner
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/playground ./apps/playground

RUN turbo prune @4mica/playground --docker

FROM base AS builder
WORKDIR /app

ENV HUSKY=0

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

# NEXT_PUBLIC_* values are inlined at build time, so they must be present here
# rather than only at runtime.
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ASSET_PREFIX
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_ASSET_PREFIX=$NEXT_PUBLIC_ASSET_PREFIX \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

# @4mica/db throws at import when DATABASE_URL is unset, and `next build`
# imports every route module to collect metadata. This sentinel is never
# connected to — same trick as packages/db/prisma.config.ts.
ENV DATABASE_URL=postgresql://unset:unset@127.0.0.1:1/unset

# src/env.ts rejects a CLERK_SECRET_KEY that is not sk_-prefixed, and the same
# metadata collection evaluates it. Deliberately a build-only sentinel rather
# than an ARG: a real key passed as a build arg is recorded in the image
# history, so it must only ever arrive at runtime via compose `environment:`.
# This ENV belongs to the builder stage and does not reach the runner below.
ENV CLERK_SECRET_KEY=sk_build_time_placeholder

# turbo (not `next build` directly) so the @4mica/db#build edge runs
# `prisma generate` first and @4mica/ui's dist is fresh.
RUN turbo build --filter=@4mica/playground

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# server.js reads HOSTNAME, not HOST (which is what Fastify reads in apps/be).
ENV HOSTNAME=0.0.0.0
ENV PORT=3100
ENV LOG_DIR=/app/logs
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app/logs && \
    chown -R nextjs:nodejs /app

# outputFileTracingRoot is the monorepo root, so standalone emits
# .next/standalone/apps/playground/server.js with node_modules hoisted to
# .next/standalone/node_modules. Copying the whole tree to /app preserves that
# layout — hence the nested CMD path below.
COPY --from=builder --chown=nextjs:nodejs /app/apps/playground/.next/standalone ./

# static/ and public/ are not file-traced and must be copied separately, into
# the same nested path the server expects.
COPY --from=builder --chown=nextjs:nodejs /app/apps/playground/.next/static ./apps/playground/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/playground/public ./apps/playground/public

USER nextjs

EXPOSE 3100
CMD ["node", "apps/playground/server.js"]
