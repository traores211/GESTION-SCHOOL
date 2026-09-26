# syntax=docker/dockerfile:1
# Build context: repository root (docker build -f backend/Dockerfile .)
# Targets: dev (hot reload, used by docker-compose.yml) and prod (default, used by recette/production).

# Node 22 LTS, pinned by digest (Node 18 is end-of-life).
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS base
RUN apk add --no-cache openssl dumb-init
WORKDIR /app

FROM base AS deps
# Toolchain only in this stage (native module bcrypt may compile on musl).
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace=backend --no-audit --no-fund && mkdir -p backend/node_modules

FROM deps AS dev
COPY backend backend
WORKDIR /app/backend
RUN npx prisma generate
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY backend backend
WORKDIR /app/backend
RUN npx prisma generate && npx nest build

FROM base AS prod
ENV NODE_ENV=production
# Prisma CLI and ts-node stay available for `prisma migrate deploy` and the seed job.
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/backend/node_modules /app/backend/node_modules
COPY --from=build --chown=node:node /app/backend/dist /app/backend/dist
COPY --from=build --chown=node:node /app/backend/prisma /app/backend/prisma
COPY --from=build --chown=node:node /app/backend/package.json /app/backend/tsconfig.json /app/backend/
WORKDIR /app/backend
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health/ready || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
