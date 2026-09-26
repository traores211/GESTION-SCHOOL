# Rapport de sécurité — lot S0 (correctifs critiques)

> Date : 2026-09-26 · Branche : `worktree-saas-platform-audit` · Référence des constats : `docs/audit/audit-technique.md` §4.

## 1. Ce qui a été corrigé

| Constat | Correctif | Fichiers | Preuve (test) |
|---|---|---|---|
| SEC-01 aucune autorisation serveur | Guards **globaux** `GlobalJwtAuthGuard` puis `PermissionsGuard`, **deny-by-default** : toute route doit déclarer `@Public()`, `@Authenticated()` ou `@RequirePermissions(...)`. Les 82 routes ont été annotées selon la matrice `backend/src/authz/permissions.ts`, dérivée des écrans réellement utilisés par chaque rôle. | `backend/src/authz/*`, `app.module.ts`, 21 contrôleurs | `authz.guards.spec.ts`, `route-coverage.spec.ts` |
| SEC-02 salaires visibles | `baseSalary` remplacé par `null` sans `payroll:read` ; finances du tableau de bord `null` sans `billing:read` ; fiche élève : factures masquées sans `billing:read`, notes sans `grades:read`. | `staff.service.ts`, `dashboard.service.ts`, `students.service.ts`, `frontend/src/app/dashboard/page.tsx` | `field-authorization.spec.ts` |
| SEC-03 notes cross-tenant | matière et période doivent appartenir à l'école ; chaque élève doit être inscrit dans la classe | `grades.service.ts`, `common/tenant-ownership.ts` | `tenant-isolation.spec.ts` |
| SEC-04 présences cross-tenant + notification | élèves inscrits dans la classe exigés, avant toute écriture ou notification | `attendance.service.ts` | idem |
| SEC-05 année courante d'une autre école | appartenance vérifiée avant modification ; bascule en transaction | `academic-years.service.ts` | idem |
| SEC-06/07/08 enseignant, année, véhicule étrangers | vérification d'appartenance à la création et à la modification | `classes.service.ts`, `subjects.service.ts`, `transport.service.ts` | idem |
| SEC-09 période étrangère sur bulletin | période vérifiée | `grades.service.ts` | — (même helper que SEC-03) |
| SEC-19 hash de mot de passe exposé | projection `PUBLIC_USER_SELECT` au lieu de `user: true` | `common/user-select.ts` + 4 services | test statique : aucun service n'inclut `user: true` |
| SEC-10 secret JWT par défaut | refus de démarrer en production si le secret est absent, court (< 32) ou un placeholder connu ; lecture différée (corrige aussi un bug où le secret de `.env.local` n'était pas vu à la signature) | `auth/jwt-secret.ts`, `auth.module.ts`, `jwt.strategy.ts` | `jwt-secret.spec.ts` |
| SEC-13 mot de passe temporaire prévisible | `crypto.randomBytes` au lieu de `Math.random` | `staff.service.ts` | — |
| DB-01/02 unicité globale | `matricule` et `reference` uniques **par école** | `schema.prisma` | `prisma validate` |
| Lockfile désynchronisé | lockfile régénéré | `package-lock.json` | `npm ci --dry-run` accepté |

Les journaux d'autorisation refusée contiennent l'identifiant et le rôle, jamais de donnée personnelle.

## 2. Preuve que les tests détectent les failles

Les tests ont été exécutés contre le **code d'origine** de `grades.service.ts` et `staff.service.ts` : **6 tests échouent** (notes sur une matière, une période ou un élève étrangers ; hash exposé ; salaires visibles par l'enseignant et la secrétaire). Avec les correctifs : **38/38 tests passent** (`npm test --workspace=backend`).

## 3. Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit -p backend` (depuis `backend/`) | ✅ |
| `nest build` | ✅ |
| `npx jest` (backend) | ✅ 5 suites, 38 tests |
| `npx tsc --noEmit` (frontend) | ✅ |
| `next build` | ✅ ; `/dashboard` 108 kB First Load JS (inchangé) |
| `npm ci --dry-run` | ✅ |
| Tests E2E sur l'application déployée | ⏸ **non exécutés** : Docker Desktop n'était pas démarré sur le poste. À faire en Phase 13-14. |

## 4. Déploiement de ce lot

1. Le changement de schéma (retrait de deux contraintes d'unicité globales, ajout d'une contrainte composite) est non destructif : `npx prisma db push` (procédure actuelle) ou, après P0-9, une migration versionnée.
2. En production, définir `JWT_SECRET` (≥ 32 caractères aléatoires) : sinon le backend **refuse de démarrer**, volontairement.
3. Comportement visible modifié : un enseignant ne voit plus le bloc « Finances » du tableau de bord ni les salaires ; un parent ou un élève reçoit 403 sur toute route de gestion ; un enseignant reçoit 403 s'il tente de créer un élève (bouton encore affiché : sera masqué en Phase 2 via les permissions côté client).

## 5. Restant ouvert (planifié)

SEC-11 (token en localStorage), SEC-12 (rate limiting), SEC-14 (helmet, Swagger), SEC-15 (audit trail), SEC-16 (parents multi-écoles), SEC-17 (MFA, mot de passe oublié), SEC-18 (ports compose), DB-03/04/05/06/08, et la **portée ABAC** (enseignant limité à ses classes) — voir `docs/roadmap/plan-implementation.md`.
