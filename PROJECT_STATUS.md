# PROJECT_STATUS.md

**Projet** : School ERP — plateforme SaaS multi-tenant pour la Côte d'Ivoire
**Dernière mise à jour** : 2026-10-07
**Branche active** : `feature/saas-multi-tenant`

---

## Résumé

Après trois phases d'évolution :

1. **Phase « Fondations »** (base de `main`) — ERP scolaire mono-tenant fonctionnel, écrans
   complets (vitrine, portail parent, pédagogie, finances, vie scolaire).
2. **Phase « Multi-écoles »** (`feature/robustness`) — groupe scolaire, membership multi-écoles,
   périmètre enseignant, rôles supervision, timetable, OCR, vocal, documents.
3. **Phase « SaaS »** (`feature/saas-multi-tenant`, 7 lots) — domaines personnalisés, cycle de
   vie école, plans & quotas, permissions fines, nginx multi-vhost + certbot auto, invoice
   reference per-école, CSP stricte + middleware Next.

## État des 7 lots SaaS

| Lot | Commit | Objet | État |
|---|---|---|---|
| L1 | `c407f9e` | Domaines personnalisés par école (SchoolDomain, résolveur Host, DNS TXT, UI, Adminer dev) | ✅ |
| L2 | `61f4d56` | Machine à états à 7 valeurs, timeline auditée, auto-expiry du trial, écran historique | ✅ |
| L3 | `1a48248` | Plans STARTER/PRO/ENTERPRISE + quotas enforced 409, overrides par organisation | ✅ |
| L4 | `8a90212` | Permissions fines (catalogue en code, guard, UI par utilisateur) | ✅ |
| L5 | `6f750be` | Nginx multi-vhost + certbot auto (service + endpoint API + snippets par domaine) | ✅ |
| L6 | `d54365d` | Invoice.reference per-école (`[schoolId, reference]`) | ✅ (partiel assumé) |
| L7 | `57bc40a` | CSP stricte sur l'API + middleware Next.js pour les routes privées | ✅ (partiel assumé) |

**Détail de chaque lot** : `docs/EVOLUTION-SAAS.md`.

## Chiffres

| Dimension | Valeur |
|---|---|
| Modèles Prisma | 43 (+2 depuis L0 : SchoolDomain, SchoolLifecycleEvent, OrganisationQuotaOverride) |
| Enums | 10 |
| Migrations | 23 (+4 depuis L0) |
| Modules Nest | 41 (+2 : domains, permissions) |
| Contrôleurs | 40 |
| Endpoints HTTP | ~297 |
| Tests unit backend | 289 (34 suites) |
| Tests unit frontend | 30 |
| Scénarios e2e | 29 |
| Pages Next.js | 48 (+2 : /domains, /users/[id]/permissions) |
| Rôles | 10 (`UserRole`) |
| Permissions fines | 17 (catalogue L4) |
| Plans | 3 (STARTER, PRO, ENTERPRISE) |

## Zéro régression

À la fin de chaque lot, les suites suivantes sont rejouées et toutes vertes :

- `test/e2e-auth.js` (JWT, 2FA, forgot/reset, sign-out)
- `test/e2e-tenancy.js` (isolation inter-écoles)
- `test/e2e-leaks.js` (aucun credential dans aucune réponse)
- `test/e2e-platform.js` (sign-up, trial, interceptor 402)
- `test/e2e-group.js` (multi-écoles, switch, memberships)
- `test/e2e-domains.js` (L1 — 18 assertions)
- `test/e2e-lifecycle.js` (L2 — 16 assertions)
- `test/e2e-quotas.js` (L3 — 10 assertions)
- `test/e2e-permissions.js` (L4 — 11 assertions)

Plus les ~20 autres scénarios historiques (admissions, bulletins, imports, payments, portal,
discipline, family, supervision, gate, smart-entry, showcase, dashboards, pupil, promotion).

## Déploiement

- **Dev** : `docker compose up -d --build` (postgres, redis, mailhog, backend watch, frontend
  watch). Adminer en option : `docker compose --profile tools up adminer`.
- **Prod** : `docker-compose.prod.yml` avec secrets, nginx, backups, certbot. Procédure
  complète : `docs/DEPLOIEMENT.md`.

## Reste à faire (non chiffré)

- **L8** : lots futurs identifiés dans les sections « Reste à faire » de chaque lot
  (`docs/EVOLUTION-SAAS.md`).
- **L9** : Float → Decimal pour les montants financiers (10+ champs, impact arithmétique).
- **L10** : pagination UI complète (parents, personnel, journal audit, documents).
- Durcir `JwtStrategy` pour refuser le login quand l'organisation est `CLOSED`.
- Notifications email J-7 / J-1 avant fin du trial.
- Afficher `/subscription/quotas` dans l'écran `/account` (vue utilisateur côté école).

## Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| SUPER_ADMIN | admin@school.local | admin123 |
| DIRECTOR | directeur@csp-yam.local | demo123 |
| SECRETARY | secretaire@school.local | secret123 |
| COMPTABLE | comptable@school.local | compta123 |
| ENSEIGNANT | k.kouassi@school.local | teach123 |
| PARENT | parent@school.local | parent123 |

Après `npm run seed:bulk`, 4 écoles supplémentaires (LMP-BKE, CSP-YAM, EPC-SPD, ITN-KGO) avec
leurs comptes `directeur@<code>.local`, `comptable@<code>.local`, `secretariat@<code>.local`,
`prof01@<code>.local` … (tous en `demo123`).

## Lire ensuite

- [`README.md`](README.md) — démarrage rapide
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — vue d'ensemble à jour
- [`docs/EVOLUTION-SAAS.md`](docs/EVOLUTION-SAAS.md) — compte-rendu détaillé L1-L7
- [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) — mise en production (TLS, certbot, backups)
- [`docs/EVOLUTION-MULTI-ECOLES.md`](docs/EVOLUTION-MULTI-ECOLES.md) — décisions multi-écoles
