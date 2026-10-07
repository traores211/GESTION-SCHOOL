# Documentation — School ERP

Index court et à jour. Chaque entrée décrit ce que le document contient et à qui il s'adresse.

## Pour démarrer

| Document | Pour qui | Contenu |
|---|---|---|
| [README.md](README.md) | tout le monde | démarrage rapide, comptes de démo, section SaaS, commandes de test |
| [ARCHITECTURE.md](ARCHITECTURE.md) | développeurs | vue d'ensemble à jour (stack, modules, flux, sécurité, SaaS, chiffres) |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | chef de projet | état actuel, chiffres, lots livrés, reste à faire |

## Évolution SaaS

| Document | Contenu |
|---|---|
| [docs/EVOLUTION-SAAS.md](docs/EVOLUTION-SAAS.md) | compte-rendu détaillé des lots L1-L7 (analyse, modifications, DB, API, frontend, sécurité, tests, non-régression, reste à faire) |
| [docs/EVOLUTION-MULTI-ECOLES.md](docs/EVOLUTION-MULTI-ECOLES.md) | décisions multi-écoles antérieures (RLS reportée, périmètre enseignant, rôles supervision) |

## Opérations

| Document | Contenu |
|---|---|
| [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) | mise en production : serveur, certificat par défaut, certbot auto pour les domaines perso, démarrage, mise à jour, migrations, backups, sécurité, surveillance |
| [docs/CAHIER-DE-RECETTES.md](docs/CAHIER-DE-RECETTES.md) | scénarios de recette fonctionnelle (test manuel) |
| [docs/GUIDE-UTILISATEUR.md](docs/GUIDE-UTILISATEUR.md) | manuel utilisateur par rôle |

## Code source

| Dossier | Contenu |
|---|---|
| `backend/src/` | 41 modules Nest, 40 contrôleurs, ~297 endpoints (préfixe `/api`) |
| `backend/prisma/schema.prisma` | 43 modèles, 10 enums |
| `backend/prisma/migrations/` | 23 migrations versionnées |
| `backend/test/e2e-*.js` | 29 scénarios de bout en bout |
| `frontend/src/app/` | 48 pages Next.js (App Router) |
| `frontend/src/components/` | shell, UI kit, modales, dashboards, timetable, showcase |
| `deploy/nginx/` | conf nginx, snippets par domaine générés par certbot |
| `deploy/certbot/` | image + script d'obtention/renouvellement des certificats Let's Encrypt |
| `deploy/backup/` | sauvegarde nocturne chiffrée + rclone |

## Historique (archives, à ne plus suivre)

Ces documents couvraient un plan initial qui a divergé pendant les phases « Multi-écoles » et
« SaaS ». Ils restent dans le dépôt comme contexte, mais la **vérité** est dans les documents
ci-dessus.

- `ROADMAP.md` — plan de phases de la version mono-tenant
- `IMPLEMENTATION_GUIDE.md` — guide d'implémentation initial
- `AUDIT.md` — audit UI (branche `redesign/ui-v2`, non fusionné)
- `PROMPT.MD` — brief original
- `API_REFERENCE.md` — référence API (voir plutôt Swagger : `http://localhost:4000/api/docs`)
- `QUICKSTART.md` — version courte du README

## Services locaux

| Service | URL | Rôle |
|---|---|---|
| Frontend | http://localhost:1300 | application Next.js |
| API | http://localhost:4000/api | NestJS |
| Swagger | http://localhost:4000/api/docs | documentation API en direct (dev + prod si `SWAGGER_ENABLED=true`) |
| Health | http://localhost:4000/api/health | monitoring (base + cache) |
| MailHog | http://localhost:8025 | emails capturés en dev |
| Adminer | http://localhost:8080 | inspection DB en dev (démarrer avec `--profile tools`) |

PostgreSQL et Redis ne sont pas exposés sur l'hôte : `docker compose exec postgres psql -U schooladmin school_erp`.
