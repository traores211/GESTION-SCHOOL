# Cahier de recettes — état d'exécution (2026-09-26, recette interrompue)

## 1. Environnement
Stack `gs-recette` (images de production, `docker-compose.recette.yml`), version `415e055`. Web : http://localhost:13000. API : http://localhost:14000/api.
Migrations 0001 et 0002 appliquées sur une base vierge. Seed chargé : 2 écoles, un compte par rôle.

## 2. Catalogue
119 exécutions couvrant 111 scénarios. Chaque scénario est défini par un ID, un module, une précondition, une action, un résultat attendu et une priorité ; ces champs sont dans `tests/report/catalog.mjs`. Les scénarios exécutables sont dans `tests/e2e/*.spec.ts`, chaque test portant l'ID en tête de titre.
Le rapport complet se génère avec : `node tests/report/build-report.mjs test-results/runs/*.json`.

## 3. Résultats obtenus avant l'interruption

| ID | Scénario | Résultat |
|---|---|---|
| Tests unitaires backend | 64 tests (droits, isolation des écoles, IA, emplois du temps, documents) | **PASS 64/64** |
| Build | type-check et build du backend et du frontend (31 routes, 101–115 kB) | **PASS** |
| Déploiement | migrations, seed, services « healthy » | **PASS** |
| SMK-01 à SMK-05 | tests de fumée post-déploiement | **PASS 5/5** |
| Suite API (58 tests) | premier lancement | **BLOCKED** : la connexion du compte « director2 » a reçu une réponse 429 |

**Analyse de l'anomalie (FAIL d'environnement, pas de défaut fonctionnel).** La limite anti-force-brute est de 10 connexions par minute et par IP. Les tests de fumée puis la suite API se sont connectés depuis la même IP en moins d'une minute, ce qui l'a déclenchée ; le contrôle fonctionne donc comme prévu.
**Correction prévue :** fixer `AUTH_RATE_LIMIT` à 100 dans `docker-compose.recette.yml`. Le scénario SEC-08 teste la limite sur `forgot-password` ; il faudra l'ajuster pour qu'il reste valide avec cette valeur.

## 4. Reste à exécuter
1. Suite API, IA (clé disponible dans l'environnement), performance.
2. Suites navigateur : bureau, tablette et mobile, avec les contrôles d'accessibilité axe.
3. Scan OWASP ZAP de référence.
4. Corriger chaque FAIL, rejouer, puis générer le rapport final.

Commandes : voir `docs/runbooks/modes-operatoires-exploitation.md` §12.

## 5. Point à surveiller
La latence de connexion est d'environ 3 s par compte (22 s pour 7 comptes) dans le conteneur. Le scénario PF-01 doit la mesurer.
