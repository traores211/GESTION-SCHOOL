# Architecture

État réel du dépôt au 7 octobre 2026, après les lots L1-L7 d'évolution SaaS.

## Vue d'ensemble

```
                       ┌───────────────────────────────────┐
                       │        Reverse proxy nginx        │
                       │  (certs Let's Encrypt par domaine │
                       │   via le service certbot)         │
                       └────────────┬───────────────────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 ▼                                     ▼
         Next.js 15 (web)                   NestJS 10 (api, /api)
         React 18, CSS maison               Prisma 5, Passport JWT
                 │                                     │
                 └───────────────┬─────────────────────┘
                                 ▼
                       PostgreSQL 16  +  Redis 7
```

**Isolation multi-tenant** : chaque requête porte un `schoolId` déduit du JWT. Les 43 modèles
métier portent une colonne `schoolId` ou dérivent d'une entité qui l'a. Les ~294 endpoints
filtrent systématiquement sur `user.schoolId` et refusent toute lecture/écriture croisée
(vérifié par `test/e2e-tenancy.js` et `test/e2e-group.js`). Le cloisonnement n'est **pas** fait
au niveau PostgreSQL (pas de RLS) : décision assumée, documentée dans `docs/EVOLUTION-MULTI-ECOLES.md`.

## Stack technique

| Composant | Version | Rôle |
|---|---|---|
| Node | 22 | runtime backend + build frontend |
| NestJS | 10.2 | API HTTP, DI, intercepteurs, guards |
| Next.js | 15 (App Router) | frontend, middleware edge |
| React | 18.2 | UI |
| Prisma | 5.22 | ORM, migrations |
| PostgreSQL | 16-alpine | base principale |
| Redis | 7-alpine | cache (sessions, quotas, rate limit) |
| TypeScript | 5.2 strict | backend + frontend |

**Pas de LDAP, pas de Tailwind, pas de NextAuth** malgré ce que certaines docs ancestrales
suggéraient. L'authentification est JWT custom (access 15 min + refresh rotatif 30 j cookie
HttpOnly, 2FA TOTP, verrouillage par compte et par IP). Le design system est un CSS maison
dans `frontend/src/app/globals.css`.

## Modules backend (41)

Groupés par domaine. Chaque module Nest = un dossier dans `backend/src/` avec un controller, un
service, des DTO (`class-validator`) et parfois des helpers purs testés en spec.

### Multi-tenant & plateforme
- `prisma` : `PrismaService` avec middleware de chiffrement AES-GCM à la volée sur les champs
  sensibles (`StaffMember.bankAccount`, `Parent.idNumber`).
- `platform` : `PlatformService` (sign-up, abonnement), `GroupService` (schools d'une organisation,
  switch-school, memberships), `LifecycleService` (machine à états), `QuotaService` (plans &
  quotas), `SubscriptionInterceptor` (402 en lecture seule).
- `domains` : `DomainResolverService` + middleware (`req.resolvedHost`), `DomainsService`
  (CRUD + vérification DNS TXT), `HostController` (`/public/host`).
- `permissions` : catalogue en code, `PermissionsService`, `PermissionsGuard`,
  `@RequirePermissions`.
- `auth` : JwtStrategy + TokenService (rotation), 2FA TOTP, forgot/reset, rate-limit Redis.

### Scolarité
- `users`, `students`, `parents` (+ `Guardianship` qualifié), `staff`, `academic-years` (+ Term),
  `classes` (+ Enrollment, ClassSubject), `subjects`, `admissions` (10 états, pièces, timeline),
  `promotion` (passage de classe fin d'année), `attendance`, `grades`, `bulletins` (PDF).

### Vie scolaire
- `discipline`, `gate` (QR + manuel + badges), `smart-entry` (OCR + voice), `homework`,
  `conversations`.

### Finance & RH
- `billing` + `billing/online` (CinetPay webhooks, sign-vérifiés), `payroll`, `transport`.

### Communication
- `notifications` (in-app), `messaging` (SMS/WhatsApp, dedupe, quotas),
  `push-subscriptions` (VAPID), `announcements`, `public` (vitrine), `showcase` (brouillon/publication),
  `family` (portail parent).

### Infra & transverse
- `infra` : RedisService, MailService, SequenceService (per-school), StorageService (local/S3),
  TeacherScopeService.
- `audit` : AuditLog + filtres, intercepteur `SensitiveFieldsInterceptor` (strip des
  credentials de toutes les réponses).
- `documents` : upload, versioning, antivirus optionnel (ClamAV).
- `imports` : xlsx/csv/pdf/docx/image → élèves, personnel, soldes, notes.
- `privacy` : exports RGPD, anonymisation.
- `insights`, `dashboard`, `assistant` (Dify).

## Modèles Prisma (43)

Détail complet dans `backend/prisma/schema.prisma`. Les tables ajoutées par les lots SaaS :

- **L1** `SchoolDomain` — mapping hostname → école, vérification DNS, statut TLS.
- **L2** `SchoolLifecycleEvent` — append-only, chaque transition d'abonnement avec opérateur et
  raison.
- **L3** `OrganisationQuotaOverride` — overrides par organisation (le baseline vit en code).
- **L4** `Permission` + pivot `_PermissionToUser` — existaient depuis `0_init`, activées en L4.
- **L6** `Invoice.reference` → composite `[schoolId, reference]` (était unique global).

19 migrations initiales + 4 nouvelles (L1-L6). CI vérifie `prisma migrate diff --exit-code`.

## Flux typiques

### Requête d'un utilisateur authentifié

```
Browser  ──Bearer token──▶  nginx  ──▶  NestJS
                                            │
                                            ├─ DomainResolverMiddleware (req.resolvedHost)
                                            ├─ JwtAuthGuard → JwtStrategy.validate()
                                            │    │
                                            │    └─ cache Redis 30 s : User.schoolId / role / schoolActive
                                            ├─ RolesGuard (si @Roles)
                                            ├─ PermissionsGuard (si @RequirePermissions)
                                            ├─ SubscriptionInterceptor (402 si readOnly)
                                            │
                                            └─ Controller → Service → Prisma (schoolId filtered)
```

### Création d'une facture

```
POST /api/billing/invoices
      │
      ├─ ValidationPipe (DTO class-validator)
      ├─ RolesGuard : FINANCE
      ├─ SubscriptionInterceptor : écrit si ACTIVE/TRIAL non expiré
      │
      └─ BillingService.createInvoice(user, dto)
            ├─ QuotaService.assertCanCreate(user, 'students')  ← non applicable ici
            ├─ assertYearOpen (année non clôturée)
            ├─ SequenceService.invoiceReference(schoolId, tx)  ← per-école (L6)
            ├─ prisma.invoice.create (en transaction)
            └─ QuotaService.invalidate(organisationId)
```

### Résolution d'un hostname

```
GET /ecole/mon-ecole-1.ci  (le navigateur a tapé mon-ecole-1.ci)
         │
         ▼
  nginx (vhost include de /etc/nginx/sites/mon-ecole-1.ci.conf, cert Let's Encrypt)
         │
         ▼ (header Host: mon-ecole-1.ci)
  NestJS DomainResolverMiddleware
         │
         ▼
  DomainResolverService.resolve('mon-ecole-1.ci')
         ├─ Redis cache 60 s
         ├─ SchoolDomain.findUnique({ hostname }) ← autoritative
         └─ fallback : plateforme, sous-domaine auto, local
         │
         ▼ req.resolvedHost = { kind: 'CUSTOM_DOMAIN', schoolId, organisationId, active }
         │
         ▼ Controllers publics (showcase, host) utilisent req.resolvedHost
```

## Sécurité

- **Authentification** : JWT HS256 15 min + refresh rotatif 30 j cookie HttpOnly (`erp_refresh`),
  famille UUID (réutilisation = révocation en cascade), 2FA TOTP obligatoire pour les rôles
  sensibles (`TOTP_REQUIRED_ROLES`), rate-limit login (10/compte, 50/IP par 15 min).
- **Isolation multi-tenant** : 729 occurrences `schoolId` dans les services, vérifiée par
  `e2e-tenancy.js` et `e2e-group.js`.
- **IDOR** : chaque `findOne`/`update`/`delete` revalide `schoolId` avant d'opérer.
- **Enseignants scopés** : `TeacherScopeService` restreint un ENSEIGNANT à ses classes et
  matières (`assertClass`, `assertSubject`, `assertStudent`, `gradeChecker`).
- **CSP stricte** (L7) : helmet avec directives explicites.
- **Middleware Next.js** (L7) : pré-redirect vers `/login` les routes privées sans cookie.
- **Audit** : chaque CREATE/UPDATE/DELETE/VERIFY sensible écrit un `AuditLog` avec
  auteur/avant/après/IP.
- **Chiffrement at rest** : AES-GCM sur `StaffMember.bankAccount`, `Parent.idNumber`,
  documents sensibles.
- **Interceptor global `SensitiveFieldsInterceptor`** : strip `password`, `totpSecret`,
  `tokenHash`, `cardToken` de toute réponse JSON (vérifié par `e2e-leaks.js`).

## Multi-tenant SaaS

### Lifecycle école

```
PROSPECT → PENDING → TRIAL ──┬─▶ ACTIVE ◄─┐
                             │     │       │
                             │     ├─▶ SUSPENDED
                             │     │       │
                             └─────┴─▶ EXPIRED
                                   │
                                   └─▶ CLOSED  (terminal)
```

- Toute transition passe par `LifecycleService.transition` (validation + audit + invalidation
  cache abonnement).
- Un `TRIAL` dont `trialEndsAt` est passé est **auto-promu** `EXPIRED` au premier `GET /subscription`.
- `CLOSED` est terminal.

### Plans

| Plan | Élèves | Comptes | Classes | Écoles | Domaines perso | Stockage | SMS/mois | IA | Vitrine avancée |
|---|---|---|---|---|---|---|---|---|---|
| STARTER | 300 | 25 | 15 | 1 | 0 | 1 Go | 500 | ✗ | ✗ |
| PRO | 1 500 | 100 | 60 | 1 | 1 | 10 Go | 3 000 | ✓ | ✓ |
| ENTERPRISE | ∞ | ∞ | ∞ | ∞ | 10 | ∞ | ∞ | ✓ | ✓ |

Overrides en base par organisation (`OrganisationQuotaOverride`).

### Rôles (UserRole)

```
SUPER_ADMIN              (opérateur plateforme)
├─ ADMIN_ORGANISATION    (admin groupe scolaire)
│    ├─ DIRECTOR         (direction d'une école)
│    │    ├─ SECRETARY
│    │    ├─ COMPTABLE
│    │    ├─ ENSEIGNANT  (scopé à ses classes / matières)
│    │    ├─ SURVEILLANT
│    │    └─ EDUCATEUR
│    │
│    └─ ELEVE / PARENT   (portail famille)
```

Permissions fines (L4) : 17 clés `resource:action` activables au-dessus des rôles via
`@RequirePermissions` + table `Permission`.

## DevOps

### Développement

- `docker-compose.yml` : postgres, redis, mailhog, backend (watch), frontend (watch),
  **adminer** (profile `tools`, port 8080).
- Hot reload : les volumes bind `backend/src` et `backend/prisma`.
- Seed : auto si DB vide (`SEED_ON_EMPTY_DB=true` par défaut). Les orgs seed sont ENTERPRISE
  pour que les 2 575 élèves de la bulk-seed respectent les quotas.

### Production

- `docker-compose.prod.yml` : images buildées (`Dockerfile.prod`), secrets requis (`${:?}`),
  nginx (443 + SNI dynamique via `/etc/nginx/sites/*.conf`), service `backup` (nocturne chiffré),
  `certbot` (profile `certbot`), `clamav` optionnel (profile `antivirus`).
- Certificats TLS : L2 côté L1-L5 — `certbot` lit la liste des hostnames `ACTIVE` via
  `GET /api/platform/certbot/hostnames` (bearer `CERTBOT_TOKEN`), obtient/renouvelle les
  certificats via webroot, écrit un snippet par domaine, demande à nginx de recharger.
- Backups : `backup.sh` chiffre avec `BACKUP_PASSPHRASE` (AES-256), push via rclone, vérifie
  mensuellement la restauration.
- CI GitHub Actions : lint + types + 289 tests unit + 29 scénarios e2e + Playwright + build
  images.

## Documents à lire

- `docs/EVOLUTION-SAAS.md` — compte-rendu détaillé des lots L1-L7 (ce qui a changé, pourquoi,
  tests, non-régression).
- `docs/EVOLUTION-MULTI-ECOLES.md` — décisions multi-écoles antérieures (RLS reportée,
  périmètre enseignant, etc.).
- `docs/DEPLOIEMENT.md` — procédure complète (serveur, HTTPS, certbot domaines, backups).
- `docs/CAHIER-DE-RECETTES.md` — tests fonctionnels manuels.
- `docs/GUIDE-UTILISATEUR.md` — manuel utilisateur par rôle.

## Chiffres

- **43** modèles Prisma, **10** enums
- **23** migrations
- **41** modules Nest, **40** controllers, **~297** endpoints (3 nouveaux depuis L5)
- **17** permissions fines
- **289** tests unit backend (34 suites), **30** tests frontend (vitest), **4** suites Playwright
- **9** scénarios e2e critiques (auth, tenancy, leaks, platform, lifecycle, quotas, permissions,
  domains, group) + ~20 autres (bulletins, admissions, imports, payments, portal, …)
- **729** occurrences `schoolId` dans `backend/src` (preuve du filtrage systématique)
