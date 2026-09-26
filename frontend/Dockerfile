# syntax=docker/dockerfile:1
# Build context: repository root (docker build -f frontend/Dockerfile .)
# Targets: dev (next dev, used by docker-compose.yml) and prod (default).

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS base
RUN apk add --no-cache dumb-init
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace=frontend --no-audit --no-fund && mkdir -p frontend/node_modules

FROM deps AS dev
COPY frontend frontend
WORKDIR /app/frontend
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]

FROM deps AS build
# Public values are inlined in the browser bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE NEXT_TELEMETRY_DISABLED=1
COPY frontend frontend
WORKDIR /app/frontend
RUN npx next build

FROM base AS prod
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/frontend/node_modules /app/frontend/node_modules
COPY --from=build --chown=node:node /app/frontend/.next /app/frontend/.next
COPY --from=build --chown=node:node /app/frontend/package.json /app/frontend/next.config.js /app/frontend/
WORKDIR /app/frontend
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "/app/node_modules/next/dist/bin/next", "start", "-p", "3000"]
