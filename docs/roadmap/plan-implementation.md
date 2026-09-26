# Roadmap, backlog et plan d'implémentation

> Statut : Phase 1. Priorités : **P0** bloquant (sécurité / fondations), **P1** nécessaire au lancement SaaS, **P2** différenciant, **P3** confort.
> Règle : pas de refonte massive. Chaque lot est livrable seul, protégé par des tests écrits **avant** le refactor, derrière un feature flag quand il change un comportement visible.

## 1. Ajustement de l'ordre des phases

L'ordre demandé (design system → SaaS → IA → … → sécurité en Phase 9) est conservé, avec **une exception justifiée** : les failles critiques d'autorisation (SEC-01/02) et d'isolation (SEC-03→09) sont corrigées **immédiatement** (lot S0), car :
1. elles exposent aujourd'hui des salaires et des données de mineurs ;
2. l'agent IA (Phases 5-8) doit réutiliser *exactement* le même système d'autorisation — il faut donc qu'il existe avant.

## 2. Roadmap

| Phase | Contenu | Livrable vérifiable | Dépend de |
|---|---|---|---|
| 0 | Audit complet | `docs/audit/*`, `docs/benchmark/*` | — |
| 1 | Architecture cible, backlog, risques | ce document, `docs/architecture/*` | 0 |
| **S0** | Correctifs critiques : permissions serveur deny-by-default, IDOR cross-tenant, secret JWT, premiers tests | suite Jest verte, test de couverture des routes | 1 |
| 2 | Design system + skills `uix-pro` / `animation-pro` + refonte shell/navigation mobile + parcours P0 (appel, notes, portail parent, login) | Storybook-like page `/design`, audit axe = 0 violation critique | S0 |
| 3 | SaaS multi-tenant : `schoolId` partout, RLS, séquences, résolution par hôte, branding, plans, feature flags, console plateforme, ABAC enseignant/parent | suite cross-tenant verte, 2 écoles de démo isolées | S0 |
| 4 | Vitrines : SSR, constructeur de sections, thèmes, SEO/OpenGraph, formulaires anti-spam | Lighthouse SEO ≥ 95, vitrine éditable sans code | 2, 3 |
| 5 | IA conversationnelle : module `ai`, registre de tools filtré, confirmations, audit, quotas | suite « refus » (tentatives hors droits) verte | S0, 3 |
| 6 | IA interfaces dynamiques : catalogue de blocs, sources nommées, `SavedView` | schémas invalides rejetés, sources non autorisées refusées | 5 |
| 7 | Moteur documentaire : templates versionnés, Gotenberg, QR, historique, import IA | bulletin & reçu en parité avec l'existant | 3 |
| 8 | Emplois du temps : modèle, solveur, validateur, IA d'interface, exports | 0 conflit sur jeux d'essai, exports PDF/XLSX/ICS | 3, 5, 7 |
| 9 | Sécurité + observabilité : cookies HttpOnly, refresh, MFA, rate limit, helmet/CSP, audit trail, pino, OTel, health ready | rapport de sécurité, tableaux de bord | S0 |
| 10 | DevSecOps : merge du kit `chore/devsecops-kit`, pipeline complet §12 de l'architecture | pipeline vert sur PR | S0 |
| 11 | Cahier de recettes complet | `docs/testing/cahier-recettes.md` | 2-8 |
| 12 | Automatisation E2E (Playwright, 3 viewports) | ≥ 80 % des scénarios P0/P1 automatisés | 11 |
| 13 | Déploiement staging | environnement joignable | 10 |
| 14 | Tests fonctionnels post-déploiement | rapport PASS/FAIL/BLOCKED/NA avec preuves | 12, 13 |
| 15 | Correction des anomalies + rejeu | 0 FAIL P0/P1 | 14 |
| 16 | Validation finale | rapports sécurité, performance, anomalies, guide de déploiement | 15 |

## 3. Backlog priorisé

### P0 — Fondations et sécurité
| ID | Élément | Critère d'acceptation |
|---|---|---|
| S0-1 | Référentiel de permissions typé partagé (`authz/permissions.ts`) | une seule source de vérité, réutilisable par les tools IA |
| S0-2 | Guard global JWT + guard global permissions, **deny-by-default**, décorateurs `@Public` / `@Authenticated` / `@RequirePermissions` | test : toute route porte une déclaration ; PARENT/ÉLÈVE reçoivent 403 sur les routes de gestion |
| S0-3 | Salaire masqué hors `payroll:read` (`/staff`) ; finances masquées du dashboard hors `billing:read` | enseignant : aucune trace de `baseSalary` ni de finances dans les réponses |
| S0-4 | Vérification d'appartenance tenant des identifiants secondaires (notes, présences, année courante, classes, matières, circuits, périodes) | tests unitaires par cas |
| S0-5 | Refus de démarrer en production sans `JWT_SECRET` robuste ; mot de passe temporaire cryptographique | test |
| S0-6 | Config Jest + premier jeu de tests | `npm test --workspace=backend` vert |
| S0-7 | Unicité matricule / référence facture par école (au lieu de globale) | 2e école peut inscrire son 1er élève |
| S0-8 | Lockfile resynchronisé, `npm ci` fonctionnel | CI reproductible |
| P0-9 | Migrations Prisma versionnées (baseline de l'existant, retrait du `.gitignore`) | `prisma migrate deploy` sur base vierge = schéma actuel |
| P0-10 | Navigation mobile | parcours appel / notes / portail parent faisables sur 360 px |
| P0-11 | Montants en `Decimal` | migration sans perte, totaux identiques avant/après sur les données de démo |

### P1 — Lancement SaaS
Multi-tenant complet (§2 architecture), branding, plans + feature flags, console plateforme, ABAC enseignant/parent, sessions cookie + MFA, rate limiting, audit trail, pagination API/UI, design system + refonte des 20 écrans, vitrine SSR + constructeur, envoi email/SMS (fournisseur local, ex. agrégateur SMS CI) + relances d'impayés, observabilité, pipeline DevSecOps, E2E.

### P2 — Différenciation (issue du benchmark)
Mobile money réel avec rapprochement automatique (Orange, MTN, Moov, Wave) ; WhatsApp ; agent IA ; interfaces dynamiques ; moteur documentaire + import IA de modèles ; bulletins au format officiel national ; emplois du temps IA ; alertes « élèves à risque » **explicables** (la règle et l'action suggérée sont affichées) ; PWA hors ligne pour l'appel ; import guidé (Excel) à l'onboarding ; paie ivoirienne (CNPS, ITS).

### P3 — Confort
Mode sombre, raccourcis clavier, personnalisation des tableaux de bord sans IA, thèmes de vitrine supplémentaires, cantine.

## 4. Risques de régression et parades

| Risque | Zone | Parade |
|---|---|---|
| Verrouiller les permissions casse un écran qui appelle un endpoint « voisin » (ex. Facturation → `/students`, Classes → `/staff`) | S0 | matrice dérivée de la **cartographie réelle des appels API de chaque page** (faite en Phase 0) ; tests par rôle |
| Filtre Prisma automatique qui masque des données légitimes (requêtes plateforme, seed, jobs) | Phase 3 | contexte explicite « plateforme » ; tests d'intégration sur base réelle ; déploiement derrière flag |
| RLS activée sans `SET LOCAL` → requêtes vides | Phase 3 | activation table par table, suite d'intégration exécutée avec RLS active |
| Migration `Float → Decimal` altère des totaux | P0-11 | script de comparaison des sommes avant/après ; sauvegarde |
| Changement d'unicité (matricule, référence) | S0-7 | contraintes composites déjà présentes pour le matricule ; vérifié qu'aucun code ne recherche par matricule ou référence seuls |
| Passage JWT localStorage → cookie | Phase 9 | double mode transitoire (header et cookie) pendant une release |
| Refonte UI | Phase 2 | écran par écran, E2E sur le parcours avant/après, captures de référence |
| Remplacement pdfkit → templates | Phase 7 | parité vérifiée sur jeux de données de démo, ancien moteur conservé sous flag |
| Vitrine `/ecole/[code]` → sous-domaine | Phase 4 | redirection 301 conservée |

## 5. Plan détaillé du lot S0 (livré — voir `docs/security/rapport-correctifs-s0.md`)

1. `backend/src/authz/permissions.ts` : type `Permission`, matrice `ROLE_PERMISSIONS`, `hasPermission()`.
2. `backend/src/authz/decorators.ts` : `@Public()`, `@Authenticated()`, `@RequirePermissions(...)`.
3. `backend/src/authz/jwt-global.guard.ts` + `permissions.guard.ts`, enregistrés via `APP_GUARD` dans `AppModule` (ordre : JWT puis permissions).
4. Annotation de toutes les routes selon la matrice §4.2 de l'architecture.
5. Correctifs IDOR dans les services concernés.
6. Filtrage de champs `baseSalary` / finances.
7. Durcissement du secret JWT et du mot de passe temporaire.
8. Unicité par école (schéma Prisma).
9. Tests : guard, couverture des routes, IDOR, filtrage des champs.
10. Vérification : type-check, build backend et frontend, suite Jest.

Ce qui est **hors** S0 et attend une validation : choix d'hébergement, fournisseur SMS / mobile money, activation de l'API Claude (clé et budget), stratégie de domaine (`*.plateforme.com`).
