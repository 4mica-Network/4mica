# syntax=docker/dockerfile:1
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1

RUN apk add --no-cache libc6-compat && \
    npm install -g pnpm@10.28.2 turbo

FROM base AS pruner
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/be ./apps/be

RUN turbo prune @4mica/be --docker

FROM base AS builder
WORKDIR /app

ENV HUSKY=0

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

RUN turbo build --filter=@4mica/be
RUN pnpm deploy --legacy --filter @4mica/be --prod /prod

FROM builder AS migrator
WORKDIR /app/packages/db

CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
ENV LOG_DIR=/app/logs

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fastify && \
    mkdir -p /app/logs && \
    chown -R fastify:nodejs /app

COPY --from=builder --chown=fastify:nodejs /prod ./

USER fastify

EXPOSE 4000
CMD ["node", "dist/index.js"]
