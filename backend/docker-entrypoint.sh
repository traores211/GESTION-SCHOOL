#!/bin/sh
# Development entrypoint: sync dependencies, migrate the database, then start Nest in watch mode.
# Production uses Dockerfile.prod (built code, `prisma migrate deploy`, no seed, no watcher).
set -e

# node_modules lives in a named volume that outlives image rebuilds: resync it with package.json.
npm install --no-audit --no-fund --loglevel=error

# Versioned migrations (prisma/migrations). A database created earlier with `db push` is baselined.
npx prisma generate
sh ./scripts/migrate.sh

# Demo data only on an empty database (the seed also creates attendance for recent days,
# so it must not run on every start).
if [ "${SEED_ON_EMPTY_DB:-true}" = "true" ]; then
  if node -e "const p=require('./scripts/prisma-client').createPrismaClient();p.school.count().then(n=>process.exit(n>0?1:0)).catch(()=>process.exit(1))"; then
    echo "Empty database: running seed"
    npx prisma db seed
  fi
fi

exec npm run dev
