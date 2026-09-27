# Cahier de recettes exécuté — GESTION SCHOOL SaaS

> Recette exécutée les 26 et 27/09/2026 **après déploiement** sur l'environnement de recette (images de production). Version déployée : branche `worktree-saas-platform-audit`.
> Preuves : `docs/testing/preuves/` (rapports JSON par passe, rapport ZAP). Documents associés : [résultats détaillés (120 exécutions)](resultats-detailles.md) · [registre des anomalies](anomalies.md) · [modes opératoires](../runbooks/).

## 1. Synthèse

| Indicateur | Résultat |
|---|---|
| Scénarios automatisés | **112 scénarios**, **120 exécutions** (les scénarios mobiles tournent sur tablette et sur smartphone) |
| **PASS** | **110** |
| **PASS au rejeu** (instable, réussi au 2ᵉ passage) | **2** : UI-03, UI-11. Cause : lenteur ponctuelle de l'environnement, voir A-12 |
| **FAIL** | **1** : PF-01, latence p95. Pics d'environnement, médianes conformes ; voir A-12 |
| **BLOCKED** | **7** : IA-03 à IA-07, IA-09, IA-10. La clé API Claude fournie est refusée par le fournisseur (401) |
| **NOT APPLICABLE** | 0 |
| Tests unitaires backend | **65/65 PASS** : isolation des écoles, permissions, emplois du temps, moteur documentaire, IA avec modèle simulé |
| Scan OWASP ZAP (baseline) | **0 FAIL, 63 règles PASS**. 8 avertissements au premier passage, 4 après correction : 2 informatifs, COEP volontairement non activé, CSP générique documentée. Voir §6 |
| Anomalies | 16 enregistrées : **6 défauts applicatifs corrigés et rejoués**, 1 anomalie ouverte (performance, environnement) |

**Verdict.** Les fonctionnalités sont **validées pour une préproduction**, avec deux réserves :
1. Rejouer IA-03 à IA-10 avec une clé API valide. Les garanties de sécurité de l'IA (outils filtrés par les droits, confirmation, revérification des droits) sont **déjà prouvées** par IA-01, IA-02, IA-08 et 13 tests unitaires sur modèle simulé.
2. Re-mesurer PF-01 sur un environnement Linux dédié.

## 2. Environnement et jeu de données

- **Stack.** Déployée avec `docker-compose.recette.yml` (projet `gs-recette`) : PostgreSQL 16, job `migrate` (migrations `0001_baseline` et `0002_saas_platform`, puis seed), backend NestJS en production (Node 22, utilisateur non-root), frontend Next.js en production.
- **Adresses.** Web : http://localhost:13000. API : http://localhost:14000/api. Sous-domaine : http://demo-001.localhost:13000.
- **Machine.** Windows 10, Docker Desktop 28.3, 8 vCPU / 3,7 Go de RAM pour Docker, partagés avec la stack de développement `school-*` (25 à 30 % de CPU permanents).
- **Données.** Deux écoles :
  - « Groupe Scolaire La Réussite » (`DEMO-001`, plan Enterprise) ;
  - « Lycée Horizon » (`lycee-horizon`, plan Starter), pour les tests d'isolation et de plans.
- **Comptes.** Un compte par rôle : opérateur plateforme, direction (×2), enseignants, secrétariat, comptabilité, parents, élève. Mots de passe de démonstration **réservés à la recette**.
- **Messagerie.** Emails et SMS passent par le fournisseur simulé ; la boîte d'envoi sert de boîte de réception de test.

## 3. Méthode

1. **Déploiement**, puis **tests de fumée bloquants** (SMK-01 à 05).
2. **Recette fonctionnelle.**
   - API : authentification, isolation des écoles, droits, scolarité, notes, emplois du temps, finance, vitrine, documents, sécurité.
   - IA : sur le vrai modèle, avec une sonde de disponibilité.
   - Performance.
   - Navigateur : bureau, puis tablette (Galaxy Tab S4) et smartphone (Pixel 5), avec contrôles d'accessibilité **axe** (WCAG 2.2 AA).
3. **Scan dynamique OWASP ZAP** de la vitrine publique.
4. **Pour chaque FAIL :** capture, trace, journaux et analyse de cause, puis correction, redéploiement et **rejeu**. Voir le registre des anomalies.
5. **Non-régression.** Toutes les suites ont été rejouées après chaque correction applicative. Les scénarios sont rejouables : comptes, modèles et périodes sont dédiés à chaque passage.

Un résultat « PASS au rejeu » n'est jamais présenté comme un PASS franc. Un « BLOCKED » indique qu'un prérequis externe manque ; la raison figure dans la colonne Observation.

## 4. Couverture par module

| Module | Scénarios | Résultat |
|---|---|---|
| Déploiement / fumée | SMK-01..05 | 5 PASS |
| Authentification, sessions, MFA, mot de passe oublié | AUTH-01..07, UI-01, UI-02 | 9 PASS |
| Multi-tenant (création d'école, isolation, branding, feature flags, domaines) | MT-01..08, UI-15, UI-17 | 10 PASS |
| Rôles et permissions | RBAC-01..06, UI-04, UI-06 | 8 PASS |
| Élèves, parents, classes, admissions | ST-01..04, PA-01..02, CL-01, AD-01, UI-05 | 9 PASS |
| Notes et bulletins | GR-01..02, UI-08 | 3 PASS |
| Emplois du temps | TT-01..05, UI-11 | 5 PASS + 1 PASS au rejeu |
| Finance et paie | FI-01..06, UI-09, UI-10 | 8 PASS |
| Communication et vitrine | CO-01, VI-01..06, UI-16, UI-18, MO-06 | 11 PASS |
| Documents | DO-01..05, UI-12, UI-19 | 7 PASS |
| IA | IA-01..10 | 3 PASS, 7 BLOCKED |
| Sécurité | SEC-01..08, UI-23 | 9 PASS |
| Performance | PF-01..04 | 3 PASS, 1 FAIL |
| Accessibilité (scénarios aussi comptés dans leur module) | UI-03, 05, 10, 13, 20, 21, 22 (axe + clavier) | 6 PASS + 1 PASS au rejeu (UI-03) |
| Mobile et tablette | MO-01..08 × 2 appareils | 16 PASS |

## 5. Performance (mesurée)

| Mesure | Avant correction | Après correction (passe finale) |
|---|---|---|
| Tableau de bord, p95 | 1 522 ms | 71 à 382 ms selon la passe ; médiane 33 à 63 ms |
| Liste des élèves, p95 | 772 ms | 166 à 400 ms ; médiane 52 à 113 ms |
| `users/me`, p95 | 146 à 493 ms | 20 à 113 ms |
| Liste paginée avec 900 élèves supplémentaires (PF-02) | — | 229 ms ; recherche 148 ms ; tableau de bord 393 ms |
| Génération de tous les emplois du temps (PF-03) | — | < 3 s ✔ |
| Génération d'un document officiel (PF-04) | — | < 3 s ✔ |
| Bundle frontend (First Load JS par page) | 101 à 109 kB | 101 à 115 kB (objectif ≤ 130 kB) ✔ |

Les **médianes** de toutes les routes clés sont comprises entre 15 et 113 ms. Le p95 reste au-dessus de 300 ms sur 2 routes, à cause de pics isolés. Le même p95 varie du simple au quadruple d'une passe à l'autre sans changement de code, ce qui désigne l'environnement : Docker Desktop sous Windows, partagé avec une autre stack. **PF-01 reste FAIL** tant qu'il n'est pas re-mesuré sur un environnement représentatif.

## 6. Sécurité

- **API.** En-têtes de sécurité présents (CSP, HSTS, nosniff, sans `X-Powered-By`). Swagger désactivé en production. Injection SQL traitée comme du texte. XSS échappée dans les documents. Champs inconnus refusés. Limitation de débit prouvée (429). Journal d'audit sans secret. Aucun hash de mot de passe dans les réponses.
- **Isolation.** Aucune lecture ni écriture croisée entre écoles (MT-02, MT-03, ST-04). L'opérateur plateforme n'accède à aucune donnée d'école (MT-07). Une école suspendue perd l'accès immédiatement (AUTH-07).
- **OWASP ZAP baseline (vitrine publique)** : 1er passage 0 FAIL / 59 PASS / 8 avertissements. Défaut corrigé (A-16) : en-têtes de sécurité et `X-Powered-By` du frontend ; scénario UI-23 ajouté. **2e passage : 0 FAIL / 63 PASS / 4 avertissements** : « Non-Storable Content » et « Modern Web Application » (informatifs), COEP (volontairement non activé : bloquerait les logos hébergés par les écoles), « CSP: Wildcard Directive » (`img-src https:` pour les logos externes et `unsafe-inline` requis par Next.js — **risque résiduel accepté**, remédiation : CSP à nonce et logos sur le stockage de la plateforme). Rapports : `docs/testing/preuves/zap-report.html`.
- **Ce qui n'a pas été testé.** Test d'intrusion manuel, téléversement de fichiers (le module n'existe pas encore, les images sont des URL), charge au-delà d'un utilisateur simultané.

## 7. Réserves et actions

| Action | Porteur | Préalable |
|---|---|---|
| Rejouer IA-03..07, IA-09, IA-10 | Exploitation | Fournir une clé API Claude valide (`ANTHROPIC_API_KEY`), puis `bash tests/run-recette.sh ai` |
| Re-mesurer PF-01 | Exploitation | Environnement Linux dédié (préproduction) |
| Brancher un fournisseur réel d'email et de SMS | Produit | Choix du prestataire (fournisseur simulé aujourd'hui) |
| Listes déroulantes d'élèves des écrans Facturation, Parents, Transport et Documents | Produit | Limitées aux 500 premiers élèves : passer à une recherche au fil de la saisie pour les grands établissements |

## 8. Rejouer la recette

```bash
docker compose -p gs-recette -f docker-compose.recette.yml up -d --build --wait
bash tests/run-recette.sh                          # fumée, API, IA, performance, bureau, tablette, mobile
node tests/report/build-report.mjs test-results/runs/*.json > docs/testing/resultats-detailles.md
npx playwright show-report playwright-report       # captures et traces
```
