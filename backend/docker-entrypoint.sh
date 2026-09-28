#!/bin/sh
# Development entrypoint: sync dependencies, prepare the database, then start Nest in watch mode.
set -e

# node_modules lives in a named volume that outlives image rebuilds: resync it with package.json.
npm install --no-audit --no-fund --loglevel=error

# The project has no Prisma migrations (prisma/migrations is git-ignored), so the schema is applied
# with `db push`. Without --accept-data-loss it refuses any destructive change instead of dropping data.
npx prisma generate
npx prisma db push --skip-generate

# Demo data only on an empty database (the seed also creates attendance for recent days,
# so it must not run on every start).
if [ "${SEED_ON_EMPTY_DB:-true}" = "true" ]; then
  if node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.school.count().then(n=>process.exit(n>0?1:0)).catch(()=>process.exit(1))"; then
    echo "Empty database: running seed"
    npx prisma db seed
  fi
fi

exec npm run dev
