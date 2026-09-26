# Journal des décisions assistées par IA

Trace de ce que l'IA a proposé, ce qui a été vérifié, ce qui a été accepté ou rejeté.

**À quoi ça sert.** Un agent qui se trompe une fois n'est pas un problème ; un agent qui se trompe
toujours de la même façon sans qu'on s'en aperçoive en est un. Ce journal rend le taux d'erreur
visible, et sert de preuve d'une revue humaine en cas d'audit.

**Qui le remplit.** Les colonnes *Périmètre*, *Verdict IA* et *Findings* sont remplies par l'agent
à la fin d'un `/security-review` ou d'un `/threat-model`. Les colonnes *Vérifié par* et *Décision*
sont remplies **par un humain** — c'est tout l'intérêt. Une ligne sans décision humaine est une
tâche en cours, pas une tâche terminée.

| Date | Périmètre | Outil / agent | Verdict IA | Findings retenus | Findings rejetés (et pourquoi) | Vérifié par | Décision |
|---|---|---|---|---|---|---|---|
| 2026-09-26 | Dépôt complet (baseline à l'intégration du kit) | gitleaks 8.30.1 · semgrep 1.177.0 · npm audit · checkov | Bloquant (SCA, Dockerfiles) | **SCA** : 36 vulnérabilités npm (1 critical `tar` via `bcrypt`, 19 high — `@nestjs/cli`, `@typescript-eslint/*`, `@nestjs/swagger`, `next`/`postcss`…), la plupart corrigées par une montée de version majeure. **Checkov** `CKV_DOCKER_3` : `backend/Dockerfile` et `frontend/Dockerfile` tournent en root. **Semgrep** : 0 finding (OWASP / secrets / TypeScript) sur `backend/src`, `backend/prisma`, `frontend/src`. | **Gitleaks** : 5 findings dans `API_REFERENCE.md` (commit `f855cc4`) rejetés comme faux positifs — ce sont des JWT d'exemple tronqués (`eyJhbGciOiJIUzI1NiIs...` = seulement l'en-tête `{"alg":"HS256"`), sans signature ni payload. Pas d'exclusion ajoutée : le gate CI ne scanne que les commits de la PR. | *(à compléter)* | *(à compléter)* |

## Ce qu'il faut noter, et qui se perd sinon

- Ce que l'analyse IA a **bien vu** que la revue humaine aurait manqué.
- Ce qu'il a fallu **corriger** dans son analyse (contrôle existant signalé à tort comme gap,
  menace hors sujet, IP de reverse proxy prise pour celle d'un attaquant).
- Ce qu'elle **n'a pas pu vérifier** — la liste des angles morts vaut souvent plus que les findings.
  Pour la baseline du 2026-09-26 : images Docker non scannées par Trivy localement (build non
  lancé) ; aucun test automatisé n'existe, donc aucun contrôle d'accès n'est prouvé par un test.
