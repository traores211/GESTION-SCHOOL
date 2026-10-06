# Évolution SaaS multi-tenant — Suivi des lots

Suivi de l'évolution de l'application vers la plateforme SaaS décrite dans
`docs/AMELIORATIONS_NEW.md`. Chaque lot est additif, livré avec ses tests, et vérifié contre la
non-régression des 262 tests unitaires et 29 scénarios de bout en bout existants.

Branche de travail : `feature/saas-multi-tenant`.

## État des lots

| Lot | Objet | État |
|---|---|---|
| **L1** | Domaines personnalisés par école (SchoolDomain, résolveur par Host, vérification DNS, écrans d'administration, Adminer en dev) | **Fait** |
| L2 | Activation du `SubscriptionInterceptor` + machine à états école complète (PROSPECT / PENDING / TRIAL / ACTIVE / SUSPENDED / EXPIRED / CLOSED) | À faire |
| L3 | Plans & quotas (élèves, utilisateurs, enseignants, stockage, domaines, SMS) + enforcement | À faire |
| L4 | Permissions fines (activation de la table `Permission` et `PermissionsGuard`) | À faire |
| L5 | Nginx multi-vhost + certbot automatique + documentation opérateur | À faire |
| L6 | Relâchement des uniques globaux (`User.email`, `School.code`, `Invoice.reference`, `Payment.transactionId`) → composites avec `organisationId` | À faire |
| L7 | Dette technique (`Float` → `Decimal` pour les montants, pagination UI complète, CSP stricte, middleware Next.js) | À faire |
| L8 | Mise à jour de la documentation (`ARCHITECTURE.md`, `INDEX.md`, `PROJECT_STATUS.md`) | À faire |

---

## Lot 1 — Domaines personnalisés par école

### Analyse

L'application vise une plateforme SaaS où chaque école doit pouvoir être joignable sur son
propre nom de domaine (par exemple `mon-ecole-1.ci`), tout en gardant la plateforme centrale
accessible sur `mon-saas-ecole.ci`. L'audit (branche `feature/robustness`) a montré qu'aucun
mécanisme ne liait un hôte HTTP à une école : le reverse proxy nginx servait un seul vhost
(`server_name _`), l'API déduisait toujours l'école du JWT, et le concept de domaine n'existait
nulle part dans le schéma Prisma. Impossible, dans ces conditions, d'empêcher une prise de
contrôle de domaine (un tenant qui revendique le nom d'un autre) ni de servir une vitrine école
sans passer par un code dans l'URL (`/ecole/:code/...`).

### Modifications

1. **Modèle `SchoolDomain`** avec `hostname` unique sur toute la plateforme, lié à `School` et
   `Organisation`, portant un `verificationToken` secret, un `status`
   (`PENDING | VERIFYING | ACTIVE | SUSPENDED | FAILED | REMOVED`), un `kind`
   (`PLATFORM | SUBDOMAIN | CUSTOM_DOMAIN | CUSTOM_DOMAIN_ALIAS`) et un drapeau
   `isPrimary` (un seul domaine principal par école, enforcé par un index unique partiel
   PostgreSQL).
2. **`DomainResolverService`** qui résout un `Host` reçu via les étapes :
   - ligne explicite dans `SchoolDomain` (fait autorité) ;
   - plateforme elle-même (`PLATFORM_HOSTNAME`) ;
   - sous-domaine automatique `<slug|code>.<PLATFORM_SUBDOMAIN_SUFFIX>` ;
   - adresses locales (localhost, IP privées) traitées comme la plateforme en développement ;
   - sinon : hôte inconnu (loggé, pas d'école associée).
   Le résultat est mis en cache 60 secondes dans Redis (ou mémoire en secours) et invalidé
   automatiquement sur toute écriture CRUD.
3. **`DomainResolverMiddleware`** installé sur toutes les routes : il attache `req.resolvedHost`
   sans jamais modifier l'école de l'utilisateur authentifié. Lit `X-Forwarded-Host` quand nginx
   est devant (configuré dans `deploy/nginx/proxy_params.conf`), sinon le header `Host`.
4. **`DomainsController`** (CRUD + verification) et **`HostController`** (`GET /api/public/host`
   pour permettre au frontend de connaître la vitrine à afficher). Toutes les routes sont
   protégées par `JwtAuthGuard + RolesGuard` (SUPER_ADMIN, ADMIN_ORGANISATION, DIRECTOR), sauf
   le résolveur public (`/api/public/host`) qui ne renvoie que l'identité publique de l'école
   (nom, logo, code, actif).
5. **Vérification DNS TXT** : l'API génère un jeton (préfixe `erp-verify-`) que l'école doit
   publier sous `_school-verify.<hostname>`. L'endpoint `POST /api/domains/:id/verify` fait un
   `dns.resolveTxt` sur le record et promeut la ligne en `ACTIVE` quand le jeton attendu est
   présent. Un domaine déjà `ACTIVE` reste live même si une revérification échoue (évite les
   coupures en cas de glitch DNS).
6. **Journal d'audit** : chaque CREATE/UPDATE/DELETE/VERIFY est enregistré dans `AuditLog` avec
   l'ancien et le nouvel état sérialisés, et apparaît dans le filtre « Domaines » (ajouté à
   `AREA_LABELS`).
7. **Isolation inter-organisations** : un `ADMIN_ORGANISATION` ne voit et ne touche que les
   écoles de son organisation ; un `DIRECTOR` que la sienne (pas celles du groupe) ; un
   `SUPER_ADMIN` voit tout mais est le seul à pouvoir suspendre un domaine (un admin
   d'organisation ne doit pas pouvoir s'exclure lui-même ; il peut supprimer).
8. **Écran d'administration** `/domains` (sidebar : « Domaines »), accessible aux rôles
   d'administration. Création, détails avec enregistrement DNS à copier, lancement de la
   vérification, promotion en principal, suspension (SUPER_ADMIN uniquement), suppression avec
   confirmation.
9. **Adminer** ajouté au `docker-compose.yml` sous le profil `tools`
   (`docker compose --profile tools up adminer`), exposé sur `localhost:8080` pour l'inspection
   de la base en développement ; **absent** de `docker-compose.prod.yml`.
10. **Nginx** forwarde maintenant `X-Forwarded-Host` ; le vhost reste `_` pour accepter tout
    hôte (le résolveur applicatif est la vraie décision de tenancy).

### Base de données

Migration `20261006000000_school_domains` :

- Table `SchoolDomain` avec clés étrangères vers `School`, `Organisation`, `User` (créateur).
- `UNIQUE(hostname)` global pour empêcher la revendication par deux écoles.
- `UNIQUE(schoolId) WHERE isPrimary = true` : un seul domaine principal par école.
- Index sur `schoolId`, `organisationId`, `status`.
- Relations `Organisation.domains`, `School.domains`, `User.createdDomains` ajoutées.

`npx prisma migrate diff --exit-code` : aucune différence entre la migration et le schéma.

### API

Nouvelles routes (toutes authentifiées sauf la dernière) :

- `GET  /api/domains` — liste des domaines visibles au compte (scopé par organisation/école).
- `GET  /api/domains/:id` — détail d'un domaine.
- `GET  /api/domains/:id/verification` — l'enregistrement DNS à publier.
- `POST /api/schools/:schoolId/domains` — création (PENDING par défaut).
- `PATCH /api/domains/:id` — bascule `isPrimary`, `status` (SUSPEND réservé SUPER_ADMIN), `notes`.
- `POST /api/domains/:id/verify` — challenge DNS TXT, promotion en ACTIVE.
- `DELETE /api/domains/:id` — suppression.
- `GET  /api/public/host` — résolution d'un hôte en identité publique d'école (pas d'auth).

### Frontend

- Nouvelle route `/domains` (`frontend/src/app/domains/page.tsx`).
- Nouvelle entrée « Domaines » dans la sidebar (icône `Globe` de lucide-react) pour les rôles
  `SUPER_ADMIN`, `ADMIN_ORGANISATION`, `DIRECTOR`.
- Écran : liste, modal de détails avec enregistrement DNS copiable, modal d'ajout, vérification,
  promotion en principal, suspension, suppression confirmée.
- Aucune nouvelle dépendance npm.

### Sécurité

- `UNIQUE(hostname)` global empêche toute prise de contrôle (deuxième école qui revendique).
- Un domaine ne peut devenir `isPrimary` qu'une fois `ACTIVE` (jamais publier une vitrine
  depuis un hôte non vérifié).
- Un `ADMIN_ORGANISATION` ne peut pas suspendre un domaine (il s'en exclurait lui-même) ; seul
  `SUPER_ADMIN` peut.
- Un domaine déjà `ACTIVE` reste live même si une revérification échoue : pas de coupure sur
  glitch DNS, mais `lastError` est enregistré et visible dans l'UI.
- Le résolveur ne fait jamais confiance au `Host` seul : il consulte la table `SchoolDomain`.
- Tous les changements sont enregistrés dans `AuditLog`.
- Validation stricte des hostnames côté DTO (regex RFC 1035, longueur ≤ 253, pas d'IP, pas
  d'URL, pas de port).

### Tests

- **Unitaires** (11 nouveaux dans `src/domains/domain-resolver.spec.ts`) :
  - `cleanHostname` : trim, strip du port, sélection du premier Host, refus des URL/paths,
    valeurs vides, hôtes > 253 caractères, acceptation de `localhost` et IP.
  - `generateVerificationToken` : unicité, format préfixé URL-safe.
  - `checkDnsVerification` : TXT trouvé, chunks DNS 255 caractères, mauvais jeton,
    `ENOTFOUND`/`ENODATA`.
- **E2E** (18 assertions dans `backend/test/e2e-domains.js`) : création, démarrage en PENDING,
  structure de l'enregistrement DNS, refus de la duplication par la même école et par une autre,
  isolation entre deux directions de deux organisations (lecture/patch/delete refusés), refus
  de la promotion en principal avant vérification, échec propre quand le DNS est absent,
  promotion après `ACTIVE`, résolution Host → école, pas de fuite sur hôte inconnu, suppression
  qui invalide le cache, journal d'audit.
- Suite complète : **262 tests unitaires** OK (31 suites), **30 tests frontend** OK, scénarios
  **e2e-tenancy**, **e2e-leaks**, **e2e-auth** rejoués : aucun échec, aucune régression.

### Non-régression

- Les 729 occurrences de `schoolId` existantes continuent de filtrer les requêtes métier
  (toujours portées par le JWT et le `TeacherScopeService`). Le `resolvedHost` n'est utilisé
  nulle part pour autoriser une action : il est purement informatif.
- Les 46 pages frontend existantes et les 294 endpoints restent inchangés.
- Prisma Studio, le seed, les migrations, les scénarios de bout en bout existants restent
  verts.

### Reste à faire

- **Certbot automatique** : la génération de certificats TLS pour un nouveau domaine
  personnalisé reste manuelle. À traiter dans **L5** avec `nginx-proxy-companion` ou
  `caddy` ou un `cert-manager` sur-mesure.
- **Status `SUBDOMAIN` auto-trusted** : fonctionne uniquement quand `PLATFORM_SUBDOMAIN_SUFFIX`
  est renseigné dans l'environnement. En développement, laisser vide ; en production, pointer
  vers le domaine racine du SaaS.
- **Push d'alerte** quand un domaine `ACTIVE` échoue à sa vérification périodique : à prévoir
  avec une tâche planifiée (actuellement, la vérification est manuelle, à la demande).

### Chemins ajoutés / modifiés

```
backend/prisma/schema.prisma                          (modèle SchoolDomain + relations)
backend/prisma/migrations/20261006000000_school_domains/migration.sql
backend/src/domains/domain-resolver.service.ts
backend/src/domains/domain-resolver.middleware.ts
backend/src/domains/domain-resolver.spec.ts
backend/src/domains/domains.service.ts
backend/src/domains/domains.controller.ts
backend/src/domains/domains.dto.ts
backend/src/domains/domains.module.ts
backend/src/domains/host.controller.ts
backend/src/domains/verification.ts
backend/src/app.module.ts                             (import DomainsModule)
backend/src/audit/audit.service.ts                    (ajout AREA_LABELS.domains)
backend/test/e2e-domains.js
docker-compose.yml                                    (service adminer, profil tools; env resolver)
deploy/nginx/proxy_params.conf                        (X-Forwarded-Host explicite)
.env.example                                          (PLATFORM_HOSTNAME, PLATFORM_SUBDOMAIN_SUFFIX)
.github/workflows/ci.yml                              (étape e2e-domains)
frontend/src/app/domains/page.tsx
frontend/src/components/Shell.tsx                     (icône Globe + entrée « Domaines »)
docs/EVOLUTION-SAAS.md                                (ce fichier)
```
