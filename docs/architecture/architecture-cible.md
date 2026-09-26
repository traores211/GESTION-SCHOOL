# Architecture cible — GESTION SCHOOL SaaS

> Statut : **proposition Phase 1**, à valider. Principe directeur : faire évoluer l'existant (NestJS + Prisma + PostgreSQL + Next.js), pas le réécrire. Chaque brique nouvelle est justifiée par une comparaison (§10).

## 1. Vue d'ensemble

```
                    *.plateforme.com  /  ecole-exemple.com (domaine perso)
                                        │
                              ┌─────────▼─────────┐
                              │ Reverse proxy/TLS │  (nginx ou équivalent, certificats auto)
                              └───┬───────────┬───┘
                                  │           │
                     ┌────────────▼──┐   ┌────▼──────────────┐
                     │ Next.js (web) │   │ NestJS API (/api) │◄── même règles d'autorisation
                     │ app + vitrine │──►│ modules métier    │    pour UI, API et agent IA
                     │ SSR vitrine   │   │ authz · tenant    │
                     └───────────────┘   │ ai · documents    │
                                         └──┬─────┬─────┬────┘
                          ┌─────────────────┘     │     └──────────────┐
                   ┌──────▼──────┐        ┌───────▼──────┐     ┌───────▼────────┐
                   │ PostgreSQL  │        │ Redis        │     │ Stockage objet │
                   │ + RLS tenant│        │ cache, files │     │ S3 / MinIO     │
                   └─────────────┘        │ rate limit   │     │ préfixe tenant │
                                          └──────┬───────┘     └───────▲────────┘
                                          ┌──────▼───────────────────────┴───┐
                                          │ Worker (même code NestJS,        │
                                          │ autre point d'entrée) : PDF,     │
                                          │ SMS/email, relances, EDT, IA     │
                                          └──────────────────────────────────┘
                     Observabilité : logs JSON (pino) · traces/métriques OpenTelemetry · health checks
```

Modules séparés (dossiers NestJS, frontières explicites) : `auth` (identité, sessions, MFA), `authz` (permissions + politiques), `tenancy` (résolution, contexte, branding), `platform` (admin SaaS, plans, feature flags), `academic`, `finance`, `hr`, `communication`, `documents`, `timetable`, `showcase`, `ai`, `observability`.

## 2. SaaS multi-tenant

### 2.1 Modèle
- **Tenant = `School`** (déjà la clé d'isolation effective ; minimise la migration). `Organisation` devient le **groupe scolaire** (facultatif) qui peut posséder plusieurs écoles.
- Chaque table métier reçoit une colonne **`schoolId` non nulle** — y compris celles qui n'en ont pas aujourd'hui (`Grade`, `Enrollment`, `Payment`, `Term`, `ClassSubject`, `Document`, `Notification`, `Parent` via une table de liaison `ParentSchool`).
- Contraintes d'unicité **toujours composées avec `schoolId`** (corrige DB-01/02 : matricule, référence facture).
- Numérotations (matricule, facture, reçu) via une table `Sequence(schoolId, key, value)` incrémentée atomiquement (`UPDATE … RETURNING`) — corrige DB-03.

### 2.2 Isolation en profondeur (3 couches indépendantes)
1. **Applicative** — un `TenantContext` (AsyncLocalStorage) est posé à chaque requête depuis le JWT **et** vérifié contre le tenant résolu par le nom d'hôte ; une extension Prisma ajoute `where: { schoolId }` à toute requête sur un modèle tenant et refuse une écriture dont le `schoolId` diffère.
2. **Base de données** — PostgreSQL **Row-Level Security** sur toutes les tables tenant : `USING (school_id = current_setting('app.school_id'))`, positionné par transaction (`SET LOCAL`). Un oubli de filtre applicatif ne fuit donc plus. Rôle BD applicatif sans `BYPASSRLS` ; un rôle séparé pour les migrations et l'administration plateforme.
3. **Tests** — une suite dédiée « cross-tenant » (2 écoles seedées) tente chaque route avec les identifiants de l'autre école et exige 403/404.

Le même contexte isole : **cache** (clés préfixées `t:{schoolId}:`), **fichiers** (préfixe `tenants/{schoolId}/`, URL signées courtes), **files de jobs** (payload porte `schoolId`, le worker repose le contexte), **logs** (champ `tenant_id` systématique, jamais de données personnelles), **exports** (générés par le worker sous le contexte du demandeur, journalisés), **IA** (voir §5).

### 2.3 Résolution du tenant
| Mode | Exemple | Usage |
|---|---|---|
| Sous-domaine | `ecole-demo.plateforme.com` | **mode par défaut** (app + vitrine) |
| Domaine personnalisé | `ecole-exemple.com` | plan Pro/Enterprise ; table `TenantDomain(host, schoolId, verifiedAt)` + vérification DNS TXT + certificat automatique |
| Chemin | `plateforme.com/ecole-demo` | vitrine publique uniquement (compatibilité avec l'actuel `/ecole/[code]`, redirection 301) |

Le middleware Next.js lit l'en-tête `Host`, résout le tenant (cache court), injecte le thème ; l'API refuse tout JWT dont le `schoolId` ne correspond pas au tenant de l'hôte.

### 2.4 Personnalisation (white-label)
`SchoolBranding` : logo, favicon, couleurs primaire/secondaire (contraste vérifié AA à l'enregistrement), typographie parmi une liste, coordonnées, réseaux sociaux, pied de page des documents, signature et cachet (images), paramètres IA. Les couleurs alimentent les **tokens CSS** du design system — aucun composant ne porte de couleur en dur.

### 2.5 Administration plateforme
Espace `/platform` réservé aux rôles plateforme (`PLATFORM_ADMIN`, `PLATFORM_SUPPORT`, sans `schoolId`) : écoles, plans, abonnements, consommation (élèves actifs, stockage, jetons IA, SMS), feature flags, journaux, support. **Impersonation** en lecture seule par défaut, horodatée, visible par l'école, journalisée.

### 2.6 Plans et feature flags
- `Plan` (Starter / Professional / Enterprise) → liste de `features` + quotas (élèves, stockage, SMS, jetons IA).
- `FeatureFlag(key, default, rollout%)` + surcharges par plan et par tenant.
- Côté API : décorateur `@RequireFeature('ai.chat')` (guard) ; côté web : `useFeature()`. Un module désactivé renvoie 404 (pas 403) pour ne pas révéler son existence.

| Fonctionnalité | Starter | Professional | Enterprise |
|---|---|---|---|
| Scolarité, notes, bulletins, présences, facturation | ✅ | ✅ | ✅ |
| Vitrine (sous-domaine) | ✅ | ✅ | ✅ |
| Domaine personnalisé, marque blanche complète | — | ✅ | ✅ |
| Paie, transport | — | ✅ | ✅ |
| Documents à templates | modèles fournis | ✅ | ✅ + versioning avancé |
| Emploi du temps IA | — | ✅ | ✅ |
| Agent IA conversationnel | — | quota | quota étendu |
| Interfaces dynamiques IA | — | — | ✅ |
| SSO, API publique, base dédiée | — | — | ✅ |

## 3. Identité et sessions
- Access token court (15 min) + **refresh token rotatif** en cookie `HttpOnly; Secure; SameSite=Lax`, stocké hashé côté serveur (révocable, détection de réutilisation). Fin du token en `localStorage`.
- Protection CSRF (double-submit token) pour les routes cookie.
- **MFA TOTP obligatoire** pour DIRECTOR, COMPTABLE, ADMIN, rôles plateforme ; codes de secours.
- Mot de passe oublié par lien à usage unique (15 min) ; politique de mot de passe (longueur ≥ 10, liste de mots de passe compromis).
- Verrouillage progressif + rate limiting par IP et par compte.
- Le statut du compte et la version de session sont revérifiés au refresh (un compte suspendu perd l'accès en ≤ 15 min).

## 4. Modèle de permissions (RBAC + ABAC)

### 4.1 Principe
Une **seule** fonction de décision, utilisée par les contrôleurs, le frontend (affichage), et les tools IA :

```
can(principal, action, resource?, context) → allow | deny(reason)
principal = { userId, tenantId, roles, permissions, attributes(classIds, childIds, staffId…) }
```

1. **RBAC** : un rôle = un ensemble de permissions `ressource:action` (`students:read`, `payroll:write`…). Rôles système par défaut ; en Phase 3, rôles personnalisés par tenant (`Role`, `RolePermission`).
2. **ABAC** (politiques de portée) appliquées dans les requêtes, pas en post-filtrage :
   - ENSEIGNANT : élèves / notes / présences **de ses classes** uniquement ; aucun salaire.
   - PARENT : ses enfants uniquement ; ÉLÈVE : lui-même.
   - COMPTABLE : finances + identité minimale des élèves (pas de notes).
3. **Deny-by-default** : une route sans déclaration explicite (`@Public`, `@Authenticated`, `@RequirePermissions`) est refusée ; un test vérifie que chaque route en porte une.
4. **Filtrage de champs** : les champs sensibles (salaire, données médicales) exigent une permission dédiée (`payroll:read`, `students:read-medical`).

### 4.2 Matrice initiale (dérivée des usages actuels du menu et des appels API de chaque écran)

| Permission | DIR | SEC | COMPTA | ENS | PARENT | ÉLÈVE |
|---|---|---|---|---|---|---|
| dashboard:read | ✅ | ✅ | ✅ | ✅ | — | — |
| students:read | ✅ | ✅ | ✅ (identité) | ✅ (ses classes*) | — | — |
| students:write | ✅ | ✅ | — | — | — | — |
| students:delete | ✅ | — | — | — | — | — |
| parents:read / write | ✅ | ✅ | — | — | — | — |
| staff:read (annuaire, **sans salaire**) | ✅ | ✅ | ✅ | ✅ | — | — |
| staff:write | ✅ | — | — | — | — | — |
| classes:read | ✅ | ✅ | ✅ | ✅ | — | — |
| classes:write | ✅ | ✅ | — | — | — | — |
| academic:read (années, périodes, matières) | ✅ | ✅ | ✅ | ✅ | — | — |
| academic:write | ✅ | — | — | — | — | — |
| admissions:read / write | ✅ | ✅ | — | — | — | — |
| attendance:read / write | ✅ | ✅ | — | ✅ (ses classes*) | — | — |
| grades:read | ✅ | ✅ | — | ✅ (ses classes*) | — | — |
| grades:write | ✅ | — | — | ✅ (ses matières*) | — | — |
| billing:read / write | ✅ | ✅ | ✅ | — | — | — |
| payroll:read / write | ✅ | — | ✅ | — | — | — |
| transport:read / write | ✅ | ✅ | — | — | — | — |
| announcements:read / write | ✅ | — | — | — | — | — |
| parent-portal:read | — | — | — | — | ✅ (ses enfants) | — |
| ai:chat | selon plan et flag, sur les tools autorisés par les permissions ci-dessus |

`*` = politique ABAC livrée en Phase 3 ; d'ici là la permission de rôle s'applique à l'école. `SUPER_ADMIN` et `ADMIN_ORGANISATION` héritent de toutes les permissions d'école.

## 5. Agent IA

### 5.1 Chaîne de confiance
```
Utilisateur → Auth → Tenant → Rôle/permissions → Agent IA → Tools filtrés → Service métier (même authz) → Données
```
- **Le LLM n'a aucun accès direct aux données.** Il ne voit que les **tools que l'utilisateur a le droit d'appeler** (liste filtrée par `can()` avant chaque conversation). Un enseignant qui demande les salaires : l'outil `get_payroll` n'existe pas dans sa session → refus expliqué.
- Chaque tool est une façade mince sur le **service métier existant**, exécutée avec le principal de l'utilisateur : même vérification tenant + permission + politique ABAC, même validation DTO, même journal d'audit. Aucun tool n'accepte de `schoolId` en paramètre (il vient du contexte).
- Les résultats de tools sont minimisés (champs utiles seulement) et **marqués comme données** dans le prompt ; le texte provenant de la base (commentaires, noms) ne peut pas modifier les instructions (défense contre l'injection de prompt).

### 5.2 Catalogue de tools (extrait)
| Tool | Permission | Sensible (confirmation) |
|---|---|---|
| `search_students`, `get_student` | students:read | non |
| `list_classes`, `get_class` | classes:read | non |
| `create_class`, `update_class` | classes:write | **oui** |
| `get_unpaid_invoices`, `get_finance_stats` | billing:read | non |
| `send_payment_reminders` | billing:write | **oui** |
| `get_grades`, `list_students_below_average` | grades:read | non |
| `update_grade` | grades:write | **oui** |
| `get_schedule`, `propose_schedule` | timetable:read / write | publication = **oui** |
| `generate_document` | documents:write | **oui** si envoi |
| `update_showcase_section` | showcase:write | **oui** |
| `build_dashboard` | selon sources de données | enregistrement = oui |

### 5.3 Actions sensibles
Le tool renvoie un **plan d'action** (`pendingAction` : description lisible, diff avant/après, portée) au lieu d'exécuter. L'interface affiche une carte de confirmation ; la confirmation porte un jeton à usage unique lié à l'utilisateur, au tenant et au contenu exact de l'action. Toute action exécutée est annulable pendant une fenêtre courte quand c'est possible (sinon, le caractère irréversible est affiché avant confirmation).

### 5.4 Fournisseur et coûts
- Fournisseur par défaut : API Claude d'Anthropic (tool use natif, streaming). Modèle rapide (Haiku 4.5) pour le routage et les questions simples, modèle plus capable (Sonnet 5) pour la planification multi-étapes. Abstraction `LlmProvider` pour pouvoir changer de fournisseur.
- Quotas de jetons par tenant et par plan, compteurs en base, alertes à 80 %.
- Aucune donnée d'élève n'est utilisée pour entraîner un modèle ; journaux de conversation conservés 90 jours par défaut (paramétrable par l'école), purgeables.

### 5.5 Interfaces dynamiques (schema-driven UI)
L'IA ne génère **jamais de code**. Elle produit un JSON validé (schéma zod côté serveur) composé de blocs d'un catalogue fermé : `kpi`, `chart(bar|line|donut)`, `table`, `filter`, `search`, `action`. Chaque bloc référence une **source de données nommée** (`fees.unpaid`, `attendance.today`, `grades.below_average`) définie en code, avec sa permission. Le backend valide le schéma, vérifie l'accès à chaque source, puis le frontend rend avec les composants du design system. Les vues sont enregistrables (`SavedView`) et partageables selon les permissions.

## 6. Moteur documentaire
- **Templates HTML/CSS versionnés** (`DocumentTemplate`, `DocumentTemplateVersion`) avec variables sans logique (`{{student.firstName}}`, `{{school.logo}}`, boucles déclarées `{{#each grades}}`), rendues par un moteur à échappement automatique (Handlebars en mode strict, helpers en liste blanche).
- L'IA aide à **importer un modèle** (Word/PDF/HTML) : elle propose le mapping vers le dictionnaire de variables connu ; l'humain valide. Les variables inconnues sont signalées, jamais inventées.
- Rendu **PDF A4** par un service Chromium isolé (Gotenberg) dans le worker : CSS d'impression (`@page`, en-têtes/pieds, numérotation), logo, signature, cachet, **QR code de vérification** (URL publique qui confirme l'authenticité sans exposer de données).
- Stockage S3 avec historique (`GeneratedDocument` : template+version, données figées, hash, auteur) ; aperçu avant impression ; impression directe ; téléchargement.
- Migration progressive : les bulletins et bulletins de paie pdfkit actuels restent en service jusqu'à parité du nouveau moteur (feature flag).

## 7. Emplois du temps
- Données : créneaux horaires de l'école, salles, disponibilités enseignants, volume horaire par matière et classe, contraintes (dures / souples).
- **Génération par un solveur déterministe**, pas par le LLM : v1 = heuristique + backtracking en TypeScript dans le worker ; si les besoins dépassent (grands établissements), solveur CP-SAT (OR-Tools, Apache-2.0) en service séparé.
- **Rôle de l'IA** : traduire les contraintes en langage naturel en contraintes structurées, expliquer les conflits, proposer des arbitrages. Un **validateur** indépendant vérifie toujours le résultat (conflits enseignant / salle / classe, chevauchements, créneaux invalides, heures insuffisantes, contraintes non respectées).
- Cycle : brouillon → validation → publication (notification) ; exports PDF, Excel, iCalendar (`.ics`).

## 8. Observabilité
- Logs JSON structurés (pino) avec `request_id`, `tenant_id`, `user_id` (pseudonymisé), `route`, `status`, `duration_ms` ; aucune donnée personnelle ni secret.
- OpenTelemetry (traces + métriques) exporté en OTLP vers la stack choisie (Grafana/Prometheus/Tempo en auto-hébergé, ou un SaaS).
- Métriques suivies : latence p50/p95 par route, taux d'erreur, erreurs frontend, jobs (durée, échecs), IA (latence, jetons, coût, refus d'autorisation), génération de documents, utilisateurs actifs par tenant, **refus d'autorisation et violations tenant** (alerte immédiate).
- Health checks `GET /api/health/live` et `/api/health/ready` (BD, Redis, stockage).

## 9. Objectifs de performance (à mesurer avant/après)
| Indicateur | Cible |
|---|---|
| API lecture p95 | < 300 ms |
| Pages critiques (LCP, 4G simulée, mobile) | < 2,5 s |
| First Load JS par page | ≤ 130 kB (baseline actuelle : 101–109 kB) |
| Listes | pagination serveur, 50 par page |
| Génération d'un bulletin PDF | < 3 s ; classe complète en tâche de fond |

## 10. Décisions techniques comparées

| Décision | Options | Choix | Raison |
|---|---|---|---|
| Isolation tenant | BD par tenant · schéma par tenant · **schéma partagé + `schoolId` + RLS** | schéma partagé + RLS | le plus simple à opérer et à migrer depuis l'existant ; RLS apporte la défense en profondeur ; « BD dédiée » gardée comme option Enterprise |
| Tenant | nouvelle entité · **`School`** | `School` | déjà présent partout ; zéro migration de sens |
| Autorisation | CASL · OPA/Cedar · **module maison typé** | maison | ~20 permissions, besoin de partager la décision avec les tools IA ; pas de dépendance ; migrable vers Cedar si les politiques se complexifient |
| Sessions | JWT localStorage · **access court + refresh rotatif en cookie HttpOnly** | cookie | supprime le vol de token par XSS, permet la révocation |
| Files / jobs | cron maison · **BullMQ (Redis)** · Temporal | BullMQ | Redis déjà dans l'infra, MIT, très utilisé avec NestJS (`@nestjs/bullmq`) ; Temporal surdimensionné |
| PDF | pdfkit (actuel) · Puppeteer dans l'API · **Gotenberg (Chromium isolé)** | Gotenberg | fidélité HTML/CSS pour des templates éditables, isolation du navigateur hors de l'API, Apache-2.0 |
| Stockage | disque local · **S3-compatible (MinIO en local)** | S3 | portable, URL signées, préfixes par tenant |
| UI | réécriture · **tokens CSS + composants maison sur primitives accessibles** | primitives Radix (MIT) pour dialog/menu/tabs/tooltip | accessibilité clavier/ARIA éprouvée sans imposer un style ; le reste en CSS maison |
| LLM | appel direct BD · **tools sur services existants** | tools | seule option compatible avec l'exigence « même autorisation que l'application » |
| EDT | LLM seul · **solveur + validateur, LLM en interface** | solveur | un LLM ne garantit pas l'absence de conflit ; le validateur le prouve |
| Montants | `Float` · **`Decimal(14,2)`** | Decimal | exactitude comptable, multi-devises |

Toute nouvelle dépendance passe la vérification : maturité, maintenance, licence, CVE, coût, impact (voir `docs/security/` et la procédure `/dependency-check` du kit DevSecOps).

## 11. Sécurité (synthèse — détail dans `docs/audit/audit-technique.md`)
Deny-by-default, RLS, MFA, cookies HttpOnly, CSRF, helmet/CSP, rate limiting (login, formulaires publics, IA), validation stricte (DTO), filtre d'exception global (pas de fuite d'erreurs internes), audit trail des actions sensibles (paie, paiements, notes, rôles, exports, actions IA), uploads : liste blanche de types, taille max, contrôle du type réel, stockage hors webroot, antivirus (ClamAV) pour les documents déposés par le public.

## 12. Chaîne DevSecOps
S'appuie sur le kit déjà préparé sur la branche `chore/devsecops-kit` (Gitleaks, Semgrep, npm audit, Checkov, Trivy, revue IA non bloquante) et le complète :
```
lint + format → tests unitaires → SAST (Semgrep) → secrets (Gitleaks) → SCA (npm audit)
→ build → scan image (Trivy) → IaC (Checkov) → tests d'intégration (Postgres éphémère, suite cross-tenant)
→ artefact (image signée, taggée par SHA) → déploiement staging → smoke tests
→ E2E Playwright (parcours critiques, 3 tailles d'écran) → tests sécurité (ZAP baseline, suite RBAC)
→ performance (k6, seuils p95) → rapport → promotion manuelle en production
```
Les tests fonctionnels s'exécutent **après** le déploiement, sur l'environnement cible ; un échec bloque la promotion et joint logs + captures au rapport.
