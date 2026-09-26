# Audit technique — GESTION SCHOOL (Phase 0)

> Date : 2026-09-26 · Base auditée : `main` @ `4d87ebe` · Méthode : lecture intégrale du backend (`backend/src`, 97 fichiers), du schéma Prisma, du frontend (`frontend/src`, ~4 100 lignes), de l'outillage (Docker, compose, lockfile), puis exécution réelle de l'install, du type-check, des builds, des tests et de `npm audit`.
> Chaque constat indique **où** (fichier:ligne quand utile), **pourquoi c'est un problème**, et **comment il a été vérifié**.

## 1. Stack actuelle

| Couche | Technologie | Version (lockfile / manifeste) | Remarque |
|---|---|---|---|
| Monorepo | npm workspaces (`backend`, `frontend`) | npm 10 | lockfile racine **désynchronisé** (voir §6) |
| Backend | NestJS 10, Express | `@nestjs/*` ^10 | modules par domaine, bonne base |
| ORM / BD | Prisma 5 · PostgreSQL 16 | `prisma` ^5.4 | `db push`, **aucune migration versionnée** |
| Auth | JWT HS256 (`@nestjs/jwt`, `passport-jwt`), bcrypt | — | token 24 h, pas de refresh, pas de révocation |
| Validation | class-validator + `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`) | — | bon point |
| PDF | pdfkit (bulletins, bulletins de paie) | 0.15 | rendu codé en dur, pas de templates |
| Frontend | Next.js 15 (App Router), React 18 | — | 100 % composants client, `fetch` maison |
| Styles | CSS global maison (`globals.css`, 421 lignes) | — | Tailwind installé **mais inutilisé** |
| Infra locale | docker-compose : postgres, redis, openldap, mailhog, backend, frontend, nginx (profil) | — | redis / ldap / mailhog **non utilisés par le code** |
| CI | aucune sur `main` | — | un kit DevSecOps existe sur la branche `chore/devsecops-kit` (non mergée) |

Dépendances déclarées mais non utilisées dans le code : `ldapjs`, `next-auth`, `axios`, `tailwindcss` (vérifié par `grep`). Elles augmentent la surface d'attaque et le volume `npm audit` sans valeur.

## 2. Cartographie de l'architecture

```
Navigateur ──► Next.js (3000, rendu client) ──fetch + Bearer JWT (localStorage)──► NestJS (4000, /api)
                                                                                    │
                                                         Prisma (1 client, sans filtre tenant global)
                                                                                    ▼
                                                                          PostgreSQL (schéma unique)
```

- **Tenant** : `Organisation` 1─n `School`. La clé d'isolation effective est `School.id`, portée par `user.schoolId` dans le JWT. L'isolation est faite **à la main dans chaque méthode de service** (`if (x.schoolId !== user.schoolId) throw`). Rien ne la garantit globalement : un oubli = une fuite.
- **Autorisation** : `RolesGuard` + `@Roles()` existent (`backend/src/common/`) mais **ne sont utilisés par aucun contrôleur** (vérifié : `grep -rn "@Roles\|RolesGuard" backend/src` → seulement leurs définitions). Seul `JwtAuthGuard` est appliqué. Le modèle `Permission` du schéma n'est jamais lu.
- **Frontend** : le filtrage par rôle n'existe que dans le menu (`Shell.tsx`, `NAV_ITEMS`) — c'est de la présentation, pas de la sécurité.
- **Asynchrone** : aucun worker, aucune file ; notifications écrites en base de façon synchrone dans la requête (boucle `await` par parent).

## 3. Inventaire fonctionnel (ce qui ne doit pas être cassé)

| Module | Backend | Frontend | Rôles visés (menu) | Couverture de test |
|---|---|---|---|---|
| Authentification | `POST /auth/login`, `GET /users/me` | `/login` | tous | ❌ |
| Tableau de bord | `GET /dashboard/overview` (KPI élèves, enseignants, classes, admissions, présence du jour, finances) | `/dashboard` | admin, DIR, SEC, COMPTA, ENS | ❌ |
| Élèves | CRUD `/students`, fiche 360° | `/students`, `/students/[id]` | admin, DIR, SEC, ENS | ❌ |
| Parents | CRUD `/parents`, liaison élèves | `/parents` | admin, DIR, SEC | ❌ |
| Personnel | `/staff` (création compte + mot de passe temporaire, salaire) | `/staff` | admin, DIR | ❌ |
| Années / trimestres | `/academic-years` (3 trimestres auto) | (dans Notes) | — | ❌ |
| Classes | CRUD `/classes`, inscription/désinscription | `/classes`, `/classes/[id]` | admin, DIR, SEC, ENS | ❌ |
| Matières | `/subjects`, affectation classe/enseignant/coef | (dans Notes) | — | ❌ |
| Admissions | workflow 10 statuts, création élève à `INSCRIPTION` | `/admissions` | admin, DIR, SEC | ❌ |
| Présences | appel par classe/date, stats du jour, justification, notification parents | `/attendance` | admin, DIR, SEC, ENS | ❌ |
| Notes & bulletins | saisie par lot, moyennes pondérées, rang, PDF | `/grades` | admin, DIR, ENS | ❌ |
| Facturation | factures multi-lignes, paiements (espèces, mobile money **simulé**), solde, stats, notification parents | `/billing` | admin, DIR, SEC, COMPTA | ❌ |
| Paie | génération mensuelle, primes/retenues, validation, paiement, PDF | `/payroll` | admin, DIR, COMPTA | ❌ |
| Transport | véhicules, circuits, abonnements, ping GPS **simulé** | `/transport` | admin, DIR, SEC | ❌ |
| Annonces | CRUD, publiées sur la vitrine | `/announcements` | admin, DIR | ❌ |
| Notifications | in-app, non lues, tout marquer lu | cloche (`NotificationBell`) | tous | ❌ |
| Portail parent | enfants, détail (notes, présences, factures) | `/portal` | PARENT | ❌ |
| Vitrine publique | `GET /public/schools/:code/showcase`, `POST .../admissions` | `/ecole/[code]`, `/ecole/[code]/inscription` | anonyme | ❌ |

Ces 18 parcours constituent le **périmètre de non-régression** (voir `docs/testing/` à venir et `docs/roadmap/plan-implementation.md` §Risques).

## 4. Sécurité — constats classés

### Critique

| ID | Constat | Où | Impact | Preuve |
|---|---|---|---|---|
| SEC-01 | **Aucune autorisation par rôle côté serveur.** Tout compte authentifié d'une école (PARENT, ELEVE, ENSEIGNANT) peut appeler toutes les routes de son école : lire la paie et la modifier (`PATCH /payroll/:id`, `/pay`), changer un salaire (`PATCH /staff/:id/salary`), créer un compte DIRECTOR (`POST /staff`), supprimer un élève, enregistrer un paiement. | tous les `*.controller.ts` (seul `JwtAuthGuard`) | élévation de privilèges, fraude financière, fuite de données de mineurs | `grep` : `RolesGuard` jamais appliqué |
| SEC-02 | **Fuite des salaires.** `GET /staff` renvoie `staffMember.baseSalary` de tout le personnel ; la page Classes l'appelle pour tout utilisateur, y compris un enseignant. | `staff.service.ts` `findAll` ; `frontend/src/app/classes/page.tsx` | données RH confidentielles exposées | lecture du code + cartographie des appels |
| SEC-19 | **Hash bcrypt des mots de passe renvoyé au client.** Les requêtes `include: { user: true }` renvoient l'enregistrement `User` complet, champ `password` compris : `GET /classes`, `GET /classes/:id`, `POST /classes`, `POST /subjects/:id/assign`, `GET /payroll`, `GET /payroll/:id/pdf` (en mémoire). | `classes.service.ts`, `subjects.service.ts`, `payroll.service.ts` | cassage hors ligne des mots de passe du personnel | découvert pendant le lot S0 ; test statique ajouté |

### Élevé — écritures inter-établissements (IDOR cross-tenant)

Les identifiants secondaires reçus dans le corps ou l'URL ne sont pas rattachés à l'école de l'appelant :

| ID | Route | Identifiant non vérifié | Conséquence |
|---|---|---|---|
| SEC-03 | `POST /grades` | `records[].studentId`, `subjectId`, `termId` | écrire des notes sur l'élève d'une autre école |
| SEC-04 | `POST /attendance/mark` | `records[].studentId` | créer des présences sur un élève étranger **et envoyer une notification à ses parents** (message non sollicité inter-école) |
| SEC-05 | `PATCH /academic-years/:id/set-current` | `id` | basculer l'année courante d'une autre école (et désactiver la sienne) |
| SEC-06 | `POST/PATCH /classes` | `teacherId`, `academicYearId` | rattacher une classe à l'année / l'enseignant d'une autre école |
| SEC-07 | `POST /subjects/:id/assign` | `teacherId` | idem pour un enseignant étranger |
| SEC-08 | `POST /transport/routes` | `vehicleId` | idem pour un véhicule étranger |
| SEC-09 | `GET /bulletins/:studentId/:termId/pdf` | `termId` | lecture du nom de période d'une autre école (faible) |

Les identifiants sont des `cuid` (non devinables) : l'exploitation suppose une fuite d'identifiant, mais la défense ne doit pas reposer sur l'obscurité.

### Moyen

| ID | Constat | Où |
|---|---|---|
| SEC-10 | Secret JWT par défaut `'dev-secret'` si la variable manque ; aucun refus de démarrage en production. | `auth.module.ts`, `jwt.strategy.ts` |
| SEC-11 | JWT stocké en `localStorage` (vol par XSS), durée 24 h, ni refresh ni révocation ; un compte suspendu garde un token valide 24 h. | `frontend/src/lib/auth.ts` |
| SEC-12 | Aucune limitation de débit : force brute sur `/auth/login`, spam sur le formulaire public d'admission. | `main.ts` |
| SEC-13 | Mot de passe temporaire généré par `Math.random()` (non cryptographique) et renvoyé en clair dans la réponse API. | `staff.service.ts:7` |
| SEC-14 | Pas de `helmet` / en-têtes de sécurité ; Swagger exposé sans condition d'environnement. | `main.ts` |
| SEC-15 | `AuditLog` et `Permission` modélisés mais jamais alimentés : aucune traçabilité des actions sensibles (paie, paiements, notes). | schéma |
| SEC-16 | Parents non rattachés à un tenant (`Parent` sans `schoolId`) : un parent lié à des élèves de deux écoles est modifiable par les deux (`update` fait un `set` des élèves et retire ceux de l'autre école). | `parents.service.ts` |
| SEC-17 | Pas de MFA, pas de politique de mot de passe (min 6), pas de « mot de passe oublié ». | `auth` |
| SEC-18 | Ports Postgres, Redis, LDAP publiés sur `0.0.0.0` ; mots de passe par défaut dans compose. | `docker-compose.yml` |

### Faible / hygiène
- Les messages d'erreur 500 Prisma remontent au client (pas de filtre d'exception global).
- Énumération possible des comptes par différence de temps de réponse à la connexion (bcrypt seulement si l'utilisateur existe).
- `console.log` au démarrage uniquement ; aucune journalisation des échecs d'authentification ou d'autorisation.

## 5. Base de données

| ID | Constat | Impact |
|---|---|---|
| DB-01 | `Student.matricule` est `@unique` **global** alors que le matricule est généré `ANNÉE-NNNN` **par école** → la 1re inscription de la 2e école en collision avec la 1re école → erreur 500. | **Bloquant pour le multi-tenant** |
| DB-02 | `Invoice.reference` `@unique` global, générée `INV-ANNÉE-NNNNN` par école → même collision. | idem |
| DB-03 | Génération `count + 1` non atomique (matricule, référence facture) → doublons en cas de requêtes concurrentes. | intégrité |
| DB-04 | Montants en `Float` (factures, paiements, salaires). | erreurs d'arrondi comptables ; utiliser `Decimal` ou entiers en unités minimales (FCFA sans décimale) |
| DB-05 | `prisma/migrations/` ignoré par `.gitignore` → aucun historique de migration, déploiements via `db push`. | risque de perte de données en production, pas de rollback |
| DB-06 | Tables métier sans `schoolId` direct (`Grade`, `Enrollment`, `Payment`, `Term`, `ClassSubject`, `Parent`, `Document`, `Notification`) → isolation par jointure uniquement, impossible à protéger par Row-Level Security simple. | architecture multi-tenant |
| DB-07 | Aucun index composite orienté requêtes (ex. `Grade(classId, termId)`, `Invoice(schoolId, status)`). | performance à volume |
| DB-08 | Paiement : aucun contrôle de sur-paiement, aucune idempotence (double clic = double paiement). | finance |

## 6. Qualité, build et outillage (mesuré)

| Contrôle | Commande | Résultat |
|---|---|---|
| Installation reproductible | `npm ci` | ❌ **échec** : lockfile désynchronisé (`@nestjs/platform-express`, `pdfkit`, … absents du lock) |
| Installation | `npm install` | ✅ |
| Type-check backend | `npx tsc --noEmit -p backend` (workspace, TS 5.9) | ✅ 0 erreur |
| Type-check backend depuis la racine | `npx tsc -p backend` | ❌ TS 7.0.2 hissé à la racine rejette `baseUrl` (`tsconfig.json:18`) |
| Build backend | `nest build` | ✅ |
| Build frontend | `next build` | ✅ 20 routes, First Load JS **101–109 kB** |
| Tests | `jest` (backend) | ❌ **0 test** ; aucune config Jest (ts-jest non branché) ; pas de script de test frontend |
| Lint | `eslint` | ❌ aucune configuration ESLint dans le dépôt |
| Vulnérabilités | `npm audit` | ❌ **40** (1 critique, 21 hautes, 14 moyennes, 4 faibles) |
| Images Docker | lecture | `node:18-alpine` (EOL), exécution root, `npm install` au lieu de `npm ci`, mode `dev` en image, HEALTHCHECK neutralisé (`|| exit 0`) |

## 7. Performance (baseline)

- Frontend : bundle maîtrisé (≈ 105 kB First Load JS par page). Aucune pagination côté API ni UI : `GET /students`, `/billing/invoices`, `/parents` renvoient **toute** la table de l'école.
- `financeStats` charge toutes les factures et tous les paiements en mémoire à chaque ouverture du tableau de bord (O(n) en Node au lieu d'un `aggregate` SQL).
- `computeBulletin` recalcule toute la classe pour chaque bulletin ; générer les bulletins d'une classe de 50 élèves = 50 × calcul complet.
- Notifications : boucle séquentielle `await` par parent dans la requête HTTP.
- Aucune mesure de temps de réponse API n'est disponible (pas de métriques) ; les objectifs chiffrés sont fixés dans l'architecture cible et seront mesurés dès que l'observabilité est en place.

## 8. Tests existants
Aucun. C'est le risque n°1 de toute refonte : rien ne détecte une régression. Le plan impose de poser un filet de tests **avant** chaque refactor structurant.

## 9. Dette technique — synthèse priorisée

1. Autorisation serveur inexistante (SEC-01/02) — **à corriger avant toute nouvelle fonctionnalité**, et prérequis de l'agent IA (qui doit réutiliser exactement la même autorisation).
2. Isolation tenant manuelle, non garantie (SEC-03→09, DB-06).
3. Contraintes d'unicité globales incompatibles avec le multi-tenant (DB-01/02).
4. Zéro test, zéro CI sur `main`, lockfile cassé.
5. Migrations non versionnées, montants en `Float`.
6. Frontend : aucune navigation mobile, pas de design system, accessibilité faible (voir `audit-ux.md`).
7. Dépendances et services inutilisés (ldap, next-auth, axios, redis, mailhog).
