#!/bin/sh
# Applies pending Prisma migrations. A database created earlier with `prisma db push` (schema present
# but no migration history) is baselined: 0_init is recorded as applied instead of being replayed.
set -e

HAS_HISTORY=$(node -e "
const p = require('./scripts/prisma-client').createPrismaClient();
p.\$queryRawUnsafe(\"select to_regclass('public._prisma_migrations') is not null as history, to_regclass('public.\\\"User\\\"') is not null as tables\")
  .then((r) => { console.log(r[0].history ? 'history' : r[0].tables ? 'pushed' : 'empty'); })
  .catch(() => console.log('empty'))
  .finally(() => p.\$disconnect());
")

if [ "$HAS_HISTORY" = "pushed" ]; then
  echo "Existing schema without migration history (db push): baselining 0_init."
  npx prisma migrate resolve --applied 0_init
fi

npx prisma migrate deploy
