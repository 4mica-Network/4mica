# syntax=docker/dockerfile:1
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache libc6-compat git ca-certificates && \
    update-ca-certificates && \
    npm install -g pnpm@10.28.2 turbo

FROM base AS builder
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN turbo prune @4mica/web --docker

FROM base AS installer
WORKDIR /app

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

COPY --from=builder /app/out/full/ .

ARG NEXT_PUBLIC_PROJECT_ID
ARG NEXT_PUBLIC_REOWN_PROJECT_ID
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_4MICA_CORE_CONTRACT_ETH_SEPOLIA
ARG NEXT_PUBLIC_4MICA_CORE_CONTRACT_BASE_SEPOLIA

ENV NEXT_PUBLIC_PROJECT_ID=$NEXT_PUBLIC_PROJECT_ID
ENV NEXT_PUBLIC_REOWN_PROJECT_ID=$NEXT_PUBLIC_REOWN_PROJECT_ID
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_4MICA_CORE_CONTRACT_ETH_SEPOLIA=$NEXT_PUBLIC_4MICA_CORE_CONTRACT_ETH_SEPOLIA
ENV NEXT_PUBLIC_4MICA_CORE_CONTRACT_BASE_SEPOLIA=$NEXT_PUBLIC_4MICA_CORE_CONTRACT_BASE_SEPOLIA

RUN pnpm --filter @4mica/web build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN npm install -g pm2 serve && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 web

COPY --from=installer --chown=web:nodejs /app/apps/web/out ./out
COPY --chown=web:nodejs apps/web/ecosystem.config.cjs ./ecosystem.config.cjs

USER web

EXPOSE 3000
CMD ["pm2-runtime", "ecosystem.config.cjs"]
