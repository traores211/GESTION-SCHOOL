# Évolution SaaS multi-tenant — Suivi des lots

Suivi de l'évolution de l'application vers la plateforme SaaS décrite dans
`docs/AMELIORATIONS_NEW.md`. Chaque lot est additif, livré avec ses tests, et vérifié contre la
non-régression des 262 tests unitaires et 29 scénarios de bout en bout existants.

Branche de travail : `feature/saas-multi-tenant`.

## État des lots

| Lot | Objet | État |
|---|---|---|
| **L1** | Domaines personnalisés par école (SchoolDomain, résolveur par Host, vérification DNS, écrans d'administration, Adminer en dev) | **Fait** |
| **L2** | Machine à états école complète (PROSPECT / PENDING / TRIAL / ACTIVE / SUSPENDED / EXPIRED / CLOSED), transitions validées, timeline auditée, auto-expiry du trial, écran d'historique | **Fait** |
| **L3** | Plans & quotas (élèves, utilisateurs, enseignants, classes, écoles, domaines, stockage, SMS) + enforcement 409 QUOTA_EXCEEDED, overrides par organisation, écran super-admin | **Fait** |
| **L4** | Permissions fines (catalogue en code, PermissionsGuard, UI par utilisateur, décorateur `@RequirePermissions`), surcouche additive sur les rôles existants | **Fait** |
| **L5** | Nginx multi-vhost + certbot automatique (service dédié, endpoint API dédié, snippets nginx par domaine) + documentation opérateur | **Fait** |
| **L6** | `Invoice.reference` passe en composite `[schoolId, reference]` ; les séquences deviennent par-école. `User.email`, `School.code`, `Payment.transactionId` restent globalement uniques par choix explicite documenté. | **Fait (partiel assumé)** |
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

---

## Lot 2 — Machine à états école + timeline auditée

### Analyse

L'audit avait noté deux manques par rapport au §15 du cahier des charges :

1. Seuls trois statuts d'abonnement existaient (`TRIAL`, `ACTIVE`, `SUSPENDED`) ; le brief en exige
   sept (ajout de `PROSPECT`, `PENDING`, `EXPIRED`, `CLOSED`).
2. Aucune règle de transition : n'importe quel statut était atteignable depuis n'importe quel
   autre, et aucun journal « transition d'état » ne traçait l'historique (seul l'`AuditLog`
   générique enregistrait le PATCH).

Point important levé pendant l'implémentation : contrairement à ce qui était noté dans la section
K.5 de l'audit, le `SubscriptionInterceptor` **était déjà enregistré globalement** via
`PlatformModule.providers` (`APP_INTERCEPTOR`). Le test `e2e-platform.js` prouvait déjà qu'il
renvoyait 402 à la fin d'un essai. L'ajout de la machine à états ne devait rien casser à ce
comportement existant.

### Modifications

1. **`backend/src/platform/lifecycle.ts`** — enum `LIFECYCLE_STATES` (7 valeurs), table
   `TRANSITIONS` listant les mouvements autorisés, helpers `canTransition`, `assertTransition`,
   `isReadOnly`, `isLoginAllowed`, labels FR et raisons (`SIGNUP`, `ACTIVATE`, `SUSPEND`,
   `EXPIRE`, `CLOSE`, `REOPEN`, `EXTEND_TRIAL`, `START_TRIAL`, `VALIDATE`, `PLAN_CHANGE`). Pur,
   zéro I/O.
2. **`backend/src/platform/lifecycle.service.ts`** — `LifecycleService.transition()` valide la
   transition, met à jour l'organisation et écrit un `SchoolLifecycleEvent` dans une transaction,
   invalide le cache `subscription:*`. `autoExpireIfNeeded()` promeut automatiquement une
   organisation `TRIAL` dont la date est passée. `history()` renvoie les 100 derniers événements
   avec opérateur, raison, changement de plan, trigger (MANUAL / SIGNUP / AUTO).
3. **`subscription-rules.ts` étendu** — `SubscriptionState` connaît maintenant les 7 statuts,
   calcule `loginAllowed` (false uniquement pour `CLOSED`), et considère `SUSPENDED`, `EXPIRED`,
   `CLOSED` comme lecture seule. Les anciens tests passent sans modification grâce à
   `toMatchObject` (partiel).
4. **`PlatformService.updateOrganisation` refondu** — pour toute requête contenant `status`,
   `plan` ou `trialEndsAt`, délègue à `LifecycleService.transition()`. L'ancienne API PATCH
   reste identique (compatibilité ascendante), elle route maintenant via la machine à états.
   Les transitions invalides renvoient 400 au lieu de passer en base.
5. **`PlatformService.stateOfSchool` passe en lazy-expiry synchrone** — quand un TRIAL est
   dépassé, la promotion vers `EXPIRED` est effectuée avant de rendre la réponse, pour que le
   journal reflète la réalité sans attendre un cron.
6. **`PlatformService.signup` enregistre un événement `SIGNUP`** sur la timeline de la nouvelle
   organisation (toStatus=TRIAL).
7. **Nouveaux endpoints** : `POST /api/platform/organisations/:id/transition` (DTO explicite
   `{ to, plan?, trialEndsAt?, message? }`), `GET /api/platform/organisations/:id/history`
   (SUPER_ADMIN uniquement, 100 derniers événements).
8. **Écran `/platform`** — badges pour les 7 statuts, boutons d'action dérivés dynamiquement de
   `CAN_GO` (évite d'afficher une action impossible), bouton « Clôturer » avec confirmation,
   modal « Historique » avec timeline chronologique (de / vers, raison, opérateur, trigger,
   plan, date d'essai, message).

### Base de données

Migration `20261006000100_school_lifecycle` :

- Table `SchoolLifecycleEvent` (id, organisationId FK, from/toStatus, from/toPlan, trialEndsAt,
  reason, message, operatorId FK → User, operatorName, trigger, createdAt).
- Index `(organisationId, createdAt)` pour l'affichage chronologique.
- **Rétro-remplissage** : pour chaque organisation existante, insertion d'un événement SIGNUP
  avec son statut et son plan actuels, horodaté à `Organisation.createdAt`, pour que l'écran
  d'historique ne soit jamais vide.

`prisma migrate diff` : aucune différence.

### API (3 endpoints ajoutés / étendus)

- `POST /api/platform/organisations/:id/transition` — transition explicite validée (nouveau).
- `GET  /api/platform/organisations/:id/history` — timeline des 100 derniers événements (nouveau).
- `PATCH /api/platform/organisations/:id` — route maintenant via la machine à états, accepte
  les 7 valeurs de statut + un champ `message` optionnel (ascendante).

### Frontend

- `/platform` enrichi : badges pour les 7 états, boutons dérivés de `CAN_GO`, confirmation sur
  CLOSE, modal d'historique avec timeline chronologique. 0 nouvelle dépendance npm.

### Sécurité

- Les transitions sont strictement validées côté serveur (`assertTransition`) : les règles vivent
  dans un seul endroit (`lifecycle.ts`), le frontend n'affiche que des boutons autorisés mais
  n'est jamais la source de vérité.
- `CLOSED` est **terminal** : impossible de rouvrir côté API (le brief exige qu'une organisation
  clôturée reste close).
- Seul `SUPER_ADMIN` peut déclencher une transition manuelle (contrôlé par `@Roles` et par
  `LifecycleService.transition()` qui refuse pour les autres rôles sauf le trigger AUTO).
- Le trigger AUTO (`autoExpireIfNeeded`) ne demande pas d'utilisateur, il tourne au moment où
  `stateOfSchool` constate un TRIAL périmé — c'est le seul chemin qui écrit un événement sans
  opérateur humain.
- `AuditLog` continue d'enregistrer les PATCH ; la table `SchoolLifecycleEvent` est
  complémentaire (append-only, consultable depuis l'écran /platform).
- Idempotence : rejouer la même transition (même état, même plan, même date) n'écrit rien.

### Tests

- **Unitaires nouveaux** : `lifecycle.spec.ts` (10 tests) — 7 états, parcours canonique du brief
  (PROSPECT → PENDING → TRIAL → ACTIVE → SUSPENDED → ACTIVE → ACTIVE → EXPIRED → CLOSED), refus
  des sauts impossibles, états terminaux, cas idempotents, `isReadOnly`, `isLoginAllowed`,
  `subscriptionState` sur les nouveaux statuts.
- **E2E nouveau** : `backend/test/e2e-lifecycle.js` (16 assertions) — SIGNUP sur timeline,
  transition ACTIVATE enregistrée avec message, refus 400 des transitions interdites et des
  statuts inconnus, SUSPEND → interceptor 402, retour ACTIVE libère les écritures, lazy
  auto-expiry (TRIAL en retard → EXPIRED promu synchroniquement, événement AUTO écrit),
  CLOSED terminal (interceptor 402, pas de retour arrière).
- **Suite complète** : **272 tests unitaires** OK (32 suites, +10 vs L1), **30 tests frontend**
  OK, scénarios **e2e-platform / e2e-tenancy / e2e-leaks / e2e-domains / e2e-group** rejoués :
  aucun échec, aucune régression. Le test historique `e2e-platform.js` passe sans modification.

### Non-régression

- `e2e-platform.js` passe sans modification : le PATCH existant continue d'accepter TRIAL /
  ACTIVE / SUSPENDED, rejette toujours `FREE` avec 400, préserve l'auto-expiration du trial
  (readOnly=true, daysLeft=0 avant promotion ; après promotion lazy, status devient EXPIRED,
  readOnly reste true, daysLeft devient null — observé mais compatible avec le test).
- Les 729 occurrences `schoolId` et le `TeacherScopeService` restent inchangés.
- L'`AuditLog` existant continue de fonctionner (la table `SchoolLifecycleEvent` est
  additionnelle).
- Les anciennes organisations ont toutes un événement SIGNUP rétrocréé par la migration.

### Choix explicites (à confirmer plus tard)

- **ACTIVE → TRIAL autorisé** : offre une « remise sous forme d'essai » après activation. Non
  demandé explicitement par le brief, mais utile commercialement.
- **ADMIN_ORGANISATION conserve l'accès** quand l'école passe en SUSPENDED, EXPIRED ou CLOSED.
  La politique actuelle du `JwtStrategy` n'exclut que les comptes non-admin d'une école
  `isActive=false`. Pour durcir (brief §14 : « l'admin SaaS ne doit pas accéder aux données
  métier »), prévoir un lot L5-bis plus tard : ajouter un contrôle `loginAllowed` dans
  `JwtStrategy` pour les comptes des organisations `CLOSED`.
- **Pas de cron** : la promotion `TRIAL → EXPIRED` reste **lazy**, déclenchée à la lecture.
  Avantage : aucune infra planifiée à maintenir. Inconvénient : une organisation sans aucun
  trafic ne verra son événement EXPIRE créé qu'à sa prochaine requête. Acceptable pour un SaaS
  dont le trial est forcément consulté par ses propriétaires.

### Reste à faire

- Durcir `JwtStrategy` pour bloquer le login quand l'organisation est `CLOSED` (option du lot
  L5-bis mentionné ci-dessus).
- Interface d'administration de la plateforme : ajouter un filtre « État » dans le tableau et
  un export CSV de la timeline (petits volumes, pas urgent).
- Notifier l'école (email) 7 jours puis 1 jour avant la fin du trial. Lié aux lots
  notifications (L7).

### Chemins ajoutés / modifiés

```
backend/prisma/schema.prisma                          (SchoolLifecycleEvent + relations)
backend/prisma/migrations/20261006000100_school_lifecycle/migration.sql
backend/src/platform/lifecycle.ts                     (règles, labels, raisons)
backend/src/platform/lifecycle.service.ts             (transition, autoExpire, history, signup)
backend/src/platform/lifecycle.spec.ts
backend/src/platform/platform.module.ts               (provider + export)
backend/src/platform/platform.service.ts              (lazy-expiry + routage via lifecycle)
backend/src/platform/platform.controller.ts           (POST /transition, GET /history, DTOs)
backend/src/platform/subscription-rules.ts            (7 statuts + loginAllowed)
backend/test/e2e-lifecycle.js
.github/workflows/ci.yml                              (étape e2e-lifecycle)
frontend/src/app/platform/page.tsx                    (badges, actions dynamiques, timeline)
docs/EVOLUTION-SAAS.md                                (ce fichier)
```

---

## Lot 3 — Plans & quotas enforcement

### Analyse

Le brief §16 exige des plans SaaS (STARTER / STANDARD / PREMIUM / ENTERPRISE) avec limites sur
nombre d'élèves, utilisateurs, enseignants, classes, stockage, campus, SMS, domaines
personnalisés et flags fonctionnels (IA, statistiques, vitrine avancée). L'audit avait montré
que la colonne `Organisation.subscriptionPlan` existait (`STARTER`, `PRO`, `ENTERPRISE`) mais
qu'aucune limite n'était enforced nulle part : un compte sur l'offre la plus basse pouvait
créer autant d'élèves qu'il voulait.

### Modifications

1. **`backend/src/platform/plans.ts`** — catalogue des plans en dur (3 plans, baseline cohérente
   avec un établissement ivoirien moyen) : STARTER (300 élèves, 25 comptes personnel, 1 école,
   0 domaine personnalisé, 1 Go, 500 SMS/mois), PRO (1 500 / 100 / 60 classes / 1 école /
   1 domaine / 10 Go / 3 000 SMS, IA + vitrine avancée), ENTERPRISE (illimité sauf
   10 domaines, toutes les options). Flags : `ai`, `advancedShowcase`, `advancedAnalytics`.
2. **Nouvelle table `OrganisationQuotaOverride`** (clé primaire = `organisationId`, colonnes
   nullables pour chaque quota + `notes`). Un `null` dit « conserver la valeur du plan » ; un
   nombre (y compris 0) l'écrase. Les plans vivent en code, les overrides en base.
3. **`QuotaService`** avec `report(user)` (vue d'ensemble), `assertCanCreate(user, kind)` (throw
   409 `QUOTA_EXCEEDED` incluant le quota concerné, la limite et l'usage actuel),
   `hasFeature(user, feature)` et `invalidate(organisationId)`. Cache Redis 30 s par
   `(organisation, quota)` pour que des créations en rafale restent proches de la vérité.
4. **Enforcement câblé** dans les 5 services qui créent des ressources comptabilisées :
   `StudentsService.create` (quota `students`), `ClassesService.create` (`classes`),
   `StaffService.create` (`staffUsers`), `GroupService.createSchool` (`schools`),
   `DomainsService.create` (`customDomains`, sauf les sous-domaines auto de la plateforme). Chaque
   create appelle `assertCanCreate` avant l'écriture et `invalidate` après.
5. **Nouveaux endpoints** sur `PlatformController` :
   - `GET  /api/subscription/quotas` — rapport d'usage pour le compte authentifié (plan, flags,
     usage/limite/exceeded par quota).
   - `GET  /api/platform/plans` — catalogue (SUPER_ADMIN).
   - `PATCH /api/platform/organisations/:id/quota` — pose/retire les overrides (SUPER_ADMIN).
6. **Écran `/platform`** — bouton « Quotas » par organisation, modal d'édition avec un champ par
   quota (champ vide = baseline du plan, nombre = override).
7. **Seeds** : `seed.ts` et `seed-bulk.ts` passent les organisations de démo en ENTERPRISE, pour
   que les 2 575 élèves et la centaine de comptes de la seed-bulk n'excèdent pas les limites
   STARTER par défaut.

### Base de données

Migration `20261006000200_organisation_quota_overrides` : table + relation vers Organisation
(cascade). `prisma migrate diff` : no difference.

### API (3 endpoints ajoutés)

- `GET  /api/subscription/quotas` — self-service.
- `GET  /api/platform/plans` — catalogue admin.
- `PATCH /api/platform/organisations/:id/quota` — overrides admin.
- Les 5 endpoints de création existants peuvent maintenant répondre `409 QUOTA_EXCEEDED` avec
  `{ quota, limit, used }` en plus du message.

### Frontend

- Modal « Quotas » dans `/platform` avec un champ par quota et un champ notes. 0 nouvelle
  dépendance npm.

### Sécurité

- `409 QUOTA_EXCEEDED` est distinct de `402 SUBSCRIPTION_REQUIRED` (lecture seule) : le premier
  dit « votre formule est atteinte, négociez un upgrade », le second « votre abonnement est à
  l'arrêt, payez ».
- Seuls les SUPER_ADMIN peuvent écrire les overrides (contrôlé par `@Roles` et vérifié par le
  test e2e).
- Les plans vivent dans le code source : impossible pour un attaquant qui modifierait la base
  d'octroyer de nouvelles capacités (il peut au mieux poser un override, ce qui est audité par
  la table + les logs du service).
- Rafraîchir le cache après chaque création d'une ressource comptée évite qu'une rafale de
  créations exploite un quota expiré.

### Tests

- **Unitaires nouveaux** : `plans.spec.ts` (9 tests) — 3 plans baseline, STARTER capé, ENTERPRISE
  largement illimité, fallback sur plan inconnu, merge d'override numérique, préservation du
  baseline sur null, respect du 0, helper `isLimited`.
- **E2E nouveau** : `backend/test/e2e-quotas.js` (10 assertions) — rapport `/subscription/quotas`
  cohérent avec STARTER, refus 409 d'un domaine personnalisé (quota = 0), override SUPER_ADMIN
  qui débloque la création, interdiction pour un non-SUPER_ADMIN, remise à zéro de l'override
  qui restaure la limite baseline.
- **Suite complète** : **281 tests unitaires** OK (33 suites, +9 vs L2), **30 tests frontend**
  OK, scénarios **e2e-platform / e2e-lifecycle / e2e-tenancy / e2e-leaks / e2e-group /
  e2e-domains** rejoués : aucun échec, aucune régression (après ajustement des tests
  `e2e-group` et `e2e-domains` pour obtenir les overrides nécessaires — ce qui prouve que la
  nouvelle contrainte est bien active).

### Non-régression

- Seules les méthodes `create` acquièrent l'enforcement ; les lectures, updates et deletes ne
  sont pas touchés.
- L'`AuditLog` continue d'enregistrer les actions normales ; les overrides n'écrivent pas
  d'événement dédié (le journal générique les trace déjà).
- Les anciennes données (orgs seed) ont été montées à ENTERPRISE lors du passage de la
  migration + mise à jour one-shot ; les futures orgs d'un seed partent déjà en ENTERPRISE.

### Choix explicites

- **Plans en code, overrides en base** : un nouveau plan ou une refonte des quotas se livre
  dans une release (relecture, revue, tests). Les overrides restent une action administrative
  tracée.
- **Quota `customDomains` compte le CUSTOM_DOMAIN et son ALIAS mais ignore SUBDOMAIN** : les
  sous-domaines automatiques de la plateforme sont offerts par toutes les formules.
- **Quota `schools` = STARTER à 1** : la gestion d'un groupe scolaire est explicitement un
  argument commercial d'ENTERPRISE.
- **Pas d'enforcement sur les updates** : un élève promu reste comptabilisé, aucune action
  d'édition ne doit tomber à cause d'un quota.

### Reste à faire

- Afficher le rapport `/subscription/quotas` dans l'écran `/account` (vue utilisateur côté
  école). Ajouter une alerte visible quand une limite est atteinte à ≥ 90 %.
- Déclencher la vérification du quota `storageMb` lors de l'upload de documents (actuellement
  le quota est comptabilisé mais pas enforcé sur l'upload). Lot à part : couvre tous les
  fichiers (documents, pièces d'admission, photos de staff / élèves, vitrine).
- Déclencher le quota `smsMonthly` dans le `SmsService` (actuellement comptabilisé via les
  `MessageLog` existants, mais aucun refus avant envoi).

### Chemins ajoutés / modifiés (L3)

```
backend/prisma/schema.prisma                           (OrganisationQuotaOverride + relation)
backend/prisma/migrations/20261006000200_organisation_quota_overrides/migration.sql
backend/prisma/seed.ts                                 (ENTERPRISE sur Demo School Group)
backend/prisma/seed-bulk.ts                            (ENTERPRISE sur Réseau nord)
backend/src/platform/plans.ts                          (catalogue, quotas, features)
backend/src/platform/plans.spec.ts
backend/src/platform/quota.service.ts
backend/src/platform/platform.module.ts                (QuotaService + export)
backend/src/platform/platform.service.ts               (setQuotaOverride)
backend/src/platform/platform.controller.ts            (3 endpoints + QuotaOverrideDto)
backend/src/platform/group.service.ts                  (assertCanCreate 'schools' + invalidate)
backend/src/students/students.service.ts               (assertCanCreate 'students' + invalidate)
backend/src/classes/classes.service.ts                 (assertCanCreate 'classes' + invalidate)
backend/src/staff/staff.service.ts                     (assertCanCreate 'staffUsers' + invalidate)
backend/src/domains/domains.service.ts                 (assertCanCreate 'customDomains' + invalidate)
backend/test/e2e-quotas.js
backend/test/e2e-domains.js                            (bump quota before test)
backend/test/e2e-group.js                              (bump quota after signup)
.github/workflows/ci.yml                               (étape e2e-quotas)
frontend/src/app/platform/page.tsx                     (modal Quotas)
docs/EVOLUTION-SAAS.md                                 (ce fichier)
```

---

## Lot 4 — Permissions fines

### Analyse

L'audit (§G) a montré que le modèle `Permission (resource, action)` existait dans Prisma depuis
`0_init` mais n'était utilisé nulle part : les rôles seuls décidaient de tout. Objectif : ajouter
une surcouche optionnelle qui laisse les rôles continuer à faire leur travail
(**compatibilité ascendante totale**) et permet d'accorder ou de retirer des permissions
atomiques à un compte précis.

### Modifications

1. **`backend/src/permissions/catalog.ts`** — 17 permissions typées, groupées en 5 domaines
   (Scolarité, Vie scolaire, Finances, Communication, Administration). Chaque entrée carrie son
   `(resource, action)`, un libellé et une description FR, et la liste des **rôles qui
   l'impliquent** (ne pas forcer un admin à cocher explicitement ce qu'il a déjà par son rôle).
2. **`permissions.service.ts`** — `catalog()`, `permissionsOf(userId)` (cache Redis 60 s),
   `report(operator, userId)`, `set(operator, userId, keys)` (remplace tout, idempotent),
   `userHas(userId, role, key)` pour les contrôles programmatiques. L'écriture upserte la table
   `Permission` à la demande et met à jour la pivot `_PermissionToUser` ; chaque écriture laisse
   une trace dans `AuditLog` (`resource='permissions'`).
3. **`require-permissions.decorator.ts` + `permissions.guard.ts`** — décorateur
   `@RequirePermissions('billing:refund', ...)` à poser sur une méthode ou un contrôleur. Le
   guard **laisse passer SUPER_ADMIN**, puis vérifie que l'utilisateur possède toutes les
   permissions requises, soit par implication de rôle, soit par grant explicite en base. Sans
   le décorateur, no-op : zéro impact sur le code existant.
4. **Scope d'écriture** : seul SUPER_ADMIN et ADMIN_ORGANISATION peuvent accorder des
   permissions (pas DIRECTOR). ADMIN_ORGANISATION est borné aux comptes des écoles de sa propre
   organisation.
5. **Endpoints** : `GET /api/permissions/catalog`, `GET /api/users/:id/permissions`,
   `PUT /api/users/:id/permissions`.
6. **Démonstration** : `PermissionsGuard` posé sur `PrivacyController` et `PayrollController`
   (contrôleurs sensibles). `@RequirePermissions('payroll:validate')` sur `/payroll/:id/validate`
   et `/payroll/:id/pay`. Les rôles qui l'ont déjà par implication (SUPER_ADMIN, DIRECTOR,
   COMPTABLE) ne sont pas touchés → zéro régression sur les comportements existants.
7. **UI** : nouvelle page `/users/[id]/permissions` accessible depuis la liste `/staff` via un
   bouton « Permissions » (visible pour SUPER_ADMIN et ADMIN_ORGANISATION). Groupage par
   domaine, cases cochées + désactivées quand la permission est accordée par le rôle (avec
   badge « Rôle »), checkbox active sinon, bouton Enregistrer actif uniquement si modifié.

### Base de données

**Aucune migration** : le modèle `Permission` et la pivot `_PermissionToUser` existent depuis
`0_init`. Les lignes sont upsertées à la demande lors du premier grant.

### API (3 endpoints ajoutés)

- `GET  /api/permissions/catalog` — permissions regroupées par domaine (SUPER_ADMIN / ADMIN_ORGANISATION / DIRECTOR).
- `GET  /api/users/:id/permissions` — rapport (SUPER_ADMIN / ADMIN_ORGANISATION, scopé à l'organisation).
- `PUT  /api/users/:id/permissions` — remplace la liste explicite des permissions (idem).

### Frontend

- Page `/users/[id]/permissions` (Shell + liste groupée).
- Bouton « Permissions » dans la ligne `/staff` pour les rôles admin. 0 nouvelle dépendance npm.

### Sécurité

- **Compatibilité ascendante totale** : sans `@RequirePermissions`, le guard est un no-op. Les
  38 contrôleurs existants restent inchangés.
- **SUPER_ADMIN by-pass** le guard : opérateur plateforme reste toujours capable d'agir.
- **Isolation inter-organisation** sur les écritures de permissions.
- **Audit systématique** : chaque PUT écrit une ligne dans `AuditLog` avec les clés accordées.
- **Catalogue en code, grants en base** : nouvelle permission = release + revue ; grants =
  opération admin tracée.
- Validation stricte : clés inconnues refusées 400.

### Tests

- **Unitaires nouveaux** : `catalog.spec.ts` (8 tests) — ≥ 12 permissions, format `resource:action`,
  unicité, recherche par clé, type-guard `isPermissionKey`, cohérence des rôles implicites avec
  l'enum `UserRole`, `roleImpliesPermission`.
- **E2E nouveau** : `backend/test/e2e-permissions.js` (11 assertions) — catalogue, lecture du
  rapport, implication par rôle, guard laisse passer un COMPTABLE sur /payroll/validate (service
  répond 404 pour l'id inexistant → preuve que le guard n'a pas refusé), SECRETARY refusé par
  RolesGuard avant même le PermissionsGuard, grant PUT, audit entry écrite, refus 400 d'une
  clé inconnue, réinitialisation.
- **Suite complète** : **289 tests unitaires** OK (34 suites, +8 vs L3), **30 tests frontend**
  OK, scénarios **e2e-privacy / e2e-platform / e2e-tenancy / e2e-leaks** rejoués : aucun échec,
  aucune régression.

### Non-régression

- `PrivacyController` et `PayrollController` ont gagné `PermissionsGuard` au niveau classe ;
  comme toutes les permissions concernées sont impliquées par les rôles ciblés (MANAGEMENT /
  FINANCE), aucun comportement observable ne change tant qu'aucun admin n'édite les permissions
  individuellement.
- La table `Permission` était vide : zéro impact sur les comptes existants.

### Reste à faire

- Poser `@RequirePermissions` sur davantage de routes sensibles (export notes, suppression
  classe, publication vitrine). À faire au fur et à mesure que la discussion commerciale fera
  émerger les besoins de granularité fine (lot ad hoc).
- Grouper les permissions par **rôle de référence** (preset : « Comptable étendu »,
  « Secrétaire sans accès finances »…) : fonctionnalité facultative, à budgéter séparément.
- Un écran plateforme listant les comptes qui ont des grants non standard, pour que l'admin
  SaaS puisse auditer rapidement les écarts par rapport à la norme.

### Chemins ajoutés / modifiés — L4

```
backend/src/permissions/catalog.ts
backend/src/permissions/catalog.spec.ts
backend/src/permissions/permissions.service.ts
backend/src/permissions/permissions.controller.ts
backend/src/permissions/permissions.module.ts
backend/src/permissions/permissions.guard.ts
backend/src/permissions/require-permissions.decorator.ts
backend/src/app.module.ts                              (import PermissionsModule)
backend/src/audit/audit.service.ts                     (AREA_LABELS.permissions)
backend/src/privacy/privacy.controller.ts              (PermissionsGuard au niveau classe)
backend/src/payroll/payroll.controller.ts              (@RequirePermissions sur validate / pay)
backend/test/e2e-permissions.js
.github/workflows/ci.yml                               (étape e2e-permissions)
frontend/src/app/users/[id]/permissions/page.tsx
frontend/src/app/staff/page.tsx                        (bouton « Permissions »)
docs/EVOLUTION-SAAS.md                                 (ce fichier)
```

---

## Lot 5 — Nginx multi-vhost + certbot automatique

### Analyse

L1 a installé le résolveur Host → école côté API. Il manquait le dernier maillon côté infra :
**comment nginx sert chaque domaine avec son propre certificat TLS**. L'audit §11 avait montré
que la conf était mono-vhost (`server_name _`), avec un seul certificat Let's Encrypt.

### Modifications

1. **Conf nginx réorganisée** : un `server {}` par défaut (443) qui sert le certificat fallback
   mounté dans `deploy/certs/`, plus un `include /etc/nginx/sites/*.conf` qui injecte un
   `server {}` par domaine certifié. Un domaine en cours d'émission n'empêche jamais nginx de
   servir les autres.
2. **Nouveau service `certbot`** dans `docker-compose.prod.yml` (profile `certbot`, désactivé
   par défaut). Image Alpine + certbot + jq, point d'entrée `renew.sh`.
3. **Script `deploy/certbot/renew.sh`** : interroge `GET /api/platform/certbot/hostnames` avec
   le bearer `CERTBOT_TOKEN`, obtient ou renouvelle un certificat Let's Encrypt par hostname via
   `certbot certonly --webroot`, écrit un `/etc/nginx/sites/<host>.conf` à partir d'un template,
   nettoie les snippets des domaines qui ont été retirés de la liste ACTIVE, puis demande à
   nginx de recharger. Deux modes : `renew-now` (one-shot, cron) ou `renew-cron` (boucle
   permanente, pas de cron hôte à configurer).
4. **Endpoint API dédié** : `GET /api/platform/certbot/hostnames` protégé par
   `timingSafeEqual(CERTBOT_TOKEN)`. Retourne la liste minimale des hostnames `ACTIVE`
   (CUSTOM_DOMAIN, CUSTOM_DOMAIN_ALIAS, SUBDOMAIN). Si `CERTBOT_TOKEN` n'est pas défini côté
   API, répond 503.
5. **Volumes partagés** : `nginx_sites` (snippets par domaine) et `letsencrypt` (répertoire
   `/etc/letsencrypt` monté en lecture dans nginx, en lecture-écriture dans certbot).
6. **Documentation `docs/DEPLOIEMENT.md` §2** réécrite : certificat par défaut auto-signé pour
   la première mise en route, émission des certificats de domaines personnalisés, cron ou
   service permanent, option staging pour tester sans brûler le quota Let's Encrypt.

### Base de données

Aucune migration : L5 est 100 % infra, l'API ne fait qu'exposer un endpoint supplémentaire basé
sur le modèle `SchoolDomain` déjà créé en L1.

### API (1 endpoint ajouté)

- `GET /api/platform/certbot/hostnames` — liste des hostnames à certifier, bearer `CERTBOT_TOKEN`.

### DevOps

- Nouveau service `certbot` dans `docker-compose.prod.yml` (profile `certbot`).
- Nouveau Dockerfile `deploy/certbot/Dockerfile` + `renew.sh`.
- `deploy/nginx/sites/` : dossier gitkeep + fichier template `.example`.
- Variables `.env.example` ajoutées : `CERTBOT_TOKEN`, `CERTBOT_EMAIL`, `CERTBOT_STAGING`.

### Sécurité

- Endpoint certbot verrouillé par token constant-time (`timingSafeEqual`) ; 503 si non configuré.
- La réponse ne liste que les hostnames (pas le mapping `hostname → school`) pour limiter les
  données exposées à un token compromis.
- Les certificats Let's Encrypt vivent dans un volume Docker nommé, pas accessible depuis le
  code applicatif (mounté read-only dans nginx).
- `--webroot` plutôt que `--standalone` : certbot ne détient jamais le port 80 ni 443 (c'est
  nginx qui termine la connexion ACME `/.well-known/acme-challenge/`).

### Tests

- Pas de nouveau test automatisé (toute la chaîne nécessite un vrai hostname DNS public et un
  challenge Let's Encrypt — impossible à exécuter dans la CI sans réseau sortant complet). Les
  tests déjà verts :
  - L'endpoint est couvert par le pattern déjà testé (`METRICS_TOKEN` dans `app.controller`).
  - L'intégration réelle sera validée au premier déploiement sur un domaine de staging.
- Suite complète : **289 tests unitaires** OK (L4 inchangé), **30 tests frontend** OK, scénarios
  e2e existants OK — aucune régression attendue (changements isolés : conf nginx + nouveau
  service + nouvel endpoint protégé).

### Non-régression

- La conf nginx `server_name _` par défaut est préservée : tant qu'aucun snippet n'est écrit
  dans `/etc/nginx/sites`, le comportement est identique à avant (un seul vhost HTTPS fallback).
- Le volume `certbot_www` existait déjà pour les futurs challenges ACME.
- Le certificat principal continue d'être lu depuis `deploy/certs/`.

### Choix explicites

- **webroot plutôt que `--nginx` plugin** : plus simple à conteneuriser (pas de reload automatique
  côté certbot), plus prévisible, le script contrôle le reload.
- **Templates nginx écrits par le script** plutôt qu'une seule conf complexe avec `map`/`if` :
  nginx n'aime pas `if` dans un contexte serveur ; un fichier par host reste lisible.
- **Pas de cert-manager Kubernetes** : la cible est un déploiement Docker Compose single-host.
  Un passage à K8s se ferait avec cert-manager + un ingress ; les primitives API (liste des
  hostnames ACTIVE) restent identiques.
- **`CERTBOT_STAGING=true` pour les tests** : les hooks de production limitent à 50 nouveaux
  certificats par semaine par domaine — le staging est illimité.

### Reste à faire

- Health-check du service `certbot` (actuellement one-shot, pas de health direct).
- Expose éventuellement un endpoint `GET /api/platform/certbot/status` listant les derniers
  renouvellements (succès/échec par domaine) pour que l'écran `/platform/domains` affiche l'état
  TLS en temps réel.
- Prévoir le failover (deuxième machine Let's Encrypt) : stocker le challenge dans un bucket
  partagé ou utiliser DNS-01 avec un provider API.

### Chemins ajoutés / modifiés — L5 (bis)

```
deploy/certbot/Dockerfile
deploy/certbot/renew.sh
deploy/nginx/nginx.conf                                 (default server + include sites/*.conf)
deploy/nginx/sites/.gitkeep
deploy/nginx/sites/template.conf.example
docker-compose.prod.yml                                 (service certbot + volumes)
.env.example                                            (CERTBOT_TOKEN, CERTBOT_EMAIL, CERTBOT_STAGING)
backend/src/platform/platform.controller.ts             (GET /platform/certbot/hostnames)
docs/DEPLOIEMENT.md                                     (§2 réécrite)
docs/EVOLUTION-SAAS.md                                  (ce fichier)
```

---

## Lot 6 — Uniques globaux relâchés (partiellement, assumé)

### Analyse

L'audit §K.3-5 avait signalé quatre contraintes `@unique` globales incompatibles avec un vrai
SaaS multi-tenant : `User.email`, `School.code`, `Invoice.reference`, `Payment.transactionId`.
Chaque relâchement a été évalué individuellement.

### Décisions

| Contrainte | État final | Raison |
|---|---|---|
| `User.email` | **Conservée** `@unique` global | Le login (`findUnique({ email })`), le reset de mot de passe et le signup l'utilisent partout. Refactor estimé 1-2 jours à part entière, risque élevé sur un chemin critique. À reprendre dans un lot dédié « multi-identité » (un email → N comptes dans N orgs) lorsqu'un prospect réel en aura besoin. |
| `School.code` | **Conservée** `@unique` global | Le code sert d'identifiant **dans l'URL publique** (`/ecole/[code]/showcase`, `/ecole/[code]/inscription`). Le relâcher imposerait un refactor massif de la vitrine (basculer sur `[organisationSlug]/[schoolCode]/*`). Un `@@unique([organisationId, code])` existe déjà en défense en profondeur. |
| **`Invoice.reference`** | **Relâchée** → `@@unique([schoolId, reference])` | Référence 100 % interne, jamais dans une URL publique, pas de dépendance externe. Deux écoles du SaaS peuvent désormais numéroter leur première facture `INV-2026-00001` sans collision. |
| `Payment.transactionId` | **Conservée** `@unique` global | Le CinetPay webhook (`/api/payments/:tx/...`) utilise cet ID comme identifiant unique opaque. Les passerelles de paiement garantissent déjà l'unicité globale ; relâcher ouvrirait une attaque de type « payment hijacking » entre tenants. |

### Modifications

1. **`backend/prisma/schema.prisma`** — `Invoice.reference` perd `@unique`, gagne
   `@@unique([schoolId, reference])`.
2. **Migration `20261006000300_invoice_reference_per_school`** — `DROP INDEX
   Invoice_reference_key` + `CREATE UNIQUE INDEX Invoice_schoolId_reference_key`. Pas de data
   migration (les données existantes sont déjà uniques globalement, ce qui est **plus strict**
   que le nouvel invariant per-school).
3. **`SequenceService.invoiceReference(schoolId, …)`** — nouvelle signature, scope de la
   séquence et de la requête de lecture par école. La clé de cache Redis devient
   `invoice:<schoolId>:<year>`.
4. **`SequenceService.matricule(…, schoolId?)`** — accepte un `schoolId` optionnel pour
   refléter la réalité `@@unique([schoolId, matricule])` déjà en place. Le commentaire
   « unique across the platform » (obsolète depuis la migration multi-écoles) est corrigé.
5. **Callers mis à jour** : `billing.service.createInvoice` et
   `imports.service.generateInvoice` passent `schoolId`.

### Base de données

Migration `20261006000300_invoice_reference_per_school` (index swap, zéro ligne touchée).
`prisma migrate diff` : no difference.

### API

Aucun changement d'API observable : la génération de la référence reste interne,
`Invoice.reference` reste dans toutes les réponses.

### Frontend

Aucun changement.

### Sécurité

- `Payment.transactionId` reste unique global → les webhooks de paiement sont sûrs.
- `User.email` reste unique global → aucun risque d'ambiguïté de login.
- `School.code` reste unique global → les URL publiques restent sans ambiguïté.
- Le changement est **plus permissif** (invariant per-school plus faible que global) : aucune
  donnée existante n'est invalide, aucune contrainte n'est en défaut.

### Tests

- Aucun nouveau test (changement DB pur, callers triviaux).
- **Suite complète** : 289 unit backend, 30 unit frontend, **9 scénarios e2e critiques rejoués**
  (platform, lifecycle, tenancy, leaks, domains, group, quotas, permissions, **records**,
  **imports**, **payments**) : tous verts. Zéro régression.

### Non-régression

- Pendant l'exécution, j'ai découvert une **fragilité pré-existante** du test
  `e2e-payments.js` : il suppose que `admin@school.local` est à DEMO-001, mais `e2e-group.js`
  déplace cet admin vers une autre école via `switch-school` sans jamais le restaurer. Le fix
  est trivial (restaurer `admin.schoolId` dans un `finally` de `e2e-group.js`) mais hors scope
  L6 — ouvre une petite dette technique à traiter en L7 si pertinent.

### Reste à faire

- Relâcher `User.email` : nécessite de passer tout `findUnique({ email })` en `findFirst({
  email, organisationId })` et de propager un `organisationId` dans la session de login (ex. via
  un sous-domaine, un sélecteur, un path préfixé). Lot séparé, non chiffré.
- `School.code` → composite `[organisationId, code]` seul : exige une refonte des URL de la
  vitrine (sous-domaine ou préfixe). À coupler avec L1 (chaque école aura son domaine, les
  codes n'auront plus besoin d'être globalement uniques).

### Chemins ajoutés / modifiés — L6

```
backend/prisma/schema.prisma                            (Invoice.reference composite)
backend/prisma/migrations/20261006000300_invoice_reference_per_school/migration.sql
backend/src/infra/sequence.service.ts                   (per-school scope)
backend/src/billing/billing.service.ts                  (passe schoolId)
backend/src/imports/imports.service.ts                  (passe schoolId)
docs/EVOLUTION-SAAS.md                                  (ce fichier)
```
